from __future__ import annotations

from datetime import date

import pytest

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.schemas.coach import (
    ClientSetup,
    CoachSettingsUpdate,
    ExerciseLibraryCreate,
    ExerciseLibraryUpdate,
    FoodLibraryCreate,
    FoodLibraryUpdate,
    PrivateNoteCreate,
)
from app.services.supabase_coach import SupabaseCoachService


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
        r2_account_id="test-account",
        r2_access_key_id="test-key",
        r2_secret_access_key="test-secret",
        r2_bucket_name="test-bucket",
    )


def coach_service() -> SupabaseCoachService:
    return SupabaseCoachService(
        settings(),
        AuthenticatedUser(id="coach-id", email="coach@example.test", access_token="coach-jwt"),
    )


def _coach_identity(path: str, params: dict) -> FakeResponse | None:
    if path.endswith("/rest/v1/profiles"):
        if params.get("id") == "eq.coach-id":
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        return FakeResponse(200, [{"id": "client-1", "role": "client", "full_name": "Navaneet"}])
    if path.endswith("/rest/v1/coaches"):
        return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
    return None


def test_review_includes_setup_and_body_entries_in_date_order(monkeypatch: pytest.MonkeyPatch) -> None:
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/clients"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "client-1",
                        "client_code": "XP-0005",
                        "primary_goal": "fat_loss",
                        "check_in_day": "wednesday",
                        "timezone": "Asia/Kolkata",
                        "dietary_preferences": "Vegetarian weekdays",
                        "allergies_injuries": "Right knee sensitive after long walks",
                    }
                ],
            )
        if path.endswith("/rest/v1/body_entries"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "body-new",
                        "client_id": "client-1",
                        "entry_date": "2026-08-24",
                        "weight_kg": "78.4",
                        "waist_cm": "86.0",
                        "hip_cm": None,
                        "body_fat_pct": None,
                        "created_at": "2026-08-24T12:00:00+00:00",
                    },
                    {
                        "id": "body-old",
                        "client_id": "client-1",
                        "entry_date": "2026-08-10",
                        "weight_kg": "80.1",
                        "waist_cm": "88.0",
                        "hip_cm": None,
                        "body_fat_pct": None,
                        "created_at": "2026-08-10T12:00:00+00:00",
                    },
                ],
            )
        if path.endswith("/rest/v1/weekly_checkins"):
            return FakeResponse(200, [])
        if path.endswith("/rest/v1/client_coaching_context"):
            return FakeResponse(
                200,
                [
                    {
                        "client_id": "client-1",
                        "client_visible_coach_note": "Keep loading conservative.",
                        "training_considerations": ["Monitor knee comfort"],
                        "safety_notice": "Coaching support only. Not medical advice.",
                        "updated_at": "2026-08-24T12:00:00+00:00",
                    }
                ],
            )
        if path.endswith("/rest/v1/coach_private_notes"):
            return FakeResponse(
                200,
                [{"id": "note-a", "note": "Coach-only context", "created_at": "2026-08-24T12:00:00+00:00"}],
            )
        if path.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [])
        if path.endswith("/rest/v1/client_tracking_preferences"):
            return FakeResponse(
                200,
                [{"client_id": "client-1", "enabled_measurements": ["weight_kg", "waist_cm"]}],
            )
        if path.endswith("/rest/v1/client_targets"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "target-weight",
                        "client_id": "client-1",
                        "metric": "weight_kg",
                        "target_value": "78.00",
                        "target_date": "2026-11-25",
                        "is_active": True,
                    },
                    {
                        "id": "target-waist",
                        "client_id": "client-1",
                        "metric": "waist_cm",
                        "target_value": "88.00",
                        "target_date": "2026-11-25",
                        "is_active": True,
                    },
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    result = service.get_client_review("client-1")

    assert [entry["entry_date"] for entry in result["body_entries"]] == ["2026-08-10", "2026-08-24"]
    setup = result["setup"]
    assert setup["primary_goal"] == "fat_loss"
    assert setup["check_in_day"] == "wednesday"
    assert setup["timezone"] == "Asia/Kolkata"
    assert setup["dietary_preferences"] == "Vegetarian weekdays"
    assert setup["allergies_injuries"] == "Right knee sensitive after long walks"
    assert setup["enabled_measurements"] == ["weight_kg", "waist_cm"]
    assert setup["target_weight_kg"] == 78.0
    assert setup["target_waist_cm"] == 88.0
    assert setup["target_date"] == date(2026, 11, 25)


def test_save_private_note_inserts_note_and_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/clients") and method == "GET":
            return FakeResponse(200, [{"id": "client-1"}])
        if path.endswith("/rest/v1/coach_private_notes") and method == "POST":
            payload = kwargs.get("json") or {}
            return FakeResponse(
                201,
                [
                    {
                        "id": "note-1",
                        "client_id": payload.get("client_id"),
                        "author_coach_id": payload.get("author_coach_id"),
                        "note": payload.get("note"),
                        "created_at": "2026-09-16T12:00:00+00:00",
                    }
                ],
            )
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-note"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    note = service.save_private_note("client-1", PrivateNoteCreate(note="Follow up on knee."))

    assert note["note"] == "Follow up on knee."
    assert any(path.endswith("/rest/v1/coach_private_notes") and method == "POST" for method, path, _ in seen)
    assert any(
        (json or {}).get("action") == "coach_note_saved"
        for _, path, json in seen
        if path.endswith("/rest/v1/audit_events")
    )
    note_payload = next(json for method, path, json in seen if method == "POST" and path.endswith("/rest/v1/coach_private_notes"))
    assert note_payload == {
        "client_id": "client-1",
        "author_coach_id": "coach-id",
        "note": "Follow up on knee.",
    }


def test_save_setup_patches_client_and_targets(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()
    client_row = {
        "id": "client-1",
        "client_code": "XP-0005",
        "primary_goal": "fat_loss",
        "check_in_day": "wednesday",
        "timezone": "Asia/Kolkata",
        "dietary_preferences": "Vegetarian weekdays",
        "allergies_injuries": "Right knee sensitive after long walks",
    }
    prefs_row = {
        "client_id": "client-1",
        "enabled_measurements": ["weight_kg", "waist_cm"],
        "updated_by_coach_id": "coach-id",
    }
    targets = {
        "weight_kg": {
            "id": "target-weight",
            "client_id": "client-1",
            "metric": "weight_kg",
            "target_value": "80.00",
            "target_date": "2026-10-01",
            "is_active": True,
        }
    }

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        payload = kwargs.get("json") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/clients") and method == "GET":
            return FakeResponse(200, [client_row])
        if path.endswith("/rest/v1/clients") and method == "PATCH":
            client_row.update(payload)
            return FakeResponse(200, [client_row])
        if path.endswith("/rest/v1/client_tracking_preferences") and method == "GET":
            return FakeResponse(200, [prefs_row])
        if path.endswith("/rest/v1/client_tracking_preferences") and method == "PATCH":
            prefs_row.update(payload)
            return FakeResponse(200, [prefs_row])
        if path.endswith("/rest/v1/client_targets") and method == "GET":
            rows = [row for row in targets.values() if row.get("is_active")]
            metric = (params.get("metric") or "").replace("eq.", "")
            if metric:
                rows = [row for row in rows if row["metric"] == metric]
            return FakeResponse(200, rows)
        if path.endswith("/rest/v1/client_targets") and method == "PATCH":
            target_id = (params.get("id") or "").replace("eq.", "")
            for row in targets.values():
                if row["id"] == target_id:
                    row.update(payload)
                    return FakeResponse(200, [row])
            raise AssertionError(f"Unknown target patch: {target_id}")
        if path.endswith("/rest/v1/client_targets") and method == "POST":
            row = {
                "id": f"target-{payload['metric']}",
                "is_active": True,
                **payload,
            }
            targets[payload["metric"]] = row
            return FakeResponse(201, [row])
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-setup"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    setup = service.save_setup(
        "client-1",
        ClientSetup(
            primary_goal="strength",
            check_in_day="sunday",
            dietary_preferences="High protein",
            allergies_injuries="Right knee",
            enabled_measurements=["weight_kg", "waist_cm", "hip_cm"],
            target_weight_kg=78.0,
            target_waist_cm=88.0,
            target_date=date(2026, 11, 25),
        ),
    )

    client_patch = next(
        json for method, path, json in seen if method == "PATCH" and path.endswith("/rest/v1/clients")
    )
    assert client_patch == {
        "primary_goal": "strength",
        "check_in_day": "sunday",
        "dietary_preferences": "High protein",
        "allergies_injuries": "Right knee",
    }
    pref_patch = next(
        json
        for method, path, json in seen
        if method == "PATCH" and path.endswith("/rest/v1/client_tracking_preferences")
    )
    assert pref_patch["enabled_measurements"] == ["weight_kg", "waist_cm", "hip_cm"]
    assert pref_patch["updated_by_coach_id"] == "coach-id"
    assert any(
        (json or {}).get("target_value") == 78.0
        for method, path, json in seen
        if path.endswith("/rest/v1/client_targets") and method in {"POST", "PATCH"}
    )
    assert any(
        (json or {}).get("metric") == "waist_cm" and (json or {}).get("target_value") == 88.0
        for method, path, json in seen
        if path.endswith("/rest/v1/client_targets")
    )
    assert any(
        (json or {}).get("action") == "client_profile_updated"
        for _, path, json in seen
        if path.endswith("/rest/v1/audit_events")
    )
    assert setup["primary_goal"] == "strength"
    assert setup["check_in_day"] == "sunday"
    assert setup["timezone"] == "Asia/Kolkata"
    assert setup["enabled_measurements"] == ["weight_kg", "waist_cm", "hip_cm"]
    assert setup["target_weight_kg"] == 78.0
    assert setup["target_waist_cm"] == 88.0
    assert setup["target_date"] == date(2026, 11, 25)


def test_save_setup_clears_null_targets_by_deactivating_active_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()
    client_row = {
        "id": "client-1",
        "client_code": "XP-0005",
        "primary_goal": "fat_loss",
        "check_in_day": "wednesday",
        "timezone": "Asia/Kolkata",
        "dietary_preferences": "Vegetarian weekdays",
        "allergies_injuries": "Right knee",
    }
    prefs_row = {
        "client_id": "client-1",
        "enabled_measurements": ["weight_kg", "waist_cm"],
        "updated_by_coach_id": "coach-id",
    }
    targets = {
        "weight_kg": {
            "id": "target-weight",
            "client_id": "client-1",
            "metric": "weight_kg",
            "target_value": "78.00",
            "target_date": "2026-11-25",
            "is_active": True,
        },
        "waist_cm": {
            "id": "target-waist",
            "client_id": "client-1",
            "metric": "waist_cm",
            "target_value": "88.00",
            "target_date": "2026-11-25",
            "is_active": True,
        },
    }

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        payload = kwargs.get("json") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/clients") and method == "GET":
            return FakeResponse(200, [client_row])
        if path.endswith("/rest/v1/clients") and method == "PATCH":
            client_row.update(payload)
            return FakeResponse(200, [client_row])
        if path.endswith("/rest/v1/client_tracking_preferences") and method == "GET":
            return FakeResponse(200, [prefs_row])
        if path.endswith("/rest/v1/client_tracking_preferences") and method == "PATCH":
            prefs_row.update(payload)
            return FakeResponse(200, [prefs_row])
        if path.endswith("/rest/v1/client_targets") and method == "GET":
            rows = [row for row in targets.values() if row.get("is_active")]
            metric = (params.get("metric") or "").replace("eq.", "")
            if metric:
                rows = [row for row in rows if row["metric"] == metric]
            return FakeResponse(200, rows)
        if path.endswith("/rest/v1/client_targets") and method == "PATCH":
            target_id = (params.get("id") or "").replace("eq.", "")
            for row in targets.values():
                if row["id"] == target_id:
                    row.update(payload)
                    return FakeResponse(200, [row])
            raise AssertionError(f"Unknown target patch: {target_id}")
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-setup"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    setup = service.save_setup(
        "client-1",
        ClientSetup(
            primary_goal="fat_loss",
            check_in_day="wednesday",
            dietary_preferences="Vegetarian weekdays",
            allergies_injuries="Right knee",
            enabled_measurements=["weight_kg", "waist_cm"],
            target_weight_kg=None,
            target_waist_cm=88.0,
            target_date=date(2026, 11, 25),
        ),
    )

    deactivate = next(
        json
        for method, path, json in seen
        if method == "PATCH"
        and path.endswith("/rest/v1/client_targets")
        and (json or {}).get("is_active") is False
    )
    assert deactivate == {"is_active": False}
    assert setup["target_weight_kg"] is None
    assert setup["target_waist_cm"] == 88.0
    assert targets["weight_kg"]["is_active"] is False


def test_create_food_library_item_posts_owner_coach_id(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items") and method == "POST":
            payload = kwargs.get("json") or {}
            return FakeResponse(
                201,
                [
                    {
                        "id": "food-1",
                        "owner_coach_id": payload.get("owner_coach_id"),
                        "name": payload.get("name"),
                        "category": payload.get("category"),
                        "calories_kcal": payload.get("calories_kcal"),
                        "protein_g": payload.get("protein_g"),
                        "carbs_g": payload.get("carbs_g"),
                        "fat_g": payload.get("fat_g"),
                        "is_active": True,
                    }
                ],
            )
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-food"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    item = service.create_food_item(
        FoodLibraryCreate(name="Greek yoghurt", category="Dairy", calories_kcal=73, protein_g=10)
    )

    food_payload = next(
        json for method, path, json in seen if method == "POST" and path.endswith("/rest/v1/food_library_items")
    )
    assert food_payload["owner_coach_id"] == "coach-id"
    assert food_payload["name"] == "Greek yoghurt"
    assert food_payload["category"] == "Dairy"
    assert item["name"] == "Greek yoghurt"
    assert item["is_active"] is True
    audit = next(json for _, path, json in seen if path.endswith("/rest/v1/audit_events"))
    assert audit["action"] == "food_library_item_saved"
    assert audit["metadata"] == {"id": "food-1", "name": "Greek yoghurt", "is_active": True}


def test_create_food_library_item_duplicate_name_maps_409(monkeypatch: pytest.MonkeyPatch) -> None:
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items") and method == "POST":
            raise APIError(409, "23505", "duplicate key value violates unique constraint")
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    with pytest.raises(APIError) as exc:
        service.create_food_item(FoodLibraryCreate(name="Greek yoghurt", category="Dairy"))
    assert exc.value.status_code == 409


def test_list_libraries_includes_inactive_ordered_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    service = coach_service()
    seen_params: list[tuple[str, dict]] = []

    def request(method: str, path: str, **kwargs):
        params = kwargs.get("params") or {}
        seen_params.append((path, params))
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "food-z",
                        "name": "Zucchini",
                        "category": "Vegetable",
                        "calories_kcal": "17",
                        "protein_g": "1.2",
                        "carbs_g": "3.1",
                        "fat_g": "0.3",
                        "is_active": False,
                    },
                    {
                        "id": "food-a",
                        "name": "Avocado",
                        "category": "Fats",
                        "calories_kcal": "160",
                        "protein_g": "2",
                        "carbs_g": "9",
                        "fat_g": "15",
                        "is_active": True,
                    },
                ],
            )
        if path.endswith("/rest/v1/exercise_library_items"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "ex-b",
                        "name": "Row",
                        "body_region": "Upper body",
                        "training_focus": "Strength",
                        "guidance": "Neutral spine",
                        "is_active": False,
                    },
                    {
                        "id": "ex-a",
                        "name": "Goblet squat",
                        "body_region": "Lower body",
                        "training_focus": "Strength",
                        "guidance": "Controlled tempo",
                        "is_active": True,
                    },
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    result = service.list_libraries()

    assert [item["name"] for item in result["food"]] == ["Avocado", "Zucchini"]
    assert result["food"][1]["is_active"] is False
    assert [item["name"] for item in result["exercises"]] == ["Goblet squat", "Row"]
    assert result["exercises"][1]["is_active"] is False
    food_params = next(params for path, params in seen_params if path.endswith("/rest/v1/food_library_items"))
    exercise_params = next(
        params for path, params in seen_params if path.endswith("/rest/v1/exercise_library_items")
    )
    assert "is_active" not in food_params
    assert "is_active" not in exercise_params
    assert food_params.get("order", "").startswith("name.")
    assert exercise_params.get("order", "").startswith("name.")


def test_list_libraries_empty_is_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items") or path.endswith("/rest/v1/exercise_library_items"):
            return FakeResponse(200, [])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    assert service.list_libraries() == {"food": [], "exercises": []}


def test_patch_food_item_disable_sets_is_active_false(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()
    row = {
        "id": "food-1",
        "name": "Greek yoghurt",
        "category": "Dairy",
        "calories_kcal": 73,
        "protein_g": 10,
        "carbs_g": 4,
        "fat_g": 2,
        "is_active": True,
    }

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items") and method == "GET":
            return FakeResponse(200, [row])
        if path.endswith("/rest/v1/food_library_items") and method == "PATCH":
            row.update(kwargs.get("json") or {})
            return FakeResponse(200, [row])
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-food-disable"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    item = service.update_food_item("food-1", FoodLibraryUpdate(is_active=False))

    patch = next(json for method, path, json in seen if method == "PATCH" and path.endswith("/rest/v1/food_library_items"))
    assert patch == {"is_active": False}
    assert item["is_active"] is False
    audit = next(json for _, path, json in seen if path.endswith("/rest/v1/audit_events"))
    assert audit["action"] == "food_library_item_saved"
    assert audit["metadata"]["is_active"] is False


def test_patch_foreign_food_library_id_is_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/food_library_items"):
            return FakeResponse(200, [])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    with pytest.raises(APIError) as exc:
        service.update_food_item("foreign-id", FoodLibraryUpdate(is_active=False))
    assert exc.value.status_code == 403


def test_create_exercise_library_item_posts_owner_coach_id(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/exercise_library_items") and method == "POST":
            payload = kwargs.get("json") or {}
            return FakeResponse(
                201,
                [
                    {
                        "id": "ex-1",
                        "owner_coach_id": payload.get("owner_coach_id"),
                        "name": payload.get("name"),
                        "body_region": payload.get("body_region"),
                        "training_focus": payload.get("training_focus"),
                        "guidance": payload.get("guidance") or "",
                        "is_active": True,
                    }
                ],
            )
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-ex"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    item = service.create_exercise_item(
        ExerciseLibraryCreate(name="Goblet squat", body_region="Lower body", training_focus="Strength")
    )

    payload = next(
        json for method, path, json in seen if method == "POST" and path.endswith("/rest/v1/exercise_library_items")
    )
    assert payload["owner_coach_id"] == "coach-id"
    assert payload["name"] == "Goblet squat"
    assert item["name"] == "Goblet squat"
    audit = next(json for _, path, json in seen if path.endswith("/rest/v1/audit_events"))
    assert audit["action"] == "exercise_library_item_saved"
    assert audit["metadata"] == {"id": "ex-1", "name": "Goblet squat", "is_active": True}


def test_patch_exercise_item_updates_guidance(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()
    row = {
        "id": "ex-1",
        "name": "Goblet squat",
        "body_region": "Lower body",
        "training_focus": "Strength",
        "guidance": "Controlled tempo",
        "is_active": True,
    }

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/exercise_library_items") and method == "GET":
            return FakeResponse(200, [row])
        if path.endswith("/rest/v1/exercise_library_items") and method == "PATCH":
            row.update(kwargs.get("json") or {})
            return FakeResponse(200, [row])
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-ex-patch"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    item = service.update_exercise_item("ex-1", ExerciseLibraryUpdate(guidance="Pause at the bottom."))
    patch = next(
        json for method, path, json in seen if method == "PATCH" and path.endswith("/rest/v1/exercise_library_items")
    )
    assert patch == {"guidance": "Pause at the bottom."}
    assert item["guidance"] == "Pause at the bottom."


def test_save_settings_writes_coach_settings_and_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()
    row = {
        "coach_id": "coach-id",
        "weight_unit": "kg",
        "default_check_in_day": "sunday",
        "default_missing_weight_threshold_days": 3,
        "default_measurement_refresh_threshold_days": 14,
        "enabled_measurements": ["weight_kg", "waist_cm"],
        "formula_registry": ["rolling_average", "rate_of_change"],
    }

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/coach_settings") and method == "PATCH":
            row.update(kwargs.get("json") or {})
            return FakeResponse(200, [row])
        if path.endswith("/rest/v1/coach_settings") and method == "POST":
            row.update(kwargs.get("json") or {})
            return FakeResponse(201, [row])
        if path.endswith("/rest/v1/audit_events") and method == "POST":
            return FakeResponse(201, [{"id": "audit-settings"}])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    result = service.save_settings(
        CoachSettingsUpdate(
            weight_unit="lb",
            default_check_in_day="wednesday",
            default_missing_weight_threshold_days=5,
            default_measurement_refresh_threshold_days=21,
            enabled_measurements=["weight_kg", "waist_cm", "hip_cm"],
        )
    )

    settings_write = next(
        json
        for method, path, json in seen
        if path.endswith("/rest/v1/coach_settings") and method in {"PATCH", "PUT", "POST"}
    )
    assert settings_write["weight_unit"] == "lb"
    assert settings_write["default_check_in_day"] == "wednesday"
    assert settings_write["default_missing_weight_threshold_days"] == 5
    assert settings_write["default_measurement_refresh_threshold_days"] == 21
    assert settings_write["enabled_measurements"] == ["weight_kg", "waist_cm", "hip_cm"]
    assert "formula_registry" not in settings_write
    audit = next(json for _, path, json in seen if path.endswith("/rest/v1/audit_events"))
    assert audit["action"] == "coach_settings_saved"
    assert audit.get("client_id") is None
    assert audit["metadata"] == {"unit": "lb", "threshold": 5}
    assert result["weight_unit"] == "lb"
    assert result["default_missing_weight_threshold_days"] == 5
    assert "formula_registry" not in result


def test_get_settings_inserts_defaults_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/coach_settings") and method == "GET":
            return FakeResponse(200, [])
        if path.endswith("/rest/v1/coach_settings") and method == "POST":
            payload = kwargs.get("json") or {}
            return FakeResponse(
                201,
                [
                    {
                        "coach_id": payload.get("coach_id"),
                        "weight_unit": "kg",
                        "default_check_in_day": "sunday",
                        "default_missing_weight_threshold_days": 3,
                        "default_measurement_refresh_threshold_days": 14,
                        "enabled_measurements": ["weight_kg", "waist_cm"],
                        "formula_registry": ["rolling_average", "rate_of_change"],
                    }
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    result = service.get_settings()

    insert = next(json for method, path, json in seen if method == "POST" and path.endswith("/rest/v1/coach_settings"))
    assert insert == {"coach_id": "coach-id"}
    assert result["weight_unit"] == "kg"
    assert result["default_check_in_day"] == "sunday"
    assert result["default_missing_weight_threshold_days"] == 3
    assert result["default_measurement_refresh_threshold_days"] == 14
    assert result["enabled_measurements"] == ["weight_kg", "waist_cm"]
    assert "formula_registry" not in result
    assert not any(path.endswith("/rest/v1/audit_events") for _, path, _ in seen)


def test_get_settings_returns_existing_row_without_insert(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, object]] = []
    service = coach_service()

    def request(method: str, path: str, **kwargs):
        seen.append((method, path, kwargs.get("json")))
        params = kwargs.get("params") or {}
        identity = _coach_identity(path, params)
        if identity is not None:
            return identity
        if path.endswith("/rest/v1/coach_settings") and method == "GET":
            return FakeResponse(
                200,
                [
                    {
                        "coach_id": "coach-id",
                        "weight_unit": "lb",
                        "default_check_in_day": "friday",
                        "default_missing_weight_threshold_days": 7,
                        "default_measurement_refresh_threshold_days": 30,
                        "enabled_measurements": ["weight_kg", "waist_cm", "body_fat_pct"],
                        "formula_registry": ["rolling_average"],
                    }
                ],
            )
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(service.gateway, "request", request)
    result = service.get_settings()

    assert result["weight_unit"] == "lb"
    assert result["default_check_in_day"] == "friday"
    assert result["default_missing_weight_threshold_days"] == 7
    assert not any(method == "POST" and path.endswith("/rest/v1/coach_settings") for method, path, _ in seen)
