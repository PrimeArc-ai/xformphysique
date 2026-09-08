from uuid import UUID
import httpx

import pytest
from fastapi.testclient import TestClient
from fastapi import Response
from pydantic import ValidationError

from app.api.v1 import admin as admin_routes
from app.api.v1.auth import get_current_workspace
from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseGateway, SupabaseAdminGateway
from app.main import app
from app.schemas.admin import CoachCreate, MinimalClientList
from app.services.supabase_admin import SupabaseAdminService
from app.services.supabase_client import SupabaseClientService

COACH_ID = UUID("12345678-1234-4234-8234-123456789012")
SETTINGS = Settings(_env_file=None, supabase_url="https://example.supabase.co", supabase_publishable_key="public-test")
USER = AuthenticatedUser("admin-id", "admin@example.test", "caller-jwt")


class Result:
    status_code = 200
    def __init__(self, value):
        self.value = value

    def json(self):
        return self.value


def test_void_rpc_success_is_not_parsed_as_json(monkeypatch):
    monkeypatch.setattr(SupabaseGateway, "request", lambda *a, **k: httpx.Response(204))
    assert SupabaseAdminService(SETTINGS, USER)._rpc("admin_record_coach_onboarding", {"target_coach_id": str(COACH_ID)}) is None


@pytest.mark.parametrize("role", ["coach", "client", None])
@pytest.mark.parametrize("action", ["list", "clients", "create", "offboard"])
def test_nonadmins_denied_before_any_privileged_operation(monkeypatch, role, action):
    calls = []

    def request(self, method, path, **kwargs):
        calls.append(path)
        assert path == "/rest/v1/profiles"
        return Result([{"role": role}] if role else [])

    monkeypatch.setattr(SupabaseGateway, "request", request)
    service = SupabaseAdminService(SETTINGS, USER)
    with pytest.raises(APIError) as raised:
        if action == "list": service.list_coaches()
        elif action == "clients": service.coach_clients(COACH_ID)
        elif action == "offboard": service.offboard_coach(COACH_ID)
        else: service.create_coach(CoachCreate(full_name="Test Coach", email="coach@example.com"))
    assert raised.value.status_code == 403
    assert calls == ["/rest/v1/profiles"]


def test_summaries_use_caller_jwt_and_only_sanitized_rpc(monkeypatch):
    def request(self, method, path, **kwargs):
        assert self.access_token == "caller-jwt"
        if path == "/rest/v1/profiles": return Result([{"role": "admin"}])
        assert path == "/rest/v1/rpc/admin_coach_clients"
        assert kwargs["json"] == {"target_coach_id": str(COACH_ID)}
        return Result([{"client_code": "XP-0001", "assigned_at": "2026-09-06T12:00:00Z", "ended_at": None}])
    monkeypatch.setattr(SupabaseGateway, "request", request)
    assert SupabaseAdminService(SETTINGS, USER).coach_clients(COACH_ID)["items"][0]["client_code"] == "XP-0001"


def test_client_response_drops_any_accidental_pii():
    result = MinimalClientList.model_validate({"items": [{
        "client_code": "XP-0001", "assigned_at": "2026-09-06T12:00:00Z", "ended_at": None,
        "id": "private-uuid", "email": "private@example.com", "full_name": "Private Client",
        "weight_kg": 80, "photos": ["private-key"], "notes": "health details",
    }]})
    assert set(result.model_dump()["items"][0]) == {"client_code", "assigned_at", "ended_at"}


def test_caller_cannot_request_a_privileged_role():
    with pytest.raises(ValidationError):
        CoachCreate(full_name="Test Coach", email="coach@example.com", role="admin")


def test_onboarding_sets_server_role_and_does_not_claim_email_delivery(monkeypatch):
    monkeypatch.setattr(SupabaseAdminService, "_require_admin", lambda self: None)
    monkeypatch.setattr(SupabaseAdminService, "_rpc", lambda *a, **k: None)
    monkeypatch.setattr(SupabaseAdminGateway, "__init__", lambda *a, **k: None)

    def create(self, method, path, **kwargs):
        assert method == "POST" and path == "/auth/v1/admin/users"
        payload = kwargs["json"]
        assert payload["app_metadata"] == {"xform_role": "coach"}
        assert "role" not in payload["user_metadata"]
        assert len(payload["password"]) >= 24
        return Result({"id": str(COACH_ID), "email": payload["email"]})
    monkeypatch.setattr(SupabaseAdminGateway, "request", create)
    result = SupabaseAdminService(SETTINGS, USER).create_coach(CoachCreate(full_name="Test Coach", email="coach@example.com"))
    assert result["email_sent"] is False and result["audit_recorded"] is True
    assert result["initial_password"]


def test_audit_failure_does_not_lose_successful_onboarding_credentials(monkeypatch):
    monkeypatch.setattr(SupabaseAdminService, "_require_admin", lambda self: None)
    monkeypatch.setattr(SupabaseAdminGateway, "__init__", lambda *a, **k: None)
    monkeypatch.setattr(SupabaseAdminGateway, "request", lambda *a, **k: Result({"id": str(COACH_ID), "email": "coach@example.com"}))
    def fail(*a, **k): raise APIError(503, "unavailable", "Unavailable")
    monkeypatch.setattr(SupabaseAdminService, "_rpc", fail)
    result = SupabaseAdminService(SETTINGS, USER).create_coach(CoachCreate(full_name="Test Coach", email="coach@example.com"))
    assert result["initial_password"] and not result["audit_recorded"]


def test_portal_selector_cannot_change_the_database_role(monkeypatch):
    monkeypatch.setattr(SupabaseClientService, "workspace", lambda self: {"role": "client"})
    with pytest.raises(APIError) as raised:
        get_current_workspace(portal="admin", settings=SETTINGS, user=USER)
    assert raised.value.code == "portal_mismatch"


def test_inactive_coach_cannot_open_workspace(monkeypatch):
    monkeypatch.setattr(SupabaseClientService, "_profile_row", lambda self: {"role": "coach"})
    monkeypatch.setattr(SupabaseClientService, "_one_or_none", lambda *a, **k: {"is_active": False})
    with pytest.raises(APIError) as raised:
        SupabaseClientService(SETTINGS, USER).workspace()
    assert raised.value.status_code == 403


def test_api_serialization_no_store_and_uuid_validation():
    class FakeService:
        def coach_clients(self, coach_id):
            return {"items": [{"client_code": "XP-0001", "assigned_at": "2026-09-06T12:00:00Z", "ended_at": None, "email": "private@example.com"}]}
    def dependency(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return FakeService()
    app.dependency_overrides[admin_routes.service] = dependency
    try:
        with TestClient(app) as client:
            response = client.get(f"/api/v1/admin/coaches/{COACH_ID}/clients")
            assert response.status_code == 200
            assert response.headers["cache-control"] == "private, no-store"
            assert set(response.json()["items"][0]) == {"client_code", "assigned_at", "ended_at"}
            assert client.get("/api/v1/admin/coaches/not-a-uuid/clients").status_code == 422
    finally:
        app.dependency_overrides.clear()
