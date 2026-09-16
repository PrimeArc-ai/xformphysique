from __future__ import annotations

from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.main import app
from app.schemas.workout_program import WorkoutProgramSnapshot
from app.services.workout_program import WorkoutProgramService


COACH_ID = "10000000-0000-0000-0000-000000000001"
CLIENT_ID = "10000000-0000-0000-0000-000000000002"
PROGRAM_ID = "10000000-0000-0000-0000-000000000003"
DAY_IDS = (
    "10000000-0000-0000-0000-000000000004",
    "10000000-0000-0000-0000-000000000005",
)
EXERCISE_IDS = (
    "10000000-0000-0000-0000-000000000006",
    "10000000-0000-0000-0000-000000000007",
)
PUBLISH_KEY = UUID("20000000-0000-0000-0000-000000000001")


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


def snapshot(days: int = 2) -> dict:
    return {
        "name": "QA Four-Week Strength",
        "active_from": "2026-09-16",
        "notes": "",
        "days": [
            {
                "position": index,
                "weekday": weekday,
                "name": f"Day {index}",
                "coach_note": "",
                "exercises": [
                    {
                        "position": 1,
                        "name": "Goblet squat",
                        "prescribed_sets": 4,
                        "prescribed_reps": "8-10",
                        "rest_seconds": 90,
                        "coach_note": "",
                    }
                ],
            }
            for index, weekday in enumerate(range(3, 3 + days), 1)
        ],
    }


def test_snapshot_rejects_duplicate_weekdays() -> None:
    payload = snapshot()
    payload["days"][1]["weekday"] = 3

    with pytest.raises(ValidationError):
        WorkoutProgramSnapshot.model_validate(payload)


def program_result(
    *,
    status: str = "draft",
    version: int | None = None,
    nested: bool = False,
) -> dict:
    days = []
    for index, weekday in enumerate((3, 4), 1):
        exercise = {
            "id": EXERCISE_IDS[index - 1],
            "exercise_library_item_id": None,
            "position": 1,
            "name": "Goblet squat",
            "prescribed_sets": 4,
            "prescribed_reps": "8-10",
            "rest_seconds": 90,
            "coach_note": "",
        }
        day = {
            "id": DAY_IDS[index - 1],
            "position": index,
            "weekday": weekday,
            "name": f"Day {index}",
            "coach_note": "",
        }
        if nested:
            exercise["training_program_day_id"] = DAY_IDS[index - 1]
            day["training_program_id"] = PROGRAM_ID
            day["training_program_day_exercises"] = [exercise]
        else:
            day["exercises"] = [exercise]
        days.append(day)

    result = {
        "id": PROGRAM_ID,
        "client_id": CLIENT_ID,
        "name": "QA Four-Week Strength",
        "status": status,
        "version": version,
        "active_from": "2026-09-16",
        "active_to": "2026-10-13" if status == "published" else None,
        "replaces_program_id": None,
    }
    if nested:
        result["coach_note"] = ""
        result["published_at"] = "2026-09-16T08:00:00+00:00"
        result["training_program_days"] = list(reversed(days))
    else:
        result["notes"] = ""
        result["days"] = days
    return result


def access_response(url: str) -> FakeResponse | None:
    if url.endswith("/rest/v1/profiles"):
        return FakeResponse(200, [{"id": COACH_ID, "role": "coach"}])
    if url.endswith("/rest/v1/coaches"):
        return FakeResponse(200, [{"id": COACH_ID, "is_active": True}])
    if url.endswith("/rest/v1/clients"):
        return FakeResponse(200, [{"id": CLIENT_ID}])
    return None


def test_save_draft_uses_caller_jwt_and_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    validated = WorkoutProgramSnapshot.model_validate(snapshot())

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/save_workout_program_draft"):
            return FakeResponse(200, program_result())
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = WorkoutProgramService(settings(), coach_user()).save_draft(CLIENT_ID, validated)

    assert result["status"] == "draft"
    assert seen[-1][0] == "POST"
    assert seen[-1][1].endswith("/rest/v1/rpc/save_workout_program_draft")
    assert seen[-1][2]["json"] == {
        "p_client_id": CLIENT_ID,
        "p_snapshot": validated.model_dump(mode="json"),
    }
    assert all(
        request_kwargs["headers"]["Authorization"] == "Bearer coach-jwt"
        for _, _, request_kwargs in seen
    )


def test_publish_uses_caller_jwt_and_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str, dict]] = []
    validated = WorkoutProgramSnapshot.model_validate(snapshot())
    published = program_result(status="published", version=1)

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/publish_workout_program"):
            return FakeResponse(
                200,
                {
                    "program": published,
                    "generated_session_count": 12,
                    "generated_session_dates": ["2026-09-16", "2026-09-17"],
                },
            )
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = WorkoutProgramService(settings(), coach_user()).publish(
        CLIENT_ID,
        PUBLISH_KEY,
        validated,
    )

    assert result["generated_session_count"] == 12
    assert seen[-1][0] == "POST"
    assert seen[-1][1].endswith("/rest/v1/rpc/publish_workout_program")
    assert seen[-1][2]["json"] == {
        "p_client_id": CLIENT_ID,
        "p_publish_key": str(PUBLISH_KEY),
        "p_snapshot": validated.model_dump(mode="json"),
    }
    assert all(
        request_kwargs["headers"]["Authorization"] == "Bearer coach-jwt"
        for _, _, request_kwargs in seen
    )


def test_workspace_uses_rls_reads_and_strips_nested_provider_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        seen.append((method, url, kwargs))
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/training_programs"):
            if kwargs["params"]["status"] == "eq.published":
                return FakeResponse(
                    200,
                    [program_result(status="published", version=1, nested=True)],
                )
            return FakeResponse(200, [program_result(nested=True)])
        if url.endswith("/rest/v1/exercise_library_items"):
            return FakeResponse(
                200,
                [
                    {
                        "id": "10000000-0000-0000-0000-000000000008",
                        "name": "Goblet squat",
                        "body_region": "lower_body",
                        "training_focus": "strength",
                    }
                ],
            )
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)
    result = WorkoutProgramService(settings(), coach_user()).get_workspace(CLIENT_ID)

    assert result["active_program"] == program_result(status="published", version=1)
    assert result["draft"] == program_result()
    program_reads = [
        kwargs["params"] for _, url, kwargs in seen if url.endswith("/rest/v1/training_programs")
    ]
    assert program_reads[0]["client_id"] == f"eq.{CLIENT_ID}"
    assert program_reads[0]["status"] == "eq.published"
    assert program_reads[0]["order"] == "published_at.desc"
    assert program_reads[1]["status"] == "eq.draft"
    assert all(
        request_kwargs["headers"]["Authorization"] == "Bearer coach-jwt"
        for _, _, request_kwargs in seen
    )


@pytest.mark.parametrize(
    ("status_code", "provider_payload", "expected_status", "expected_code"),
    [
        (
            403,
            {"code": "42501", "message": "insufficient privilege"},
            403,
            "authorization_failed",
        ),
        (
            400,
            {"code": "22023", "message": "invalid workout program"},
            422,
            "supabase_validation_failed",
        ),
        (
            409,
            {"code": "23505", "message": "duplicate key value violates unique constraint"},
            409,
            "program_publish_conflict",
        ),
        (
            500,
            {"code": "40001", "message": "could not serialize access due to concurrent update"},
            409,
            "program_publish_conflict",
        ),
    ],
)
def test_publish_maps_postgrest_errors(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    provider_payload: dict,
    expected_status: int,
    expected_code: str,
) -> None:
    def request(method: str, url: str, **kwargs):
        access = access_response(url)
        if access is not None:
            return access
        if url.endswith("/rest/v1/rpc/publish_workout_program"):
            return FakeResponse(status_code, provider_payload)
        raise AssertionError(url)

    monkeypatch.setattr(httpx, "request", request)

    with pytest.raises(APIError) as error:
        WorkoutProgramService(settings(), coach_user()).publish(
            CLIENT_ID,
            PUBLISH_KEY,
            WorkoutProgramSnapshot.model_validate(snapshot()),
        )

    assert error.value.status_code == expected_status
    assert error.value.code == expected_code


def test_publish_maps_upstream_availability_to_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(method: str, url: str, **kwargs):
        access = access_response(url)
        if access is not None:
            return access
        raise httpx.ConnectError("Supabase offline")

    monkeypatch.setattr(httpx, "request", request)

    with pytest.raises(APIError) as error:
        WorkoutProgramService(settings(), coach_user()).publish(
            CLIENT_ID,
            PUBLISH_KEY,
            WorkoutProgramSnapshot.model_validate(snapshot()),
        )

    assert error.value.status_code == 503
    assert error.value.code == "supabase_unavailable"


def test_workout_program_routes_render_error_contracts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app.dependency_overrides[get_settings] = settings
    app.dependency_overrides[get_authenticated_user] = coach_user
    try:
        with TestClient(app) as client:
            invalid_payload = snapshot()
            invalid_payload["days"][1]["weekday"] = 3
            validation = client.put(
                f"/api/v1/coach/clients/{CLIENT_ID}/workout-program/draft",
                json=invalid_payload,
            )
            assert validation.status_code == 422
            assert validation.json()["error"]["code"] == "validation_error"

            def forbidden(*_args, **_kwargs):
                raise APIError(403, "authorization_failed", "Forbidden")

            monkeypatch.setattr(WorkoutProgramService, "save_draft", forbidden)
            denied = client.put(
                f"/api/v1/coach/clients/{CLIENT_ID}/workout-program/draft",
                json=snapshot(),
            )
            assert denied.status_code == 403
            assert denied.json()["error"]["code"] == "authorization_failed"

            def conflicted(*_args, **_kwargs):
                raise APIError(409, "program_publish_conflict", "Publish conflict")

            monkeypatch.setattr(WorkoutProgramService, "publish", conflicted)
            conflict = client.post(
                f"/api/v1/coach/clients/{CLIENT_ID}/workout-program/publish",
                json={"publish_key": str(PUBLISH_KEY), "program": snapshot()},
            )
            assert conflict.status_code == 409
            assert conflict.json()["error"]["code"] == "program_publish_conflict"

            def unavailable(*_args, **_kwargs):
                raise APIError(503, "supabase_unavailable", "Supabase is unavailable")

            monkeypatch.setattr(WorkoutProgramService, "get_workspace", unavailable)
            outage = client.get(
                f"/api/v1/coach/clients/{CLIENT_ID}/workout-program"
            )
            assert outage.status_code == 503
            assert outage.json()["error"]["code"] == "supabase_unavailable"
    finally:
        app.dependency_overrides.clear()


def test_snapshot_rejects_non_contiguous_positions() -> None:
    payload = snapshot()
    payload["days"][1]["position"] = 3

    with pytest.raises(ValidationError):
        WorkoutProgramSnapshot.model_validate(payload)
