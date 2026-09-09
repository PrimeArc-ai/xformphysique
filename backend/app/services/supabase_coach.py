from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any
from urllib.parse import quote

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseAdminGateway, SupabaseGateway
from app.schemas.coach import ClientCoachingContextUpdate, ClientOnboardingCreate
from app.services.r2_photo_storage import R2PhotoStorage


logger = logging.getLogger(__name__)


class SupabaseCoachService:
    """Coach-only onboarding over a caller JWT plus an explicit Admin Auth seam."""

    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = (
            SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None
        )

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

    def list_clients(self) -> dict[str, list[dict[str, Any]]]:
        """Return the coach's assigned roster with server-derived data-quality state.

        Every query carries the coach JWT; Supabase RLS is the final ownership
        check, not a client identifier supplied by the browser.
        """

        if self.gateway is None:
            return {"items": []}
        self._require_active_coach()
        clients = self._rows("clients", {"order": "created_at.desc", "limit": 200})
        client_ids = {client["id"] for client in clients}
        profiles = self._rows("profiles", {"role": "eq.client", "limit": 200})
        profiles_by_id = {profile["id"]: profile for profile in profiles if profile["id"] in client_ids}
        body_entries = self._rows("body_entries", {"order": "entry_date.desc", "limit": 5000})
        checkins = self._rows("weekly_checkins", {"order": "period_start.desc", "limit": 5000})
        latest_body = self._latest_by_client(body_entries, "entry_date")
        latest_checkin = self._latest_by_client(checkins, "period_start")

        items = []
        for client in clients:
            client_id = client["id"]
            profile = profiles_by_id.get(client_id)
            if profile is None:
                # A profile is provisioned with every client identity. Omitting an
                # incomplete row is safer than exposing an anonymous workspace.
                continue
            latest_entry = latest_body.get(client_id)
            latest_checkin_row = latest_checkin.get(client_id)
            items.append(
                self._client_list_item(client, profile, latest_entry, latest_checkin_row)
            )
        return {"items": items}

    def get_client_review(self, client_id: str) -> dict[str, Any]:
        """Return raw client-recorded signals for one assigned client only."""

        self._require_active_coach()
        client = self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        profile = self._one("profiles", {"id": f"eq.{client_id}"}, "client_not_found")
        body_entries = self._rows(
            "body_entries",
            {"client_id": f"eq.{client_id}", "order": "entry_date.desc", "limit": 100},
        )
        checkins = self._rows(
            "weekly_checkins",
            {"client_id": f"eq.{client_id}", "order": "period_start.desc", "limit": 24},
        )
        context = self._one_or_none("client_coaching_context", {"client_id": f"eq.{client_id}"})
        if context is None:
            raise APIError(404, "coaching_context_not_found", "Client coaching context was not provisioned")
        private_notes = self._rows(
            "coach_private_notes",
            {"client_id": f"eq.{client_id}", "order": "created_at.desc", "limit": 20},
        )
        photos = self._rows("progress_photos", {"client_id": f"eq.{client_id}", "limit": 100})
        latest_entry = body_entries[0] if body_entries else None
        latest_checkin = checkins[0] if checkins else None
        return {
            "client": self._client_list_item(client, profile, latest_entry, latest_checkin),
            "body_entries": [self._body_entry(item) for item in body_entries],
            "checkins": [self._checkin(item) for item in checkins],
            "photo_count": len(photos),
            "progress_photos": [self._progress_photo(item, client_id) for item in photos],
            "coaching_context": self._coaching_context(context),
            "private_notes": [self._private_note(item) for item in private_notes],
        }

    def get_client_progress_photo_content(self, client_id: str, photo_id: str) -> tuple[bytes, str, str]:
        """Return bytes only after confirming this coach still owns the client assignment."""

        self._require_active_coach()
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        photo = self._one(
            "progress_photos",
            {"id": f"eq.{photo_id}", "client_id": f"eq.{client_id}"},
            "photo_not_found",
        )
        if photo.get("storage_provider") == "r2":
            return (
                R2PhotoStorage(self.settings).read(photo["storage_path"]),
                photo["content_type"],
                photo["original_filename"],
            )
        response = self.gateway.request(
            "GET", f"/storage/v1/object/authenticated/progress-photos/{quote(photo['storage_path'])}"
        )
        return response.content, photo["content_type"], photo["original_filename"]

    def update_client_coaching_context(
        self, client_id: str, payload: ClientCoachingContextUpdate
    ) -> dict[str, Any]:
        """Save coach guidance for the target client, guarded by assignment RLS."""

        self._require_active_coach()
        # Resolve through the caller JWT before mutation so an unassigned ID is
        # never silently updated, even if a future policy is accidentally relaxed.
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_by_coach_id"] = self.user.id
        rows = self._write(
            "PATCH",
            "client_coaching_context",
            updates,
            params={"client_id": f"eq.{client_id}"},
        )
        if not rows:
            raise APIError(404, "coaching_context_not_found", "Client coaching context was not found")
        self._write(
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "client_id": client_id,
                "action": "coach_note_saved",
                "entity_type": "client_coaching_context",
                "metadata": {"source": "coach_client_review"},
            },
        )
        return self._coaching_context(rows[0])

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

    def _one_or_none(self, table: str, params: dict[str, Any]) -> dict[str, Any] | None:
        rows = self._rows(table, {**params, "limit": 1})
        return rows[0] if rows else None

    def _rows(self, table: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        response = self.gateway.request("GET", f"/rest/v1/{table}", params={"select": "*", **(params or {})})
        return response.json()

    def _write(
        self,
        method: str,
        table: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        response = self.gateway.request(
            method,
            f"/rest/v1/{table}",
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        return response.json()

    @staticmethod
    def _latest_by_client(
        rows: list[dict[str, Any]], date_field: str
    ) -> dict[str, dict[str, Any]]:
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            client_id = row["client_id"]
            if client_id not in latest or row[date_field] > latest[client_id][date_field]:
                latest[client_id] = row
        return latest

    @staticmethod
    def _number(value: Any) -> float | None:
        return float(value) if value is not None else None

    def _client_list_item(
        self,
        client: dict[str, Any],
        profile: dict[str, Any],
        latest_entry: dict[str, Any] | None,
        latest_checkin: dict[str, Any] | None,
    ) -> dict[str, Any]:
        entry_date = date.fromisoformat(latest_entry["entry_date"]) if latest_entry else None
        needs_attention = entry_date is None or date.today() - entry_date > timedelta(days=3)
        return {
            "id": client["id"],
            "client_code": client["client_code"],
            "full_name": profile["full_name"],
            "primary_goal": client["primary_goal"],
            "check_in_day": client["check_in_day"],
            "timezone": client["timezone"],
            "latest_weight_kg": self._number(latest_entry.get("weight_kg")) if latest_entry else None,
            "latest_entry_date": entry_date,
            "latest_checkin_period_start": latest_checkin.get("period_start") if latest_checkin else None,
            "latest_checkin_submitted_at": latest_checkin.get("submitted_at") if latest_checkin else None,
            "needs_attention": needs_attention,
        }

    def _body_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": entry["id"],
            "entry_date": entry["entry_date"],
            "weight_kg": self._number(entry["weight_kg"]),
            "waist_cm": self._number(entry.get("waist_cm")),
            "hip_cm": self._number(entry.get("hip_cm")),
            "body_fat_pct": self._number(entry.get("body_fat_pct")),
            "created_at": entry["created_at"],
        }

    @staticmethod
    def _checkin(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            key: entry.get(key)
            for key in (
                "id",
                "period_start",
                "submitted_at",
                "energy_score",
                "sleep_score",
                "sentiment",
                "observation",
                "concern",
            )
        }

    @staticmethod
    def _coaching_context(context: dict[str, Any]) -> dict[str, Any]:
        return {
            "client_id": context["client_id"],
            "client_visible_coach_note": context["client_visible_coach_note"],
            "training_considerations": context["training_considerations"],
            "safety_notice": context["safety_notice"],
            "updated_at": context["updated_at"],
        }

    @staticmethod
    def _private_note(note: dict[str, Any]) -> dict[str, Any]:
        return {key: note[key] for key in ("id", "note", "created_at")}

    @staticmethod
    def _progress_photo(photo: dict[str, Any], client_id: str) -> dict[str, Any]:
        return {
            "id": photo["id"],
            "view": photo["view"],
            "captured_on": photo["captured_on"],
            "file_name": photo["original_filename"],
            "content_url": f"/api/v1/coach/clients/{client_id}/progress-photos/{photo['id']}/content",
        }

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
