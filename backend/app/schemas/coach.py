from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
