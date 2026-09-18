from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.foundation_intake import FoundationAnswers, FoundationAnswersDraft
from app.services.foundation_catalog import (
    CHECKLIST_GROUPS,
    WAIVER_VERSION,
    attention_flags,
    valid_submit_answers,
)


REQUIRED_GROUPS = {
    "sleep_recovery",
    "gut_digestive",
    "thyroid_autoimmune",
    "mental_cognitive",
    "hormonal_health",
    "allergy_environmental",
    "skin_hair",
    "pain_inflammation",
    "recovery_biomarkers",
    "blood_sugar_metabolism",
    "breathing_patterns",
    "metabolic_signals",
    "endocrine_signals",
    "gi_issues",
    "immune_histamine",
    "orthopedic",
    "neuro_sleep",
    "movement_limitation",
    "cardiorespiratory",
    "genetic_predisposition",
    "methylation_detox",
    "hormone_brain_mood",
    "breathing_stress",
    "cognitive",
    "longevity_aging",
    "autonomic_nervous",
    "food_response",
    "histamine_meals",
    "oxygen_fitness",
    "emotional_stress",
    "behavioral_patterns",
    "stress_recovery",
    "gut_brain",
    "hydration_minerals",
    "temperature_regulation",
    "metabolic_warning",
    "hormonal_symptoms",
    "digestion_advanced",
    "afternoon_crash",
    "habit_barriers",
    "blood_marker_symptoms",
    "inflammation_immune",
    "mental_load",
    "upper_gi",
    "large_intestine",
    "immune_system",
    "adrenal",
    "thyroid_symptoms",
    "sugar_handling",
    "essential_fatty_acids",
    "vitamin_mineral_needs",
    "male_urology",
    "female_cycle_symptoms",
}

EXPECTED_OPTION_COUNTS = {
    "sleep_recovery": 4,
    "gut_digestive": 4,
    "thyroid_autoimmune": 2,
    "mental_cognitive": 3,
    "hormonal_health": 20,
    "allergy_environmental": 11,
    "skin_hair": 11,
    "pain_inflammation": 3,
    "recovery_biomarkers": 10,
    "blood_sugar_metabolism": 3,
    "breathing_patterns": 13,
    "metabolic_signals": 8,
    "endocrine_signals": 16,
    "gi_issues": 11,
    "immune_histamine": 8,
    "orthopedic": 27,
    "neuro_sleep": 9,
    "movement_limitation": 21,
    "cardiorespiratory": 23,
    "genetic_predisposition": 7,
    "methylation_detox": 6,
    "hormone_brain_mood": 6,
    "breathing_stress": 6,
    "cognitive": 6,
    "longevity_aging": 6,
    "autonomic_nervous": 5,
    "food_response": 7,
    "histamine_meals": 7,
    "oxygen_fitness": 6,
    "emotional_stress": 8,
    "behavioral_patterns": 8,
    "stress_recovery": 7,
    "gut_brain": 7,
    "hydration_minerals": 6,
    "temperature_regulation": 7,
    "metabolic_warning": 17,
    "hormonal_symptoms": 11,
    "digestion_advanced": 12,
    "afternoon_crash": 8,
    "habit_barriers": 11,
    "blood_marker_symptoms": 73,
    "inflammation_immune": 38,
    "mental_load": 14,
    "upper_gi": 17,
    "large_intestine": 14,
    "immune_system": 8,
    "adrenal": 13,
    "thyroid_symptoms": 15,
    "sugar_handling": 15,
    "essential_fatty_acids": 7,
    "vitamin_mineral_needs": 22,
    "male_urology": 11,
    "female_cycle_symptoms": 35,
}


def test_waiver_version() -> None:
    assert WAIVER_VERSION == "xform-foundation-waiver-v1"


def test_required_groups_present() -> None:
    assert REQUIRED_GROUPS == set(CHECKLIST_GROUPS)


def test_catalog_snapshot_matches_group_option_counts() -> None:
    assert {key: len(options) for key, options in CHECKLIST_GROUPS.items()} == EXPECTED_OPTION_COUNTS


def test_each_group_has_none_and_unique_ids() -> None:
    for key, options in CHECKLIST_GROUPS.items():
        ids = [item["id"] for item in options]
        assert "none" in ids, key
        assert len(ids) == len(set(ids)), key
        assert all(item["label"] and "(" not in item["label"] for item in options)


def test_required_groups_include_at_least_one_real_option() -> None:
    for key in REQUIRED_GROUPS:
        assert len(CHECKLIST_GROUPS[key]) > 1, key


def test_valid_fixture_parses_for_male() -> None:
    FoundationAnswers.model_validate(valid_submit_answers("male"))


def test_valid_fixture_parses_for_female_and_requires_cycle_group() -> None:
    payload = valid_submit_answers("female")
    assert "female_cycle_symptoms" in payload["checklists"]
    FoundationAnswers.model_validate(payload)


def test_valid_fixture_for_other_omits_sex_gated_checklists() -> None:
    payload = valid_submit_answers("other")
    assert "male_urology" not in payload["checklists"]
    assert "female_cycle_symptoms" not in payload["checklists"]
    FoundationAnswers.model_validate(payload)


def test_none_is_exclusive_for_checklists() -> None:
    payload = valid_submit_answers("male")
    payload["checklists"]["sleep_recovery"] = ["none", "do_you_snore_or_have_you_ever_been_diagnosed_with_sleep_apnea"]

    with pytest.raises(ValidationError):
        FoundationAnswers.model_validate(payload)


def test_draft_allows_partial_nested_payload() -> None:
    FoundationAnswersDraft.model_validate(
        {
            "identity": {"full_name": "Taylor Example"},
            "waiver": {"accepted": True},
        }
    )


def test_attention_flags_include_pregnancy_and_physician_warning() -> None:
    payload = valid_submit_answers("female")
    payload["sex_specific"]["pregnant"] = "unsure"
    payload["safety"]["physician_said_no_exercise"] = "Cardiologist advised against training for now."

    assert attention_flags(payload) == ["reported_pregnancy", "physician_said_no_exercise"]


@pytest.mark.parametrize("answer", ["No.", "no"])
def test_attention_flags_treat_negative_physician_answers_as_no_flag(answer: str) -> None:
    payload = valid_submit_answers("male")
    payload["safety"]["physician_said_no_exercise"] = answer

    assert attention_flags(payload) == []


def test_attention_flags_keep_affirmative_physician_warning() -> None:
    payload = valid_submit_answers("male")
    payload["safety"]["physician_said_no_exercise"] = "Yes, stop training"

    assert attention_flags(payload) == ["physician_said_no_exercise"]


def test_submit_rejects_underage_date_of_birth() -> None:
    payload = valid_submit_answers("male")
    payload["identity"]["date_of_birth"] = "2010-01-15"

    with pytest.raises(ValidationError):
        FoundationAnswers.model_validate(payload)
