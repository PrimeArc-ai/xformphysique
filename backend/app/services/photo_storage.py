from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.errors import APIError


ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


class LocalPhotoStorage:
    """Local private storage adapter. Swap this class when object storage is introduced."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.root = self.settings.storage_dir.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    async def save(self, file: UploadFile) -> tuple[str, int, str]:
        content_type = (file.content_type or "").lower()
        suffix = ALLOWED_IMAGE_TYPES.get(content_type)
        if suffix is None:
            raise APIError(422, "invalid_photo_type", "Upload a JPEG, PNG or WebP image")

        contents = await file.read(self.settings.max_photo_bytes + 1)
        if not contents:
            raise APIError(422, "empty_photo", "Photo file cannot be empty")
        if len(contents) > self.settings.max_photo_bytes:
            raise APIError(422, "photo_too_large", "Photo exceeds 10 MB limit")

        storage_key = f"{uuid4().hex}{suffix}"
        target = self.root / storage_key
        temporary = self.root / f".{storage_key}.part"
        temporary.write_bytes(contents)
        temporary.replace(target)
        return storage_key, len(contents), content_type

    def path_for(self, storage_key: str) -> Path:
        candidate = (self.root / storage_key).resolve()
        if candidate.parent != self.root or not candidate.is_file():
            raise APIError(404, "photo_not_found", "Progress photo not found")
        return candidate

    def delete(self, storage_key: str) -> None:
        candidate = (self.root / storage_key).resolve()
        if candidate.parent == self.root:
            candidate.unlink(missing_ok=True)
