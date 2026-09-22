import httpx
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.services.auth_email_link_config import AuthEmailLinkConfigService


class FakeResponse:
    def __init__(self, status_code: int, payload: object):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_secret_key="sb_secret_test",
        client_invite_redirect_url="https://fallback.example.test/",
    )


def test_service_prefers_supabase_db_redirect(monkeypatch) -> None:
    seen = {}

    def request(method: str, url: str, **kwargs):
        seen["method"] = method
        seen["url"] = url
        seen["headers"] = kwargs.get("headers")
        return FakeResponse(200, [{"app_redirect_url": "https://hardcover-agreed-rebel-setup.trycloudflare.com/"}])

    monkeypatch.setattr(httpx, "request", request)
    redirect_url, source = AuthEmailLinkConfigService(_settings()).get_redirect_url()

    assert source == "supabase_db"
    assert redirect_url == "https://hardcover-agreed-rebel-setup.trycloudflare.com/"
    assert seen["method"] == "GET"
    assert seen["url"].endswith("/rest/v1/auth_email_link_config")
    assert seen["headers"]["Authorization"] == "Bearer sb_secret_test"


def test_service_falls_back_to_env_when_db_value_missing(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "request", lambda *a, **kw: FakeResponse(200, []))
    redirect_url, source = AuthEmailLinkConfigService(_settings()).get_redirect_url()
    assert source == "env_fallback"
    assert redirect_url == "https://fallback.example.test/"


def test_public_auth_endpoint_returns_resolved_redirect_url(monkeypatch) -> None:
    settings = _settings()
    monkeypatch.setattr(
        AuthEmailLinkConfigService,
        "get_redirect_url",
        lambda self: ("https://hardcover-agreed-rebel-setup.trycloudflare.com/", "supabase_db"),
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/email-link-config")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {
        "redirect_url": "https://hardcover-agreed-rebel-setup.trycloudflare.com/",
        "source": "supabase_db",
    }
