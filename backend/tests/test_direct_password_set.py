import pytest
from fastapi.testclient import TestClient
from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import SupabaseAdminGateway
from app.main import app
from app.schemas.auth import DirectPasswordSet
from app.services.supabase_admin import set_password_by_email


@pytest.mark.parametrize("environment", ["development", "production", "test"])
def test_email_only_password_change_is_always_disabled(monkeypatch, environment):
    settings = Settings(_env_file=None, environment=environment,
        supabase_url="https://example.supabase.co", supabase_publishable_key="public-test", supabase_secret_key="secret-test")
    def forbidden(*a, **kw):
        pytest.fail("Email-only recovery must never use the privileged Auth API")
    monkeypatch.setattr(SupabaseAdminGateway, "__init__", forbidden)
    payload = DirectPasswordSet(email="coach@example.com", password="NewPass!1234", confirm_password="NewPass!1234")
    with pytest.raises(APIError) as failure:
        set_password_by_email(settings, payload)
    assert failure.value.status_code == 410
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.post("/api/v1/auth/set-password", json=payload.model_dump())
            assert response.status_code == 410
            assert response.json()["error"]["code"] == "direct_password_set_disabled"
    finally:
        app.dependency_overrides.clear()
