from __future__ import annotations

import logging
import secrets
from uuid import UUID

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseAdminGateway, SupabaseGateway
from app.schemas.admin import CoachCreate
from app.schemas.auth import DirectPasswordSet
from app.services import local_demo

logger = logging.getLogger(__name__)


def set_password_by_email(settings: Settings, payload: DirectPasswordSet) -> dict:
    """Development-only: write a chosen password to Auth so the same credentials can sign in.

    SMTP is not used. Anyone who knows an account email can set its password while this
    path is enabled, so it stays off outside development.
    """

    if settings.environment != "development":
        raise APIError(403, "direct_password_set_disabled", "Direct password set is only available in development.")
    if payload.password != payload.confirm_password:
        raise APIError(422, "password_mismatch", "Passwords do not match.")
    if not settings.supabase_admin_enabled:
        return {"updated": True, "email": str(payload.email).lower()}

    email = str(payload.email).lower()
    admin = SupabaseAdminGateway(settings)
    rows = admin.request(
        "GET",
        "/rest/v1/profiles",
        params={"email": f"ilike.{email}", "select": "id,email", "limit": "1"},
    ).json()
    if not rows:
        raise APIError(404, "account_not_found", "No XForm account uses that email.")
    user_id = rows[0]["id"]
    admin.request("PUT", f"/auth/v1/admin/users/{user_id}", json={"password": payload.password})
    return {"updated": True, "email": email}


class SupabaseAdminService:
    """Client summaries use sanitized RPCs with the caller JWT, never a service-key read."""

    def __init__(self, settings: Settings, user: AuthenticatedUser):
        self.settings, self.user = settings, user
        self.gateway = (
            SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None
        )

    def _require_admin(self):
        rows = self.gateway.request("GET", "/rest/v1/profiles", params={
            "id": f"eq.{self.user.id}", "select": "role", "limit": 1,
        }).json()
        if not rows or rows[0]["role"] != "admin":
            raise APIError(403, "admin_role_required", "Admin workspace access is required")

    def _rpc(self, name: str, payload=None):
        response = self.gateway.request("POST", f"/rest/v1/rpc/{name}", json=payload or {})
        # PostgREST returns HTTP 204 for void functions such as the audit writer.
        return None if response.status_code == 204 else response.json()

    def list_coaches(self):
        if self.gateway is None:
            return local_demo.list_coaches()
        self._require_admin()
        return {"items": self._rpc("admin_list_coaches")}

    def coach_clients(self, coach_id: UUID):
        if self.gateway is None:
            return local_demo.coach_clients(coach_id)
        self._require_admin()
        return {"items": self._rpc("admin_coach_clients", {"target_coach_id": str(coach_id)})}

    def offboard_coach(self, coach_id: UUID):
        if self.gateway is None:
            raise APIError(503, "local_demo", "Offboarding is unavailable in local demo.")
        self._require_admin()
        return self._rpc("admin_offboard_coach", {"target_coach_id": str(coach_id)})

    def reset_password(self, coach_id: UUID):
        """Keep the login email; generate a new password and return it once."""
        if self.gateway is None:
            return local_demo.reset_password(coach_id)
        self._require_admin()
        roster = self._rpc("admin_list_coaches") or []
        coach = next((item for item in roster if str(item.get("id")) == str(coach_id)), None)
        if coach is None:
            raise APIError(404, "coach_not_found", "Coach not found")
        password = f"Xf!9{secrets.token_urlsafe(18)}"
        SupabaseAdminGateway(self.settings).request(
            "PUT",
            f"/auth/v1/admin/users/{coach_id}",
            json={"password": password},
        )
        audit_recorded = True
        try:
            self._rpc("admin_record_coach_password_reset", {"target_coach_id": str(coach_id)})
        except APIError:
            audit_recorded = False
            logger.warning("Coach password-reset audit could not be recorded")
        return {
            "id": coach_id,
            "full_name": coach["full_name"],
            "email": coach["email"],
            "initial_password": password,
            "email_sent": False,
            "audit_recorded": audit_recorded,
        }

    def create_coach(self, payload: CoachCreate):
        if self.gateway is None:
            raise APIError(503, "local_demo", "Coach onboarding is unavailable in local demo.")
        self._require_admin()
        password = f"Xf!9{secrets.token_urlsafe(18)}"
        # Supabase rejects duplicate emails. Never promotes/replaces an existing account.
        account = SupabaseAdminGateway(self.settings).request("POST", "/auth/v1/admin/users", json={
            "email": str(payload.email).lower(), "password": password, "email_confirm": True,
            "app_metadata": {"xform_role": "coach"},
            "user_metadata": {"full_name": payload.full_name, "professional_title": payload.professional_title},
        }).json()
        coach_id = account.get("id")
        if not coach_id:
            raise APIError(503, "coach_creation_uncertain", "Could not confirm account creation. Check the coach list before retrying.")
        # Auth insert + profile/coach/settings trigger is one DB transaction. Audit is a
        # separate request: never hide successful creation or its password if audit fails.
        audit_recorded = True
        try:
            self._rpc("admin_record_coach_onboarding", {"target_coach_id": coach_id})
        except APIError:
            audit_recorded = False
            logger.warning("Coach onboarding audit could not be recorded")
        return {"id": coach_id, "full_name": payload.full_name, "email": account["email"],
                "initial_password": password, "email_sent": False, "audit_recorded": audit_recorded}
