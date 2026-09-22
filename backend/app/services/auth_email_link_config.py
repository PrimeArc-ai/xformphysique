from __future__ import annotations

import logging
from urllib.parse import urlparse

from app.core.config import Settings
from app.core.supabase import SupabaseAdminGateway


logger = logging.getLogger(__name__)


def _valid_redirect_url(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value


class AuthEmailLinkConfigService:
    """Resolve public redirect URL for auth email links."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def get_redirect_url(self) -> tuple[str, str]:
        fallback = _valid_redirect_url(self.settings.client_invite_redirect_url) or "http://127.0.0.1:5173/"
        if not self.settings.supabase_admin_enabled:
            return fallback, "env_fallback"
        try:
            rows = SupabaseAdminGateway(self.settings).request(
                "GET",
                "/rest/v1/auth_email_link_config",
                params={"select": "app_redirect_url", "id": "eq.true", "limit": 1},
            ).json()
            candidate = _valid_redirect_url((rows or [{}])[0].get("app_redirect_url"))
            if candidate:
                return candidate, "supabase_db"
        except Exception:
            logger.exception("Failed to read auth email link config; falling back to environment value")
        return fallback, "env_fallback"
