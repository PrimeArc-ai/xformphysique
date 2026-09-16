from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class CoachAPIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Measurement = Literal["weight_kg", "waist_cm", "hip_cm", "body_fat_pct"]
Weekday = Literal[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


class ClientOnboardingCreate(CoachAPIModel):
    full_name: Annotated[str, Field(min_length=1, max_length=160)]
    email: EmailStr
    primary_goal: Annotated[str, Field(min_length=1, max_length=100)]
    check_in_day: Weekday = "sunday"
    timezone: Annotated[str, Field(min_length=1, max_length=100)] = "Asia/Kolkata"
    target_weight_kg: Annotated[float | None, Field(gt=0, le=500)] = None
    dietary_preferences: Annotated[str, Field(max_length=2000)] = ""
    allergies_injuries: Annotated[str, Field(max_length=2000)] = ""
    enabled_measurements: list[Measurement] = Field(
        default_factory=lambda: ["weight_kg", "waist_cm"], min_length=1, max_length=4
    )
    private_coach_note: Annotated[str, Field(max_length=5000)] = ""


class ClientOnboardingResponse(BaseModel):
    id: str
    client_code: str
    full_name: str
    email: EmailStr
    primary_goal: str
    check_in_day: str
    invitation_sent: bool


class CoachClientListItem(BaseModel):
    """A compact, coach-authorized client roster record."""

    id: str
    client_code: str
    full_name: str
    primary_goal: str
    check_in_day: Weekday
    timezone: str
    latest_weight_kg: float | None
    latest_entry_date: date | None
    latest_checkin_period_start: date | None
    latest_checkin_submitted_at: datetime | None
    needs_attention: bool
    attention_reasons: list[str] = Field(default_factory=list)
    check_in_schedule: dict = Field(default_factory=dict)


class CoachClientListResponse(BaseModel):
    items: list[CoachClientListItem]


class CoachBodyEntry(BaseModel):
    id: str
    entry_date: date
    weight_kg: float
    waist_cm: float | None
    hip_cm: float | None
    body_fat_pct: float | None
    created_at: datetime


class CoachCheckin(BaseModel):
    id: str
    period_start: date
    submitted_at: datetime
    energy_score: int
    sleep_score: int
    sentiment: str
    observation: str
    concern: str | None


class CoachPrivateNote(BaseModel):
    id: str
    note: str
    created_at: datetime


class ClientSetup(CoachAPIModel):
    primary_goal: str
    check_in_day: Weekday
    dietary_preferences: str = ""
    allergies_injuries: str = ""
    enabled_measurements: list[Measurement]
    target_weight_kg: float | None = None
    target_waist_cm: float | None = None
    target_date: date | None = None


class PrivateNoteCreate(CoachAPIModel):
    note: Annotated[str, Field(min_length=1, max_length=5000)]


class ClientSetupResponse(BaseModel):
    primary_goal: str
    check_in_day: Weekday
    timezone: str
    dietary_preferences: str = ""
    allergies_injuries: str = ""
    enabled_measurements: list[Measurement]
    target_weight_kg: float | None = None
    target_waist_cm: float | None = None
    target_date: date | None = None


class CoachProgressPhoto(BaseModel):
    """Metadata for a progress image an assigned coach may review."""

    id: str
    view: str
    captured_on: date
    file_name: str
    content_url: str


class ClientCoachingContextUpdate(CoachAPIModel):
    """Coach-owned context the assigned client is allowed to read."""

    client_visible_coach_note: Annotated[str | None, Field(max_length=2000)] = None
    training_considerations: Annotated[list[str] | None, Field(max_length=20)] = None
    safety_notice: Annotated[str | None, Field(max_length=1000)] = None

    @field_validator("training_considerations")
    @classmethod
    def normalize_training_considerations(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        normalized = [item.strip() for item in value if item.strip()]
        if len(normalized) != len(value):
            raise ValueError("training considerations cannot be blank")
        if any(len(item) > 250 for item in normalized):
            raise ValueError("each training consideration must be 250 characters or fewer")
        return normalized

    @model_validator(mode="after")
    def require_non_null_change(self) -> "ClientCoachingContextUpdate":
        if not self.model_fields_set:
            raise ValueError("provide at least one coaching-context field")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("coaching-context fields cannot be null")
        return self


class ClientCoachingContextResponse(BaseModel):
    client_id: str
    client_visible_coach_note: str
    training_considerations: list[str]
    safety_notice: str
    updated_at: datetime


class CoachClientReviewResponse(BaseModel):
    client: CoachClientListItem
    body_entries: list[CoachBodyEntry]
    checkins: list[CoachCheckin]
    photo_count: int
    progress_photos: list[CoachProgressPhoto]
    coaching_context: ClientCoachingContextResponse
    private_notes: list[CoachPrivateNote]
    setup: ClientSetupResponse


class FoodLibraryCreate(CoachAPIModel):
    name: Annotated[str, Field(min_length=1, max_length=180)]
    category: Annotated[str, Field(min_length=1, max_length=80)]
    calories_kcal: Annotated[float | None, Field(ge=0)] = None
    protein_g: Annotated[float | None, Field(ge=0)] = None
    carbs_g: Annotated[float | None, Field(ge=0)] = None
    fat_g: Annotated[float | None, Field(ge=0)] = None


class FoodLibraryUpdate(CoachAPIModel):
    name: Annotated[str | None, Field(min_length=1, max_length=180)] = None
    category: Annotated[str | None, Field(min_length=1, max_length=80)] = None
    calories_kcal: Annotated[float | None, Field(ge=0)] = None
    protein_g: Annotated[float | None, Field(ge=0)] = None
    carbs_g: Annotated[float | None, Field(ge=0)] = None
    fat_g: Annotated[float | None, Field(ge=0)] = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_non_null_change(self) -> "FoodLibraryUpdate":
        if not self.model_fields_set:
            raise ValueError("provide at least one food library field")
        return self


class FoodLibraryItem(BaseModel):
    id: str
    name: str
    category: str
    calories_kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    is_active: bool


class ExerciseLibraryCreate(CoachAPIModel):
    name: Annotated[str, Field(min_length=1, max_length=180)]
    body_region: Annotated[str, Field(min_length=1, max_length=80)]
    training_focus: Annotated[str, Field(min_length=1, max_length=80)]
    guidance: Annotated[str, Field(max_length=3000)] = ""


class ExerciseLibraryUpdate(CoachAPIModel):
    name: Annotated[str | None, Field(min_length=1, max_length=180)] = None
    body_region: Annotated[str | None, Field(min_length=1, max_length=80)] = None
    training_focus: Annotated[str | None, Field(min_length=1, max_length=80)] = None
    guidance: Annotated[str | None, Field(max_length=3000)] = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_non_null_change(self) -> "ExerciseLibraryUpdate":
        if not self.model_fields_set:
            raise ValueError("provide at least one exercise library field")
        return self


class ExerciseLibraryItem(BaseModel):
    id: str
    name: str
    body_region: str
    training_focus: str
    guidance: str = ""
    is_active: bool


class CoachLibrariesResponse(BaseModel):
    food: list[FoodLibraryItem]
    exercises: list[ExerciseLibraryItem]


class CoachSettingsUpdate(CoachAPIModel):
    weight_unit: Literal["kg", "lb"]
    default_check_in_day: Weekday
    default_missing_weight_threshold_days: int = Field(ge=1, le=90)
    default_measurement_refresh_threshold_days: int = Field(ge=1, le=365)
    enabled_measurements: list[Measurement]


class CoachSettingsResponse(BaseModel):
    weight_unit: Literal["kg", "lb"]
    default_check_in_day: Weekday
    default_missing_weight_threshold_days: int
    default_measurement_refresh_threshold_days: int
    enabled_measurements: list[Measurement]
