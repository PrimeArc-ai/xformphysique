"""Retry only explicitly retired R2 photos; never apply a retention policy."""
from __future__ import annotations

import threading
import logging

from app.core.config import Settings
from app.core.supabase import SupabaseAdminGateway
from app.services.r2_photo_storage import R2PhotoStorage

logger = logging.getLogger(__name__)


class PhotoCleanupService:
    def __init__(self, settings: Settings):
        self.gateway = SupabaseAdminGateway(settings)
        self.storage = R2PhotoStorage(settings)

    def run_once(self, stop_requested=lambda: False) -> dict[str, int]:
        # One lease at a time prevents later jobs expiring while an earlier R2 call waits.
        counts = {"claimed": 0, "completed": 0, "retry_pending": 0}
        for _ in range(10):
            if stop_requested():
                break
            jobs = self.gateway.request("POST", "/rest/v1/rpc/claim_photo_cleanup_jobs", json={"p_limit": 1}).json()
            if not jobs:
                break
            job = jobs[0]
            counts["claimed"] += 1
            success, error = False, "cleanup_failed"
            try:
                photos = self.gateway.request("GET", "/rest/v1/progress_photos", params={
                    "id": f"eq.{job['photo_id']}", "select": "storage_path,storage_provider,deleted_at",
                }).json()
                references = self.gateway.request("GET", "/rest/v1/progress_photos", params={
                    "storage_path": f"eq.{job['storage_path']}", "deleted_at": "is.null", "select": "id", "limit": 1,
                }).json()
                if (len(photos) == 1 and photos[0].get("deleted_at")
                        and photos[0].get("storage_provider") == "r2"
                        and photos[0].get("storage_path") == job["storage_path"] and not references):
                    # S3 DeleteObject is idempotent: retry is safe after a lost DB response.
                    self.storage.delete(job["storage_path"], strict=True)
                    success, error = True, None
                else:
                    error = "reference_not_retired"
            except Exception:
                # Do not store provider messages, object paths, credentials, or client data.
                error = "storage_or_reference_unavailable"
            try:
                accepted = self.gateway.request("POST", "/rest/v1/rpc/finish_photo_cleanup_job", json={
                    "p_id": job["id"], "p_lease_token": job["lease_token"],
                    "p_success": success, "p_error_code": error,
                }).json()
                success = success and accepted is True
            except Exception:
                # Lease expiry makes an uncertain completion retryable after process death.
                success = False
                logger.warning("Photo cleanup completion unavailable; lease will retry")
            counts["completed" if success else "retry_pending"] += 1
        return counts


def run_photo_cleanup(settings: Settings, stop: threading.Event) -> None:
    service = PhotoCleanupService(settings)
    while not stop.is_set():
        try:
            result = service.run_once(stop.is_set)
            if result["claimed"]:
                logger.info("Photo cleanup batch: completed=%s retry_pending=%s", result["completed"], result["retry_pending"])
        except Exception:
            logger.warning("Photo cleanup batch unavailable; will retry")
        stop.wait(timeout=60)
