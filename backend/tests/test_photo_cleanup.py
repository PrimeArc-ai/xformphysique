import threading
from types import SimpleNamespace

import pytest

from app.services.photo_cleanup import PhotoCleanupService, run_photo_cleanup


def worker(monkeypatch, *, retired=True, active_reference=False, storage_fails=False, finish_fails=False, stale_lease=False):
    calls, deleted = [], []
    job = {"id": "job-1", "photo_id": "photo-1", "storage_path": "client/retired.webp", "lease_token": "lease-1"}
    jobs = [[job], []]
    def request(method, path, **kwargs):
        calls.append((path, kwargs))
        if path.endswith('claim_photo_cleanup_jobs'):
            return SimpleNamespace(json=lambda: jobs.pop(0))
        if path.endswith('finish_photo_cleanup_job'):
            if finish_fails:
                raise RuntimeError('response lost')
            return SimpleNamespace(json=lambda: not stale_lease)
        if 'id' in kwargs['params']:
            return SimpleNamespace(json=lambda: [{"storage_path": job['storage_path'], "storage_provider": 'r2', "deleted_at": '2026-09-21' if retired else None}])
        return SimpleNamespace(json=lambda: [{"id": 'live'}] if active_reference else [])
    def delete(path, strict):
        assert strict
        deleted.append(path)
        if storage_fails:
            raise RuntimeError('private provider detail')
    monkeypatch.setattr('app.services.photo_cleanup.SupabaseAdminGateway', lambda settings: SimpleNamespace(request=request))
    monkeypatch.setattr('app.services.photo_cleanup.R2PhotoStorage', lambda settings: SimpleNamespace(delete=delete))
    return PhotoCleanupService(None), calls, deleted


def test_success_confirms_after_storage_delete(monkeypatch):
    service, calls, deleted = worker(monkeypatch)
    assert service.run_once() == {"claimed": 1, "completed": 1, "retry_pending": 0}
    assert deleted == ['client/retired.webp']
    finish = next(args['json'] for path, args in calls if path.endswith('finish_photo_cleanup_job'))
    assert finish == {"p_id": 'job-1', "p_lease_token": 'lease-1', "p_success": True, "p_error_code": None}


@pytest.mark.parametrize('options', [{"retired": False}, {"active_reference": True}])
def test_never_deletes_active_or_mismatched_reference(monkeypatch, options):
    service, calls, deleted = worker(monkeypatch, **options)
    assert service.run_once()['retry_pending'] == 1
    assert deleted == []
    finish = next(args['json'] for path, args in calls if path.endswith('finish_photo_cleanup_job'))
    assert finish['p_error_code'] == 'reference_not_retired'
    assert not finish['p_success']


def test_provider_failure_is_durable_and_sanitized(monkeypatch):
    service, calls, _ = worker(monkeypatch, storage_fails=True)
    assert service.run_once()['retry_pending'] == 1
    finish = next(args['json'] for path, args in calls if path.endswith('finish_photo_cleanup_job'))
    assert finish['p_error_code'] == 'storage_or_reference_unavailable'
    assert not finish['p_success']
    assert 'private provider detail' not in str(calls)


def test_lost_completion_response_keeps_retry_semantics(monkeypatch):
    service, _, deleted = worker(monkeypatch, finish_fails=True)
    assert service.run_once()['retry_pending'] == 1
    assert deleted


def test_shutdown_does_not_claim_more_work(monkeypatch):
    service, calls, _ = worker(monkeypatch)
    assert service.run_once(lambda: True)['claimed'] == 0
    assert not calls


def test_background_starts_batch_and_stops_cleanly(monkeypatch):
    stop, completed = threading.Event(), threading.Event()
    def run_once(stop_requested):
        completed.set()
        return {"claimed": 0, "completed": 0, "retry_pending": 0}
    monkeypatch.setattr('app.services.photo_cleanup.PhotoCleanupService', lambda settings: SimpleNamespace(run_once=run_once))
    thread = threading.Thread(target=run_photo_cleanup, args=(None, stop), daemon=True)
    thread.start()
    assert completed.wait(timeout=1)
    stop.set()
    thread.join(timeout=1)
    assert not thread.is_alive()


def test_stale_lease_is_not_reported_as_completed(monkeypatch):
    service, _, deleted = worker(monkeypatch, stale_lease=True)
    assert service.run_once()["completed"] == 0
    assert deleted
