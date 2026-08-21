from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Header

from app.core.config import Settings, get_settings
from app.core.errors import APIError


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    access_token: str


class SupabaseGateway:
    """Small server-side client that preserves the caller JWT for every RLS check."""

    def __init__(self, settings: Settings, access_token: str) -> None:
        if not settings.supabase_enabled:
            raise APIError(503, "supabase_not_configured", "Supabase integration is not configured")
        self.base_url = settings.supabase_url.rstrip("/")
        self.publishable_key = settings.supabase_publishable_key
        self.access_token = access_token

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {self.access_token}",
        }

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        request_headers = {**self.headers, **(headers or {})}
        try:
            response = httpx.request(
                method,
                f"{self.base_url}{path}",
                params=params,
                json=json,
                content=content,
                headers=request_headers,
                timeout=12.0,
            )
        except httpx.HTTPError as exc:
            raise APIError(503, "supabase_unavailable", "Supabase is unavailable") from exc
        if response.status_code >= 400:
            self._raise_error(response)
        return response

    @staticmethod
    def _raise_error(response: httpx.Response) -> None:
        try:
            detail = response.json()
        except ValueError:
            detail = {}
        message = detail.get("message") or detail.get("msg") or "Supabase request failed"
        status = response.status_code
        if status in {401, 403}:
            raise APIError(status, "authorization_failed", message)
        if status == 404:
            raise APIError(404, "resource_not_found", message)
        if status in {400, 409, 422}:
            raise APIError(status, "supabase_validation_failed", message)
        raise APIError(503, "supabase_request_failed", message)


class SupabaseAdminGateway(SupabaseGateway):
    """Explicit server-only gateway for narrowly scoped Admin Auth operations.

    Its key bypasses RLS. Callers must first be authenticated and authorized with
    their own JWT before using this gateway.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_admin_enabled:
            raise APIError(
                503,
                "supabase_admin_not_configured",
                "Client invitations require the Supabase server secret key",
            )
        self.base_url = settings.supabase_url.rstrip("/")
        self.admin_key = settings.supabase_admin_key

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.admin_key,
            "Authorization": f"Bearer {self.admin_key}",
        }


def get_authenticated_user(
    authorization: str | None = Header(default=None),
    settings: Settings = get_settings(),
) -> AuthenticatedUser:
    if not settings.supabase_enabled:
        raise APIError(503, "supabase_not_configured", "Supabase authentication is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise APIError(401, "missing_access_token", "A valid access token is required")
    access_token = authorization.removeprefix("Bearer ").strip()
    if not access_token:
        raise APIError(401, "missing_access_token", "A valid access token is required")

    gateway = SupabaseGateway(settings, access_token)
    response = gateway.request("GET", "/auth/v1/user")
    payload = response.json()
    user_id = payload.get("id")
    if not user_id:
        raise APIError(401, "invalid_access_token", "The access token is invalid")
    return AuthenticatedUser(id=user_id, email=payload.get("email"), access_token=access_token)
