from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


PositiveFloat = Annotated[float, Field(gt=0)]
Score = Annotated[int, Field(ge=1, le=5)]


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BodyEntryUpsert(APIModel):
    weight_kg: PositiveFloat
    waist_cm: PositiveFloat | None = None


class CheckInUpsert(APIModel):
    energy_score: Score
    sleep_score: Score
    sentiment: Literal["excellent", "good", "okay", "low"]
    observation: Annotated[str, Field(min_length=1, max_length=1000)]
    concern: Annotated[str | None, Field(max_length=1000)] = None


class MealAdherenceUpsert(APIModel):
    date: date
    status: Literal["followed", "partly", "missed"]


class RecipeGuideRequest(APIModel):
    meal_id: Annotated[str, Field(min_length=1, max_length=50)]


class WorkoutSet(APIModel):
    set_number: Annotated[int, Field(ge=1, le=20)]
    reps: Annotated[int, Field(ge=0, le=200)]
    load_kg: Annotated[float, Field(ge=0, le=1000)]
    difficulty: Literal["easy", "moderate", "hard"] | None = None


class ExerciseLog(APIModel):
    plan_exercise_id: Annotated[str, Field(min_length=1, max_length=50)]
    sets: list[WorkoutSet] = Field(default_factory=list, max_length=20)


class WorkoutSessionUpdate(APIModel):
    status: Literal["ready", "in_progress", "completed"] | None = None
    completed_at: datetime | None = None
    overall_difficulty: Literal["easy", "moderate", "hard"] | None = None
    note: Annotated[str | None, Field(max_length=1000)] = None
    exercise_logs: list[ExerciseLog] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def has_update(self) -> WorkoutSessionUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one session field")
        if self.status == "completed" and self.completed_at is None:
            self.completed_at = datetime.now().astimezone()
        return self


class ProfileUpdate(APIModel):
    primary_goal: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    target_weight_kg: PositiveFloat | None = None
    check_in_day: Literal[
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
    ] | None = None
    timezone: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    dietary_preferences: Annotated[str | None, Field(max_length=2000)] = None
    allergies_injuries: Annotated[str | None, Field(max_length=2000)] = None

    @model_validator(mode="after")
    def has_update(self) -> ProfileUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one profile field")
        return self


class ErrorDetail(APIModel):
    code: str
    message: str
    fields: dict[str, str] | None = None


class ErrorResponse(APIModel):
    error: ErrorDetail
    request_id: str


# Response models deliberately preserve contract fields while allowing nested plan and workout payloads.
class BodyEntryResponse(BaseModel):
    id: str
    date: date
    weight_kg: float
    waist_cm: float | None
    created_at: datetime


class BodyEntriesResponse(BaseModel):
    items: list[BodyEntryResponse]
    summary: dict[str, float | None]


class BodyEntrySaveResponse(BodyEntryResponse):
    summary: dict[str, float | None]


class CheckInResponse(BaseModel):
    id: str
    period_start: date
    submitted_at: datetime
    energy_score: int
    sleep_score: int
    sentiment: str
    observation: str
    concern: str | None


class CheckInsResponse(BaseModel):
    schedule: dict[str, Any]
    items: list[CheckInResponse]


class CheckInSaveResponse(CheckInResponse):
    status: str


class PhotoResponse(BaseModel):
    id: str
    view: str
    captured_on: date
    file_name: str
    content_url: str


class ProgressPhotosResponse(BaseModel):
    items: list[PhotoResponse]


class DashboardResponse(BaseModel):
    client: dict[str, Any]
    body: dict[str, Any]
    check_ins: dict[str, Any]
    training_volume: dict[str, Any]
    next_actions: list[dict[str, Any]]


class NutritionPlanResponse(BaseModel):
    plan_id: str
    name: str
    date: date
    daily_targets: dict[str, int]
    restrictions: list[str]
    meals: list[dict[str, Any]]


class MealAdherenceResponse(BaseModel):
    meal_id: str
    date: date
    status: str
    daily_summary: dict[str, int]


class RecipeGuideResponse(BaseModel):
    meal_id: str
    meal_name: str
    guide: str
    uses_assigned_ingredients_only: bool
    remaining_requests_today: int


class WorkoutSessionResponse(BaseModel):
    session_id: str
    date: date
    title: str
    week_label: str
    coach_note: str
    status: str
    estimated_duration_minutes: int
    exercises: list[dict[str, Any]]


class WorkoutSessionSaveResponse(BaseModel):
    session_id: str
    status: str
    completed_at: datetime | None
    volume_kg: float
    completion_percent: int


class HealthSummaryResponse(BaseModel):
    wellbeing: dict[str, Any]
    planning_context: dict[str, Any]
    safety_notice: str


class ProfileResponse(BaseModel):
    client_id: str
    name: str
    email: str
    primary_goal: str
    target_weight_kg: float | None
    check_in_day: str
    timezone: str
    dietary_preferences: str
    allergies_injuries: str


class ProfileSaveResponse(BaseModel):
    client_id: str
    updated_at: datetime
    profile: dict[str, Any]
