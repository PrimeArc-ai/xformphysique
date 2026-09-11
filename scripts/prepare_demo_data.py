"""Seed ONLY the disposable local recording database; never use live data."""
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.client import Client, CheckIn, Meal, WorkoutSession, WorkoutExercise
from app.services.progress import RATING_KEYS, week_start

settings = get_settings()
assert not settings.supabase_enabled
assert settings.database_url.startswith("sqlite:////tmp/xform-demo-20260910.")
today = date.today()
with SessionLocal() as db:
    client = db.get(Client, "cl_001")
    client.email = "maya.shah@example.test"
    client.created_at = datetime.now(timezone.utc) - timedelta(days=42)
    for i in range(1, 5):
        period = week_start(today - timedelta(weeks=i))
        entry = db.scalar(select(CheckIn).where(CheckIn.client_id == client.id, CheckIn.period_start == period))
        if entry is None:
            entry = CheckIn(id=f"recording-week-{i}", client_id=client.id, period_start=period)
            db.add(entry)
        if i > 1:
            entry.questionnaire_version = 2
            entry.ratings = {key: (4 if key in ("hunger", "stress") else 9-i) for key in RATING_KEYS}
        entry.energy_score, entry.sleep_score = 4, 4
        entry.sentiment = "good"
        entry.observation = "Three training sessions completed. Meal preparation helped consistency."
        entry.concern = "Keep daily walks comfortable."
        entry.submitted_at = datetime.combine(period + timedelta(days=6), datetime.min.time(), timezone.utc)
        session_id = f"recording-session-{i}"
        if not db.get(WorkoutSession, session_id):
            logs = []
            session = WorkoutSession(id=session_id, client_id=client.id, session_date=period+timedelta(days=2), title="Lower body strength", week_label=f"Foundation week {5-i}", coach_note="Controlled reps, steady progress.", status="completed", estimated_duration_minutes=45)
            db.add(session)
            for j, name in enumerate(("Goblet squat", "Romanian deadlift")):
                identity = f"recording-exercise-{i}-{j}"
                db.add(WorkoutExercise(id=identity, session_id=session_id, position=j+1, name=name, prescription={"sets":3, "reps":"10", "rest_seconds":90}))
                logs.append({"plan_exercise_id":identity, "sets":[{"set_number":n, "reps":10, "load_kg":30-i*2.5, "difficulty":"moderate"} for n in range(1,4)]})
            session.exercise_logs = logs
    meal = db.get(Meal, "meal_001")
    meal.preparation = "Combine the yoghurt and oats. Top with berries and chill overnight."
    meal.coach_instructions = "Use the assigned portions. Keep breakfast consistent on training days."
    db.commit()
print("Disposable demo history prepared; no live data touched.")
