from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.schemas.coach import ClientOnboardingCreate
from app.services.foundation_catalog import WAIVER_VERSION, valid_submit_answers
from app.services.supabase_coach import SupabaseCoachService


class FakeResponse:
    def __init__(self, status_code: int, payload: object):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_secret_key="sb_secret_test",
        client_invite_redirect_url="https://app.example.test/",
    )


def test_coach_invitation_provisions_owned_client(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        requests.append((method, url, kwargs))
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/auth/v1/invite"):
            assert kwargs["headers"]["Authorization"] == "Bearer sb_secret_test"
            assert kwargs["json"]["redirect_to"] == "https://app.example.test/"
            return FakeResponse(200, {"id": "client-id"})
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"client_code": "XP-0042", "primary_goal": "fat_loss", "check_in_day": "sunday"}])
        return FakeResponse(201, [{"id": "row-id"}])

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt")
    )

    result = service.invite_and_onboard_client(
        ClientOnboardingCreate(
            full_name="Kavya Rao",
            email="kavya@xformphysique.in",
            primary_goal="fat_loss",
            target_weight_kg=58.5,
            private_coach_note="Start with a conservative training volume.",
        )
    )

    assert result == {
        "id": "client-id",
        "client_code": "XP-0042",
        "full_name": "Kavya Rao",
        "email": "kavya@xformphysique.in",
        "primary_goal": "fat_loss",
        "check_in_day": "sunday",
        "invitation_sent": True,
    }
    paths = [url for _, url, _ in requests]
    assert any(path.endswith("/auth/v1/invite") for path in paths)
    assert any(path.endswith("/rest/v1/coach_client_assignments") for path in paths)
    client_patch = next(
        kwargs["json"]
        for method, path, kwargs in requests
        if method == "PATCH" and path.endswith("/rest/v1/clients")
    )
    assert client_patch["foundation_intake_status"] == "pending"
    intake_insert = next(
        kwargs["json"]
        for method, path, kwargs in requests
        if method == "POST" and path.endswith("/rest/v1/client_foundation_intakes")
    )
    assert intake_insert == {"client_id": "client-id"}
    assert any(path.endswith("/rest/v1/audit_events") for path in paths)


def test_client_cannot_invite_other_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "client-id", "role": "client"}])
        raise AssertionError("Client role must not reach Supabase Admin Auth")

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="client-id", email="client@example.test", access_token="client-jwt")
    )

    with pytest.raises(APIError) as error:
        service.invite_and_onboard_client(
            ClientOnboardingCreate(
                full_name="Another Client", email="another@xformphysique.in", primary_goal="strength"
            )
        )

    assert error.value.status_code == 403
    assert error.value.code == "coach_role_required"


def test_assigned_coach_can_read_foundation_intake(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = valid_submit_answers("male")

    def request(method: str, url: str, **kwargs):
        params = kwargs.get("params") or {}
        if url.endswith("/rest/v1/profiles"):
            if params.get("id") == "eq.coach-id":
                return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
            return FakeResponse(
                200,
                [
                    {
                        "id": "client-id",
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": "client-id", "foundation_intake_status": "pending"}])
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(
                200,
                [
                    {
                        "client_id": "client-id",
                        "schema_version": 1,
                        "answers": answers,
                        "waiver_version": WAIVER_VERSION,
                        "submitted_at": None,
                    }
                ],
            )
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt")
    )

    result = service.get_foundation_intake("client-id")

    assert result["status"] == "pending"
    assert result["schema_version"] == 1
    assert result["answers"]["identity"]["full_name"] == "Taylor Example"
    assert result["prefill"] == {
        "full_name": "Taylor Example",
        "email": "client@example.test",
    }
    assert result["waiver_version"] == WAIVER_VERSION
    assert set(result["photos"]) == {
        "front",
        "back",
        "side",
        "front_double_bicep",
        "back_double_bicep",
    }


def test_unassigned_coach_cannot_read_foundation_intake(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        params = kwargs.get("params") or {}
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt")
    )

    with pytest.raises(APIError) as error:
        service.get_foundation_intake("client-id")

    assert error.value.status_code == 403


def test_pending_foundation_intake_marks_roster_attention(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        params = kwargs.get("params") or {}
        if url.endswith("/rest/v1/profiles"):
            if params.get("id") == "eq.coach-id":
                return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
            return FakeResponse(200, [{"id": "client-id", "role": "client", "full_name": "Taylor Example"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "client-id",
                        "client_code": "XP-0042",
                        "primary_goal": "fat_loss",
                        "check_in_day": "sunday",
                        "timezone": "Asia/Kolkata",
                        "foundation_intake_status": "pending",
                        "created_at": "2026-09-18T08:00:00Z",
                    }
                ],
            )
        if url.endswith("/rest/v1/body_entries"):
            return FakeResponse(200, [])
        if url.endswith("/rest/v1/weekly_checkins"):
            return FakeResponse(200, [])
        if url.endswith("/rest/v1/client_tracking_preferences"):
            return FakeResponse(200, [{"client_id": "client-id", "missing_weight_threshold_days": 30}])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    monkeypatch.setattr(
        "app.services.supabase_coach.schedule",
        lambda client, rows: {
            "current_status": "current",
            "consecutive_missed": 0,
            "missed_count": 0,
            "due_on": None,
            "next_due_on": None,
            "timezone": "Asia/Kolkata",
        },
    )
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt")
    )

    item = service.list_clients()["items"][0]

    assert item["foundation_intake_status"] == "pending"
    assert item["needs_attention"] is True
    assert "Foundation intake pending" in item["attention_reasons"]
