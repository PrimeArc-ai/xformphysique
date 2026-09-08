from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.schemas.coach import ClientCoachingContextUpdate
from app.services.r2_photo_storage import R2PhotoStorage
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
    )


def coach_service() -> SupabaseCoachService:
    return SupabaseCoachService(
        settings(), AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt")
    )


def test_assigned_coach_can_review_only_rls_returned_client_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        params = kwargs.get("params", {})
        if url.endswith("/rest/v1/profiles"):
            if params.get("id") == "eq.coach-id":
                return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
            return FakeResponse(200, [{"id": "client-a", "role": "client", "full_name": "Ava Client"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            # This represents data already filtered by Supabase RLS; client-b is
            # deliberately absent from the coach's result set.
            return FakeResponse(
                200,
                [
                    {
                        "id": "client-a",
                        "client_code": "XP-101",
                        "primary_goal": "strength",
                        "check_in_day": "sunday",
                        "timezone": "Asia/Kolkata",
                    }
                ],
            )
        if url.endswith("/rest/v1/body_entries"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "body-a",
                        "client_id": "client-a",
                        "entry_date": "2026-08-24",
                        "weight_kg": "70.2",
                        "waist_cm": "82.0",
                        "hip_cm": None,
                        "body_fat_pct": None,
                        "created_at": "2026-08-24T12:00:00+00:00",
                    }
                ],
            )
        if url.endswith("/rest/v1/weekly_checkins"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "checkin-a",
                        "client_id": "client-a",
                        "period_start": "2026-08-17",
                        "submitted_at": "2026-08-23T12:00:00+00:00",
                        "energy_score": 4,
                        "sleep_score": 3,
                        "sentiment": "good",
                        "observation": "Training felt consistent.",
                        "concern": None,
                    }
                ],
            )
        if url.endswith("/rest/v1/client_coaching_context"):
            return FakeResponse(
                200,
                [
                    {
                        "client_id": "client-a",
                        "client_visible_coach_note": "Keep the current loading.",
                        "training_considerations": ["Monitor knee comfort"],
                        "safety_notice": "Coaching support only. Not medical advice.",
                        "updated_at": "2026-08-24T12:00:00+00:00",
                    }
                ],
            )
        if url.endswith("/rest/v1/coach_private_notes"):
            return FakeResponse(200, [{"id": "note-a", "note": "Coach-only context", "created_at": "2026-08-24T12:00:00+00:00"}])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "photo-a",
                        "client_id": "client-a",
                        "view": "front",
                        "captured_on": "2026-08-24",
                        "original_filename": "progress-photo.png",
                    }
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr(httpx, "request", request)
    result = coach_service().get_client_review("client-a")

    assert result["client"]["full_name"] == "Ava Client"
    assert result["body_entries"][0]["weight_kg"] == 70.2
    assert result["checkins"][0]["energy_score"] == 4
    assert result["photo_count"] == 1
    assert result["progress_photos"] == [
        {
            "id": "photo-a",
            "view": "front",
            "captured_on": "2026-08-24",
            "file_name": "progress-photo.png",
            "content_url": "/api/v1/coach/clients/client-a/progress-photos/photo-a/content",
        }
    ]
    assert result["coaching_context"]["client_visible_coach_note"] == "Keep the current loading."
    client_reads = [kwargs["params"] for _, url, kwargs in seen if url.endswith("/rest/v1/body_entries")]
    assert client_reads == [{"select": "*", "client_id": "eq.client-a", "order": "entry_date.desc", "limit": 100}]
    assert all(kwargs["headers"]["Authorization"] == "Bearer coach-jwt" for _, _, kwargs in seen)


def test_assigned_coach_can_read_only_their_clients_r2_photo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        params = kwargs.get("params", {})
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            assert params == {"select": "*", "id": "eq.client-a"}
            return FakeResponse(200, [{"id": "client-a"}])
        if url.endswith("/rest/v1/progress_photos"):
            assert params == {
                "select": "*",
                "id": "eq.photo-a",
                "client_id": "eq.client-a",
            }
            return FakeResponse(
                200,
                [
                    {
                        "id": "photo-a",
                        "client_id": "client-a",
                        "storage_provider": "r2",
                        "storage_path": "client-a/opaque.png",
                        "content_type": "image/png",
                        "original_filename": "progress-photo.png",
                    }
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr(httpx, "request", request)
    monkeypatch.setattr(R2PhotoStorage, "read", lambda _self, _path: b"private-photo")

    content, content_type, file_name = coach_service().get_client_progress_photo_content(
        "client-a", "photo-a"
    )

    assert (content, content_type, file_name) == (
        b"private-photo",
        "image/png",
        "progress-photo.png",
    )
    assert all(kwargs["headers"]["Authorization"] == "Bearer coach-jwt" for _, _, kwargs in seen)


def test_client_cannot_read_coach_review(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "client-id", "role": "client"}])
        raise AssertionError("A client must not query coach data")

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseCoachService(
        settings(), AuthenticatedUser(id="client-id", email="client@example.test", access_token="client-jwt")
    )

    with pytest.raises(APIError) as error:
        service.get_client_review("another-client")

    assert error.value.status_code == 403
    assert error.value.code == "coach_role_required"


def test_coach_context_update_is_targeted_and_audited(monkeypatch: pytest.MonkeyPatch) -> None:
    writes: list[tuple[str, dict, dict]] = []

    def request(method: str, url: str, **kwargs):
        params = kwargs.get("params", {})
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients") and method == "GET":
            return FakeResponse(200, [{"id": "client-a"}])
        if url.endswith("/rest/v1/client_coaching_context") and method == "PATCH":
            writes.append(("context", params, kwargs["json"]))
            return FakeResponse(
                200,
                [
                    {
                        "client_id": "client-a",
                        "client_visible_coach_note": "Use a controlled tempo.",
                        "training_considerations": ["Monitor knee comfort"],
                        "safety_notice": "Coaching support only. Not medical advice.",
                        "updated_at": "2026-08-24T12:00:00+00:00",
                    }
                ],
            )
        if url.endswith("/rest/v1/audit_events") and method == "POST":
            writes.append(("audit", params, kwargs["json"]))
            return FakeResponse(201, [{"id": "audit-a"}])
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr(httpx, "request", request)
    result = coach_service().update_client_coaching_context(
        "client-a",
        ClientCoachingContextUpdate(
            client_visible_coach_note="Use a controlled tempo.",
            training_considerations=["Monitor knee comfort"],
        ),
    )

    assert result["client_id"] == "client-a"
    assert writes[0] == (
        "context",
        {"client_id": "eq.client-a"},
        {
            "client_visible_coach_note": "Use a controlled tempo.",
            "training_considerations": ["Monitor knee comfort"],
            "updated_by_coach_id": "coach-id",
        },
    )
    assert writes[1][0] == "audit"
    assert writes[1][2]["client_id"] == "client-a"
    assert writes[1][2]["action"] == "coach_note_saved"
