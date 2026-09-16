from __future__ import annotations

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkoutProgramAPIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WorkoutProgramExerciseInput(WorkoutProgramAPIModel):
    position: Annotated[int, Field(ge=1, le=12)]
    exercise_library_item_id: UUID | None = None
    name: Annotated[str, Field(min_length=1, max_length=160)]
    prescribed_sets: Annotated[int, Field(ge=1, le=20)]
    prescribed_reps: Annotated[str, Field(min_length=1, max_length=40)]
    rest_seconds: Annotated[int | None, Field(ge=0, le=1800)] = None
    coach_note: Annotated[str, Field(max_length=1000)] = ""


class WorkoutProgramDayInput(WorkoutProgramAPIModel):
    position: Annotated[int, Field(ge=1, le=6)]
    weekday: Annotated[int, Field(ge=1, le=7)]
    name: Annotated[str, Field(min_length=1, max_length=160)]
    coach_note: Annotated[str, Field(max_length=2000)] = ""
    exercises: list[WorkoutProgramExerciseInput] = Field(min_length=1, max_length=12)


class WorkoutProgramSnapshot(WorkoutProgramAPIModel):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    active_from: date
    notes: Annotated[str, Field(max_length=2000)] = ""
    days: list[WorkoutProgramDayInput] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def validate_order_and_weekdays(self) -> WorkoutProgramSnapshot:
        if [day.position for day in self.days] != list(range(1, len(self.days) + 1)):
            raise ValueError("Program day positions must be contiguous from 1")
        if len({day.weekday for day in self.days}) != len(self.days):
            raise ValueError("Training weekdays must be unique")
        for day in self.days:
            if [exercise.position for exercise in day.exercises] != list(
                range(1, len(day.exercises) + 1)
            ):
                raise ValueError(
                    f"Exercise positions for {day.name} must be contiguous from 1"
                )
        return self


class WorkoutProgramExerciseResponse(WorkoutProgramExerciseInput):
    id: UUID


class WorkoutProgramDayResponse(WorkoutProgramAPIModel):
    id: UUID
    position: int
    weekday: int
    name: str
    coach_note: str
    exercises: list[WorkoutProgramExerciseResponse]


class WorkoutProgramResponse(WorkoutProgramAPIModel):
    id: UUID
    client_id: UUID
    name: str
    notes: str = ""
    status: Literal["draft", "published", "archived"]
    version: int | None
    active_from: date
    active_to: date | None
    replaces_program_id: UUID | None
    days: list[WorkoutProgramDayResponse]


class ExerciseLibraryOption(WorkoutProgramAPIModel):
    id: UUID
    name: str
    body_region: str
    training_focus: str


class WorkoutProgramWorkspaceResponse(WorkoutProgramAPIModel):
    active_program: WorkoutProgramResponse | None
    draft: WorkoutProgramResponse | None
    exercise_library: list[ExerciseLibraryOption]


class WorkoutProgramPublishRequest(WorkoutProgramAPIModel):
    publish_key: UUID
    program: WorkoutProgramSnapshot


class WorkoutProgramPublishResponse(WorkoutProgramAPIModel):
    program: WorkoutProgramResponse
    generated_session_count: int
    generated_session_dates: list[date]
