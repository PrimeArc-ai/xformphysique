from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseGateway
from app.schemas.workout_program import WorkoutProgramSnapshot


class WorkoutProgramService:
    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = (
            SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None
        )

    def get_workspace(self, client_id: str) -> dict[str, Any]:
        self._require_client_access(client_id)
        select = (
            "id,client_id,name,coach_note,status,version,active_from,active_to,"
            "replaces_program_id,training_program_days(id,position,weekday,name,coach_note,"
            "training_program_day_exercises(id,position,exercise_library_item_id,name,"
            "prescribed_sets,prescribed_reps,rest_seconds,coach_note))"
        )
        active = self._rows(
            "training_programs",
            {
                "select": select,
                "client_id": f"eq.{client_id}",
                "status": "eq.published",
                "order": "published_at.desc",
                "limit": 1,
            },
        )
        draft = self._rows(
            "training_programs",
            {
                "select": select,
                "client_id": f"eq.{client_id}",
                "status": "eq.draft",
                "limit": 1,
            },
        )
        library = self._rows(
            "exercise_library_items",
            {
                "select": "id,name,body_region,training_focus",
                "owner_coach_id": f"eq.{self.user.id}",
                "is_active": "eq.true",
                "order": "name.asc",
            },
        )
        return {
            "active_program": self._normalize_program(active[0]) if active else None,
            "draft": self._normalize_program(draft[0]) if draft else None,
            "exercise_library": library,
        }

    def save_draft(
        self,
        client_id: str,
        snapshot: WorkoutProgramSnapshot,
    ) -> dict[str, Any]:
        self._require_client_access(client_id)
        return self._rpc(
            "/rest/v1/rpc/save_workout_program_draft",
            {
                "p_client_id": client_id,
                "p_snapshot": snapshot.model_dump(mode="json"),
            },
        )

    def publish(
        self,
        client_id: str,
        publish_key: UUID,
        snapshot: WorkoutProgramSnapshot,
    ) -> dict[str, Any]:
        self._require_client_access(client_id)
        return self._rpc(
            "/rest/v1/rpc/publish_workout_program",
            {
                "p_client_id": client_id,
                "p_publish_key": str(publish_key),
                "p_snapshot": snapshot.model_dump(mode="json"),
            },
        )

    def _rpc(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        gateway = self._require_gateway()
        try:
            return gateway.request("POST", path, json=payload).json()
        except APIError as exc:
            provider_message = exc.message.lower()
            if (
                exc.status_code == 409
                or exc.code in {"23505", "40001"}
                or "23505" in provider_message
                or "40001" in provider_message
                or "duplicate key" in provider_message
                or "serialize access" in provider_message
                or "serialization failure" in provider_message
            ):
                raise APIError(
                    409,
                    "program_publish_conflict",
                    "The workout program changed while publishing; refresh and try again",
                ) from exc
            if (
                exc.status_code in {400, 422}
                or exc.code == "22023"
                or "22023" in provider_message
            ):
                raise APIError(422, exc.code, exc.message, exc.fields) from exc
            if exc.code == "42501" or "42501" in provider_message:
                raise APIError(403, "authorization_failed", exc.message) from exc
            raise

    def _rows(self, table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        return self._require_gateway().request(
            "GET",
            f"/rest/v1/{table}",
            params=params,
        ).json()

    def _require_client_access(self, client_id: str) -> None:
        profile = self._rows(
            "profiles",
            {"select": "id,role", "id": f"eq.{self.user.id}"},
        )
        if not profile or profile[0].get("role") != "coach":
            raise APIError(
                403,
                "coach_role_required",
                "An active coach account is required",
            )

        coach = self._rows(
            "coaches",
            {"select": "id,is_active", "id": f"eq.{self.user.id}"},
        )
        if not coach or not coach[0].get("is_active"):
            raise APIError(
                403,
                "coach_role_required",
                "An active coach account is required",
            )

        client = self._rows(
            "clients",
            {"select": "id", "id": f"eq.{client_id}"},
        )
        if not client:
            raise APIError(
                404,
                "client_not_found",
                "Client not found or not assigned to this coach",
            )

    def _require_gateway(self) -> SupabaseGateway:
        if self.gateway is None:
            raise APIError(
                503,
                "supabase_not_configured",
                "Supabase integration is not configured",
            )
        return self.gateway

    @staticmethod
    def _normalize_program(row: dict[str, Any]) -> dict[str, Any]:
        result = {
            key: row.get(key)
            for key in (
                "id",
                "client_id",
                "name",
                "status",
                "version",
                "active_from",
                "active_to",
                "replaces_program_id",
            )
        }
        result["notes"] = row.get("coach_note", "")
        result["days"] = []
        for raw_day in sorted(
            row.get("training_program_days", []),
            key=lambda day: day["position"],
        ):
            day = {
                key: raw_day.get(key)
                for key in ("id", "position", "weekday", "name", "coach_note")
            }
            day["exercises"] = [
                {
                    key: raw_exercise.get(key)
                    for key in (
                        "id",
                        "exercise_library_item_id",
                        "position",
                        "name",
                        "prescribed_sets",
                        "prescribed_reps",
                        "rest_seconds",
                        "coach_note",
                    )
                }
                for raw_exercise in sorted(
                    raw_day.get("training_program_day_exercises", []),
                    key=lambda exercise: exercise["position"],
                )
            ]
            result["days"].append(day)
        return result
