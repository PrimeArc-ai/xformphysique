from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseGateway
from app.services.r2_photo_storage import R2PhotoStorage


WorkspaceRole = Literal["client", "coach"]


class ProfilePhotoService:
    """Own-profile avatars only, with Supabase RLS retained on every metadata call."""

    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = (
            SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None
        )

    def get_photo(self, role: WorkspaceRole) -> dict[str, Any]:
        if self.gateway is None:
            return {"photo": None}
        self._require_role(role)
        photo = self._one_or_none("profile_photos", {"profile_id": f"eq.{self.user.id}"})
        return {"photo": self._payload(photo, role) if photo else None}

    async def upload_photo(self, file: UploadFile, role: WorkspaceRole) -> dict[str, Any]:
        self._require_role(role)
        existing = self._one_or_none("profile_photos", {"profile_id": f"eq.{self.user.id}"})
        # A stable ID/key means an avatar replacement overwrites the old R2 object,
        # rather than leaving an unreferenced image that consumes storage.
        photo_id = existing["id"] if existing else str(uuid4())
        storage = R2PhotoStorage(self.settings)
        storage_path, byte_size, content_type, _ = await storage.save_profile_photo(
            file, self.user.id, photo_id
        )
        payload = {
            "id": photo_id,
            "profile_id": self.user.id,
            "storage_provider": "r2",
            "storage_path": storage_path,
            "content_type": content_type,
            "byte_size": byte_size,
        }
        try:
            if existing:
                rows = self._write(
                    "PATCH", "profile_photos", payload, params={"profile_id": f"eq.{self.user.id}"}
                )
            else:
                rows = self._write("POST", "profile_photos", payload)
        except Exception:
            # First-write failures do not leave an image behind. Replacements use a
            # stable key, so cleanup would delete the caller's previous avatar.
            if not existing:
                storage.delete(storage_path)
            raise
        return self._payload(rows[0], role)

    def get_photo_content(self, role: WorkspaceRole) -> tuple[bytes, str, str]:
        self._require_role(role)
        photo = self._one("profile_photos", {"profile_id": f"eq.{self.user.id}"}, "profile_photo_not_found")
        if photo.get("storage_provider") != "r2":
            raise APIError(503, "profile_photo_storage_unavailable", "Profile photo storage is unavailable")
        return R2PhotoStorage(self.settings).read(photo["storage_path"]), photo["content_type"], "profile-photo.webp"

    def _require_role(self, role: WorkspaceRole) -> None:
        profile = self._one("profiles", {"id": f"eq.{self.user.id}"}, "workspace_not_found")
        if profile.get("role") != role:
            raise APIError(403, f"{role}_role_required", f"{role.title()} workspace access is required")
        if role == "coach":
            coach = self._one_or_none("coaches", {"id": f"eq.{self.user.id}"})
            if not coach or not coach.get("is_active"):
                raise APIError(403, "coach_inactive", "Your coach access has been suspended")

    def _payload(self, photo: dict[str, Any], role: WorkspaceRole) -> dict[str, Any]:
        return {
            "id": photo["id"],
            "content_type": photo["content_type"],
            "byte_size": photo["byte_size"],
            "updated_at": photo["updated_at"],
            "content_url": f"/api/v1/{role}/profile/photo/content",
        }

    def _one_or_none(self, table: str, params: dict[str, Any]) -> dict[str, Any] | None:
        response = self.gateway.request("GET", f"/rest/v1/{table}", params={"select": "*", **params, "limit": 1})
        rows = response.json()
        return rows[0] if rows else None

    def _one(self, table: str, params: dict[str, Any], code: str) -> dict[str, Any]:
        row = self._one_or_none(table, params)
        if row is None:
            raise APIError(404, code, "The current workspace is not authorized for this action")
        return row

    def _write(
        self, method: str, table: str, payload: dict[str, Any], *, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        response = self.gateway.request(
            method,
            f"/rest/v1/{table}",
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        return response.json()
