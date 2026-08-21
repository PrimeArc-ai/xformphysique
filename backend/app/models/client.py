from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Client(Timestamped, Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    primary_goal: Mapped[str] = mapped_column(String(100))
    starting_weight_kg: Mapped[float] = mapped_column(Float)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_day: Mapped[str] = mapped_column(String(20), default="sunday")
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Kolkata")
    dietary_preferences: Mapped[str] = mapped_column(Text, default="")
    allergies_injuries: Mapped[str] = mapped_column(Text, default="")

    body_entries: Mapped[list[BodyEntry]] = relationship(back_populates="client", cascade="all, delete-orphan")
    check_ins: Mapped[list[CheckIn]] = relationship(back_populates="client", cascade="all, delete-orphan")
    photos: Mapped[list[ProgressPhoto]] = relationship(back_populates="client", cascade="all, delete-orphan")
    meal_plans: Mapped[list[MealPlan]] = relationship(back_populates="client", cascade="all, delete-orphan")
    workout_sessions: Mapped[list[WorkoutSession]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )


class BodyEntry(Base):
    __tablename__ = "body_entries"
    __table_args__ = (UniqueConstraint("client_id", "entry_date", name="uq_body_entry_client_date"),)

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    weight_kg: Mapped[float] = mapped_column(Float)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    client: Mapped[Client] = relationship(back_populates="body_entries")


class CheckIn(Base):
    __tablename__ = "check_ins"
    __table_args__ = (UniqueConstraint("client_id", "period_start", name="uq_check_in_client_period"),)

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    period_start: Mapped[date] = mapped_column(Date, index=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    energy_score: Mapped[int] = mapped_column(Integer)
    sleep_score: Mapped[int] = mapped_column(Integer)
    sentiment: Mapped[str] = mapped_column(String(30))
    observation: Mapped[str] = mapped_column(Text)
    concern: Mapped[str | None] = mapped_column(Text, nullable=True)

    client: Mapped[Client] = relationship(back_populates="check_ins")


class ProgressPhoto(Base):
    __tablename__ = "progress_photos"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    view: Mapped[str] = mapped_column(String(20), index=True)
    captured_on: Mapped[date] = mapped_column(Date, index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    client: Mapped[Client] = relationship(back_populates="photos")


class MealPlan(Timestamped, Base):
    __tablename__ = "meal_plans"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    active_from: Mapped[date] = mapped_column(Date)
    active_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    daily_targets: Mapped[dict[str, int]] = mapped_column(JSON)
    restrictions: Mapped[list[str]] = mapped_column(JSON)

    client: Mapped[Client] = relationship(back_populates="meal_plans")
    meals: Mapped[list[Meal]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("meal_plans.id"), index=True)
    meal_time: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(180))
    ingredients: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    calories_kcal: Mapped[int] = mapped_column(Integer)
    macros: Mapped[dict[str, int]] = mapped_column(JSON)

    plan: Mapped[MealPlan] = relationship(back_populates="meals")
    adherence: Mapped[list[MealAdherence]] = relationship(back_populates="meal", cascade="all, delete-orphan")


class MealAdherence(Base):
    __tablename__ = "meal_adherence"
    __table_args__ = (UniqueConstraint("client_id", "meal_id", "entry_date", name="uq_meal_adherence"),)

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    meal_id: Mapped[str] = mapped_column(ForeignKey("meals.id"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20))

    meal: Mapped[Meal] = relationship(back_populates="adherence")


class WorkoutSession(Timestamped, Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    session_date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(180))
    week_label: Mapped[str] = mapped_column(String(50))
    coach_note: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="ready")
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    overall_difficulty: Mapped[str | None] = mapped_column(String(30), nullable=True)
    client_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    exercise_logs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    client: Mapped[Client] = relationship(back_populates="workout_sessions")
    exercises: Mapped[list[WorkoutExercise]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="WorkoutExercise.position"
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("workout_sessions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(180))
    prescription: Mapped[dict[str, Any]] = mapped_column(JSON)

    session: Mapped[WorkoutSession] = relationship(back_populates="exercises")
