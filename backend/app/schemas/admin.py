from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CoachCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    professional_title: str = Field(default="Fitness Coach", min_length=2, max_length=120)


class AdminCoach(BaseModel):
    id: UUID
    full_name: str
    email: str
    professional_title: str | None
    is_active: bool
    created_at: datetime
    active_client_count: int


class AdminCoachList(BaseModel):
    items: list[AdminCoach]


class MinimalClient(BaseModel):
    # An explicit allowlist: never serialize client UUIDs, PII or health data.
    client_code: str
    assigned_at: datetime
    ended_at: datetime | None


class MinimalClientList(BaseModel):
    items: list[MinimalClient]


class CoachCreated(BaseModel):
    id: UUID
    full_name: str
    email: str
    initial_password: str
    email_sent: bool = False
    audit_recorded: bool


class CoachOffboarded(BaseModel):
    id: UUID
    is_active: bool
    released_client_count: int
