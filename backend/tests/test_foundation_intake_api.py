from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.db.base import Base
from app.main import app
from app.schemas.foundation_intake import FoundationAnswers, FoundationAnswersDraft
from app.services.client import ClientService, seed_demo_data
from app.services.foundation_catalog import WAIVER_VERSION, attention_flags, valid_submit_answers
from app.services.foundation_intake import FoundationIntakeService
from app.services.progress import PHOTO_VIEWS
from app.services.supabase_client import SupabaseClientService


CLIENT_ID = "80000000-0000-0000-0000-000000000002"


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


def test_valid_fixtures_parse() -> None:
    FoundationAnswersDraft.model_validate({"identity": {"full_name": "Taylor Example"}})
    FoundationAnswers.model_validate(valid_submit_answers("male"))


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
    assert payload["waiver_version"] == WAIVER_VERSION
    assert payload["attention_flags"] == attention_flags(stored_answers)
    assert payload["submitted_at"] is None
    assert all(
        call[2]["headers"]["Authorization"] == "Bearer client-jwt"
        for call in seen
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


def test_openapi_includes_foundation_intake_routes() -> None:
    paths = app.openapi()["paths"]
    base = "/api/v1/client/foundation-intake"

    assert "get" in paths[base]
    assert "patch" in paths[base]
    assert "post" in paths[f"{base}/submit"]
