from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.schemas.coach import ClientOnboardingCreate
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
