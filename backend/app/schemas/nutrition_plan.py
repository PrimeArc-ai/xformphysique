from __future__ import annotations

import re
from datetime import date, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


StrictPositiveInt = Annotated[int, Field(strict=True, gt=0)]
StrictNonNegativeInt = Annotated[int, Field(strict=True, ge=0)]
Restriction = Annotated[str, Field(min_length=1, max_length=120)]


class NutritionPlanAPIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NutritionPlanIngredientInput(NutritionPlanAPIModel):
    position: Annotated[int, Field(strict=True, ge=1, le=12)]
    food_library_item_id: UUID | None = None
    ingredient_name: Annotated[str, Field(min_length=1, max_length=180)]
    quantity: Annotated[float, Field(gt=0)]
    unit: Annotated[str, Field(min_length=1, max_length=30)]


class NutritionPlanMealInput(NutritionPlanAPIModel):
    position: Annotated[int, Field(strict=True, ge=1, le=8)]
    meal_time: time
    name: Annotated[str, Field(min_length=1, max_length=180)]
    calories_kcal: StrictNonNegativeInt
    protein_g: StrictNonNegativeInt
    carbs_g: StrictNonNegativeInt
    fat_g: StrictNonNegativeInt
    coach_instructions: str = ""
    preparation: str = ""
    ingredients: list[NutritionPlanIngredientInput] = Field(min_length=1, max_length=12)

    @field_validator("meal_time", mode="before")
    @classmethod
    def validate_meal_time_format(cls, value: object) -> object:
        if not isinstance(value, str) or re.fullmatch(
            r"[0-9]{2}:[0-9]{2}(?::[0-9]{2})?",
            value,
        ) is None:
            raise ValueError("Meal time must use HH:MM or HH:MM:SS")
        return value


class NutritionPlanSnapshot(NutritionPlanAPIModel):
    name: Annotated[str, Field(min_length=1, max_length=180)]
    active_from: date
    calories_kcal: StrictPositiveInt
    protein_g: StrictNonNegativeInt
    carbs_g: StrictNonNegativeInt
    fat_g: StrictNonNegativeInt
    restrictions: list[Restriction]
    meals: list[NutritionPlanMealInput] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_order_and_restrictions(self) -> NutritionPlanSnapshot:
        if [meal.position for meal in self.meals] != list(range(1, len(self.meals) + 1)):
            raise ValueError("Meal positions must be contiguous from 1")
        for meal in self.meals:
            if [ingredient.position for ingredient in meal.ingredients] != list(
                range(1, len(meal.ingredients) + 1)
            ):
                raise ValueError(
                    f"Ingredient positions for {meal.name} must be contiguous from 1"
                )
        if len(set(self.restrictions)) != len(self.restrictions):
            raise ValueError("Restrictions must be unique")
        return self


class NutritionPlanIngredientResponse(NutritionPlanIngredientInput):
    id: UUID


class NutritionPlanMealResponse(NutritionPlanAPIModel):
    id: UUID
    position: int
    meal_time: time
    name: str
    calories_kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    coach_instructions: str = ""
    preparation: str = ""
    ingredients: list[NutritionPlanIngredientResponse]


class NutritionPlanResponse(NutritionPlanAPIModel):
    id: UUID
    client_id: UUID
    name: str
    status: Literal["draft", "published", "archived"]
    version: int | None
    active_from: date
    active_to: date | None
    replaces_plan_id: UUID | None
    calories_kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    restrictions: list[str]
    meals: list[NutritionPlanMealResponse]


class FoodLibraryOption(NutritionPlanAPIModel):
    id: UUID
    name: str
    category: str
    calories_kcal: float | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None


class NutritionPlanWorkspaceResponse(NutritionPlanAPIModel):
    active_plan: NutritionPlanResponse | None
    draft: NutritionPlanResponse | None
    food_library: list[FoodLibraryOption]


class NutritionPlanDraftResponse(NutritionPlanAPIModel):
    plan: NutritionPlanResponse


class NutritionPlanPublishRequest(NutritionPlanAPIModel):
    publish_key: UUID
    plan: NutritionPlanSnapshot


class NutritionPlanPublishResponse(NutritionPlanDraftResponse):
    meal_count: int
