from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from app.core.config import Settings
from app.services.checkin_reminders import CheckinReminderService


class FakeResponse:
    def __init__(self, status_code: int, payload: object):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeSender:
    def __init__(self) -> None:
        self.destinations: list[str] = []

    def send_checkin_reminder(self, destination: str) -> str:
        self.destinations.append(destination)
        return "SM-reminder-1"


def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_secret_key="sb_secret_test",
    )


def test_due_reminder_is_sent_once_and_logged(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[tuple[str, str, dict]] = []

    def request(method: str, url: str, **kwargs):
        requests.append((method, url, kwargs))
        params = kwargs.get("params", {})
        if url.endswith("/rest/v1/client_notification_preferences"):
            return FakeResponse(
                200,
                [
                    {
                        "client_id": "client-a",
                        "whatsapp_destination": "+919999999999",
                        "whatsapp_consent_at": "2026-08-01T00:00:00+00:00",
                        "whatsapp_opted_out_at": None,
                        "checkin_reminders_enabled": True,
                        "reminder_time": "21:30:00",
                    }
                ],
            )
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(
                200,
                [{"id": "client-a", "timezone": "Asia/Kolkata", "check_in_day": "monday"}],
            )
        if url.endswith("/rest/v1/notification_deliveries") and method == "GET":
            assert params["client_id"] == "eq.client-a"
            return FakeResponse(200, [])
        if url.endswith("/rest/v1/notification_deliveries") and method == "POST":
            assert kwargs["json"]["status"] == "queued"
            return FakeResponse(201, [{"id": "delivery-a"}])
        if url.endswith("/rest/v1/notification_deliveries") and method == "PATCH":
            assert params == {"id": "eq.delivery-a"}
            assert kwargs["json"]["status"] == "sent"
            assert kwargs["json"]["provider_message_id"] == "SM-reminder-1"
            return FakeResponse(200, [{"id": "delivery-a"}])
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr(httpx, "request", request)
    sender = FakeSender()
    # 16:00 UTC is 21:30 in Asia/Kolkata on Sunday, immediately before a
    # Monday client check-in.
    result = CheckinReminderService(settings(), sender).run(
        datetime(2026, 8, 23, 16, 0, tzinfo=timezone.utc)
    )

    assert result.as_payload() == {"evaluated": 1, "queued": 1, "sent": 1, "skipped": 0, "failed": 0}
    assert sender.destinations == ["+919999999999"]
    assert all(kwargs["headers"]["Authorization"] == "Bearer sb_secret_test" for _, _, kwargs in requests)


def test_reminder_is_not_queued_outside_the_exact_daily_dispatch_time(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(method: str, url: str, **kwargs):
        if url.endswith("/rest/v1/client_notification_preferences"):
            return FakeResponse(
                200,
                [{"client_id": "client-a", "whatsapp_destination": "+919999999999", "whatsapp_consent_at": "2026-08-01T00:00:00+00:00", "whatsapp_opted_out_at": None, "checkin_reminders_enabled": True, "reminder_time": "21:30:00"}],
            )
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": "client-a", "timezone": "Asia/Kolkata", "check_in_day": "monday"}])
        raise AssertionError("No delivery record may be queried or written outside the send window")

    monkeypatch.setattr(httpx, "request", request)
    sender = FakeSender()
    # Five minutes after the configured local time is not eligible; this is a
    # single dispatch, not a 9–10pm polling window.
    result = CheckinReminderService(settings(), sender).run(
        datetime(2026, 8, 23, 16, 5, tzinfo=timezone.utc)
    )

    assert result.as_payload() == {"evaluated": 1, "queued": 0, "sent": 0, "skipped": 1, "failed": 0}
    assert sender.destinations == []
