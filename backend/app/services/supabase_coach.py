from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseAdminGateway, SupabaseGateway
from app.schemas.coach import ClientOnboardingCreate


logger = logging.getLogger(__name__)


class SupabaseCoachService:
    """Coach-only onboarding over a caller JWT plus an explicit Admin Auth seam."""

    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = SupabaseGateway(settings, user.access_token)

    def invite_and_onboard_client(self, payload: ClientOnboardingCreate) -> dict[str, Any]:
        self._require_active_coach()
        admin = SupabaseAdminGateway(self.settings)
        invitation = admin.request(
            "POST",
            "/auth/v1/invite",
            json={
                "email": str(payload.email),
                "data": {
                    "full_name": payload.full_name,
                    "first_name": payload.full_name.split(maxsplit=1)[0],
                    "xform_invitation": True,
                    "xform_password_set": False,
                },
                "redirect_to": self.settings.client_invite_redirect_url,
            },
        ).json()
        client_id = invitation.get("id") or invitation.get("user", {}).get("id")
        if not client_id:
            raise APIError(503, "invitation_failed", "Supabase did not return the invited client identity")

        try:
            client = self._configure_client(admin, client_id, payload)
        except Exception:
            self._delete_unfinished_invitation(admin, client_id)
            raise

        return {
            "id": client_id,
            "client_code": client["client_code"],
            "full_name": payload.full_name,
            "email": payload.email,
            "primary_goal": client["primary_goal"],
            "check_in_day": client["check_in_day"],
            "invitation_sent": True,
        }

    def _require_active_coach(self) -> None:
        profile = self._one("profiles", {"id": f"eq.{self.user.id}"}, "workspace_not_found")
        if profile.get("role") != "coach":
            raise APIError(403, "coach_role_required", "Coach workspace access is required")
        coach = self._one("coaches", {"id": f"eq.{self.user.id}"}, "coach_workspace_not_found")
        if not coach.get("is_active"):
            raise APIError(403, "coach_inactive", "This coach workspace is inactive")

    def _configure_client(
        self, admin: SupabaseAdminGateway, client_id: str, payload: ClientOnboardingCreate
    ) -> dict[str, Any]:
        client_rows = self._admin_write(
            admin,
            "PATCH",
            "clients",
            {
                "primary_goal": payload.primary_goal,
                "check_in_day": payload.check_in_day,
                "timezone": payload.timezone,
                "dietary_preferences": payload.dietary_preferences,
                "allergies_injuries": payload.allergies_injuries,
            },
            params={"id": f"eq.{client_id}"},
        )
        if not client_rows:
            raise APIError(503, "client_workspace_not_ready", "Client workspace provisioning did not complete")

        self._admin_write(
            admin,
            "PATCH",
            "client_tracking_preferences",
            {
                "enabled_measurements": payload.enabled_measurements,
                "updated_by_coach_id": self.user.id,
            },
            params={"client_id": f"eq.{client_id}"},
        )
        self._admin_write(
            admin,
            "POST",
            "coach_client_assignments",
            {"coach_id": self.user.id, "client_id": client_id, "assigned_by": self.user.id},
        )
        if payload.target_weight_kg is not None:
            self._admin_write(
                admin,
                "POST",
                "client_targets",
                {
                    "client_id": client_id,
                    "metric": "weight_kg",
                    "target_value": payload.target_weight_kg,
                    "set_by_profile_id": self.user.id,
                },
            )
        if payload.private_coach_note:
            self._admin_write(
                admin,
                "POST",
                "coach_private_notes",
                {"client_id": client_id, "author_coach_id": self.user.id, "note": payload.private_coach_note},
            )
        self._admin_write(
            admin,
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "client_id": client_id,
                "action": "client_created",
                "entity_type": "client",
                "entity_id": client_id,
                "metadata": {"source": "coach_portal", "invitation_delivery": "requested"},
            },
        )
        return client_rows[0]

    def _one(self, table: str, params: dict[str, Any], code: str) -> dict[str, Any]:
        response = self.gateway.request("GET", f"/rest/v1/{table}", params={"select": "*", **params})
        rows = response.json()
        if not rows:
            raise APIError(403, code, "The current workspace is not authorized for this action")
        return rows[0]

    @staticmethod
    def _admin_write(
        admin: SupabaseAdminGateway,
        method: str,
        table: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        response = admin.request(
            method,
            f"/rest/v1/{table}",
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        return response.json()

    @staticmethod
    def _delete_unfinished_invitation(admin: SupabaseAdminGateway, client_id: str) -> None:
        try:
            admin.request("DELETE", f"/auth/v1/admin/users/{client_id}")
        except Exception:
            logger.exception("Could not remove partially provisioned client invitation", extra={"client_id": client_id})
