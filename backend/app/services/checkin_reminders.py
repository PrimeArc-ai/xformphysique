from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import SupabaseAdminGateway


WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


class WhatsAppSender(Protocol):
    """Provider boundary; application scheduling never depends on Twilio details."""

    def send_checkin_reminder(self, destination: str) -> str:
        """Send one approved, privacy-minimal utility template and return its provider ID."""


class TwilioWhatsAppSender:
    """Twilio Content Template sender. Credentials remain server-only."""

    def __init__(self, settings: Settings) -> None:
        if not settings.twilio_whatsapp_enabled:
            raise APIError(
                503,
                "whatsapp_provider_not_configured",
                "Twilio WhatsApp sender and approved reminder template are not configured",
            )
        self.account_sid = settings.twilio_account_sid
        self.auth_token = settings.twilio_auth_token
        self.from_number = settings.twilio_whatsapp_from
        self.template_sid = settings.twilio_whatsapp_reminder_template_sid

    def send_checkin_reminder(self, destination: str) -> str:
        try:
            response = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json",
                data={
                    "To": f"whatsapp:{destination}",
                    "From": self.from_number,
                    "ContentSid": self.template_sid,
                },
                auth=(self.account_sid, self.auth_token),
                timeout=12.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise APIError(503, "whatsapp_delivery_failed", "WhatsApp provider could not accept reminder") from exc
        message_sid = response.json().get("sid")
        if not message_sid:
            raise APIError(503, "whatsapp_delivery_failed", "WhatsApp provider did not return a message ID")
        return message_sid


@dataclass(frozen=True)
class ReminderRunResult:
    evaluated: int
    queued: int
    sent: int
    skipped: int
    failed: int

    def as_payload(self) -> dict[str, int]:
        return {
            "evaluated": self.evaluated,
            "queued": self.queued,
            "sent": self.sent,
            "skipped": self.skipped,
            "failed": self.failed,
        }


class CheckinReminderService:
    """Server-side, idempotent daily reminders for due weekly check-ins.

    The service uses the server-only Supabase Admin credential because it must
    evaluate many clients. It never receives that credential from a browser.
    """

    def __init__(self, settings: Settings, sender: WhatsAppSender | None = None) -> None:
        self.settings = settings
        self.sender = sender

    def run(self, now: datetime | None = None) -> ReminderRunResult:
        admin = SupabaseAdminGateway(self.settings)
        now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        preferences = self._rows(
            admin,
            "client_notification_preferences",
            {"checkin_reminders_enabled": "eq.true", "whatsapp_opted_out_at": "is.null"},
        )
        clients = {
            client["id"]: client
            for client in self._rows(admin, "clients", {"limit": 5000})
        }
        evaluated = queued = sent = skipped = failed = 0
        sender = self.sender

        for preference in preferences:
            evaluated += 1
            client = clients.get(preference["client_id"])
            if not client or not preference.get("whatsapp_consent_at") or not preference.get("whatsapp_destination"):
                skipped += 1
                continue
            local_now = self._local_time(now_utc, client.get("timezone"))
            if local_now is None or not self._is_due_window(client, preference, local_now):
                skipped += 1
                continue
            reminder_date = local_now.date()
            existing = self._one_or_none(
                admin,
                "notification_deliveries",
                {
                    "client_id": f"eq.{client['id']}",
                    "channel": "eq.whatsapp",
                    "reminder_local_date": f"eq.{reminder_date.isoformat()}",
                },
            )
            if existing is not None:
                skipped += 1
                continue
            # Validate sender configuration before creating an outbox record, so
            # a missing secret cannot strand a queued reminder.
            if sender is None:
                sender = TwilioWhatsAppSender(self.settings)
            delivery = self._write(
                admin,
                "POST",
                "notification_deliveries",
                {
                    "client_id": client["id"],
                    "channel": "whatsapp",
                    "provider": "twilio",
                    "reminder_local_date": reminder_date.isoformat(),
                    "scheduled_for": local_now.isoformat(),
                    "status": "queued",
                    "attempt_count": 0,
                },
            )[0]
            queued += 1
            try:
                provider_message_id = sender.send_checkin_reminder(preference["whatsapp_destination"])
                self._write(
                    admin,
                    "PATCH",
                    "notification_deliveries",
                    {
                        "status": "sent",
                        "attempt_count": 1,
                        "provider_message_id": provider_message_id,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                        "last_error": None,
                    },
                    params={"id": f"eq.{delivery['id']}"},
                )
                sent += 1
            except APIError as exc:
                self._write(
                    admin,
                    "PATCH",
                    "notification_deliveries",
                    {
                        "status": "failed",
                        "attempt_count": 1,
                        "last_error": exc.code,
                    },
                    params={"id": f"eq.{delivery['id']}"},
                )
                failed += 1
        return ReminderRunResult(evaluated, queued, sent, skipped, failed)

    @staticmethod
    def _local_time(now: datetime, timezone_name: str | None) -> datetime | None:
        try:
            return now.astimezone(ZoneInfo(timezone_name or "UTC"))
        except ZoneInfoNotFoundError:
            return None

    @staticmethod
    def _is_due_window(client: dict[str, Any], preference: dict[str, Any], now: datetime) -> bool:
        reminder_time = time.fromisoformat(preference["reminder_time"])
        scheduled = datetime.combine(now.date(), reminder_time, tzinfo=now.tzinfo)
        tomorrow_checkin_day = WEEKDAYS[(now.date() + timedelta(days=1)).weekday()]
        return (
            client["check_in_day"] == tomorrow_checkin_day
            # The scheduler invokes this once at the configured local minute;
            # this is intentionally not a polling window across the hour.
            and now.replace(second=0, microsecond=0) == scheduled
        )

    @staticmethod
    def _rows(
        admin: SupabaseAdminGateway, table: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        return admin.request("GET", f"/rest/v1/{table}", params={"select": "*", **(params or {})}).json()

    def _one_or_none(
        self, admin: SupabaseAdminGateway, table: str, params: dict[str, Any]
    ) -> dict[str, Any] | None:
        rows = self._rows(admin, table, {**params, "limit": 1})
        return rows[0] if rows else None

    @staticmethod
    def _write(
        admin: SupabaseAdminGateway,
        method: str,
        table: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return admin.request(
            method,
            f"/rest/v1/{table}",
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        ).json()
