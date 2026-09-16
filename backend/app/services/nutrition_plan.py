from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseGateway
from app.schemas.nutrition_plan import NutritionPlanSnapshot


class NutritionPlanService:
    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = (
            SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None
        )

    def get_workspace(self, client_id: str) -> dict[str, Any]:
        self._require_client_access(client_id)
        select = (
            "id,client_id,name,status,version,active_from,active_to,replaces_plan_id,"
            "calories_kcal,protein_g,carbs_g,fat_g,"
            "nutrition_plan_restrictions(restriction),"
            "meals(id,position,meal_time,name,calories_kcal,protein_g,carbs_g,fat_g,"
            "coach_instructions,preparation,"
            "meal_ingredients(id,position,food_library_item_id,ingredient_name,quantity,unit))"
        )
        active = self._rows(
            "nutrition_plans",
            {
                "select": select,
                "client_id": f"eq.{client_id}",
                "status": "eq.published",
                "order": "published_at.desc",
                "limit": 1,
            },
        )
        draft = self._rows(
            "nutrition_plans",
            {
                "select": select,
                "client_id": f"eq.{client_id}",
                "status": "eq.draft",
                "limit": 1,
            },
        )
        food_library = self._rows(
            "food_library_items",
            {
                "select": "id,name,category,calories_kcal,protein_g,carbs_g,fat_g",
                "owner_coach_id": f"eq.{self.user.id}",
                "is_active": "eq.true",
                "order": "name.asc",
            },
        )
        return {
            "active_plan": self._normalize_plan(active[0]) if active else None,
            "draft": self._normalize_plan(draft[0]) if draft else None,
            "food_library": food_library,
        }

    def save_draft(
        self,
        client_id: str,
        snapshot: NutritionPlanSnapshot,
    ) -> dict[str, Any]:
        self._require_client_access(client_id)
        result = self._rpc(
            "/rest/v1/rpc/save_nutrition_plan_draft",
            {
                "p_client_id": client_id,
                "p_snapshot": snapshot.model_dump(mode="json"),
            },
        )
        return {"plan": self._normalize_plan(result["plan"])}

    def publish(
        self,
        client_id: str,
        publish_key: UUID,
        snapshot: NutritionPlanSnapshot,
    ) -> dict[str, Any]:
        self._require_client_access(client_id)
        result = self._rpc(
            "/rest/v1/rpc/publish_nutrition_plan",
            {
                "p_client_id": client_id,
                "p_publish_key": str(publish_key),
                "p_snapshot": snapshot.model_dump(mode="json"),
            },
        )
        return {
            "plan": self._normalize_plan(result["plan"]),
            "meal_count": result["meal_count"],
        }

    def _rpc(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        gateway = self._require_gateway()
        try:
            return gateway.request("POST", path, json=payload).json()
        except APIError as exc:
            provider_message = exc.message.lower()
            if (
                exc.status_code == 403
                or exc.code in {"42501", "authorization_failed"}
                or "42501" in provider_message
            ):
                raise APIError(403, "authorization_failed", exc.message) from exc
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
                    "nutrition_plan_publish_conflict",
                    "The nutrition plan changed while publishing; refresh and try again",
                ) from exc
            if (
                exc.status_code in {400, 422}
                or exc.code == "22023"
                or "22023" in provider_message
            ):
                raise APIError(422, exc.code, exc.message, exc.fields) from exc
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
    def _normalize_plan(row: dict[str, Any]) -> dict[str, Any]:
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
                "replaces_plan_id",
                "calories_kcal",
                "protein_g",
                "carbs_g",
                "fat_g",
            )
        }
        restrictions = row.get("nutrition_plan_restrictions")
        result["restrictions"] = (
            [item["restriction"] for item in restrictions]
            if restrictions is not None
            else row.get("restrictions", [])
        )
        result["meals"] = []
        for raw_meal in sorted(row.get("meals", []), key=lambda meal: meal["position"]):
            meal = {
                key: raw_meal.get(key)
                for key in (
                    "id",
                    "position",
                    "meal_time",
                    "name",
                    "calories_kcal",
                    "protein_g",
                    "carbs_g",
                    "fat_g",
                    "coach_instructions",
                    "preparation",
                )
            }
            raw_ingredients = raw_meal.get(
                "meal_ingredients",
                raw_meal.get("ingredients", []),
            )
            meal["ingredients"] = [
                {
                    key: ingredient.get(key)
                    for key in (
                        "id",
                        "position",
                        "food_library_item_id",
                        "ingredient_name",
                        "quantity",
                        "unit",
                    )
                }
                for ingredient in sorted(
                    raw_ingredients,
                    key=lambda ingredient: ingredient["position"],
                )
            ]
            result["meals"].append(meal)
        return result
