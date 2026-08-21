from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import APIError
from app.models.client import (
    BodyEntry,
    CheckIn,
    Client,
    Meal,
    MealAdherence,
    MealPlan,
    ProgressPhoto,
    WorkoutExercise,
    WorkoutSession,
)
from app.schemas.client import (
    BodyEntryUpsert,
    CheckInUpsert,
    MealAdherenceUpsert,
    ProfileUpdate,
    WorkoutSessionUpdate,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _identifier(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _volume_from_logs(logs: list[dict[str, Any]]) -> float:
    return round(
        sum(
            float(set_data.get("reps", 0)) * float(set_data.get("load_kg", 0))
            for exercise in logs
            for set_data in exercise.get("sets", [])
        ),
        2,
    )


class ClientService:
    """Client-owned use cases. Every read/write scopes data to current client."""

    def __init__(self, db: Session, client_id: str) -> None:
        self.db = db
        self.client_id = client_id

    def get_dashboard(self) -> dict[str, Any]:
        client = self._client()
        today = date.today()
        body_entries = self.db.scalars(
            self._body_query().order_by(BodyEntry.entry_date.desc()).limit(7)
        ).all()
        latest = body_entries[0] if body_entries else None
        trend = [
            {"date": entry.entry_date, "weight_kg": entry.weight_kg}
            for entry in reversed(body_entries)
        ]
        latest_checkin = self.db.scalars(
            self._checkin_query().order_by(CheckIn.period_start.desc())
        ).first()
        sessions = self.db.scalars(
            self._session_query().where(WorkoutSession.session_date >= today - timedelta(days=29))
        ).all()
        daily_volume: dict[date, float] = {}
        for session in sessions:
            daily_volume[session.session_date] = daily_volume.get(session.session_date, 0) + _volume_from_logs(
                session.exercise_logs or []
            )
        total_volume = round(sum(daily_volume.values()), 2)
        due_on = self._next_weekday(today, client.check_in_day)
        return {
            "client": {
                "id": client.id,
                "first_name": client.first_name,
                "primary_goal": client.primary_goal,
            },
            "body": {
                "current_weight_kg": latest.weight_kg if latest else None,
                "latest_waist_cm": latest.waist_cm if latest else None,
                "change_from_start_kg": round(latest.weight_kg - client.starting_weight_kg, 2)
                if latest
                else None,
                "target_progress_percent": self._target_progress(client, latest),
                "trend": trend,
            },
            "check_ins": {
                "count": self.db.scalar(
                    select(func.count(CheckIn.id)).where(CheckIn.client_id == self.client_id)
                )
                or 0,
                "status": "submitted" if latest_checkin and latest_checkin.period_start == _week_start(today) else "due",
            },
            "training_volume": {
                "range_days": 30,
                "total_kg": total_volume,
                "sessions": len(sessions),
                "training_days": len(daily_volume),
                "best_day_kg": max(daily_volume.values(), default=0),
                "daily_kg": [
                    {"date": entry_date, "volume_kg": volume}
                    for entry_date, volume in sorted(daily_volume.items())
                ],
            },
            "next_actions": [
                {"type": "body_entry", "label": "Log body progress", "due": latest is None or latest.entry_date != today},
                {"type": "check_in", "label": "Submit weekly check-in", "due": due_on == today},
            ],
        }

    def list_body_entries(self, start: date | None, end: date | None, limit: int) -> dict[str, Any]:
        if start and end and start > end:
            raise APIError(422, "invalid_date_range", "from date cannot be after to date")
        query = self._body_query()
        if start:
            query = query.where(BodyEntry.entry_date >= start)
        if end:
            query = query.where(BodyEntry.entry_date <= end)
        entries = self.db.scalars(query.order_by(BodyEntry.entry_date.desc()).limit(limit)).all()
        return {"items": [self._body_payload(entry) for entry in entries], "summary": self._body_summary()}

    def upsert_body_entry(self, entry_date: date, payload: BodyEntryUpsert) -> dict[str, Any]:
        if entry_date > date.today():
            raise APIError(422, "future_date", "Body entry date cannot be in future")
        entry = self.db.scalars(self._body_query().where(BodyEntry.entry_date == entry_date)).first()
        if entry is None:
            entry = BodyEntry(
                id=_identifier("body"),
                client_id=self.client_id,
                entry_date=entry_date,
                weight_kg=payload.weight_kg,
                waist_cm=payload.waist_cm,
            )
            self.db.add(entry)
        else:
            entry.weight_kg = payload.weight_kg
            entry.waist_cm = payload.waist_cm
        self.db.commit()
        self.db.refresh(entry)
        response = self._body_payload(entry)
        response["summary"] = self._body_summary()
        return response

    def list_checkins(self, limit: int) -> dict[str, Any]:
        client = self._client()
        today = date.today()
        entries = self.db.scalars(
            self._checkin_query().order_by(CheckIn.period_start.desc()).limit(limit)
        ).all()
        due_on = self._next_weekday(today, client.check_in_day)
        current = self.db.scalars(
            self._checkin_query().where(CheckIn.period_start == _week_start(today))
        ).first()
        return {
            "schedule": {
                "day_of_week": client.check_in_day,
                "current_status": "submitted" if current else "due",
                "due_on": due_on,
            },
            "items": [self._checkin_payload(entry) for entry in entries],
        }

    def upsert_current_checkin(self, payload: CheckInUpsert) -> dict[str, Any]:
        period_start = _week_start(date.today())
        entry = self.db.scalars(self._checkin_query().where(CheckIn.period_start == period_start)).first()
        if entry is None:
            entry = CheckIn(id=_identifier("checkin"), client_id=self.client_id, period_start=period_start)
            self.db.add(entry)
        entry.submitted_at = _now()
        entry.energy_score = payload.energy_score
        entry.sleep_score = payload.sleep_score
        entry.sentiment = payload.sentiment
        entry.observation = payload.observation
        entry.concern = payload.concern
        self.db.commit()
        self.db.refresh(entry)
        response = self._checkin_payload(entry)
        response["status"] = "submitted"
        return response

    def list_progress_photos(self, view: str | None, limit: int) -> dict[str, Any]:
        query = self._photo_query()
        if view:
            query = query.where(ProgressPhoto.view == view)
        photos = self.db.scalars(
            query.order_by(ProgressPhoto.captured_on.desc(), ProgressPhoto.created_at.desc()).limit(limit)
        ).all()
        return {"items": [self._photo_payload(photo) for photo in photos]}

    def create_progress_photo(
        self,
        *,
        view: str,
        captured_on: date,
        file_name: str,
        storage_key: str,
        content_type: str,
        byte_size: int,
    ) -> dict[str, Any]:
        if captured_on > date.today():
            raise APIError(422, "future_date", "Photo capture date cannot be in future")
        photo = ProgressPhoto(
            id=_identifier("photo"),
            client_id=self.client_id,
            view=view,
            captured_on=captured_on,
            file_name=file_name[:255] or "progress-photo",
            storage_key=storage_key,
            content_type=content_type,
            byte_size=byte_size,
        )
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return self._photo_payload(photo)

    def get_photo(self, photo_id: str) -> ProgressPhoto:
        photo = self.db.scalars(self._photo_query().where(ProgressPhoto.id == photo_id)).first()
        if photo is None:
            raise APIError(404, "photo_not_found", "Progress photo not found")
        return photo

    def get_active_nutrition_plan(self, plan_date: date) -> dict[str, Any]:
        plan = (
            self.db.execute(
                select(MealPlan)
                .options(selectinload(MealPlan.meals))
                .where(
                    MealPlan.client_id == self.client_id,
                    MealPlan.active_from <= plan_date,
                    (MealPlan.active_to.is_(None)) | (MealPlan.active_to >= plan_date),
                )
                .order_by(MealPlan.active_from.desc())
            )
            .scalars()
            .first()
        )
        if plan is None:
            raise APIError(404, "nutrition_plan_not_found", "No active nutrition plan for this date")
        adherence = {
            item.meal_id: item.status
            for item in self.db.execute(
                select(MealAdherence).where(
                    MealAdherence.client_id == self.client_id,
                    MealAdherence.entry_date == plan_date,
                )
            ).scalars()
        }
        return {
            "plan_id": plan.id,
            "name": plan.name,
            "date": plan_date,
            "daily_targets": plan.daily_targets,
            "restrictions": plan.restrictions,
            "meals": [
                {
                    "id": meal.id,
                    "time": meal.meal_time,
                    "name": meal.name,
                    "ingredients": meal.ingredients,
                    "calories_kcal": meal.calories_kcal,
                    "macros": meal.macros,
                    "adherence_status": adherence.get(meal.id, "pending"),
                }
                for meal in plan.meals
            ],
        }

    def upsert_meal_adherence(self, meal_id: str, payload: MealAdherenceUpsert) -> dict[str, Any]:
        if payload.date > date.today():
            raise APIError(422, "future_date", "Meal adherence date cannot be in future")
        meal = self._assigned_meal(meal_id, payload.date)
        record = self.db.execute(
            select(MealAdherence).where(
                MealAdherence.client_id == self.client_id,
                MealAdherence.meal_id == meal.id,
                MealAdherence.entry_date == payload.date,
            )
        ).scalar_one_or_none()
        if record is None:
            record = MealAdherence(
                id=_identifier("mealstatus"),
                client_id=self.client_id,
                meal_id=meal.id,
                entry_date=payload.date,
                status=payload.status,
            )
            self.db.add(record)
        else:
            record.status = payload.status
        self.db.commit()
        total_meals = self.db.execute(select(func.count(Meal.id)).where(Meal.plan_id == meal.plan_id)).scalar_one()
        logged_meals = self.db.execute(
            select(func.count(MealAdherence.id)).where(
                MealAdherence.client_id == self.client_id,
                MealAdherence.entry_date == payload.date,
                MealAdherence.status.in_(["followed", "partly", "missed"]),
            )
        ).scalar_one()
        return {
            "meal_id": meal.id,
            "date": payload.date,
            "status": payload.status,
            "daily_summary": {"logged_meals": logged_meals, "total_meals": total_meals},
        }

    def create_recipe_guide(self, meal_id: str) -> dict[str, Any]:
        meal = self._assigned_meal(meal_id, date.today())
        ingredient_names = [item["name"] for item in meal.ingredients]
        guide = f"Prepare {' and '.join(ingredient_names)} using assigned quantities. Serve when ready."
        return {
            "meal_id": meal.id,
            "meal_name": meal.name,
            "guide": guide,
            "uses_assigned_ingredients_only": True,
            "remaining_requests_today": 1,
        }

    def get_workout_for_date(self, session_date: date) -> dict[str, Any]:
        session = (
            self.db.execute(
                self._session_query()
                .options(selectinload(WorkoutSession.exercises))
                .where(WorkoutSession.session_date == session_date)
            )
            .scalars()
            .first()
        )
        if session is None:
            raise APIError(404, "workout_session_not_found", "No workout session assigned for this date")
        return self._workout_payload(session)

    def update_workout_session(self, session_id: str, payload: WorkoutSessionUpdate) -> dict[str, Any]:
        session = (
            self.db.execute(
                self._session_query()
                .options(selectinload(WorkoutSession.exercises))
                .where(WorkoutSession.id == session_id)
            )
            .scalars()
            .first()
        )
        if session is None:
            raise APIError(404, "workout_session_not_found", "Workout session not found")
        if payload.exercise_logs is not None:
            allowed_ids = {exercise.id for exercise in session.exercises}
            submitted_ids = {entry.plan_exercise_id for entry in payload.exercise_logs}
            unknown_ids = submitted_ids - allowed_ids
            if unknown_ids:
                raise APIError(422, "invalid_exercise_log", "Exercise does not belong to this session")
            session.exercise_logs = [entry.model_dump() for entry in payload.exercise_logs]
        if "status" in payload.model_fields_set:
            session.status = payload.status or session.status
        if "completed_at" in payload.model_fields_set:
            session.completed_at = payload.completed_at
        if "overall_difficulty" in payload.model_fields_set:
            session.overall_difficulty = payload.overall_difficulty
        if "note" in payload.model_fields_set:
            session.client_note = payload.note
        if session.status == "completed" and session.completed_at is None:
            session.completed_at = _now()
        self.db.commit()
        self.db.refresh(session)
        volume = _volume_from_logs(session.exercise_logs or [])
        completed_exercises = len({entry["plan_exercise_id"] for entry in session.exercise_logs or []})
        completion = round(100 * completed_exercises / len(session.exercises)) if session.exercises else 0
        return {
            "session_id": session.id,
            "status": session.status,
            "completed_at": session.completed_at,
            "volume_kg": volume,
            "completion_percent": completion,
        }

    def health_summary(self) -> dict[str, Any]:
        client = self._client()
        latest = self.db.scalars(self._checkin_query().order_by(CheckIn.submitted_at.desc())).first()
        return {
            "wellbeing": {
                "energy_score": latest.energy_score if latest else None,
                "sentiment": latest.sentiment if latest else "not_reported",
                "source_check_in_id": latest.id if latest else None,
            },
            "planning_context": {
                "dietary_preferences": [client.dietary_preferences] if client.dietary_preferences else [],
                "allergies": [client.allergies_injuries] if client.allergies_injuries else [],
                "training_considerations": ["Follow coach programming; report pain promptly."],
                "coach_note": "Prioritise consistent sleep and gradual progression this week.",
            },
            "safety_notice": "Coaching support only. Not medical advice.",
        }

    def profile(self) -> dict[str, Any]:
        client = self._client()
        return self._profile_payload(client)

    def update_profile(self, payload: ProfileUpdate) -> dict[str, Any]:
        client = self._client()
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(client, field, value)
        self.db.commit()
        self.db.refresh(client)
        return {
            "client_id": client.id,
            "updated_at": client.updated_at,
            "profile": {
                field: value
                for field, value in self._profile_payload(client).items()
                if field not in {"client_id", "name", "email"}
            },
        }

    def _client(self) -> Client:
        client = self.db.get(Client, self.client_id)
        if client is None:
            raise APIError(401, "client_session_invalid", "Client session is not available")
        return client

    def _body_query(self) -> Select[tuple[BodyEntry]]:
        return select(BodyEntry).where(BodyEntry.client_id == self.client_id)

    def _checkin_query(self) -> Select[tuple[CheckIn]]:
        return select(CheckIn).where(CheckIn.client_id == self.client_id)

    def _photo_query(self) -> Select[tuple[ProgressPhoto]]:
        return select(ProgressPhoto).where(ProgressPhoto.client_id == self.client_id)

    def _session_query(self) -> Select[tuple[WorkoutSession]]:
        return select(WorkoutSession).where(WorkoutSession.client_id == self.client_id)

    def _assigned_meal(self, meal_id: str, plan_date: date) -> Meal:
        meal = (
            self.db.execute(
                select(Meal)
                .join(MealPlan)
                .where(
                    Meal.id == meal_id,
                    MealPlan.client_id == self.client_id,
                    MealPlan.active_from <= plan_date,
                    (MealPlan.active_to.is_(None)) | (MealPlan.active_to >= plan_date),
                )
            )
            .scalars()
            .first()
        )
        if meal is None:
            raise APIError(404, "assigned_meal_not_found", "Assigned meal not found")
        return meal

    def _body_summary(self) -> dict[str, float | None]:
        client = self._client()
        entries = self.db.scalars(self._body_query().order_by(BodyEntry.entry_date.asc())).all()
        if not entries:
            return {
                "start_weight_kg": client.starting_weight_kg,
                "latest_weight_kg": None,
                "weight_change_kg": None,
                "seven_day_average_kg": None,
            }
        latest = entries[-1]
        recent = entries[-7:]
        return {
            "start_weight_kg": client.starting_weight_kg,
            "latest_weight_kg": latest.weight_kg,
            "weight_change_kg": round(latest.weight_kg - client.starting_weight_kg, 2),
            "seven_day_average_kg": round(sum(item.weight_kg for item in recent) / len(recent), 2),
        }

    @staticmethod
    def _body_payload(entry: BodyEntry) -> dict[str, Any]:
        return {
            "id": entry.id,
            "date": entry.entry_date,
            "weight_kg": entry.weight_kg,
            "waist_cm": entry.waist_cm,
            "created_at": entry.created_at,
        }

    @staticmethod
    def _checkin_payload(entry: CheckIn) -> dict[str, Any]:
        return {
            "id": entry.id,
            "period_start": entry.period_start,
            "submitted_at": entry.submitted_at,
            "energy_score": entry.energy_score,
            "sleep_score": entry.sleep_score,
            "sentiment": entry.sentiment,
            "observation": entry.observation,
            "concern": entry.concern,
        }

    @staticmethod
    def _photo_payload(photo: ProgressPhoto) -> dict[str, Any]:
        return {
            "id": photo.id,
            "view": photo.view,
            "captured_on": photo.captured_on,
            "file_name": photo.file_name,
            "content_url": f"/api/v1/client/progress-photos/{photo.id}/content",
        }

    @staticmethod
    def _workout_payload(session: WorkoutSession) -> dict[str, Any]:
        return {
            "session_id": session.id,
            "date": session.session_date,
            "title": session.title,
            "week_label": session.week_label,
            "coach_note": session.coach_note,
            "status": session.status,
            "estimated_duration_minutes": session.estimated_duration_minutes,
            "exercises": [
                {
                    "plan_exercise_id": exercise.id,
                    "order": exercise.position,
                    "name": exercise.name,
                    "prescription": exercise.prescription,
                }
                for exercise in session.exercises
            ],
        }

    @staticmethod
    def _profile_payload(client: Client) -> dict[str, Any]:
        return {
            "client_id": client.id,
            "name": client.name,
            "email": client.email,
            "primary_goal": client.primary_goal,
            "target_weight_kg": client.target_weight_kg,
            "check_in_day": client.check_in_day,
            "timezone": client.timezone,
            "dietary_preferences": client.dietary_preferences,
            "allergies_injuries": client.allergies_injuries,
        }

    @staticmethod
    def _target_progress(client: Client, latest: BodyEntry | None) -> int | None:
        if latest is None or client.target_weight_kg is None:
            return None
        total = abs(client.starting_weight_kg - client.target_weight_kg)
        if total == 0:
            return 100
        moved = abs(client.starting_weight_kg - latest.weight_kg)
        return min(100, round(moved / total * 100))

    @staticmethod
    def _next_weekday(start: date, weekday_name: str) -> date:
        weekdays = {
            "monday": 0,
            "tuesday": 1,
            "wednesday": 2,
            "thursday": 3,
            "friday": 4,
            "saturday": 5,
            "sunday": 6,
        }
        target = weekdays.get(weekday_name, 6)
        return start + timedelta(days=(target - start.weekday()) % 7)


def seed_demo_data(db: Session, client_id: str) -> None:
    """Create only local development data; seed is idempotent and no request depends on it."""

    if db.get(Client, client_id):
        return
    today = date.today()
    client = Client(
        id=client_id,
        first_name="Maya",
        name="Maya Shah",
        email="maya@example.com",
        primary_goal="body_recomposition",
        starting_weight_kg=70.1,
        target_weight_kg=65.0,
        check_in_day="sunday",
        timezone="Asia/Kolkata",
        dietary_preferences="Dairy-aware. Prefer quick weekday meals.",
        allergies_injuries="Shellfish allergy. Right knee sensitive after long walks.",
    )
    db.add(client)
    weight_series = [69.2, 69.0, 68.9, 68.8, 68.7, 68.6, 68.5, 68.4]
    for offset, weight in enumerate(weight_series):
        db.add(
            BodyEntry(
                id=f"body_seed_{offset}",
                client_id=client_id,
                entry_date=today - timedelta(days=len(weight_series) - offset - 1),
                weight_kg=weight,
                waist_cm=71.8 - (offset * 0.1),
            )
        )
    db.add(
        CheckIn(
            id="checkin_seed_001",
            client_id=client_id,
            period_start=_week_start(today - timedelta(days=7)),
            submitted_at=_now() - timedelta(days=2),
            energy_score=4,
            sleep_score=3,
            sentiment="good",
            observation="Training felt consistent.",
            concern="Right knee felt sensitive after longer walks.",
        )
    )
    plan = MealPlan(
        id="mealplan_001",
        client_id=client_id,
        name="Recomposition baseline",
        active_from=today - timedelta(days=30),
        active_to=None,
        daily_targets={"calories_kcal": 1860, "protein_g": 135, "carbs_g": 190, "fat_g": 62},
        restrictions=["dairy_aware", "shellfish_free"],
    )
    db.add(plan)
    db.add_all(
        [
            Meal(
                id="meal_001",
                plan_id=plan.id,
                meal_time="08:00",
                name="Greek yoghurt bowl",
                ingredients=[
                    {"name": "Greek yoghurt", "quantity": 200, "unit": "g"},
                    {"name": "Oats", "quantity": 40, "unit": "g"},
                    {"name": "Berries", "quantity": 80, "unit": "g"},
                ],
                calories_kcal=420,
                macros={"protein_g": 35, "carbs_g": 41, "fat_g": 13},
            ),
            Meal(
                id="meal_002",
                plan_id=plan.id,
                meal_time="13:00",
                name="Chicken rice bowl",
                ingredients=[
                    {"name": "Chicken breast", "quantity": 150, "unit": "g"},
                    {"name": "Rice", "quantity": 150, "unit": "g"},
                ],
                calories_kcal=610,
                macros={"protein_g": 49, "carbs_g": 64, "fat_g": 15},
            ),
            Meal(
                id="meal_003",
                plan_id=plan.id,
                meal_time="20:00",
                name="Lentil vegetable plate",
                ingredients=[
                    {"name": "Lentils", "quantity": 180, "unit": "g"},
                    {"name": "Mixed vegetables", "quantity": 250, "unit": "g"},
                ],
                calories_kcal=520,
                macros={"protein_g": 30, "carbs_g": 70, "fat_g": 12},
            ),
        ]
    )
    session = WorkoutSession(
        id="session_001",
        client_id=client_id,
        session_date=today,
        title="Lower body strength",
        week_label=f"Week {today.isocalendar().week:02d}",
        coach_note="Move smoothly. Leave two reps in reserve.",
        status="ready",
        estimated_duration_minutes=45,
        exercise_logs=[],
    )
    db.add(session)
    db.add_all(
        [
            WorkoutExercise(
                id="pex_001",
                session_id=session.id,
                position=1,
                name="Goblet squat",
                prescription={"sets": 3, "reps": "10", "rest_seconds": 90},
            ),
            WorkoutExercise(
                id="pex_002",
                session_id=session.id,
                position=2,
                name="Romanian deadlift",
                prescription={"sets": 3, "reps": "10", "rest_seconds": 90},
            ),
        ]
    )
    db.commit()
