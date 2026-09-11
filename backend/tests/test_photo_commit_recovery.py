"""A lost database response must not cause deletion of a successfully saved photo."""
import asyncio
from datetime import date
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser
from app.services.supabase_client import SupabaseClientService


def client_service():
    return SupabaseClientService(
        Settings(_env_file=None, supabase_url="https://example.supabase.co", supabase_publishable_key="public-test"),
        AuthenticatedUser(id="client-a", email="client@example.test", access_token="test-only"),
    )


@pytest.mark.parametrize("read_state", ["committed", "absent", "unavailable"])
def test_uncertain_upload_keeps_bytes_unless_absence_proven(monkeypatch, read_state):
    service = client_service()
    removed = []
    photo = dict(id="photo-1", view="front", captured_on="2026-09-09", original_filename="photo.webp", storage_path="client-a/photo-1.webp")
    async def save(*args):
        return "client-a/photo-1.webp", 100, "image/webp", "photo.webp"
    storage = SimpleNamespace(save=save, delete=lambda path: removed.append(path))
    monkeypatch.setattr("app.services.supabase_client.R2PhotoStorage", lambda settings: storage)
    monkeypatch.setattr(service, "today", lambda: date(2026, 9, 9))
    def failed_commit_response(*args, **kwargs):
        raise APIError(503, "network_error", "Response lost")
    monkeypatch.setattr(service.gateway, "request", failed_commit_response)
    def read_back(*args):
        if read_state == "unavailable":
            raise APIError(503, "network_error", "Cannot confirm metadata")
        return photo if read_state == "committed" else None
    monkeypatch.setattr(service, "_one_or_none", read_back)
    operation = service.upload_progress_photo(None, "front", date(2026, 9, 9))
    if read_state == "committed":
        assert asyncio.run(operation)["id"] == "photo-1"
    else:
        with pytest.raises(APIError):
            asyncio.run(operation)
    assert removed == (["client-a/photo-1.webp"] if read_state == "absent" else [])


def test_delete_reports_cleanup_pending_after_private_retirement(monkeypatch):
    service = client_service()
    calls = []
    def retire(method, path, **kwargs):
        calls.append(path)
        return SimpleNamespace(json=lambda: dict(storage_provider="r2", storage_path="client-a/photo.webp"))
    def unavailable(path, strict=False):
        assert strict and calls == ["/rest/v1/rpc/retire_progress_photo"]
        raise APIError(503, "storage_unavailable", "Storage unavailable")
    monkeypatch.setattr(service.gateway, "request", retire)
    monkeypatch.setattr("app.services.supabase_client.R2PhotoStorage", lambda settings: SimpleNamespace(delete=unavailable))
    assert service.delete_progress_photo("photo-1") == {"id": "photo-1", "deleted": True, "cleanup_pending": True}
