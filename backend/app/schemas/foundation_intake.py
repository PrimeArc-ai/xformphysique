from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Literal, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.services.foundation_catalog import (
    CHECKLIST_GROUPS,
    CRAVING_TIME_OPTIONS,
    DIET_STYLE_OPTIONS,
    FOOD_CRAVINGS_OPTIONS,
    SKIN_WITHOUT_LOTION_OPTIONS,
    WAIVER_VERSION,
    WILLING_TO_CHANGE_OPTIONS,
    WORK_ENVIRONMENT_OPTIONS,
)

Text80 = Annotated[str, Field(max_length=80)]
Text200 = Annotated[str, Field(min_length=1, max_length=200)]
Text500 = Annotated[str, Field(min_length=1, max_length=500)]
Text1000 = Annotated[str, Field(min_length=1, max_length=1000)]
Text2000 = Annotated[str, Field(min_length=1, max_length=2000)]
Text4000 = Annotated[str, Field(min_length=1, max_length=4000)]
OptionalText1000 = Annotated[str, Field(max_length=1000)]
OptionalText2000 = Annotated[str, Field(max_length=2000)]
OptionalText4000 = Annotated[str, Field(max_length=4000)]
ChecklistSelection = Annotated[list[str], Field(min_length=1)]

MALE_BANDS = {"m_6_9", "m_10_14", "m_15_19", "m_20_24", "m_25_29", "m_30_plus"}
FEMALE_BANDS = {"f_12_16", "f_17_21", "f_22_26", "f_27_31", "f_32_36", "f_37_plus"}
CHECKLIST_ALLOWED_IDS = {
    key: {item["id"] for item in options}
    for key, options in CHECKLIST_GROUPS.items()
}
CRAVING_TIME_IDS = {item["id"] for item in CRAVING_TIME_OPTIONS}
WORK_ENVIRONMENT_IDS = {item["id"] for item in WORK_ENVIRONMENT_OPTIONS}
DIET_STYLE_IDS = {item["id"] for item in DIET_STYLE_OPTIONS}
WILLING_TO_CHANGE_IDS = {item["id"] for item in WILLING_TO_CHANGE_OPTIONS}
FOOD_CRAVING_IDS = {item["id"] for item in FOOD_CRAVINGS_OPTIONS}
SKIN_WITHOUT_LOTION_IDS = {item["id"] for item in SKIN_WITHOUT_LOTION_OPTIONS}
BODY_FEELING_OPTIONS = {
    "totally_unhappy",
    "very_unhappy",
    "moderately_unhappy",
    "slightly_unhappy",
    "neutral",
    "slightly_happy",
    "moderately_happy",
    "very_happy",
    "totally_happy",
}
CHECKLIST_FIELD_NAMES = tuple(CHECKLIST_GROUPS.keys())
APPLICABLE_ALWAYS = {
    name
    for name in CHECKLIST_GROUPS
    if name not in {"male_urology", "female_cycle_symptoms"}
}


def _validate_closed_list(
    value: list[str],
    allowed_ids: set[str],
    *,
    exclusive_id: str | None = None,
) -> list[str]:
    if len(value) != len(set(value)):
        raise ValueError("Selections must be unique")
    unknown = sorted(set(value) - allowed_ids)
    if unknown:
        raise ValueError(f"Unknown selections: {', '.join(unknown)}")
    if exclusive_id and exclusive_id in value and len(value) > 1:
        raise ValueError(f"{exclusive_id} must be selected alone")
    return value


def _optional_model(model_cls: type[BaseModel], name: str) -> type[BaseModel]:
    annotations = {}
    namespace = {"__module__": __name__}
    for field_name, annotation in get_type_hints(model_cls, include_extras=True).items():
        annotations[field_name] = annotation | None
        namespace[field_name] = None
    namespace["__annotations__"] = annotations
    return type(name, (model_cls,), namespace)


class FoundationAPIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Identity(FoundationAPIModel):
    full_name: Annotated[str, Field(min_length=1, max_length=160)]
    date_of_birth: date
    sex: Literal["male", "female", "other"]
    mobile: Annotated[str, Field(min_length=8, max_length=20)]
    place_of_living: Text200
    profession: Text200

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        if any(char not in "+ 0123456789" for char in value):
            raise ValueError("Mobile must contain digits, spaces, or +")
        return value


class Body(FoundationAPIModel):
    morning_weight_kg: Annotated[float, Field(ge=20, le=400)]
    height_cm: Annotated[float, Field(ge=100, le=250)]
    waist_cm: Annotated[float, Field(ge=40, le=200)]
    visual_body_fat: str
    desired_weight_kg: Annotated[float, Field(ge=20, le=400)]


class Logistics(FoundationAPIModel):
    knows_food_logging: Literal["yes", "no"]
    knows_food_scale: Literal["yes", "no"]
    food_preference: Literal[
        "vegetarian",
        "eggetarian_outside",
        "vegan",
        "nonveg_outside",
        "nonveg_home_and_outside",
        "eggetarian_home_and_outside",
    ]
    training_location: Literal[
        "gym",
        "home_no_dumbbells",
        "home_dumbbells",
        "home_dumbbells_no_bench",
        "home_dumbbells_bands",
    ]
    ingredient_quantity: Literal["raw", "cooked"]
    training_days: Literal["1_3", "1_4", "1_5", "1_6"]
    meals_per_day: Annotated[int, Field(strict=True, ge=1, le=8)]
    veg_days_separate: Literal["yes", "no"]
    disliked_foods: Annotated[str, Field(min_length=1, max_length=2000)]
    who_cooks: Text500
    supplement_budget_monthly: Text200
    workout_time: Text200


class RequiredEatingSlot(FoundationAPIModel):
    time: Text80
    foods: Annotated[str, Field(min_length=1, max_length=2000)]


class OptionalEatingSlot(FoundationAPIModel):
    time: Text80 = ""
    foods: Annotated[str, Field(max_length=2000)] = ""


class EatingPattern(FoundationAPIModel):
    breakfast: RequiredEatingSlot
    mid_morning: OptionalEatingSlot
    lunch: RequiredEatingSlot
    evening: OptionalEatingSlot
    dinner: RequiredEatingSlot
    late_night: OptionalEatingSlot


class Training(FoundationAPIModel):
    strength_lifts: Text4000
    equipment: Text4000
    dumbbell_increments: Text500
    refused_exercises: Text2000
    exercise_history: Text2000
    current_program: Text2000
    tracks_workouts: Literal["pen_paper", "notes_app", "hevy_strong", "mental", "none"]
    joint_flareups: Text2000
    post_workout_routine: Text1000
    hobbies_sports: Text1000
    strong_weak_groups: Text2000
    exercise_familiarity: Text2000
    ped_steroids: Text2000
    muscular_capacity: Annotated[int, Field(strict=True, ge=1, le=5)]
    athletic_ability: Annotated[int, Field(strict=True, ge=1, le=5)]
    flexibility: Annotated[int, Field(strict=True, ge=1, le=5)]
    cardio_ability: Annotated[int, Field(strict=True, ge=1, le=5)]
    exercise_level: Literal["none", "light", "moderate", "hard", "extreme"]
    weekly_exercise_hours: Literal["under_3", "3_6", "6_10", "over_10"]
    dedication_1_to_10: Annotated[int, Field(strict=True, ge=1, le=10)]
    transport: Literal["vehicle", "walking", "jogging", "bicycle"]
    sitting_hours: Literal["under_8", "8_12", "12_18", "over_18"]


class Safety(FoundationAPIModel):
    family_cardiac_or_untrained_age: Text2000
    hospitalized_recently: Text2000
    major_surgery_injuries_illness: Text2000
    other_health_concerns: Text2000
    recent_labs_note: Text2000
    food_allergies: Text2000
    limits_on_activity: Text2000
    bone_density_over_50: Text1000
    physician_said_no_exercise: Text2000
    ortho_surgeries: Text2000
    imaging_mri_xray: Text2000
    prescription_medication: Text4000
    psych_meds_or_insulin_etc: Text2000
    blood_pressure_reading: Annotated[str, Field(min_length=1, max_length=80)]
    resting_heart_rate: Annotated[str, Field(min_length=1, max_length=80)]
    snore_or_unrefreshed: Text1000
    bowel_movements: Text1000
    current_supplements: Text2000
    fat_burner_history: Text1000


class Lifestyle(FoundationAPIModel):
    job_and_commute: Text2000
    relationship_status: Text200
    motivation_when_low: Text2000
    prior_bodycomp_attempts: Text2000
    why_this_matters: Text4000
    photoshoot_gift: Text2000
    life_events: Text2000
    disordered_eating: Text4000
    body_feeling: str
    nightmares: Annotated[str, Field(max_length=1000)] = ""
    non_scale_victory: Text2000
    caloric_drinks: Text1000
    delivery_or_eat_out: Text500
    must_have_foods: Text1000
    religious_fasting: Text1000
    work_shift_pattern: Text1000
    hours_to_first_meal: Text200
    weekend_vs_weekday: Text1000
    stopped_previous_programs: Text2000
    craving_triggers: Text1000
    one_year_vision: Text2000
    priority_goals: Text2000
    what_kept_you: Text2000
    religious_cultural_diet: Text2000
    sleep_quality_1_to_10: Annotated[int, Field(strict=True, ge=1, le=10)]
    sleep_notes: Text2000
    weekday_sleep_hours: Literal["under_6", "6_7", "7_8", "over_8"]
    weekend_sleep_hours: Literal["under_6", "6_7", "7_8", "over_8"]
    energy_1_to_10: Annotated[int, Field(strict=True, ge=1, le=10)]
    energy_notes: Text2000
    libido_energy: Text500
    fat_storage_areas: Text500
    days_you_will_not_show_up: Text2000
    excuses_and_plan: Text2000
    burnout_or_anxiety: Text2000
    mental_health_diagnosis: Text2000
    success_definition: Text2000
    family_support: Text1000
    people_who_discourage: Text1000
    work_stress_limits: Text1000
    smoking: Text1000
    alcohol: Text1000
    online_training_history: Text2000
    three_habit_changes: Text2000
    craving_times: ChecklistSelection
    work_environment: ChecklistSelection
    lifestyle_activity: Literal["sedentary", "light", "moderate", "active", "very_active"]
    water_intake: Literal["under_1l", "1_3l", "3_5l", "over_5l"]
    diet_styles: ChecklistSelection
    willing_to_change: ChecklistSelection
    skin_without_lotion: str
    food_cravings_list: ChecklistSelection
    milestone_celebration: Text2000
    anything_else: Annotated[str, Field(max_length=4000)] = ""

    @field_validator("body_feeling")
    @classmethod
    def validate_body_feeling(cls, value: str) -> str:
        if value not in BODY_FEELING_OPTIONS:
            raise ValueError("Use a supported body feeling option")
        return value

    @field_validator("skin_without_lotion")
    @classmethod
    def validate_skin_without_lotion(cls, value: str) -> str:
        if value not in SKIN_WITHOUT_LOTION_IDS:
            raise ValueError("Use a supported skin-without-lotion option")
        return value

    @field_validator("craving_times")
    @classmethod
    def validate_craving_times(cls, value: list[str]) -> list[str]:
        return _validate_closed_list(value, CRAVING_TIME_IDS, exclusive_id="rarely_no_specific_time")

    @field_validator("work_environment")
    @classmethod
    def validate_work_environment(cls, value: list[str]) -> list[str]:
        return _validate_closed_list(value, WORK_ENVIRONMENT_IDS)

    @field_validator("diet_styles")
    @classmethod
    def validate_diet_styles(cls, value: list[str]) -> list[str]:
        return _validate_closed_list(value, DIET_STYLE_IDS)

    @field_validator("willing_to_change")
    @classmethod
    def validate_willing_to_change(cls, value: list[str]) -> list[str]:
        return _validate_closed_list(value, WILLING_TO_CHANGE_IDS, exclusive_id="none")

    @field_validator("food_cravings_list")
    @classmethod
    def validate_food_cravings(cls, value: list[str]) -> list[str]:
        return _validate_closed_list(value, FOOD_CRAVING_IDS, exclusive_id="none")


class SexSpecific(FoundationAPIModel):
    pregnant: Literal["yes", "no", "unsure"] | None = None
    birth_control: OptionalText1000 = None
    last_cycle_start: date | None = None
    last_cycle_unknown: bool | None = None
    cycle_energy_drops: OptionalText1000 = None
    periods_regular: OptionalText1000 = None
    perimenopause: OptionalText1000 = None
    deficit_drive: OptionalText1000 = None
    trt_or_hormones: OptionalText1000 = None
    testosterone_tested_last_year: OptionalText1000 = None
    note: OptionalText2000 = None


class Checklists(FoundationAPIModel):
    sleep_recovery: ChecklistSelection
    gut_digestive: ChecklistSelection
    thyroid_autoimmune: ChecklistSelection
    mental_cognitive: ChecklistSelection
    hormonal_health: ChecklistSelection
    allergy_environmental: ChecklistSelection
    skin_hair: ChecklistSelection
    pain_inflammation: ChecklistSelection
    recovery_biomarkers: ChecklistSelection
    blood_sugar_metabolism: ChecklistSelection
    breathing_patterns: ChecklistSelection
    metabolic_signals: ChecklistSelection
    endocrine_signals: ChecklistSelection
    gi_issues: ChecklistSelection
    immune_histamine: ChecklistSelection
    orthopedic: ChecklistSelection
    neuro_sleep: ChecklistSelection
    movement_limitation: ChecklistSelection
    cardiorespiratory: ChecklistSelection
    genetic_predisposition: ChecklistSelection
    methylation_detox: ChecklistSelection
    hormone_brain_mood: ChecklistSelection
    breathing_stress: ChecklistSelection
    cognitive: ChecklistSelection
    longevity_aging: ChecklistSelection
    autonomic_nervous: ChecklistSelection
    food_response: ChecklistSelection
    histamine_meals: ChecklistSelection
    oxygen_fitness: ChecklistSelection
    emotional_stress: ChecklistSelection
    behavioral_patterns: ChecklistSelection
    stress_recovery: ChecklistSelection
    gut_brain: ChecklistSelection
    hydration_minerals: ChecklistSelection
    temperature_regulation: ChecklistSelection
    metabolic_warning: ChecklistSelection
    hormonal_symptoms: ChecklistSelection
    digestion_advanced: ChecklistSelection
    afternoon_crash: ChecklistSelection
    habit_barriers: ChecklistSelection
    blood_marker_symptoms: ChecklistSelection
    inflammation_immune: ChecklistSelection
    mental_load: ChecklistSelection
    upper_gi: ChecklistSelection
    large_intestine: ChecklistSelection
    immune_system: ChecklistSelection
    adrenal: ChecklistSelection
    thyroid_symptoms: ChecklistSelection
    sugar_handling: ChecklistSelection
    essential_fatty_acids: ChecklistSelection
    vitamin_mineral_needs: ChecklistSelection
    male_urology: ChecklistSelection | None = None
    female_cycle_symptoms: ChecklistSelection | None = None

    @field_validator(*CHECKLIST_FIELD_NAMES)
    @classmethod
    def validate_groups(cls, value: list[str], info: ValidationInfo) -> list[str]:
        return _validate_closed_list(value, CHECKLIST_ALLOWED_IDS[info.field_name], exclusive_id="none")


class Waiver(FoundationAPIModel):
    accepted: bool


class FoundationAnswers(FoundationAPIModel):
    identity: Identity
    body: Body
    logistics: Logistics
    eating_pattern: EatingPattern
    training: Training
    safety: Safety
    lifestyle: Lifestyle
    checklists: Checklists
    sex_specific: SexSpecific
    waiver: Waiver

    @model_validator(mode="after")
    def validate_submit_rules(self) -> FoundationAnswers:
        today = datetime.now(timezone.utc).date()
        age = today.year - self.identity.date_of_birth.year
        if (today.month, today.day) < (
            self.identity.date_of_birth.month,
            self.identity.date_of_birth.day,
        ):
            age -= 1
        if age < 18:
            raise ValueError("Client must be at least 18 years old")
        if self.waiver.accepted is not True:
            raise ValueError(f"Waiver {WAIVER_VERSION} must be accepted")

        sex = self.identity.sex
        body_fat = self.body.visual_body_fat
        if sex == "male" and body_fat not in MALE_BANDS:
            raise ValueError("Male submit payloads must use a male visual body fat band")
        if sex == "female" and body_fat not in FEMALE_BANDS:
            raise ValueError("Female submit payloads must use a female visual body fat band")
        if sex == "other" and body_fat not in MALE_BANDS | FEMALE_BANDS:
            raise ValueError("Other submit payloads must use a supported visual body fat band")

        allowed_sex_fields = {
            "male": {"deficit_drive", "trt_or_hormones", "testosterone_tested_last_year"},
            "female": {
                "pregnant",
                "birth_control",
                "last_cycle_start",
                "cycle_energy_drops",
                "periods_regular",
                "perimenopause",
            },
            "other": {"note"},
        }[sex]
        present_sex_fields = {
            field_name
            for field_name, value in self.sex_specific.model_dump(exclude_none=True).items()
            if value not in ("", [], {})
        }
        if sex == "male":
            missing = allowed_sex_fields - present_sex_fields
            if missing:
                raise ValueError("Male payloads require all male sex-specific fields")
            if self.checklists.male_urology is None or self.checklists.female_cycle_symptoms is not None:
                raise ValueError("Male payloads require only the male_urology checklist")
        elif sex == "female":
            missing = allowed_sex_fields - present_sex_fields
            if missing:
                raise ValueError("Female payloads require all female sex-specific fields")
            if (
                self.sex_specific.last_cycle_unknown is True
                and self.sex_specific.last_cycle_start is not None
            ):
                raise ValueError("Female payloads cannot set last_cycle_start when last_cycle_unknown is true")
            if (
                self.sex_specific.last_cycle_unknown is not True
                and self.sex_specific.last_cycle_start is None
            ):
                raise ValueError("Female payloads require a last_cycle_start or last_cycle_unknown=true")
            if self.checklists.female_cycle_symptoms is None or self.checklists.male_urology is not None:
                raise ValueError("Female payloads require only the female_cycle_symptoms checklist")
        else:
            if present_sex_fields - {"note"}:
                raise ValueError("Other payloads may only include an optional note")
            if self.checklists.female_cycle_symptoms is not None or self.checklists.male_urology is not None:
                raise ValueError("Other payloads must omit sex-gated checklist groups")

        missing_always = [
            field_name
            for field_name in APPLICABLE_ALWAYS
            if getattr(self.checklists, field_name) is None
        ]
        if missing_always:
            raise ValueError("All non-sex-gated checklist groups are required")
        return self


IdentityDraft = _optional_model(Identity, "IdentityDraft")
BodyDraft = _optional_model(Body, "BodyDraft")
LogisticsDraft = _optional_model(Logistics, "LogisticsDraft")
RequiredEatingSlotDraft = _optional_model(RequiredEatingSlot, "RequiredEatingSlotDraft")
OptionalEatingSlotDraft = _optional_model(OptionalEatingSlot, "OptionalEatingSlotDraft")
TrainingDraft = _optional_model(Training, "TrainingDraft")
SafetyDraft = _optional_model(Safety, "SafetyDraft")
LifestyleDraft = _optional_model(Lifestyle, "LifestyleDraft")
SexSpecificDraft = _optional_model(SexSpecific, "SexSpecificDraft")
ChecklistsDraft = _optional_model(Checklists, "ChecklistsDraft")
WaiverDraft = _optional_model(Waiver, "WaiverDraft")


class EatingPatternDraft(FoundationAPIModel):
    breakfast: RequiredEatingSlotDraft | None = None
    mid_morning: OptionalEatingSlotDraft | None = None
    lunch: RequiredEatingSlotDraft | None = None
    evening: OptionalEatingSlotDraft | None = None
    dinner: RequiredEatingSlotDraft | None = None
    late_night: OptionalEatingSlotDraft | None = None


class FoundationAnswersDraft(FoundationAPIModel):
    identity: IdentityDraft | None = None
    body: BodyDraft | None = None
    logistics: LogisticsDraft | None = None
    eating_pattern: EatingPatternDraft | None = None
    training: TrainingDraft | None = None
    safety: SafetyDraft | None = None
    lifestyle: LifestyleDraft | None = None
    checklists: ChecklistsDraft | None = None
    sex_specific: SexSpecificDraft | None = None
    waiver: WaiverDraft | None = None
