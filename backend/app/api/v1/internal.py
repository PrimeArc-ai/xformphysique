from __future__ import annotations

from hmac import compare_digest
from fastapi import APIRouter, Depends, Header

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.services.checkin_reminders import CheckinReminderService


router = APIRouter(prefix="/internal/jobs", tags=["Internal jobs"])


@router.post("/checkin-reminders/run")
def run_checkin_reminders(
    settings: Settings = Depends(get_settings),
    job_token: str | None = Header(default=None, alias="X-XForm-Job-Token"),
):
    """Protected scheduler endpoint; never call this from the browser."""

    if not settings.checkin_reminder_job_token or not job_token or not compare_digest(
        job_token, settings.checkin_reminder_job_token
    ):
        raise APIError(403, "invalid_job_token", "A valid internal job token is required")
    return CheckinReminderService(settings).run().as_payload()
