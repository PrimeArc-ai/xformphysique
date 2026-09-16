from __future__ import annotations

from copy import deepcopy
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.main import app
from app.schemas.nutrition_plan import NutritionPlanSnapshot
from app.services.nutrition_plan import NutritionPlanService


COACH_ID = "30000000-0000-0000-0000-000000000001"
CLIENT_ID = "30000000-0000-0000-0000-000000000002"
PLAN_ID = "30000000-0000-0000-0000-000000000003"
MEAL_IDS = (
    "30000000-0000-0000-0000-000000000004",
    "30000000-0000-0000-0000-000000000005",
)
INGREDIENT_IDS = (
    "30000000-0000-0000-0000-000000000006",
    "30000000-0000-0000-0000-000000000007",
)
FOOD_ID = "30000000-0000-0000-0000-000000000008"
PUBLISH_KEY = UUID("40000000-0000-0000-0000-000000000001")


class FakeResponse:
    def __init__(self, status_code: int, payload: object):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def settings() -> Settings:
    return Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
    )


def coach_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=COACH_ID,
        email="coach@example.test",
        access_token="coach-jwt",
    )


def snapshot(meals: int = 2) -> dict:
    return {
        "name": "QA Daily Fuel",
        "active_from": "2026-09-16",
        "calories_kcal": 1860,
        "protein_g": 135,
        "carbs_g": 180,
        "fat_g": 55,
        "restrictions": ["shellfish-free"],
        "meals": [
            {
                "position": index,
                "meal_time": "08:00" if index == 1 else "13:00:00",
                "name": f"Meal {index}",
                "calories_kcal": 420,
                "protein_g": 35,
                "carbs_g": 41,
                "fat_g": 13,
                "coach_instructions": "",
                "preparation": "Mix and serve.",
                "ingredients": [
                    {
                        "position": 1,
                        "food_library_item_id": FOOD_ID if index == 1 else None,
                        "ingredient_name": "Greek yoghurt",
                        "quantity": 200,
                        "unit": "g",
                    }
                ],
            }
            for index in range(1, meals + 1)
        ],
    }


@pytest.mark.parametrize("meal_count", [0, 9])
def test_snapshot_rejects_meal_count_outside_one_to_eight(meal_count: int) -> None:
    with pytest.raises(ValidationError):
        NutritionPlanSnapshot.model_validate(snapshot(meal_count))


@pytest.mark.parametrize("target", ["meals", "ingredients"])
def test_snapshot_rejects_non_contiguous_positions(target: str) -> None:
    payload = snapshot()
    if target == "meals":
        payload["meals"][1]["position"] = 3
    else:
        second = deepcopy(payload["meals"][0]["ingredients"][0])
        second["position"] = 3
        payload["meals"][0]["ingredients"].append(second)

    with pytest.raises(ValidationError):
        NutritionPlanSnapshot.model_validate(payload)


def test_snapshot_rejects_extra_fields() -> None:
    payload = snapshot()
    payload["unexpected"] = True

    with pytest.raises(ValidationError):
        NutritionPlanSnapshot.model_validate(payload)


@pytest.mark.parametrize("invalid_macro", [1.5, "135"])
def test_snapshot_requires_integer_macros(invalid_macro: object) -> None:
    payload = snapshot()
    payload["protein_g"] = invalid_macro

    with pytest.raises(ValidationError):
        NutritionPlanSnapshot.model_validate(payload)


@pytest.mark.parametrize("meal_time", ["08:00", "08:00:00"])
def test_snapshot_accepts_exact_supported_meal_time_formats(meal_time: str) -> None:
    payload = snapshot()
    payload["meals"][0]["meal_time"] = meal_time

    NutritionPlanSnapshot.model_validate(payload)


@pytest.mark.parametrize(
    "meal_time",
    ["8:00", "08:00:00.123456", "2026-09-16T08:00:00"],
)
def test_snapshot_rejects_meal_time_outside_exact_supported_formats(
    meal_time: str,
) -> None:
    payload = snapshot()
    payload["meals"][0]["meal_time"] = meal_time

    with pytest.raises(ValidationError):
        NutritionPlanSnapshot.model_validate(payload)


def plan_result(*, status: str = "draft", version: int | None = None, nested: bool = False) -> dict:
    meals = []
    for index in range(1, 3):
        ingredient = {
            "id": INGREDIENT_IDS[index - 1],
            "position": 1,
            "food_library_item_id": FOOD_ID if index == 1 else None,
            "ingredient_name": "Greek yoghurt",
            "quantity": 200,
            "unit": "g",
        }
        meal = {
            "id": MEAL_IDS[index - 1],
            "position": index,
            "meal_time": "08:00:00" if index == 1 else "13:00:00",
            "name": f"Meal {index}",
            "calories_kcal": 420,
            "protein_g": 35,
            "carbs_g": 41,
            "fat_g": 13,
            "coach_instructions": "",
            "preparation": "Mix and serve.",
        }
        if nested:
            meal["meal_ingredients"] = [ingredient]
        else:
            meal["ingredients"] = [ingredient]
        meals.append(meal)

    result = {
        "id": PLAN_ID,
        "client_id": CLIENT_ID,
        "name": "QA Daily Fuel",
        "status": status,
        "version": version,
        "active_from": "2026-09-16",
        "active_to": None,
        "replaces_plan_id": None,
        "calories_kcal": 1860,
        "protein_g": 135,
        "carbs_g": 180,
        "fat_g": 55,
    }
    if nested:
        result["nutrition_plan_restrictions"] = [{"restriction": "shellfish-free"}]
        result["meals"] = list(reversed(meals))
    else:
        result["restrictions"] = ["shellfish-free"]
        result["meals"] = meals
    return result


def access_response(url: str) -> FakeResponse | None:
    if url.endswith("/rest/v1/profiles"):
        return FakeResponse(200, [{"id": COACH_ID, "role": "coach"}])
    if url.endswith("/rest/v1/coaches"):
        return FakeResponse(200, [{"id": COACH_ID, "is_active": True}])
    if url.endswith("/rest/v1/clients"):
        return FakeResponse(200, [{"id": CLIENT_ID}])
    return None


def test_workspace_uses_caller_jwt_and_nested_rls_reads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/nutrition_plans"):
            if kwargs["params"]["status"] == "eq.published":
                return FakeResponse(200, [plan_result(status="published", version=1, nested=True)])
            return FakeResponse(200, [plan_result(nested=True)])
        if url.endswith("/rest/v1/food_library_items"):
            return FakeResponse(
                200,
                [
                    {
                        "id": FOOD_ID,
                        "name": "Greek yoghurt",
                        "category": "dairy",
                        "calories_kcal": 73,
                        "protein_g": 10,
                        "carbs_g": 4,
                        "fat_g": 2,
                    }
                ],
            )
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = NutritionPlanService(settings(), coach_user()).get_workspace(CLIENT_ID)

    assert result["active_plan"] == plan_result(status="published", version=1)
    assert result["draft"] == plan_result()
    plan_reads = [
        kwargs["params"] for _, url, kwargs in seen if url.endswith("/rest/v1/nutrition_plans")
    ]
    assert plan_reads[0]["client_id"] == f"eq.{CLIENT_ID}"
    assert plan_reads[0]["status"] == "eq.published"
    assert plan_reads[1]["status"] == "eq.draft"
    library_read = next(
        kwargs["params"] for _, url, kwargs in seen if url.endswith("/rest/v1/food_library_items")
    )
    assert library_read["owner_coach_id"] == f"eq.{COACH_ID}"
    assert library_read["is_active"] == "eq.true"
    assert all(
        request_kwargs["headers"]["Authorization"] == "Bearer coach-jwt"
        for _, _, request_kwargs in seen
    )


def test_save_draft_uses_caller_jwt_and_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    validated = NutritionPlanSnapshot.model_validate(snapshot())

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/save_nutrition_plan_draft"):
            return FakeResponse(200, {"plan": plan_result()})
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = NutritionPlanService(settings(), coach_user()).save_draft(CLIENT_ID, validated)

    assert result["plan"]["status"] == "draft"
    assert seen[-1][0] == "POST"
    assert seen[-1][1].endswith("/rest/v1/rpc/save_nutrition_plan_draft")
    assert seen[-1][2]["json"] == {
        "p_client_id": CLIENT_ID,
        "p_snapshot": validated.model_dump(mode="json"),
    }
    assert all(
        request_kwargs["headers"]["Authorization"] == "Bearer coach-jwt"
        for _, _, request_kwargs in seen
    )


def test_publish_posts_key_and_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    validated = NutritionPlanSnapshot.model_validate(snapshot())

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/publish_nutrition_plan"):
            return FakeResponse(
                200,
                {"plan": plan_result(status="published", version=1), "meal_count": 2},
            )
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = NutritionPlanService(settings(), coach_user()).publish(
        CLIENT_ID,
        PUBLISH_KEY,
        validated,
    )

    assert result["meal_count"] == 2
    assert seen[-1][0] == "POST"
    assert seen[-1][1].endswith("/rest/v1/rpc/publish_nutrition_plan")
    assert seen[-1][2]["json"] == {
        "p_client_id": CLIENT_ID,
        "p_publish_key": str(PUBLISH_KEY),
        "p_snapshot": validated.model_dump(mode="json"),
    }


def test_provider_42501_maps_to_403(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/publish_nutrition_plan"):
            return FakeResponse(403, {"code": "42501", "message": "insufficient privilege"})
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)

    with pytest.raises(APIError) as error:
        NutritionPlanService(settings(), coach_user()).publish(
            CLIENT_ID,
            PUBLISH_KEY,
            NutritionPlanSnapshot.model_validate(snapshot()),
        )

    assert error.value.status_code == 403
    assert error.value.code == "authorization_failed"


def test_openapi_includes_nutrition_plan_routes() -> None:
    paths = app.openapi()["paths"]
    base = f"/api/v1/coach/clients/{{client_id}}/nutrition-plan"

    assert "get" in paths[base]
    assert "put" in paths[f"{base}/draft"]
    assert "post" in paths[f"{base}/publish"]
