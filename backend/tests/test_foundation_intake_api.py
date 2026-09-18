from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api import deps as api_deps
from app.api.v1.auth import get_current_workspace
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.db.base import Base
from app.main import app
from app.schemas.foundation_intake import FoundationAnswers, FoundationAnswersDraft
from app.services.client import ClientService, seed_demo_data
from app.services.foundation_catalog import (
    CHECKLIST_GROUPS,
    WAIVER_VERSION,
    attention_flags,
    valid_submit_answers,
)
from app.services.foundation_intake import FoundationIntakeService
from app.services.progress import PHOTO_VIEWS
from app.services.supabase_client import SupabaseClientService


CLIENT_ID = "80000000-0000-0000-0000-000000000002"
AUTH_HEADERS = {"Authorization": "Bearer client-jwt"}


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


def client_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=CLIENT_ID,
        email="client@example.test",
        access_token="client-jwt",
    )


def intake_row(*, answers: dict | None = None, status: str = "pending") -> dict:
    return {
        "client_id": CLIENT_ID,
        "schema_version": 1,
        "answers": answers or {},
        "waiver_version": WAIVER_VERSION if status == "submitted" else None,
        "submitted_at": "2026-09-18T08:30:00Z" if status == "submitted" else None,
    }


def photo_row(view: str, *, photo_id: str | None = None) -> dict:
    identifier = photo_id or f"{view}-photo"
    return {
        "id": identifier,
        "view": view,
        "captured_on": "2026-09-18",
        "original_filename": f"{view}.webp",
        "storage_path": f"{CLIENT_ID}/{view}.webp",
        "content_type": "image/webp",
        "created_at": "2026-09-18T08:00:00Z",
    }


def client_service() -> FoundationIntakeService:
    return FoundationIntakeService.from_client(
        SupabaseClientService(settings(), client_user())
    )


def intake_payload(*, status: str = "pending", answers: dict | None = None) -> dict:
    return {
        "status": status,
        "schema_version": 1,
        "answers": answers,
        "prefill": {
            "full_name": "Taylor Example",
            "email": "client@example.test",
        },
        "photos": {view: None for view in PHOTO_VIEWS},
        "waiver_version": WAIVER_VERSION,
        "attention_flags": [],
        "submitted_at": None,
    }


def dashboard_payload() -> dict:
    return {
        "client": {"id": CLIENT_ID, "first_name": "Taylor", "primary_goal": "Lose fat"},
        "body": {
            "current_weight_kg": None,
            "latest_waist_cm": None,
            "change_from_start_kg": None,
            "target_progress_percent": None,
            "trend": [],
        },
        "check_ins": {"count": 0, "status": "due"},
        "training_volume": {
            "range_days": 30,
            "total_kg": 0,
            "sessions": 0,
            "training_days": 0,
            "best_day_kg": 0,
            "daily_kg": [],
        },
        "next_actions": [],
    }


@pytest.fixture
def client_app(monkeypatch: pytest.MonkeyPatch):
    app.dependency_overrides[get_settings] = settings
    app.dependency_overrides[get_authenticated_user] = client_user
    monkeypatch.setattr(api_deps, "get_authenticated_user", lambda authorization, settings: client_user())

    monkeypatch.setattr(
        SupabaseClientService,
        "workspace",
        lambda self: {
            "id": CLIENT_ID,
            "email": "client@example.test",
            "first_name": "Taylor",
            "full_name": "Taylor Example",
            "role": "client",
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "foundation_intake_status",
        lambda self: "pending",
        raising=False,
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "get_dashboard",
        lambda self: dashboard_payload(),
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "get_active_nutrition_plan",
        lambda self, plan_date: {
            "plan_id": "plan-1",
            "name": "Lean Phase",
            "date": plan_date.isoformat(),
            "daily_targets": {"calories_kcal": 2000, "protein_g": 150, "carbs_g": 180, "fat_g": 60},
            "restrictions": [],
            "meals": [],
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "get_workout_for_date",
        lambda self, session_date: {
            "session_id": "session-1",
            "date": session_date.isoformat(),
            "title": "Workout A",
            "week_label": "Week 1",
            "coach_note": "",
            "status": "ready",
            "estimated_duration_minutes": 45,
            "exercises": [],
            "note": None,
            "overall_difficulty": None,
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "health_summary",
        lambda self: {
            "wellbeing": {"energy_score": None, "sentiment": "not_reported", "source_check_in_id": None},
            "planning_context": {
                "dietary_preferences": [],
                "allergies": [],
                "training_considerations": [],
                "coach_note": "",
            },
            "safety_notice": "Coaching support only. Not medical advice.",
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "profile",
        lambda self: {
            "client_id": CLIENT_ID,
            "name": "Taylor Example",
            "email": "client@example.test",
            "primary_goal": "Lose fat",
            "target_weight_kg": None,
            "check_in_day": "monday",
            "timezone": "UTC",
            "dietary_preferences": "",
            "allergies_injuries": "",
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "list_progress_photos",
        lambda self, view, limit, offset=0: {"items": [], "has_more": False},
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "delete_progress_photo",
        lambda self, photo_id: {"id": photo_id, "deleted": True, "cleanup_pending": False},
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "get_photo_content",
        lambda self, photo_id: (b"image-bytes", "image/webp", f"{photo_id}.webp"),
    )

    async def upload_progress_photo(self, file, view, captured_on, replace_photo_id=None):
        return {
            "id": "photo-1",
            "view": view,
            "captured_on": captured_on.isoformat(),
            "file_name": file.filename or "progress-photo.webp",
            "content_url": "/api/v1/client/progress-photos/photo-1/content",
            "period_start": "2026-09-15",
            "uploaded_at": "2026-09-18T08:00:00Z",
            "cleanup_pending": False,
        }

    monkeypatch.setattr(SupabaseClientService, "upload_progress_photo", upload_progress_photo)
    monkeypatch.setattr(
        FoundationIntakeService,
        "get_intake",
        lambda self: intake_payload(status="pending", answers={}),
    )
    monkeypatch.setattr(
        FoundationIntakeService,
        "save_draft",
        lambda self, answers: intake_payload(status="pending", answers=answers),
    )
    monkeypatch.setattr(
        FoundationIntakeService,
        "submit",
        lambda self, answers, waiver_version: intake_payload(status="submitted", answers=answers),
    )

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def test_valid_fixtures_parse() -> None:
    FoundationAnswersDraft.model_validate({"identity": {"full_name": "Taylor Example"}})
    FoundationAnswers.model_validate(valid_submit_answers("male"))


def test_patch_accepts_compact_partial_draft(client_app: TestClient) -> None:
    response = client_app.patch(
        "/api/v1/client/foundation-intake",
        headers=AUTH_HEADERS,
        json={"answers": {"identity": {"full_name": "Taylor Example"}}},
    )

    assert response.status_code == 200
    assert response.json()["answers"] == {"identity": {"full_name": "Taylor Example"}}


def test_female_submit_accepts_cycle_date_without_unknown_flag() -> None:
    answers = valid_submit_answers("female")
    answers["sex_specific"].pop("last_cycle_unknown", None)
    answers["sex_specific"]["last_cycle_start"] = "2026-09-01"

    FoundationAnswers.model_validate(answers)


def test_female_submit_rejects_cycle_date_with_unknown_flag() -> None:
    answers = valid_submit_answers("female")
    answers["sex_specific"]["last_cycle_start"] = "2026-09-01"
    answers["sex_specific"]["last_cycle_unknown"] = True

    with pytest.raises(ValueError, match="cannot set last_cycle_start"):
        FoundationAnswers.model_validate(answers)


def test_get_returns_pending_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    stored_answers = valid_submit_answers("female")
    stored_answers["sex_specific"]["pregnant"] = "yes"

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": CLIENT_ID, "foundation_intake_status": "pending"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": CLIENT_ID,
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row(answers=stored_answers)])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [photo_row("front")])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    payload = client_service().get_intake()

    assert payload["status"] == "pending"
    assert payload["schema_version"] == 1
    assert payload["answers"]["identity"]["full_name"] == "Taylor Example"
    assert payload["prefill"] == {
        "full_name": "Taylor Example",
        "email": "client@example.test",
    }
    assert payload["photos"]["front"]["file_name"] == "front.webp"
    assert payload["photos"]["front"]["content_url"].endswith("/front-photo/content")
    assert "storage_path" not in payload["photos"]["front"]
    assert payload["photos"]["back"] is None
    assert payload["catalog"] == CHECKLIST_GROUPS
    assert payload["waiver_version"] == WAIVER_VERSION
    assert payload["attention_flags"] == attention_flags(stored_answers)
    assert payload["submitted_at"] is None
    assert all(
        call[2]["headers"]["Authorization"] == "Bearer client-jwt"
        for call in seen
    )


def test_get_omits_catalog_for_coach_scoped_reads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": "assigned-client", "foundation_intake_status": "pending"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "assigned-client",
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row()])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseClientService(settings(), client_user())
    service.client_id = "assigned-client"

    payload = FoundationIntakeService.from_client(service).get_intake()

    assert payload["status"] == "pending"
    assert payload["catalog"] is None


def test_coach_scoped_get_uses_coach_photo_content_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": "assigned-client", "foundation_intake_status": "submitted"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "assigned-client",
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row(status="submitted")])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [photo_row("front", photo_id="coach-front")])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    service = SupabaseClientService(settings(), client_user())
    service.client_id = "assigned-client"

    payload = FoundationIntakeService.from_client(service).get_intake()

    assert payload["photos"]["front"]["content_url"] == (
        "/api/v1/coach/clients/assigned-client/progress-photos/coach-front/content"
    )


def test_save_draft_uses_caller_jwt_and_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    draft = {"identity": {"full_name": "Navaneet"}}

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        if url.endswith("/rest/v1/rpc/save_foundation_intake_draft"):
            return FakeResponse(200, {"status": "pending"})
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": CLIENT_ID, "foundation_intake_status": "pending"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": CLIENT_ID,
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row(answers=draft)])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = client_service().save_draft(draft)

    assert result["status"] == "pending"
    assert seen[0][0] == "POST"
    assert seen[0][1].endswith("/rest/v1/rpc/save_foundation_intake_draft")
    assert seen[0][2]["json"] == {"p_answers": draft}
    assert all(
        call[2]["headers"]["Authorization"] == "Bearer client-jwt"
        for call in seen
    )


def test_save_draft_invalid_payload_maps_to_foundation_invalid() -> None:
    with pytest.raises(APIError) as err:
        client_service().save_draft({"identity": {"date_of_birth": "not-a-date"}})

    assert err.value.status_code == 422
    assert err.value.code == "foundation_invalid"
    assert "identity.date_of_birth" in (err.value.fields or {})


def test_submit_without_waiver_422() -> None:
    answers = valid_submit_answers("male")
    answers["waiver"] = {"accepted": False}

    with pytest.raises(APIError) as err:
        client_service().submit(answers, WAIVER_VERSION)

    assert err.value.status_code == 422
    assert err.value.code == "foundation_waiver_required"


def test_submit_without_photos_422(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": CLIENT_ID, "foundation_intake_status": "pending"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": CLIENT_ID,
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row(answers={})])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [photo_row("front"), photo_row("back")])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)

    with pytest.raises(APIError) as err:
        client_service().submit(valid_submit_answers("male"), WAIVER_VERSION)

    assert err.value.status_code == 422
    assert err.value.code == "foundation_photos_incomplete"


def test_submit_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    answers = valid_submit_answers("male")

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": CLIENT_ID, "foundation_intake_status": "submitted"}])
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(
                200,
                [
                    {
                        "id": CLIENT_ID,
                        "role": "client",
                        "full_name": "Taylor Example",
                        "email": "client@example.test",
                    }
                ],
            )
        if url.endswith("/rest/v1/client_foundation_intakes"):
            return FakeResponse(200, [intake_row(answers=answers, status="submitted")])
        if url.endswith("/rest/v1/progress_photos"):
            return FakeResponse(200, [photo_row(view) for view in PHOTO_VIEWS])
        if url.endswith("/rest/v1/rpc/submit_foundation_intake"):
            return FakeResponse(200, {"status": "submitted"})
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = client_service().submit(answers, WAIVER_VERSION)

    assert result["status"] == "submitted"
    submit_call = next(
        call for call in seen if call[1].endswith("/rest/v1/rpc/submit_foundation_intake")
    )
    assert submit_call[2]["json"] == {
        "p_answers": FoundationAnswers.model_validate(answers).model_dump(
            mode="json", exclude_none=True
        ),
        "p_waiver_version": WAIVER_VERSION,
    }
    assert all(
        call[2]["headers"]["Authorization"] == "Bearer client-jwt"
        for call in seen
    )


def test_submit_wrong_version_422() -> None:
    with pytest.raises(APIError) as err:
        client_service().submit(valid_submit_answers("male"), "wrong-version")

    assert err.value.status_code == 422
    assert err.value.code == "foundation_waiver_required"


def test_sqlite_returns_not_required_and_locks_writes(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'foundation.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_demo_data(db, "cl_001")
        service = FoundationIntakeService.from_client(ClientService(db, "cl_001"))

        payload = service.get_intake()

        assert payload["status"] == "not_required"
        assert payload["answers"] is None
        assert set(payload["photos"]) == set(PHOTO_VIEWS)
        assert all(payload["photos"][view] is None for view in PHOTO_VIEWS)

        with pytest.raises(APIError) as save_error:
            service.save_draft({"identity": {"full_name": "Taylor Example"}})
        assert save_error.value.status_code == 409
        assert save_error.value.code == "foundation_intake_locked"

        with pytest.raises(APIError) as submit_error:
            service.submit(valid_submit_answers("male"), WAIVER_VERSION)
        assert submit_error.value.status_code == 409
        assert submit_error.value.code == "foundation_intake_locked"


def test_workspace_includes_client_foundation_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        SupabaseClientService,
        "_profile_row",
        lambda self: {
            "id": CLIENT_ID,
            "role": "client",
            "first_name": "Taylor",
            "full_name": "Taylor Example",
            "email": "client@example.test",
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "_one_or_none",
        lambda self, table, params: {
            "id": CLIENT_ID,
            "foundation_intake_status": "pending",
        }
        if table == "clients"
        else None,
    )

    workspace = SupabaseClientService(settings(), client_user()).workspace()

    assert workspace["role"] == "client"
    assert workspace["foundation_intake_status"] == "pending"


def test_workspace_defaults_client_foundation_status_to_not_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        SupabaseClientService,
        "_profile_row",
        lambda self: {
            "id": CLIENT_ID,
            "role": "client",
            "first_name": "Taylor",
            "full_name": "Taylor Example",
            "email": "client@example.test",
        },
    )
    monkeypatch.setattr(
        SupabaseClientService,
        "_one_or_none",
        lambda self, table, params: {"id": CLIENT_ID} if table == "clients" else None,
    )

    workspace = SupabaseClientService(settings(), client_user()).workspace()

    assert workspace["foundation_intake_status"] == "not_required"


def test_local_demo_me_client_returns_not_required_foundation_status() -> None:
    workspace = get_current_workspace(
        portal="client",
        settings=Settings(_env_file=None),
        user=client_user(),
    )

    assert workspace["role"] == "client"
    assert workspace["foundation_intake_status"] == "not_required"


@pytest.mark.parametrize("portal", ["coach", "admin"])
def test_local_demo_me_non_clients_do_not_get_fake_foundation_pending(portal: str) -> None:
    workspace = get_current_workspace(
        portal=portal,
        settings=Settings(_env_file=None),
        user=client_user(),
    )

    assert workspace["role"] == portal
    assert "foundation_intake_status" not in workspace


def test_openapi_includes_foundation_intake_routes() -> None:
    paths = app.openapi()["paths"]
    base = "/api/v1/client/foundation-intake"

    assert "get" in paths[base]
    assert "patch" in paths[base]
    assert "post" in paths[f"{base}/submit"]


def test_openapi_includes_coach_foundation_intake_route() -> None:
    paths = app.openapi()["paths"]

    assert "get" in paths["/api/v1/coach/clients/{client_id}/foundation-intake"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/client/dashboard",
        "/api/v1/client/health-summary",
        "/api/v1/client/profile",
        "/api/v1/client/profile/photo",
        "/api/v1/client/profile/photo/content",
        "/api/v1/client/nutrition/active-plan?date=2026-09-18",
        "/api/v1/client/workout-sessions/today?date=2026-09-18",
    ],
)
def test_pending_client_blocks_non_intake_routes(client_app: TestClient, path: str) -> None:
    response = client_app.get(path, headers=AUTH_HEADERS)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "foundation_intake_required"


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("GET", "/api/v1/client/foundation-intake", {}),
        (
            "PATCH",
            "/api/v1/client/foundation-intake",
            {"json": {"answers": {"identity": {"full_name": "Taylor Example"}}}},
        ),
        (
            "POST",
            "/api/v1/client/foundation-intake/submit",
            {"json": {"answers": valid_submit_answers("male"), "waiver_version": WAIVER_VERSION}},
        ),
        ("GET", "/api/v1/client/progress-photos?view=front&limit=50", {}),
        (
            "POST",
            "/api/v1/client/progress-photos",
            {
                "data": {"view": "front", "captured_on": "2026-09-18"},
                "files": {"file": ("front.webp", b"fake-image", "image/webp")},
            },
        ),
        ("DELETE", "/api/v1/client/progress-photos/photo-1", {}),
        ("GET", "/api/v1/client/progress-photos/photo-1/content", {}),
    ],
)
def test_pending_client_allows_intake_and_photo_routes(
    client_app: TestClient,
    method: str,
    path: str,
    kwargs: dict,
) -> None:
    response = client_app.request(method, path, headers=AUTH_HEADERS, **kwargs)

    assert response.status_code == 200


def test_submitted_client_can_open_dashboard(
    client_app: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        SupabaseClientService,
        "foundation_intake_status",
        lambda self: "submitted",
        raising=False,
    )

    response = client_app.get("/api/v1/client/dashboard", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json()["client"]["id"] == CLIENT_ID


def test_not_required_client_can_open_dashboard(
    client_app: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        SupabaseClientService,
        "foundation_intake_status",
        lambda self: "not_required",
        raising=False,
    )

    response = client_app.get("/api/v1/client/dashboard", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json()["client"]["id"] == CLIENT_ID


def test_foundation_intake_status_missing_client_maps_to_client_access_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [])
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)

    with pytest.raises(APIError) as err:
        SupabaseClientService(settings(), client_user()).foundation_intake_status()

    assert err.value.status_code == 403
    assert err.value.code == "client_role_required"
