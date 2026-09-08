from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProfilePhoto(BaseModel):
    """Metadata only; private image bytes are served by a guarded endpoint."""

    id: str
    content_type: str
    byte_size: int
    updated_at: datetime
    content_url: str


class ProfilePhotoResponse(BaseModel):
    photo: ProfilePhoto | None
