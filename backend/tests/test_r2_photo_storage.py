from __future__ import annotations

import asyncio
import io

import pytest
from PIL import Image

from app.core.config import Settings
from app.core.errors import APIError
from app.services.r2_photo_storage import R2PhotoStorage


class FakeR2Client:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def put_object(self, **kwargs) -> None:
        self.calls.append(kwargs)


class FakeUpload:
    def __init__(self, content: bytes, content_type: str) -> None:
        self.content = content
        self.content_type = content_type

    async def read(self, _: int) -> bytes:
        return self.content


def test_r2_storage_fails_closed_without_server_credentials() -> None:
    settings = Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
    )

    with pytest.raises(APIError) as error:
        R2PhotoStorage(settings)

    assert error.value.status_code == 503
    assert error.value.code == "r2_not_configured"


def test_r2_endpoint_is_derived_from_account_id() -> None:
    settings = Settings(
        _env_file=None,
        r2_account_id="account-id",
        r2_access_key_id="access-key",
        r2_secret_access_key="secret-key",
        r2_bucket_name="xform-progress-photos",
    )

    assert settings.r2_enabled is True
    assert settings.r2_effective_endpoint_url == "https://account-id.r2.cloudflarestorage.com"


def test_profile_photo_is_compact_webp_at_a_stable_opaque_key() -> None:
    settings = Settings(
        _env_file=None,
        r2_account_id="account-id",
        r2_access_key_id="access-key",
        r2_secret_access_key="secret-key",
        r2_bucket_name="xform-progress-photos",
    )
    raw = io.BytesIO()
    Image.new("RGB", (64, 48), color=(25, 50, 75)).save(raw, format="PNG")
    upload = FakeUpload(raw.getvalue(), "image/png")
    storage = R2PhotoStorage(settings)
    fake_r2 = FakeR2Client()
    storage._client = fake_r2

    profile_id = "11111111-1111-1111-1111-111111111111"
    photo_id = "22222222-2222-2222-2222-222222222222"
    storage_path, byte_size, content_type, file_name = asyncio.run(
        storage.save_profile_photo(upload, profile_id, photo_id)
    )

    assert storage_path == f"profiles/{profile_id}/{photo_id}.webp"
    assert content_type == "image/webp"
    assert file_name == "profile-photo.webp"
    assert byte_size == len(fake_r2.calls[0]["Body"])
    assert fake_r2.calls[0]["Key"] == storage_path
    assert fake_r2.calls[0]["ContentType"] == "image/webp"
    with Image.open(io.BytesIO(fake_r2.calls[0]["Body"])) as normalized:
        assert normalized.format == "WEBP"
        assert max(normalized.size) <= 1024
