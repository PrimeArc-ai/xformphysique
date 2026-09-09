from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import SupabaseAdminGateway
from app.main import app
from app.schemas.auth import DirectPasswordSet
from app.services.supabase_admin import set_password_by_email

USER_ID = UUID("12345678-1234-4234-8234-123456789012")
DEV = Settings(
    _env_file=None,
    environment="development",
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="public-test",
    supabase_secret_key="secret-test",
)
PROD = Settings(
    _env_file=None,
    environment="production",
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="public-test",
    supabase_secret_key="secret-test",
)


class Result:
    status_code = 200

    def __init__(self, value):
        self.value = value

    def json(self):
        return self.value


def test_direct_set_accepts_reserved_test_domains():
    payload = DirectPasswordSet(
        email="aisha.kapoor.coach.20260826@xform.test",
        password="NewPass!1234",
        confirm_password="NewPass!1234",
    )
    assert payload.email == "aisha.kapoor.coach.20260826@xform.test"


def test_direct_set_rejects_mismatched_passwords():
    with pytest.raises(APIError) as raised:
        set_password_by_email(
            DEV,
            DirectPasswordSet(email="aisha@example.com", password="NewPass!1234", confirm_password="Other!1234"),
        )
    assert raised.value.status_code == 422


def test_direct_set_disabled_outside_development():
    with pytest.raises(APIError) as raised:
        set_password_by_email(
            PROD,
            DirectPasswordSet(email="aisha@example.com", password="NewPass!1234", confirm_password="NewPass!1234"),
        )
    assert raised.value.code == "direct_password_set_disabled"


def test_direct_set_updates_auth_password(monkeypatch):
    calls = []

    def request(self, method, path, **kwargs):
        calls.append((method, path, kwargs.get("params"), kwargs.get("json")))
        if method == "GET":
            return Result([{"id": str(USER_ID), "email": "aisha@example.com"}])
        return Result({})

    monkeypatch.setattr(SupabaseAdminGateway, "__init__", lambda *a, **k: None)
    monkeypatch.setattr(SupabaseAdminGateway, "request", request)
    result = set_password_by_email(
        DEV,
        DirectPasswordSet(email="Aisha@example.com", password="NewPass!1234", confirm_password="NewPass!1234"),
    )
    assert result == {"updated": True, "email": "aisha@example.com"}
    assert calls[0][0] == "GET" and calls[0][1] == "/rest/v1/profiles"
    assert calls[1][0] == "PUT" and calls[1][1] == f"/auth/v1/admin/users/{USER_ID}"
    assert calls[1][3] == {"password": "NewPass!1234"}


def test_direct_set_unknown_email(monkeypatch):
    monkeypatch.setattr(SupabaseAdminGateway, "__init__", lambda *a, **k: None)
    monkeypatch.setattr(SupabaseAdminGateway, "request", lambda *a, **k: Result([]))
    with pytest.raises(APIError) as raised:
        set_password_by_email(
            DEV,
            DirectPasswordSet(email="missing@example.com", password="NewPass!1234", confirm_password="NewPass!1234"),
        )
    assert raised.value.status_code == 404


def test_set_password_route_uses_development_settings(monkeypatch):
    monkeypatch.setattr("app.api.v1.auth.set_password_by_email", lambda settings, payload: {"updated": True, "email": str(payload.email)})
    app.dependency_overrides[get_settings] = lambda: DEV
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/auth/set-password",
                json={"email": "aisha@example.com", "password": "NewPass!1234", "confirm_password": "NewPass!1234"},
            )
            assert response.status_code == 200
            assert response.headers["cache-control"] == "private, no-store"
            assert response.json()["updated"] is True
    finally:
        app.dependency_overrides.clear()
