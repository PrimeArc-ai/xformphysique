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
