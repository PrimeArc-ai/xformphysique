from __future__ import annotations

import io
from typing import Any
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import APIError


IMAGE_FORMATS = {
    "image/jpeg": ("JPEG", ".jpg"),
    "image/png": ("PNG", ".png"),
    "image/webp": ("WEBP", ".webp"),
}


class R2PhotoStorage:
    """Private Cloudflare R2 images behind the FastAPI authorization boundary.

    Browsers never receive an R2 credential, object-list permission, or public
    bucket URL. Object keys contain only the client UUID plus a random UUID.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.r2_enabled or not settings.r2_effective_endpoint_url:
            raise APIError(
                503,
                "r2_not_configured",
                "Cloudflare R2 is not configured for progress-photo storage",
            )
        self.settings = settings
        self.bucket = settings.r2_bucket_name
        self._client: Any | None = None

    async def save(self, file: UploadFile, client_id: str) -> tuple[str, int, str, str]:
        """Validate, remove EXIF/metadata, and write one private R2 object."""

        normalized, content_type, suffix = await self._prepare_image(
            file, max_bytes=self.settings.max_photo_bytes
        )
        object_key = f"{client_id}/{uuid4().hex}{suffix}"
        self._write_object(object_key, normalized, content_type)
        return object_key, len(normalized), content_type, f"progress-photo{suffix}"

    async def save_profile_photo(
        self, file: UploadFile, profile_id: str, photo_id: str
    ) -> tuple[str, int, str, str]:
        """Store a small, current-only profile image under its stable photo ID.

        Re-uploads overwrite the same opaque R2 key. This guarantees one object
        per profile photo rather than accumulating historical avatar files.
        """

        normalized, _, _ = await self._prepare_image(
            file,
            max_bytes=self.settings.max_profile_photo_bytes,
            output_content_type="image/webp",
            max_dimension=1024,
        )
        content_type = "image/webp"
        object_key = f"profiles/{profile_id}/{photo_id}.webp"
        self._write_object(object_key, normalized, content_type)
        return object_key, len(normalized), content_type, "profile-photo.webp"

    async def _prepare_image(
        self,
        file: UploadFile,
        *,
        max_bytes: int,
        output_content_type: str | None = None,
        max_dimension: int | None = None,
    ) -> tuple[bytes, str, str]:
        content_type = (file.content_type or "").lower()
        format_details = IMAGE_FORMATS.get(content_type)
        if format_details is None:
            raise APIError(422, "invalid_photo_type", "Upload a JPEG, PNG or WebP image")
        raw = await file.read(max_bytes + 1)
        if not raw:
            raise APIError(422, "empty_photo", "Photo file cannot be empty")
        if len(raw) > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            raise APIError(422, "photo_too_large", f"Photo exceeds {limit_mb} MB limit")
        normalized = self._strip_metadata(
            raw,
            output_content_type or content_type,
            max_dimension=max_dimension,
        )
        if len(normalized) > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            raise APIError(422, "photo_too_large", f"Processed photo exceeds {limit_mb} MB limit")
        final_content_type = output_content_type or content_type
        _, suffix = IMAGE_FORMATS[final_content_type]
        return normalized, final_content_type, suffix

    def _write_object(self, object_key: str, content: bytes, content_type: str) -> None:
        try:
            self._r2().put_object(
                Bucket=self.bucket,
                Key=object_key,
                Body=content,
                ContentType=content_type,
            )
        except Exception as exc:  # Provider exceptions are intentionally not exposed to callers.
            raise APIError(503, "r2_unavailable", "Cloudflare R2 could not store the private photo") from exc

    def read(self, object_key: str) -> bytes:
        try:
            response = self._r2().get_object(Bucket=self.bucket, Key=object_key)
            return response["Body"].read()
        except Exception as exc:
            raise APIError(404, "photo_not_found", "Progress photo not found") from exc

    def delete(self, object_key: str, *, strict: bool = False) -> None:
        try:
            self._r2().delete_object(Bucket=self.bucket, Key=object_key)
        except Exception as exc:
            if strict:
                raise APIError(503, "photo_cleanup_pending", "Photo is hidden; private object cleanup must be retried") from exc
            # Cleanup never hides the original database error after a metadata write failure.
            return

    def _r2(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3
        except ImportError as exc:
            raise APIError(
                503,
                "r2_dependency_missing",
                "R2 storage dependency is not installed on the API server",
            ) from exc
        self._client = boto3.client(
            "s3",
            endpoint_url=self.settings.r2_effective_endpoint_url,
            aws_access_key_id=self.settings.r2_access_key_id,
            aws_secret_access_key=self.settings.r2_secret_access_key,
            region_name="auto",
        )
        return self._client

    @staticmethod
    def _strip_metadata(raw: bytes, content_type: str, *, max_dimension: int | None = None) -> bytes:
        try:
            from PIL import Image, ImageOps
        except ImportError as exc:
            raise APIError(
                503,
                "image_processing_dependency_missing",
                "Image processing dependency is not installed on the API server",
            ) from exc
        try:
            with Image.open(io.BytesIO(raw)) as image:
                normalized = ImageOps.exif_transpose(image)
                if max_dimension:
                    normalized.thumbnail((max_dimension, max_dimension))
                if content_type == "image/jpeg" and normalized.mode not in {"RGB", "L"}:
                    normalized = normalized.convert("RGB")
                output = io.BytesIO()
                save_options: dict[str, Any] = {"format": IMAGE_FORMATS[content_type][0]}
                if content_type in {"image/jpeg", "image/webp"}:
                    save_options.update({"quality": 85, "method": 6} if content_type == "image/webp" else {"quality": 90, "optimize": True})
                normalized.save(output, **save_options)
                return output.getvalue()
        except Exception as exc:
            raise APIError(422, "invalid_photo_content", "Uploaded file is not a valid image") from exc
