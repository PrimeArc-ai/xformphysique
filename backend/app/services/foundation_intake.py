from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from app.core.errors import APIError
from app.schemas.foundation_intake import FoundationAnswers, FoundationAnswersDraft
from app.services.client import ClientService
from app.services.foundation_catalog import WAIVER_VERSION, attention_flags
from app.services.progress import PHOTO_VIEWS
from app.services.supabase_client import SupabaseClientService


def _error_fields(exc: ValidationError) -> dict[str, str]:
    return {
        ".".join(str(part) for part in error["loc"]) or "answers": error["msg"]
        for error in exc.errors()
    }


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _photo_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "view": row["view"],
        "captured_on": row["captured_on"],
        "file_name": row["original_filename"],
        "content_url": f"/api/v1/client/progress-photos/{row['id']}/content",
        "period_start": _week_start(date.fromisoformat(row["captured_on"])).isoformat(),
        "uploaded_at": row.get("created_at"),
    }


class FoundationIntakeService:
    def __init__(self, service: ClientService | SupabaseClientService) -> None:
        self.service = service

    @classmethod
    def from_client(
        cls, service: ClientService | SupabaseClientService
    ) -> FoundationIntakeService:
        return cls(service)

    def get_intake(self) -> dict[str, Any]:
        if isinstance(self.service, ClientService):
            return self.service.get_foundation_intake()
        return self._get_supabase_intake()

    def save_draft(self, answers: dict[str, Any]) -> dict[str, Any]:
        if isinstance(self.service, ClientService):
            return self.service.save_foundation_intake_draft(answers)
        try:
            draft = FoundationAnswersDraft.model_validate(answers)
        except ValidationError as exc:
            raise APIError(
                422,
                "foundation_invalid",
                "Foundation intake answers are invalid",
                _error_fields(exc),
            ) from exc
        self._rpc(
            "/rest/v1/rpc/save_foundation_intake_draft",
            {"p_answers": draft.model_dump(mode="json", exclude_none=True)},
        )
        return self.get_intake()

    def submit(self, answers: dict[str, Any], waiver_version: str) -> dict[str, Any]:
        if isinstance(self.service, ClientService):
            return self.service.submit_foundation_intake(answers, waiver_version)
        if waiver_version != WAIVER_VERSION or answers.get("waiver", {}).get("accepted") is not True:
            raise APIError(
                422,
                "foundation_waiver_required",
                f"Waiver {WAIVER_VERSION} must be accepted",
            )
        try:
            submitted = FoundationAnswers.model_validate(answers)
        except ValidationError as exc:
            raise APIError(
                422,
                "foundation_invalid",
                "Foundation intake answers are invalid",
                _error_fields(exc),
            ) from exc
        if any(photo is None for photo in self._photo_slots().values()):
            raise APIError(
                422,
                "foundation_photos_incomplete",
                "All five foundation intake photo poses are required before submit",
            )
        self._rpc(
            "/rest/v1/rpc/submit_foundation_intake",
            {
                "p_answers": submitted.model_dump(mode="json", exclude_none=True),
                "p_waiver_version": waiver_version,
            },
        )
        return self.get_intake()

    def _get_supabase_intake(self) -> dict[str, Any]:
        service = self._supabase()
        client = service._one(
            "clients",
            {"id": f"eq.{service.client_id}"},
            "client_not_found",
            "Client workspace not found",
        )
        profile = service._profile_row()
        status = client.get("foundation_intake_status") or "not_required"
        if status == "not_required":
            return self._payload(
                status=status,
                schema_version=1,
                answers=None,
                full_name=profile.get("full_name", ""),
                email=profile.get("email") or service.user.email or "",
                photos={view: None for view in PHOTO_VIEWS},
                waiver_version=WAIVER_VERSION,
                attention=[],
                submitted_at=None,
            )

        intake = service._one_or_none(
            "client_foundation_intakes",
            {"client_id": f"eq.{service.client_id}"},
        ) or {
            "schema_version": 1,
            "answers": {},
            "waiver_version": None,
            "submitted_at": None,
        }
        answers = intake.get("answers") or {}
        return self._payload(
            status=status,
            schema_version=intake.get("schema_version") or 1,
            answers=answers,
            full_name=profile.get("full_name", ""),
            email=profile.get("email") or service.user.email or "",
            photos=self._photo_slots(),
            waiver_version=intake.get("waiver_version") or WAIVER_VERSION,
            attention=attention_flags(answers),
            submitted_at=intake.get("submitted_at"),
        )

    def _photo_slots(self) -> dict[str, dict[str, Any] | None]:
        service = self._supabase()
        rows = service._rows(
            "progress_photos",
            {
                "select": "id,view,captured_on,original_filename,created_at",
                "client_id": f"eq.{service.client_id}",
                "deleted_at": "is.null",
                "order": "captured_on.desc,created_at.desc,id.desc",
            },
        )
        slots: dict[str, dict[str, Any] | None] = {view: None for view in PHOTO_VIEWS}
        for row in rows:
            view = row.get("view")
            if view in slots and slots[view] is None:
                slots[view] = _photo_payload(row)
        return slots

    def _rpc(self, path: str, payload: dict[str, Any]) -> None:
        service = self._supabase()
        try:
            service.gateway.request("POST", path, json=payload).json()
        except APIError as exc:
            provider_message = exc.message.lower()
            if exc.status_code in {403, 409} or exc.code == "authorization_failed":
                raise APIError(
                    409,
                    "foundation_intake_locked",
                    "Foundation intake is locked and can no longer be edited",
                ) from exc
            if "waiver" in provider_message:
                raise APIError(422, "foundation_waiver_required", exc.message) from exc
            if "photo" in provider_message or "pose" in provider_message:
                raise APIError(422, "foundation_photos_incomplete", exc.message) from exc
            if exc.status_code in {400, 422}:
                raise APIError(
                    422,
                    "foundation_invalid",
                    exc.message,
                    exc.fields,
                ) from exc
            raise

    def _supabase(self) -> SupabaseClientService:
        if not isinstance(self.service, SupabaseClientService):
            raise APIError(
                503,
                "supabase_not_configured",
                "Supabase integration is not configured",
            )
        return self.service

    @staticmethod
    def _payload(
        *,
        status: str,
        schema_version: int,
        answers: dict[str, Any] | None,
        full_name: str,
        email: str,
        photos: dict[str, dict[str, Any] | None],
        waiver_version: str,
        attention: list[str],
        submitted_at: datetime | str | None,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "schema_version": schema_version,
            "answers": answers,
            "prefill": {
                "full_name": full_name,
                "email": email,
            },
            "photos": photos,
            "waiver_version": waiver_version,
            "attention_flags": attention,
            "submitted_at": submitted_at,
        }
