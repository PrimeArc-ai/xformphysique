from __future__ import annotations

from datetime import date, datetime
import logging
from typing import Any
from urllib.parse import quote

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseAdminGateway, SupabaseGateway
from app.schemas.coach import (
    ClientCoachingContextUpdate,
    ClientOnboardingCreate,
    ClientSetup,
    CoachSettingsUpdate,
    ExerciseLibraryCreate,
    ExerciseLibraryUpdate,
    FoodLibraryCreate,
    FoodLibraryUpdate,
    PrivateNoteCreate,
)
from app.services.r2_photo_storage import R2PhotoStorage
from app.services.progress import schedule


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
        checkins, offset = [], 0
        while True:
            page = self._rows("weekly_checkins", {"order": "period_start.desc,id.desc", "limit": 500, "offset": offset})
            checkins.extend(page)
            if len(page) < 500:
                break
            offset += 500
        latest_body = self._latest_by_client(body_entries, "entry_date")
        latest_checkin = self._latest_by_client(checkins, "period_start")
        preference_rows = self._rows("client_tracking_preferences", {"limit": 200})
        thresholds = {
            row["client_id"]: row.get("missing_weight_threshold_days") for row in preference_rows
        }

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
            raw_threshold = thresholds.get(client_id)
            threshold_days = 3 if raw_threshold is None else int(raw_threshold)
            schedule_payload = schedule(client, [c for c in checkins if c["client_id"] == client_id])
            items.append(
                self._client_list_item(
                    client,
                    profile,
                    latest_entry,
                    latest_checkin_row,
                    threshold_days=threshold_days,
                    schedule_payload=schedule_payload,
                )
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
        photos = self._rows("progress_photos", {"client_id": f"eq.{client_id}", "deleted_at": "is.null", "limit": 100})
        latest_entry = max(body_entries, key=lambda item: item["entry_date"]) if body_entries else None
        latest_checkin = checkins[0] if checkins else None
        ordered_entries = sorted(body_entries, key=lambda item: item["entry_date"])
        return {
            "client": self._client_list_item(client, profile, latest_entry, latest_checkin),
            "body_entries": [self._body_entry(item) for item in ordered_entries],
            "checkins": [self._checkin(item) for item in checkins],
            "photo_count": len(photos),
            "progress_photos": [self._progress_photo(item, client_id) for item in photos],
            "coaching_context": self._coaching_context(context),
            "private_notes": [self._private_note(item) for item in private_notes],
            "setup": self._client_setup(client_id, client),
        }

    def get_client_progress_photo_content(self, client_id: str, photo_id: str) -> tuple[bytes, str, str]:
        """Return bytes only after confirming this coach still owns the client assignment."""

        self._require_active_coach()
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        photo = self._one(
            "progress_photos",
            {"id": f"eq.{photo_id}", "client_id": f"eq.{client_id}", "deleted_at": "is.null"},
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

    def save_private_note(self, client_id: str, payload: PrivateNoteCreate) -> dict[str, Any]:
        """Append a coach-only note. Clients never read these rows."""

        self._require_active_coach()
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        rows = self._write(
            "POST",
            "coach_private_notes",
            {
                "client_id": client_id,
                "author_coach_id": self.user.id,
                "note": payload.note,
            },
        )
        if not rows:
            raise APIError(503, "note_save_failed", "Private note was not saved")
        self._write(
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "client_id": client_id,
                "action": "coach_note_saved",
                "entity_type": "coach_private_note",
                "entity_id": rows[0].get("id"),
                "metadata": {"source": "coach_client_review"},
            },
        )
        return self._private_note(rows[0])

    def save_setup(self, client_id: str, payload: ClientSetup) -> dict[str, Any]:
        """Persist Review setup: client profile, measurements, and active targets."""

        self._require_active_coach()
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        self._write(
            "PATCH",
            "clients",
            {
                "primary_goal": payload.primary_goal,
                "check_in_day": payload.check_in_day,
                "dietary_preferences": payload.dietary_preferences,
                "allergies_injuries": payload.allergies_injuries,
            },
            params={"id": f"eq.{client_id}"},
        )
        self._write(
            "PATCH",
            "client_tracking_preferences",
            {
                "enabled_measurements": payload.enabled_measurements,
                "updated_by_coach_id": self.user.id,
            },
            params={"client_id": f"eq.{client_id}"},
        )
        self._upsert_active_target(client_id, "weight_kg", payload.target_weight_kg, payload.target_date)
        self._upsert_active_target(client_id, "waist_cm", payload.target_waist_cm, payload.target_date)
        self._write(
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "client_id": client_id,
                "action": "client_profile_updated",
                "entity_type": "client",
                "entity_id": client_id,
                "metadata": {"source": "coach_client_review"},
            },
        )
        return self._client_setup(client_id)

    def list_libraries(self) -> dict[str, list[dict[str, Any]]]:
        """Return this coach's food and exercise libraries, including inactive rows."""

        self._require_active_coach()
        food = self._rows(
            "food_library_items",
            {"owner_coach_id": f"eq.{self.user.id}", "order": "name.asc", "limit": 2000},
        )
        exercises = self._rows(
            "exercise_library_items",
            {"owner_coach_id": f"eq.{self.user.id}", "order": "name.asc", "limit": 2000},
        )
        return {
            "food": [self._food_item(item) for item in sorted(food, key=lambda row: row["name"].lower())],
            "exercises": [
                self._exercise_item(item) for item in sorted(exercises, key=lambda row: row["name"].lower())
            ],
        }

    def create_food_item(self, payload: FoodLibraryCreate) -> dict[str, Any]:
        self._require_active_coach()
        rows = self._write_library(
            "POST",
            "food_library_items",
            {"owner_coach_id": self.user.id, **payload.model_dump()},
        )
        if not rows:
            raise APIError(503, "library_item_save_failed", "Food library item was not saved")
        item = rows[0]
        self._audit_library("food_library_item_saved", "food_library_item", item)
        return self._food_item(item)

    def update_food_item(self, item_id: str, payload: FoodLibraryUpdate) -> dict[str, Any]:
        self._require_active_coach()
        self._one("food_library_items", {"id": f"eq.{item_id}"}, "library_item_forbidden")
        rows = self._write_library(
            "PATCH",
            "food_library_items",
            payload.model_dump(exclude_unset=True),
            params={"id": f"eq.{item_id}"},
        )
        if not rows:
            raise APIError(403, "library_item_forbidden", "The current workspace is not authorized for this action")
        item = rows[0]
        self._audit_library("food_library_item_saved", "food_library_item", item)
        return self._food_item(item)

    def create_exercise_item(self, payload: ExerciseLibraryCreate) -> dict[str, Any]:
        self._require_active_coach()
        rows = self._write_library(
            "POST",
            "exercise_library_items",
            {"owner_coach_id": self.user.id, **payload.model_dump()},
        )
        if not rows:
            raise APIError(503, "library_item_save_failed", "Exercise library item was not saved")
        item = rows[0]
        self._audit_library("exercise_library_item_saved", "exercise_library_item", item)
        return self._exercise_item(item)

    def update_exercise_item(self, item_id: str, payload: ExerciseLibraryUpdate) -> dict[str, Any]:
        self._require_active_coach()
        self._one("exercise_library_items", {"id": f"eq.{item_id}"}, "library_item_forbidden")
        rows = self._write_library(
            "PATCH",
            "exercise_library_items",
            payload.model_dump(exclude_unset=True),
            params={"id": f"eq.{item_id}"},
        )
        if not rows:
            raise APIError(403, "library_item_forbidden", "The current workspace is not authorized for this action")
        item = rows[0]
        self._audit_library("exercise_library_item_saved", "exercise_library_item", item)
        return self._exercise_item(item)

    def _write_library(
        self,
        method: str,
        table: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        try:
            return self._write(method, table, payload, params=params)
        except APIError as exc:
            message = exc.message or ""
            if (
                exc.status_code == 409
                or exc.code == "23505"
                or "23505" in message
                or "duplicate key" in message.lower()
            ):
                raise APIError(
                    409,
                    "library_item_name_conflict",
                    "A library item with this name already exists",
                ) from exc
            raise

    def get_settings(self) -> dict[str, Any]:
        """Return this coach's settings row, inserting database defaults if missing."""

        self._require_active_coach()
        row = self._one_or_none("coach_settings", {"coach_id": f"eq.{self.user.id}"})
        if row is None:
            rows = self._write("POST", "coach_settings", {"coach_id": self.user.id})
            if not rows:
                raise APIError(503, "settings_save_failed", "Coach settings were not created")
            row = rows[0]
        return self._settings_payload(row)

    def save_settings(self, payload: CoachSettingsUpdate) -> dict[str, Any]:
        """Persist coach-wide defaults. Does not write formula_registry."""

        self._require_active_coach()
        fields = payload.model_dump()
        rows = self._write(
            "PATCH",
            "coach_settings",
            fields,
            params={"coach_id": f"eq.{self.user.id}"},
        )
        if not rows:
            rows = self._write("POST", "coach_settings", {"coach_id": self.user.id, **fields})
        if not rows:
            raise APIError(503, "settings_save_failed", "Coach settings were not saved")
        row = rows[0]
        self._write(
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "action": "coach_settings_saved",
                "entity_type": "coach_settings",
                "entity_id": self.user.id,
                "metadata": {
                    "unit": payload.weight_unit,
                    "threshold": payload.default_missing_weight_threshold_days,
                },
            },
        )
        return self._settings_payload(row)

    @staticmethod
    def _settings_payload(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "weight_unit": row["weight_unit"],
            "default_check_in_day": row["default_check_in_day"],
            "default_missing_weight_threshold_days": int(row["default_missing_weight_threshold_days"]),
            "default_measurement_refresh_threshold_days": int(row["default_measurement_refresh_threshold_days"]),
            "enabled_measurements": list(row.get("enabled_measurements") or ["weight_kg", "waist_cm"]),
        }

    def _audit_library(self, action: str, entity_type: str, item: dict[str, Any]) -> None:
        self._write(
            "POST",
            "audit_events",
            {
                "actor_profile_id": self.user.id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": item.get("id"),
                "metadata": {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "is_active": bool(item.get("is_active", True)),
                },
            },
        )

    def _food_item(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item["id"],
            "name": item["name"],
            "category": item["category"],
            "calories_kcal": self._number(item.get("calories_kcal")),
            "protein_g": self._number(item.get("protein_g")),
            "carbs_g": self._number(item.get("carbs_g")),
            "fat_g": self._number(item.get("fat_g")),
            "is_active": bool(item.get("is_active", True)),
        }

    @staticmethod
    def _exercise_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item["id"],
            "name": item["name"],
            "body_region": item["body_region"],
            "training_focus": item["training_focus"],
            "guidance": item.get("guidance") or "",
            "is_active": bool(item.get("is_active", True)),
        }

    def _client_setup(self, client_id: str, client: dict[str, Any] | None = None) -> dict[str, Any]:
        client = client or self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        prefs = self._one_or_none("client_tracking_preferences", {"client_id": f"eq.{client_id}"})
        targets = self._rows(
            "client_targets",
            {"client_id": f"eq.{client_id}", "is_active": "eq.true", "limit": 20},
        )
        return self._setup_payload(client, prefs, targets)

    def _upsert_active_target(
        self,
        client_id: str,
        metric: str,
        value: float | None,
        target_date: date | None,
    ) -> None:
        existing = self._one_or_none(
            "client_targets",
            {"client_id": f"eq.{client_id}", "metric": f"eq.{metric}", "is_active": "eq.true"},
        )
        if value is None:
            if existing:
                self._write(
                    "PATCH",
                    "client_targets",
                    {"is_active": False},
                    params={"id": f"eq.{existing['id']}"},
                )
            return
        fields = {
            "target_value": value,
            "target_date": target_date.isoformat() if target_date else None,
            "set_by_profile_id": self.user.id,
        }
        if existing:
            self._write("PATCH", "client_targets", fields, params={"id": f"eq.{existing['id']}"})
            return
        self._write(
            "POST",
            "client_targets",
            {"client_id": client_id, "metric": metric, **fields},
        )

    def _require_active_coach(self) -> None:
        profile = self._one("profiles", {"id": f"eq.{self.user.id}"}, "workspace_not_found")
        if profile.get("role") != "coach":
            raise APIError(403, "coach_role_required", "Coach workspace access is required")
        coach = self._one("coaches", {"id": f"eq.{self.user.id}"}, "coach_workspace_not_found")
        if not coach.get("is_active"):
            raise APIError(403, "coach_inactive", "This coach workspace is inactive")

    def progress_service(self, client_id: str):
        """Reuse progress reads under the SAME coach JWT, never a service-role token."""
        from app.services.supabase_client import SupabaseClientService
        self._require_active_coach()
        self._one("clients", {"id": f"eq.{client_id}"}, "client_not_found")
        service = SupabaseClientService(self.settings, self.user)
        service.client_id = client_id
        return service

    def save_weekly_feedback(self, client_id, checkin_id, payload):
        self.progress_service(client_id)
        return self.gateway.request("POST", "/rest/v1/rpc/save_weekly_feedback", json={
            "p_client_id": client_id, "p_checkin_id": checkin_id, "p_feedback": payload.model_dump()}).json()

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

    @staticmethod
    def _optional_date(value: Any) -> date | None:
        if value in (None, ""):
            return None
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        return date.fromisoformat(str(value)[:10])

    def _setup_payload(
        self,
        client: dict[str, Any],
        prefs: dict[str, Any] | None,
        targets: list[dict[str, Any]],
    ) -> dict[str, Any]:
        by_metric = {row["metric"]: row for row in targets}
        weight = by_metric.get("weight_kg")
        waist = by_metric.get("waist_cm")
        target_date = None
        if weight and weight.get("target_date"):
            target_date = self._optional_date(weight["target_date"])
        elif waist and waist.get("target_date"):
            target_date = self._optional_date(waist["target_date"])
        return {
            "primary_goal": client["primary_goal"],
            "check_in_day": client["check_in_day"],
            "timezone": client.get("timezone") or "Asia/Kolkata",
            "dietary_preferences": client.get("dietary_preferences") or "",
            "allergies_injuries": client.get("allergies_injuries") or "",
            "enabled_measurements": list(
                (prefs or {}).get("enabled_measurements") or ["weight_kg", "waist_cm"]
            ),
            "target_weight_kg": self._number(weight["target_value"]) if weight else None,
            "target_waist_cm": self._number(waist["target_value"]) if waist else None,
            "target_date": target_date,
        }

    def _client_list_item(
        self,
        client: dict[str, Any],
        profile: dict[str, Any],
        latest_entry: dict[str, Any] | None,
        latest_checkin: dict[str, Any] | None,
        threshold_days: int = 3,
        schedule_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        entry_date = date.fromisoformat(latest_entry["entry_date"]) if latest_entry else None
        schedule_payload = schedule_payload or {}
        consecutive_missed = int(schedule_payload.get("consecutive_missed") or 0)
        overdue = schedule_payload.get("current_status") == "overdue"
        attention_reasons: list[str] = []
        if entry_date is None:
            stale_weight = True
            attention_reasons.append("No body entry")
        else:
            age_days = (date.today() - entry_date).days
            stale_weight = age_days > threshold_days
            if stale_weight:
                attention_reasons.append(f"No body entry for {age_days} days")
        if overdue:
            attention_reasons.append("Weekly check-in overdue")
        if consecutive_missed >= 3:
            attention_reasons.append(f"{consecutive_missed} consecutive missed check-ins")
        needs_attention = stale_weight or overdue or consecutive_missed >= 3
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
            "attention_reasons": attention_reasons,
            "check_in_schedule": schedule_payload,
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
