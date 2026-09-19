from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, text, select
from sqlalchemy.orm import Session
from app.core.config import Settings
from app.core.supabase import AuthenticatedUser
from app.main import app
from app.db.base import Base
from app.db.upgrades import upgrade_local_schema
from app.models.client import CheckIn, Client, WorkoutSession, WorkoutExercise
from app.schemas.client import CheckInUpsert, WorkoutSessionUpdate, ProfileUpdate
from app.services.client import ClientService, seed_demo_data
from app.services.progress import RATING_KEYS, PHOTO_VIEWS, schedule, exercise_history, local_today
from app.services.supabase_client import SupabaseClientService


def payload():
    return dict(energy_score=4, sleep_score=3, sentiment="good", observation="Consistent week",
                questionnaire_version=2, ratings={key: 7 for key in RATING_KEYS}, challenges="Travel", additional_comments="Kept a routine")


@pytest.mark.parametrize("key", RATING_KEYS)
def test_each_new_rating_is_required_and_validated(key):
    data = payload()
    del data["ratings"][key]
    with pytest.raises(ValidationError): CheckInUpsert(**data)
    for bad in (0, 11, 1.5, True, "7"):
        data["ratings"][key] = bad
        with pytest.raises(ValidationError): CheckInUpsert(**data)


def test_questionnaire_versions_and_timezone_validation():
    assert CheckInUpsert(**payload()).ratings["energy"] == 7
    data = payload(); data["questionnaire_version"] = 1
    with pytest.raises(ValidationError): CheckInUpsert(**data)
    with pytest.raises(ValidationError): ProfileUpdate(timezone="Unknown/City")
    assert ProfileUpdate(timezone="Asia/Kolkata").timezone == "Asia/Kolkata"


def test_duplicate_exercises_or_set_numbers_rejected():
    row = dict(plan_exercise_id="exercise", sets=[dict(set_number=1, reps=10, load_kg=20)])
    with pytest.raises(ValidationError): WorkoutSessionUpdate(exercise_logs=[row, row])
    row["sets"] *= 2
    with pytest.raises(ValidationError): WorkoutSessionUpdate(exercise_logs=[row])


def test_timezone_schedule_misses_and_fixed_seven_day_anchor():
    now = datetime(2026, 9, 6, 19, 0, tzinfo=timezone.utc)
    client = dict(timezone="Asia/Kolkata", check_in_day="sunday", created_at="2026-08-24")
    s = schedule(client, [], now)
    assert s["today"] == "2026-09-07" and s["due_on"] == "2026-08-31"
    assert s["next_due_on"] == "2026-08-31" and s["previous_due_on"] == "2026-08-24"
    assert s["missed_count"] == s["consecutive_missed"] == 1
    result = schedule(client, [{"period_start": "2026-08-31", "submitted_at": "2026-09-06T12:00:00Z"}], now)
    assert result["missed_count"] == 0 and result["consecutive_missed"] == 0
    assert local_today("America/Los_Angeles", now) == date(2026, 9, 6)
    done = schedule(client, [{"period_start": "2026-09-07", "submitted_at": "2026-09-08T10:00:00Z"}], datetime(2026, 9, 9, tzinfo=timezone.utc))
    assert done["current_status"] == "submitted" and done["next_due_on"] == "2026-09-15"


def test_exercise_history_uses_raw_sets_and_preserves_library_identity():
    sessions = []
    for day, load in [("2026-08-31", 20), ("2026-09-07", 25)]:
        sessions.append(dict(session_id=day, date=day, status="completed", exercises=[dict(plan_exercise_id=day, name="Goblet squat", exercise_library_item_id="library-1", sets=[dict(set_number=1, reps=10, load_kg=load), dict(set_number=2, reps=8, load_kg=30)])]))
    result = exercise_history(sessions)["items"][0]
    assert result["weeks"][0]["volume_kg"] == 440
    assert result["weeks"][1]["volume_kg"] == 490
    assert result["trends"] == {"load_kg": "stable", "reps": "stable", "volume_kg": "increasing"}
    assert result["best_set"]["load_kg"] == 30 and result["training_days"] == 2
    assert len(result["history"]) == 2


def test_supabase_workout_history_only_reads_active_workout_sessions():
    # Catches removing the active-session predicate from workout history reads.
    workout_session_reads = []

    def request(method, path, **kwargs):
        params = kwargs.get("params") or {}
        if method == "GET" and path == "/rest/v1/workout_sessions":
            workout_session_reads.append(params)
            return SimpleNamespace(json=lambda: [{
                "id": "session-a",
                "session_date": "2026-09-16",
                "title": "Workout A",
                "week_label": "Week 1",
                "coach_note": "",
                "status": "completed",
                "client_note": None,
                "overall_difficulty": "moderate",
                "estimated_duration_minutes": 45,
            }])
        if method == "GET" and path == "/rest/v1/workout_exercises":
            return SimpleNamespace(json=lambda: [{"id": "exercise-a", "name": "Goblet squat", "exercise_library_item_id": "library-a", "prescribed_sets": 3, "prescribed_reps": "10", "rest_seconds": 60, "coach_note": ""}])
        if method == "GET" and path == "/rest/v1/workout_set_logs":
            return SimpleNamespace(json=lambda: [{"workout_exercise_id": "exercise-a", "set_number": 1, "reps": 10, "load_kg": 20, "difficulty": "moderate"}])
        raise AssertionError(f"unexpected request {method} {path} {params}")

    service = SupabaseClientService(
        Settings(_env_file=None, supabase_url="https://example.supabase.co", supabase_publishable_key="public-test"),
        AuthenticatedUser(id="client-a", email="client@example.test", access_token="test-only"),
    )
    service.gateway = SimpleNamespace(request=request)

    assert service.workout_history()["items"][0]["name"] == "Goblet squat"
    assert workout_session_reads[0]["retired_at"] == "is.null"


def test_schedule_does_not_count_miss_before_local_signup_date():
    # UTC Sunday signup was already Monday in India; that Sunday was never due.
    result = schedule(dict(timezone="Asia/Kolkata", check_in_day="sunday", created_at="2026-09-06T19:00:00Z"),
                      [], datetime(2026, 9, 8, tzinfo=timezone.utc))
    assert result["missed_count"] == 0
    assert result["due_on"] == "2026-09-14"


def test_sqlite_reloads_every_set_and_preserves_older_weeks(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'progress.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_demo_data(db, "cl_001")
        service = ClientService(db, "cl_001")
        earlier = CheckIn(id="historical", client_id="cl_001", period_start=date.today()-timedelta(days=35), submitted_at=datetime.now(timezone.utc)-timedelta(days=35), energy_score=2, sleep_score=5, sentiment="okay", observation="Original wording")
        db.add(earlier); db.commit()
        saved = service.upsert_current_checkin(CheckInUpsert(**payload()))
        assert saved["ratings"]["digestion"] == 7
        assert db.get(CheckIn, "historical").energy_score == 2
        page = service.list_checkins(1)
        assert page["has_more"]
        all_entries = service.list_checkins(52)["items"]
        assert any(e["id"] == "historical" for e in all_entries)
        assert service.list_checkins(1, 1)["items"][0]["id"] == all_entries[1]["id"]
        w = service.get_workout_for_date(date.today())
        logs = [dict(plan_exercise_id=e["plan_exercise_id"], sets=[dict(set_number=1,reps=10,load_kg=20),dict(set_number=2,reps=8,load_kg=25)]) for e in w["exercises"]]
        result = service.update_workout_session(w["session_id"], WorkoutSessionUpdate(status="in_progress", exercise_logs=logs))
        assert result["volume_kg"] == len(logs)*400
        assert all(len(e["sets"]) == 2 for e in service.get_workout_for_date(date.today())["exercises"])
        for row in logs: row["sets"].pop()
        service.update_workout_session(w["session_id"], WorkoutSessionUpdate(status="completed", exercise_logs=logs))
        assert all(len(e["sets"]) == 1 for e in service.get_workout_for_date(date.today())["exercises"])
        assert service.workout_history()["items"][0]["weeks"][0]["volume_kg"] == 200


def test_additive_sqlite_upgrade_keeps_legacy_data(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(text("create table check_ins(id text, energy_score integer, observation text)"))
        conn.execute(text("insert into check_ins values('old',4,'Keep exactly')"))
        conn.execute(text("create table progress_photos(id text)"))
        conn.execute(text("create table meals(id text)"))
    upgrade_local_schema(engine)
    upgrade_local_schema(engine)
    with engine.connect() as conn:
        assert conn.execute(text("select energy_score,observation,questionnaire_version,ratings from check_ins")).one() == (4,"Keep exactly",1,"{}")


def test_five_photo_poses_replacement_and_delete_via_api():
    with TestClient(app) as client:
        today = client.get('/api/v1/client/check-ins').json()['schedule']['today']
        for pose in PHOTO_VIEWS:
            def upload(replace=None):
                data = dict(view=pose,captured_on=today)
                if replace: data['replace_photo_id'] = replace
                return client.post('/api/v1/client/progress-photos',data=data,files={'file':('test.png',b'test-photo','image/png')})
            response = upload()
            assert response.status_code == 200, response.text
            first = response.json()
            assert first['period_start'] and first['uploaded_at']
            second = upload(first['id']).json()
            assert second['id'] != first['id']
            assert client.get(first['content_url']).status_code == 404
            assert client.get(second['content_url']).status_code == 200
            assert client.delete(f"/api/v1/client/progress-photos/{second['id']}").json()['deleted']
            assert client.get(second['content_url']).status_code == 404
        assert client.delete('/api/v1/client/progress-photos/not-owned').status_code == 404


def test_rolling_edits_keep_anchor_and_waist_history(tmp_path):
    from app.models.client import BodyEntry
    from app.schemas.client import BodyEntryUpsert
    engine = create_engine(f"sqlite:///{tmp_path / 'rolling.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_demo_data(db, "cl_001")
        service = ClientService(db, "cl_001")
        first = service.upsert_current_checkin(CheckInUpsert(**payload()))
        second = service.upsert_current_checkin(CheckInUpsert(**{**payload(), "observation": "Edited"}))
        assert first["id"] == second["id"]
        assert first["submitted_at"] == second["submitted_at"]
        due = service.list_checkins(1)["schedule"]["due_on"]
        assert due == (local_today("Asia/Kolkata", first["submitted_at"].replace(tzinfo=timezone.utc)) + timedelta(days=7)).isoformat()
        day = service.today()
        service.upsert_body_entry(day, BodyEntryUpsert(weight_kg=80, waist_cm=90))
        service.upsert_body_entry(day, BodyEntryUpsert(weight_kg=79))
        assert db.scalars(select(BodyEntry).where(BodyEntry.client_id == "cl_001", BodyEntry.entry_date == day)).one().waist_cm == 90


def test_late_schedule_stays_overdue_until_submission():
    client = {"timezone": "UTC", "created_at": "2026-09-01"}
    entries = [{"period_start": "2026-09-02", "submitted_at": "2026-09-02T12:00:00Z"}]
    result = schedule(client, entries, datetime(2026, 9, 20, tzinfo=timezone.utc))
    assert result["due_on"] == "2026-09-09"
    assert result["current_status"] == "overdue"
    assert result["period_start"] == "2026-09-20"
    entries.append({"period_start": "2026-09-20", "submitted_at": "2026-09-20T12:00:00Z"})
    assert schedule(client, entries, datetime(2026, 9, 20, 13, tzinfo=timezone.utc))["due_on"] == "2026-09-27"
