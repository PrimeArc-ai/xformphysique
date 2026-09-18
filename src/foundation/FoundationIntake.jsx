import { useEffect, useMemo, useRef, useState } from 'react'
import { clientApi, setAccessToken } from '../api/client'
import WizardStep from './WizardStep'
import { WAIVER_TEXT, WAIVER_VERSION } from './waiver'
import bodyFatReference from '../assets/foundation-bodyfat-reference.webp'
import './foundation.css'

const STEP_DEFS = [
  ['identity', 'You'],
  ['body', 'Body'],
  ['logistics', 'Food & training logistics'],
  ['eating_pattern', 'Eating pattern'],
  ['training', 'Training'],
  ['safety', 'Safety'],
  ['lifestyle', 'Lifestyle & goals'],
  ['checklists', 'Context checklists'],
  ['sex_specific', 'Sex-specific'],
  ['photos', 'Baseline photos'],
  ['waiver', 'Waiver'],
]

const FOOTER_COPY = 'Coaching support only. This form is not medical advice or a diagnosis.'
const STEP_MEMORY_KEY = 'xform.foundation.step'
const PHOTO_ORDER = ['front', 'back', 'side', 'front_double_bicep', 'back_double_bicep']
const PHOTO_LABELS = {
  front: 'Front',
  back: 'Back',
  side: 'Side',
  front_double_bicep: 'Front double bicep',
  back_double_bicep: 'Back double bicep',
}

const YES_NO_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
const SEX_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]
const FOOD_PREFERENCE_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian_outside', label: 'Eggetarian outside' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'nonveg_outside', label: 'Non-veg outside' },
  { value: 'nonveg_home_and_outside', label: 'Non-veg home and outside' },
  { value: 'eggetarian_home_and_outside', label: 'Eggetarian home and outside' },
]
const TRAINING_LOCATION_OPTIONS = [
  { value: 'gym', label: 'Gym' },
  { value: 'home_no_dumbbells', label: 'Home, no dumbbells' },
  { value: 'home_dumbbells', label: 'Home with dumbbells' },
  { value: 'home_dumbbells_no_bench', label: 'Home with dumbbells, no bench' },
  { value: 'home_dumbbells_bands', label: 'Home with dumbbells and bands' },
]
const TRAINING_DAYS_OPTIONS = [
  { value: '1_3', label: '3 days' },
  { value: '1_4', label: '4 days' },
  { value: '1_5', label: '5 days' },
  { value: '1_6', label: '6 days' },
]
const TRACKING_OPTIONS = [
  { value: 'pen_paper', label: 'Pen and paper' },
  { value: 'notes_app', label: 'Notes app' },
  { value: 'hevy_strong', label: 'Hevy / Strong' },
  { value: 'mental', label: 'Mentally' },
  { value: 'none', label: 'I do not track' },
]
const EXERCISE_LEVEL_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
  { value: 'extreme', label: 'Extreme' },
]
const WEEKLY_HOURS_OPTIONS = [
  { value: 'under_3', label: 'Under 3 hours' },
  { value: '3_6', label: '3 to 6 hours' },
  { value: '6_10', label: '6 to 10 hours' },
  { value: 'over_10', label: 'Over 10 hours' },
]
const TRANSPORT_OPTIONS = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'walking', label: 'Walking' },
  { value: 'jogging', label: 'Jogging' },
  { value: 'bicycle', label: 'Bicycle' },
]
const SITTING_HOURS_OPTIONS = [
  { value: 'under_8', label: 'Under 8 hours' },
  { value: '8_12', label: '8 to 12 hours' },
  { value: '12_18', label: '12 to 18 hours' },
  { value: 'over_18', label: 'Over 18 hours' },
]
const SLEEP_HOURS_OPTIONS = [
  { value: 'under_6', label: 'Under 6 hours' },
  { value: '6_7', label: '6 to 7 hours' },
  { value: '7_8', label: '7 to 8 hours' },
  { value: 'over_8', label: 'Over 8 hours' },
]
const LIFESTYLE_ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
]
const WATER_OPTIONS = [
  { value: 'under_1l', label: 'Under 1L' },
  { value: '1_3l', label: '1 to 3L' },
  { value: '3_5l', label: '3 to 5L' },
  { value: 'over_5l', label: 'Over 5L' },
]
const BODY_FEELING_OPTIONS = [
  { value: 'totally_unhappy', label: 'Totally unhappy' },
  { value: 'very_unhappy', label: 'Very unhappy' },
  { value: 'moderately_unhappy', label: 'Moderately unhappy' },
  { value: 'slightly_unhappy', label: 'Slightly unhappy' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'slightly_happy', label: 'Slightly happy' },
  { value: 'moderately_happy', label: 'Moderately happy' },
  { value: 'very_happy', label: 'Very happy' },
  { value: 'totally_happy', label: 'Totally happy' },
]
const SKIN_OPTIONS = [
  { value: 'very_dry', label: 'Very dry' },
  { value: 'oily', label: 'Oily' },
  { value: 'dry', label: 'Dry' },
  { value: 'combination', label: 'Combination' },
  { value: 'normal', label: 'Normal' },
]
const CRAVING_TIME_OPTIONS = [
  { value: 'mid_morning', label: 'Mid-morning' },
  { value: 'late_afternoon_tea_time', label: 'Late afternoon / Tea time' },
  { value: 'immediately_after_lunch_or_dinner', label: 'Immediately after lunch or dinner' },
  { value: 'late_night_before_bed', label: 'Late night / Before bed' },
  { value: 'during_high_stress_hours_at_work', label: 'During high-stress hours at work' },
  { value: 'around_my_menstrual_cycle', label: 'Around my menstrual cycle' },
  { value: 'rarely_no_specific_time', label: 'Rarely / No specific time' },
]
const WORK_ENVIRONMENT_OPTIONS = [
  { value: 'desk_job_with_prolonged_sitting', label: 'Desk job with prolonged sitting' },
  { value: 'hybrid_work', label: 'Hybrid work' },
  { value: 'night_shift_rotational_shift_work', label: 'Night shift / Rotational shift work' },
  { value: 'frequent_work_related_travel', label: 'Frequent work-related travel' },
  { value: 'high_physical_activity_on_job', label: 'High physical activity on job' },
  { value: 'frequent_long_driving_commute_hours', label: 'Frequent long driving / commute hours' },
  { value: 'irregular_sleep_schedule_due_to_work_family_obligations', label: 'Irregular sleep schedule due to work/family obligations' },
]
const DIET_STYLE_OPTIONS = [
  { value: 'low_fat', label: 'Low fat' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'low_sugar', label: 'Low sugar' },
  { value: 'gluten_free', label: 'Gluten free' },
  { value: 'dairy_free', label: 'Dairy free' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'no_wheat', label: 'No wheat' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'low_sodium', label: 'Low sodium' },
  { value: 'diabetic', label: 'Diabetic' },
  { value: 'other', label: 'Other' },
]
const CHANGE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'significantly_modify_your_diet', label: 'Significantly modify your diet' },
  { value: 'take_nutritional_supplements_each_day', label: 'Take nutritional supplements each day' },
  { value: 'keep_a_record_of_everything_you_eat_each_day', label: 'Keep a record of everything you eat each day' },
  { value: 'modify_your_lifestyle', label: 'Modify your lifestyle' },
  { value: 'practice_relaxation_techniques', label: 'Practice relaxation techniques' },
  { value: 'engage_in_regular_exercise_physical_activity', label: 'Engage in regular exercise / physical activity' },
  { value: 'have_periodic_lab_tests_to_assess_your_progress', label: 'Have periodic lab tests to assess your progress' },
]
const FOOD_CRAVING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sugar', label: 'Sugar' },
  { value: 'chocolate', label: 'Chocolate' },
  { value: 'meats_fish', label: 'Meats / Fish' },
  { value: 'fried_food', label: 'Fried food' },
  { value: 'fat', label: 'Fat' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'desserts', label: 'Desserts' },
  { value: 'milk', label: 'Milk' },
  { value: 'bread', label: 'Bread' },
]
const BODY_FAT_OPTIONS = {
  male: [
    { value: 'm_6_9', label: 'Male 6-9' },
    { value: 'm_10_14', label: 'Male 10-14' },
    { value: 'm_15_19', label: 'Male 15-19' },
    { value: 'm_20_24', label: 'Male 20-24' },
    { value: 'm_25_29', label: 'Male 25-29' },
    { value: 'm_30_plus', label: 'Male 30+' },
  ],
  female: [
    { value: 'f_12_16', label: 'Female 12-16' },
    { value: 'f_17_21', label: 'Female 17-21' },
    { value: 'f_22_26', label: 'Female 22-26' },
    { value: 'f_27_31', label: 'Female 27-31' },
    { value: 'f_32_36', label: 'Female 32-36' },
    { value: 'f_37_plus', label: 'Female 37+' },
  ],
}

const IDENTITY_FIELDS = [
  { path: 'identity.full_name', label: 'Full name' },
  { path: 'identity.date_of_birth', label: 'Date of birth', type: 'date' },
  { path: 'identity.sex', label: 'Sex', type: 'select', options: SEX_OPTIONS },
  { path: 'identity.mobile', label: 'Mobile' },
  { path: 'identity.place_of_living', label: 'Place of living' },
  { path: 'identity.profession', label: 'Profession' },
]

const BODY_FIELDS = [
  { path: 'body.morning_weight_kg', label: 'Morning dry weight (kg)', type: 'number', step: '0.1' },
  { path: 'body.height_cm', label: 'Height (cm)', type: 'number', step: '0.1' },
  { path: 'body.waist_cm', label: 'Waist just above navel (cm)', type: 'number', step: '0.1' },
  { path: 'body.desired_weight_kg', label: 'Desired weight (kg)', type: 'number', step: '0.1' },
]

const LOGISTICS_FIELDS = [
  { path: 'logistics.knows_food_logging', label: 'Do you know food logging?', type: 'select', options: YES_NO_OPTIONS },
  { path: 'logistics.knows_food_scale', label: 'Do you know how to use a food scale?', type: 'select', options: YES_NO_OPTIONS },
  { path: 'logistics.food_preference', label: 'Food preference', type: 'select', options: FOOD_PREFERENCE_OPTIONS },
  { path: 'logistics.training_location', label: 'Training location', type: 'select', options: TRAINING_LOCATION_OPTIONS },
  { path: 'logistics.ingredient_quantity', label: 'Ingredient quantity', type: 'select', options: [{ value: 'raw', label: 'Raw' }, { value: 'cooked', label: 'Cooked' }] },
  { path: 'logistics.training_days', label: 'Training days per week', type: 'select', options: TRAINING_DAYS_OPTIONS },
  { path: 'logistics.meals_per_day', label: 'Meals per day', type: 'number', min: '1', max: '8' },
  { path: 'logistics.veg_days_separate', label: 'Keep veg days separate?', type: 'select', options: YES_NO_OPTIONS },
  { path: 'logistics.disliked_foods', label: 'Disliked foods', type: 'textarea' },
  { path: 'logistics.who_cooks', label: 'Who cooks?', type: 'textarea' },
  { path: 'logistics.supplement_budget_monthly', label: 'Supplement budget per month', type: 'textarea' },
  { path: 'logistics.workout_time', label: 'Preferred workout time', type: 'textarea' },
]

const EATING_SLOTS = [
  ['breakfast', 'Breakfast', true],
  ['mid_morning', 'Mid-morning', false],
  ['lunch', 'Lunch', true],
  ['evening', 'Evening', false],
  ['dinner', 'Dinner', true],
  ['late_night', 'Late night', false],
]

const TRAINING_FIELDS = [
  { path: 'training.strength_lifts', label: 'Strength lifts', type: 'textarea' },
  { path: 'training.equipment', label: 'Equipment you can use', type: 'textarea' },
  { path: 'training.dumbbell_increments', label: 'Dumbbell increments', type: 'textarea' },
  { path: 'training.refused_exercises', label: 'Exercises you refuse', type: 'textarea' },
  { path: 'training.exercise_history', label: 'Exercise history', type: 'textarea' },
  { path: 'training.current_program', label: 'Current program', type: 'textarea' },
  { path: 'training.tracks_workouts', label: 'How do you track workouts?', type: 'select', options: TRACKING_OPTIONS },
  { path: 'training.joint_flareups', label: 'Joint flare-ups', type: 'textarea' },
  { path: 'training.post_workout_routine', label: 'Post-workout routine', type: 'textarea' },
  { path: 'training.hobbies_sports', label: 'Hobbies or sports', type: 'textarea' },
  { path: 'training.strong_weak_groups', label: 'Strong and weak muscle groups', type: 'textarea' },
  { path: 'training.exercise_familiarity', label: 'Exercise familiarity', type: 'textarea' },
  { path: 'training.ped_steroids', label: 'PED / steroid context', type: 'textarea' },
  { path: 'training.muscular_capacity', label: 'Muscular capacity', type: 'select', options: numberOptions(5) },
  { path: 'training.athletic_ability', label: 'Athletic ability', type: 'select', options: numberOptions(5) },
  { path: 'training.flexibility', label: 'Flexibility', type: 'select', options: numberOptions(5) },
  { path: 'training.cardio_ability', label: 'Cardio ability', type: 'select', options: numberOptions(5) },
  { path: 'training.exercise_level', label: 'Current exercise level', type: 'select', options: EXERCISE_LEVEL_OPTIONS },
  { path: 'training.weekly_exercise_hours', label: 'Weekly exercise hours', type: 'select', options: WEEKLY_HOURS_OPTIONS },
  { path: 'training.dedication_1_to_10', label: 'Dedication (1-10)', type: 'select', options: numberOptions(10) },
  { path: 'training.transport', label: 'Transport', type: 'select', options: TRANSPORT_OPTIONS },
  { path: 'training.sitting_hours', label: 'Sitting hours', type: 'select', options: SITTING_HOURS_OPTIONS },
]

const SAFETY_FIELDS = [
  { path: 'safety.family_cardiac_or_untrained_age', label: 'Family cardiac or untrained age context', type: 'textarea' },
  { path: 'safety.hospitalized_recently', label: 'Hospitalized recently', type: 'textarea' },
  { path: 'safety.major_surgery_injuries_illness', label: 'Major surgery, injuries, or illness', type: 'textarea' },
  { path: 'safety.other_health_concerns', label: 'Other health concerns', type: 'textarea' },
  { path: 'safety.recent_labs_note', label: 'Recent labs note', type: 'textarea', hint: 'Upload PDFs later in Health if the coach requests them.' },
  { path: 'safety.food_allergies', label: 'Food allergies', type: 'textarea' },
  { path: 'safety.limits_on_activity', label: 'Limits on activity', type: 'textarea' },
  { path: 'safety.bone_density_over_50', label: 'Bone density over 50', type: 'textarea' },
  { path: 'safety.physician_said_no_exercise', label: 'Has a physician told you not to exercise?', type: 'textarea' },
  { path: 'safety.ortho_surgeries', label: 'Orthopedic surgeries', type: 'textarea' },
  { path: 'safety.imaging_mri_xray', label: 'Imaging, MRI, or X-ray context', type: 'textarea' },
  { path: 'safety.prescription_medication', label: 'Prescription medication', type: 'textarea' },
  { path: 'safety.psych_meds_or_insulin_etc', label: 'Psych meds, insulin, thyroid meds, blood thinners, etc.', type: 'textarea' },
  { path: 'safety.blood_pressure_reading', label: 'Blood pressure reading', type: 'text' },
  { path: 'safety.resting_heart_rate', label: 'Resting heart rate', type: 'text' },
  { path: 'safety.snore_or_unrefreshed', label: 'Snore or wake unrefreshed', type: 'textarea' },
  { path: 'safety.bowel_movements', label: 'Bowel movements', type: 'textarea' },
  { path: 'safety.current_supplements', label: 'Current supplements', type: 'textarea' },
  { path: 'safety.fat_burner_history', label: 'Fat-burner history', type: 'textarea' },
]

const LIFESTYLE_FIELDS = [
  { path: 'lifestyle.job_and_commute', label: 'Job and commute', type: 'textarea' },
  { path: 'lifestyle.relationship_status', label: 'Relationship status', type: 'text' },
  { path: 'lifestyle.motivation_when_low', label: 'What keeps you going when motivation is low?', type: 'textarea' },
  { path: 'lifestyle.prior_bodycomp_attempts', label: 'Prior body-composition attempts', type: 'textarea' },
  { path: 'lifestyle.why_this_matters', label: 'Why does this matter to you?', type: 'textarea' },
  { path: 'lifestyle.photoshoot_gift', label: 'Photoshoot or gift idea', type: 'textarea' },
  { path: 'lifestyle.life_events', label: 'Life events affecting progress', type: 'textarea' },
  { path: 'lifestyle.disordered_eating', label: 'Disordered eating context', type: 'textarea' },
  { path: 'lifestyle.body_feeling', label: 'How do you feel about your body now?', type: 'select', options: BODY_FEELING_OPTIONS },
  { path: 'lifestyle.nightmares', label: 'Nightmares', type: 'textarea' },
  { path: 'lifestyle.non_scale_victory', label: 'Most meaningful non-scale victory', type: 'textarea' },
  { path: 'lifestyle.caloric_drinks', label: 'Caloric drinks', type: 'textarea' },
  { path: 'lifestyle.delivery_or_eat_out', label: 'Delivery or eating out', type: 'textarea' },
  { path: 'lifestyle.must_have_foods', label: 'Must-have foods', type: 'textarea' },
  { path: 'lifestyle.religious_fasting', label: 'Religious fasting', type: 'textarea' },
  { path: 'lifestyle.work_shift_pattern', label: 'Work shift pattern', type: 'textarea' },
  { path: 'lifestyle.hours_to_first_meal', label: 'Hours to first meal', type: 'text' },
  { path: 'lifestyle.weekend_vs_weekday', label: 'Weekend vs weekday routine', type: 'textarea' },
  { path: 'lifestyle.stopped_previous_programs', label: 'Why did previous programs stop?', type: 'textarea' },
  { path: 'lifestyle.craving_triggers', label: 'Craving triggers', type: 'textarea' },
  { path: 'lifestyle.one_year_vision', label: 'One-year vision', type: 'textarea' },
  { path: 'lifestyle.priority_goals', label: 'Priority goals', type: 'textarea' },
  { path: 'lifestyle.what_kept_you', label: 'What kept you from starting sooner?', type: 'textarea' },
  { path: 'lifestyle.religious_cultural_diet', label: 'Religious or cultural diet notes', type: 'textarea' },
  { path: 'lifestyle.sleep_quality_1_to_10', label: 'Sleep quality (1-10)', type: 'select', options: numberOptions(10) },
  { path: 'lifestyle.sleep_notes', label: 'Sleep notes', type: 'textarea' },
  { path: 'lifestyle.weekday_sleep_hours', label: 'Weekday sleep hours', type: 'select', options: SLEEP_HOURS_OPTIONS },
  { path: 'lifestyle.weekend_sleep_hours', label: 'Weekend sleep hours', type: 'select', options: SLEEP_HOURS_OPTIONS },
  { path: 'lifestyle.energy_1_to_10', label: 'Energy (1-10)', type: 'select', options: numberOptions(10) },
  { path: 'lifestyle.energy_notes', label: 'Energy notes', type: 'textarea' },
  { path: 'lifestyle.libido_energy', label: 'Libido and energy', type: 'textarea' },
  { path: 'lifestyle.fat_storage_areas', label: 'Where do you store fat most easily?', type: 'textarea' },
  { path: 'lifestyle.days_you_will_not_show_up', label: 'Days you feel least likely to show up', type: 'textarea' },
  { path: 'lifestyle.excuses_and_plan', label: 'Excuses you use and your plan for them', type: 'textarea' },
  { path: 'lifestyle.burnout_or_anxiety', label: 'Burnout or anxiety', type: 'textarea' },
  { path: 'lifestyle.mental_health_diagnosis', label: 'Mental health diagnosis', type: 'textarea' },
  { path: 'lifestyle.success_definition', label: 'What does success mean to you?', type: 'textarea' },
  { path: 'lifestyle.family_support', label: 'Family support', type: 'textarea' },
  { path: 'lifestyle.people_who_discourage', label: 'People who discourage you', type: 'textarea' },
  { path: 'lifestyle.work_stress_limits', label: 'How does work stress limit you?', type: 'textarea' },
  { path: 'lifestyle.smoking', label: 'Smoking', type: 'textarea' },
  { path: 'lifestyle.alcohol', label: 'Alcohol', type: 'textarea' },
  { path: 'lifestyle.online_training_history', label: 'Online training history', type: 'textarea' },
  { path: 'lifestyle.three_habit_changes', label: 'Three habit changes you are willing to make', type: 'textarea' },
  { path: 'lifestyle.lifestyle_activity', label: 'Lifestyle activity', type: 'select', options: LIFESTYLE_ACTIVITY_OPTIONS },
  { path: 'lifestyle.water_intake', label: 'Water intake', type: 'select', options: WATER_OPTIONS },
  { path: 'lifestyle.skin_without_lotion', label: 'Skin without lotion', type: 'select', options: SKIN_OPTIONS },
  { path: 'lifestyle.milestone_celebration', label: 'Milestone celebration', type: 'textarea' },
  { path: 'lifestyle.anything_else', label: 'Anything else?', type: 'textarea' },
]

function numberOptions(max) {
  return Array.from({ length: max }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  }))
}

function emptyAnswers(fullName = '') {
  return {
    identity: {
      full_name: fullName,
      date_of_birth: '',
      sex: '',
      mobile: '',
      place_of_living: '',
      profession: '',
    },
    body: {
      morning_weight_kg: '',
      height_cm: '',
      waist_cm: '',
      visual_body_fat: '',
      desired_weight_kg: '',
    },
    logistics: {
      knows_food_logging: '',
      knows_food_scale: '',
      food_preference: '',
      training_location: '',
      ingredient_quantity: '',
      training_days: '',
      meals_per_day: '',
      veg_days_separate: '',
      disliked_foods: '',
      who_cooks: '',
      supplement_budget_monthly: '',
      workout_time: '',
    },
    eating_pattern: Object.fromEntries(EATING_SLOTS.map(([key]) => [key, { time: '', foods: '' }])),
    training: {
      strength_lifts: '',
      equipment: '',
      dumbbell_increments: '',
      refused_exercises: '',
      exercise_history: '',
      current_program: '',
      tracks_workouts: '',
      joint_flareups: '',
      post_workout_routine: '',
      hobbies_sports: '',
      strong_weak_groups: '',
      exercise_familiarity: '',
      ped_steroids: '',
      muscular_capacity: '',
      athletic_ability: '',
      flexibility: '',
      cardio_ability: '',
      exercise_level: '',
      weekly_exercise_hours: '',
      dedication_1_to_10: '',
      transport: '',
      sitting_hours: '',
    },
    safety: {
      family_cardiac_or_untrained_age: '',
      hospitalized_recently: '',
      major_surgery_injuries_illness: '',
      other_health_concerns: '',
      recent_labs_note: '',
      food_allergies: '',
      limits_on_activity: '',
      bone_density_over_50: '',
      physician_said_no_exercise: '',
      ortho_surgeries: '',
      imaging_mri_xray: '',
      prescription_medication: '',
      psych_meds_or_insulin_etc: '',
      blood_pressure_reading: '',
      resting_heart_rate: '',
      snore_or_unrefreshed: '',
      bowel_movements: '',
      current_supplements: '',
      fat_burner_history: '',
    },
    lifestyle: {
      job_and_commute: '',
      relationship_status: '',
      motivation_when_low: '',
      prior_bodycomp_attempts: '',
      why_this_matters: '',
      photoshoot_gift: '',
      life_events: '',
      disordered_eating: '',
      body_feeling: '',
      nightmares: '',
      non_scale_victory: '',
      caloric_drinks: '',
      delivery_or_eat_out: '',
      must_have_foods: '',
      religious_fasting: '',
      work_shift_pattern: '',
      hours_to_first_meal: '',
      weekend_vs_weekday: '',
      stopped_previous_programs: '',
      craving_triggers: '',
      one_year_vision: '',
      priority_goals: '',
      what_kept_you: '',
      religious_cultural_diet: '',
      sleep_quality_1_to_10: '',
      sleep_notes: '',
      weekday_sleep_hours: '',
      weekend_sleep_hours: '',
      energy_1_to_10: '',
      energy_notes: '',
      libido_energy: '',
      fat_storage_areas: '',
      days_you_will_not_show_up: '',
      excuses_and_plan: '',
      burnout_or_anxiety: '',
      mental_health_diagnosis: '',
      success_definition: '',
      family_support: '',
      people_who_discourage: '',
      work_stress_limits: '',
      smoking: '',
      alcohol: '',
      online_training_history: '',
      three_habit_changes: '',
      craving_times: [],
      work_environment: [],
      lifestyle_activity: '',
      water_intake: '',
      diet_styles: [],
      willing_to_change: [],
      skin_without_lotion: '',
      food_cravings_list: [],
      milestone_celebration: '',
      anything_else: '',
    },
    checklists: {},
    sex_specific: {},
    waiver: { accepted: false },
  }
}

function deepMerge(target, source) {
  if (Array.isArray(source)) return [...source]
  if (!source || typeof source !== 'object') return source ?? target
  const output = { ...(target || {}) }
  for (const [key, value] of Object.entries(source)) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(output[key], value)
      : Array.isArray(value)
        ? [...value]
        : value
  }
  return output
}

function setAtPath(value, path, nextValue) {
  const parts = path.split('.')
  const output = { ...value }
  let pointer = output
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    pointer[key] = Array.isArray(pointer[key]) ? [...pointer[key]] : { ...(pointer[key] || {}) }
    pointer = pointer[key]
  }
  pointer[parts.at(-1)] = nextValue
  return output
}

function getAtPath(value, path) {
  return path.split('.').reduce((current, key) => (current == null ? current : current[key]), value)
}

function todayLocal() {
  return new Date().toISOString().slice(0, 10)
}

function stepTitleForKey(key) {
  return STEP_DEFS.find(([stepKey]) => stepKey === key)?.[1] || 'Foundation form'
}

function stepKeyForError(field, code) {
  if (code === 'foundation_photos_incomplete') return 'photos'
  if (code === 'foundation_waiver_required') return 'waiver'
  if (!field) return 'waiver'
  const [root] = field.split('.')
  return root === 'answers' ? 'waiver' : root
}

function formatFieldName(field) {
  return field
    .split('.')
    .slice(1)
    .join(' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function groupValidationIssues(error) {
  const grouped = new Map()
  const fields = error?.fields && typeof error.fields === 'object' ? error.fields : null
  if (fields) {
    for (const [field, message] of Object.entries(fields)) {
      const key = stepKeyForError(field, error.code)
      const entry = grouped.get(key) || []
      entry.push(`${formatFieldName(field)}: ${message}`)
      grouped.set(key, entry)
    }
  } else {
    const key = stepKeyForError('', error?.code)
    grouped.set(key, [error?.message || 'Please review this step before submitting.'])
  }
  return Array.from(grouped.entries()).map(([key, items]) => ({
    key,
    title: stepTitleForKey(key),
    items,
  }))
}

function normalizeAnswers(answers) {
  const normalized = JSON.parse(JSON.stringify(answers))
  for (const path of [
    'body.morning_weight_kg',
    'body.height_cm',
    'body.waist_cm',
    'body.desired_weight_kg',
    'logistics.meals_per_day',
    'training.muscular_capacity',
    'training.athletic_ability',
    'training.flexibility',
    'training.cardio_ability',
    'training.dedication_1_to_10',
    'lifestyle.sleep_quality_1_to_10',
    'lifestyle.energy_1_to_10',
  ]) {
    const rawValue = getAtPath(normalized, path)
    if (rawValue === '') continue
    const numeric = path.includes('kg') || path.includes('cm') ? Number.parseFloat(rawValue) : Number.parseInt(rawValue, 10)
    if (Number.isFinite(numeric)) {
      const next = setAtPath(normalized, path, numeric)
      Object.assign(normalized, next)
    }
  }
  return normalized
}

function bodyFatChoices(sex) {
  if (sex === 'female') return BODY_FAT_OPTIONS.female
  if (sex === 'male') return BODY_FAT_OPTIONS.male
  return [...BODY_FAT_OPTIONS.male, ...BODY_FAT_OPTIONS.female]
}

function toggleExclusive(values, item, exclusiveId) {
  if (item === exclusiveId) return [exclusiveId]
  const filtered = values.filter((value) => value !== exclusiveId)
  return values.includes(item)
    ? filtered.filter((value) => value !== item)
    : [...filtered, item]
}

function mergePrefill(prefill, answers) {
  return deepMerge(emptyAnswers(prefill?.full_name || ''), answers || {})
}

async function hydratePhotoSlots(slots) {
  const next = {}
  for (const view of PHOTO_ORDER) {
    const photo = slots?.[view]
    if (!photo?.content_url) {
      next[view] = null
      continue
    }
    next[view] = {
      ...photo,
      preview_url: await clientApi.getPrivatePhotoUrl(photo.content_url),
    }
  }
  return next
}

function updateUrls(urlsRef, nextPhotos) {
  urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  urlsRef.current = Object.values(nextPhotos).map((photo) => photo?.preview_url).filter(Boolean)
}

function MultiSelectField({ label, options, values, onToggle, hint }) {
  return (
    <fieldset className="foundation-field foundation-checkbox-field">
      <legend>{label}</legend>
      <div className="foundation-checkbox-grid">
        {options.map((option) => (
          <label key={option.value} className="foundation-check">
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {hint ? <small>{hint}</small> : null}
    </fieldset>
  )
}

function renderField(field, answers, setAnswer) {
  const value = getAtPath(answers, field.path) ?? ''
  const shared = {
    id: field.path,
    name: field.path,
    value,
    onChange: (event) => setAnswer(field.path, event.target.value),
  }
  if (field.type === 'textarea') {
    return (
      <label key={field.path} className="foundation-field foundation-field-wide">
        <span>{field.label}</span>
        <textarea {...shared} rows={4} />
        {field.hint ? <small>{field.hint}</small> : null}
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label key={field.path} className="foundation-field">
        <span>{field.label}</span>
        <select {...shared}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {field.hint ? <small>{field.hint}</small> : null}
      </label>
    )
  }
  return (
    <label key={field.path} className="foundation-field">
      <span>{field.label}</span>
      <input
        {...shared}
        type={field.type || 'text'}
        step={field.step}
        min={field.min}
        max={field.max}
      />
      {field.hint ? <small>{field.hint}</small> : null}
    </label>
  )
}

export default function FoundationIntake({ auth }) {
  const previewUrls = useRef([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [prefillEmail, setPrefillEmail] = useState(auth.workspace.email || '')
  const [catalog, setCatalog] = useState({})
  const [photos, setPhotos] = useState({})
  const [answers, setAnswers] = useState(emptyAnswers(auth.workspace.full_name || ''))
  const [currentStepKey, setCurrentStepKey] = useState(() => window.localStorage.getItem(STEP_MEMORY_KEY) || 'identity')
  const [submitIssues, setSubmitIssues] = useState([])

  const sex = answers.identity?.sex || ''
  const visibleSteps = useMemo(
    () => STEP_DEFS.filter(([key]) => key !== 'sex_specific' || sex !== 'other'),
    [sex],
  )
  const currentIndex = Math.max(0, visibleSteps.findIndex(([key]) => key === currentStepKey))
  const currentStep = visibleSteps[currentIndex] || visibleSteps[0]

  useEffect(() => {
    setAccessToken(auth.session.access_token)
    setLoadFailed(false)
    let active = true
    ;(async () => {
      try {
        const payload = await clientApi.getFoundationIntake()
        const merged = mergePrefill(payload.prefill, payload.answers)
        const hydratedPhotos = await hydratePhotoSlots(payload.photos)
        if (!active) return
        updateUrls(previewUrls, hydratedPhotos)
        setAnswers(merged)
        setPrefillEmail(payload.prefill?.email || auth.workspace.email || '')
        setCatalog(payload.catalog || {})
        setPhotos(hydratedPhotos)
        setLoadFailed(false)
        const remembered = window.localStorage.getItem(STEP_MEMORY_KEY)
        const stepKeys = STEP_DEFS.map(([key]) => key)
        setCurrentStepKey(stepKeys.includes(remembered) ? remembered : 'identity')
      } catch (requestError) {
        if (!active) return
        setLoadFailed(true)
        setError(requestError.message || 'Could not load your foundation form.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrls.current = []
      setAccessToken(null)
    }
  }, [auth.session.access_token, auth.workspace.email, auth.workspace.full_name])

  useEffect(() => {
    if (!visibleSteps.some(([key]) => key === currentStepKey)) {
      setCurrentStepKey('photos')
    }
  }, [currentStepKey, visibleSteps])

  useEffect(() => {
    if (currentStepKey) window.localStorage.setItem(STEP_MEMORY_KEY, currentStepKey)
  }, [currentStepKey])

  const setAnswer = (path, nextValue) => {
    setSaveMessage('')
    setSubmitIssues([])
    setAnswers((current) => setAtPath(current, path, nextValue))
  }

  const saveDraft = async (nextAnswers = answers, message = 'Draft saved. You can continue later.') => {
    setSaving(true)
    setError('')
    try {
      const payload = await clientApi.saveFoundationDraft(normalizeAnswers(nextAnswers))
      setAnswers(mergePrefill(payload.prefill, payload.answers))
      if (payload.catalog) setCatalog(payload.catalog)
      setSaveMessage(message)
      return payload
    } catch (requestError) {
      setError(requestError.message || 'Could not save your draft.')
      throw requestError
    } finally {
      setSaving(false)
    }
  }

  const handleNext = async () => {
    const nextStep = visibleSteps[currentIndex + 1]
    if (!nextStep) return
    await saveDraft(answers, 'Progress saved.')
    setCurrentStepKey(nextStep[0])
  }

  const handleBack = () => {
    const previous = visibleSteps[currentIndex - 1]
    if (previous) setCurrentStepKey(previous[0])
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    setSubmitIssues([])
    try {
      await clientApi.submitFoundationIntake(normalizeAnswers(answers), WAIVER_VERSION)
      window.localStorage.removeItem(STEP_MEMORY_KEY)
      await auth.refreshWorkspace()
    } catch (requestError) {
      setError(requestError.message || 'Could not submit your foundation form.')
      const issues = groupValidationIssues(requestError)
      setSubmitIssues(issues)
      const firstKey = issues[0]?.key
      if (firstKey) setCurrentStepKey(firstKey)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePhotoUpload = async (view, file) => {
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const saved = await clientApi.uploadPhoto(file, view, todayLocal(), photos[view]?.id)
      setPhotos((current) => {
        const next = {
          ...current,
          [view]: {
            ...saved,
            preview_url: URL.createObjectURL(file),
          },
        }
        updateUrls(previewUrls, next)
        return next
      })
      setSaveMessage(`${PHOTO_LABELS[view]} photo uploaded.`)
    } catch (requestError) {
      setError(requestError.message || `Could not upload the ${PHOTO_LABELS[view].toLowerCase()} photo.`)
    } finally {
      setSaving(false)
    }
  }

  const bodyFatOptions = bodyFatChoices(sex)
  const actions = (
    <>
      <button type="button" className="foundation-secondary-button" onClick={auth.signOut}>Sign out</button>
      <button type="button" className="foundation-secondary-button" onClick={() => saveDraft()} disabled={saving || submitting}>
        {saving ? 'Saving…' : 'Save draft'}
      </button>
      {currentIndex > 0 ? <button type="button" className="foundation-secondary-button" onClick={handleBack}>Back</button> : null}
      {currentStep?.[0] === 'waiver'
        ? <button type="button" className="lime-button foundation-submit-button" onClick={handleSubmit} disabled={saving || submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
        : <button type="button" className="lime-button foundation-submit-button" onClick={handleNext} disabled={saving || submitting}>{saving ? 'Saving…' : 'Next'}</button>}
    </>
  )

  if (loading) {
    return <main className="auth-shell"><section className="auth-card"><span className="loading-dot" /><strong>Loading your foundation form…</strong></section></main>
  }

  if (loadFailed) {
    return <main className="auth-shell"><section className="auth-card"><h1>Foundation form unavailable.</h1><p>{error}</p><button className="lime-button" onClick={auth.signOut}>Sign out</button></section></main>
  }

  return (
    <main className="foundation-shell">
      <section className="foundation-frame">
        <header className="foundation-header">
          <div>
            <p className="kicker">CLIENT FOUNDATION</p>
            <h1>Foundation form</h1>
            <p>Complete this before opening the rest of your client portal.</p>
          </div>
          <button type="button" className="foundation-secondary-button" onClick={auth.signOut}>Sign out</button>
        </header>

        <div className="foundation-banner" role="note">{FOOTER_COPY}</div>

        <ol className="foundation-stepper" aria-label="Foundation form steps">
          {visibleSteps.map(([key, title], index) => (
            <li key={key} className={key === currentStep?.[0] ? 'current' : index < currentIndex ? 'done' : ''}>
              <span>{index + 1}</span>
              <strong>{title}</strong>
            </li>
          ))}
        </ol>

        {saveMessage ? <p className="foundation-status" role="status">{saveMessage}</p> : null}
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        {submitIssues.length ? (
          <section className="foundation-issues panel">
            <header><div><strong>Missing information</strong><span>Submit checks all required fields across the full wizard.</span></div></header>
            <div className="foundation-issues-body">
              {submitIssues.map((issue) => (
                <div key={issue.key}>
                  <strong>{issue.title}</strong>
                  <ul>
                    {issue.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {currentStep?.[0] === 'identity' ? (
          <WizardStep title="You" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Tell us how to identify and contact you." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {renderField(IDENTITY_FIELDS[0], answers, setAnswer)}
              <label className="foundation-field">
                <span>Email</span>
                <input value={prefillEmail} readOnly />
              </label>
              {IDENTITY_FIELDS.slice(1).map((field) => renderField(field, answers, setAnswer))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'body' ? (
          <WizardStep title="Body" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Body context for coaching support only." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {BODY_FIELDS.map((field) => renderField(field, answers, setAnswer))}
            </div>
            <section className="foundation-bodyfat panel">
              <header>
                <div>
                  <strong>Visual body-fat reference</strong>
                  <span>Choose a visual band only. Do not enter a calculated percentage.</span>
                </div>
              </header>
              <div className="foundation-bodyfat-content">
                <img src={bodyFatReference} alt="Visual body-fat band reference for foundation intake" />
                <fieldset className="foundation-radio-group">
                  <legend>Visual body-fat band</legend>
                  <div className="foundation-choice-grid">
                    {bodyFatOptions.map((option) => (
                      <label key={option.value} className="foundation-check foundation-radio-card">
                        <input
                          type="radio"
                          name="body.visual_body_fat"
                          checked={answers.body.visual_body_fat === option.value}
                          onChange={() => setAnswer('body.visual_body_fat', option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </section>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'logistics' ? (
          <WizardStep title="Food & training logistics" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Set the practical constraints your coach needs." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {LOGISTICS_FIELDS.map((field) => renderField(field, answers, setAnswer))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'eating_pattern' ? (
          <WizardStep title="Eating pattern" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Share your current meal times and what you usually eat." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-slot-list">
              {EATING_SLOTS.map(([slotKey, label, required]) => (
                <section key={slotKey} className="panel foundation-slot-card">
                  <header>
                    <div>
                      <strong>{label}</strong>
                      <span>{required ? 'Foods required on submit.' : 'Optional snack slot.'}</span>
                    </div>
                  </header>
                  <div className="foundation-grid foundation-grid-tight">
                    <label className="foundation-field">
                      <span>Time</span>
                      <input
                        value={answers.eating_pattern?.[slotKey]?.time || ''}
                        onChange={(event) => setAnswer(`eating_pattern.${slotKey}.time`, event.target.value)}
                      />
                    </label>
                    <label className="foundation-field foundation-field-wide">
                      <span>Foods</span>
                      <textarea
                        rows={3}
                        value={answers.eating_pattern?.[slotKey]?.foods || ''}
                        onChange={(event) => setAnswer(`eating_pattern.${slotKey}.foods`, event.target.value)}
                      />
                    </label>
                  </div>
                </section>
              ))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'training' ? (
          <WizardStep title="Training" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Training history, equipment, and self-ratings." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {TRAINING_FIELDS.map((field) => renderField(field, answers, setAnswer))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'safety' ? (
          <WizardStep title="Safety" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="This is coaching context only and does not block submission." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {SAFETY_FIELDS.map((field) => renderField(field, answers, setAnswer))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'lifestyle' ? (
          <WizardStep title="Lifestyle & goals" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Daily life, motivation, recovery, and behavior patterns." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-grid">
              {LIFESTYLE_FIELDS.map((field) => renderField(field, answers, setAnswer))}
            </div>
            <div className="foundation-multi-grid">
              <MultiSelectField
                label="Craving times"
                options={CRAVING_TIME_OPTIONS}
                values={answers.lifestyle.craving_times || []}
                onToggle={(item) => setAnswer('lifestyle.craving_times', toggleExclusive(answers.lifestyle.craving_times || [], item, 'rarely_no_specific_time'))}
              />
              <MultiSelectField
                label="Work environment"
                options={WORK_ENVIRONMENT_OPTIONS}
                values={answers.lifestyle.work_environment || []}
                onToggle={(item) => {
                  const current = answers.lifestyle.work_environment || []
                  setAnswer('lifestyle.work_environment', current.includes(item) ? current.filter((value) => value !== item) : [...current, item])
                }}
              />
              <MultiSelectField
                label="Diet styles"
                options={DIET_STYLE_OPTIONS}
                values={answers.lifestyle.diet_styles || []}
                onToggle={(item) => {
                  const current = answers.lifestyle.diet_styles || []
                  setAnswer('lifestyle.diet_styles', current.includes(item) ? current.filter((value) => value !== item) : [...current, item])
                }}
              />
              <MultiSelectField
                label="Willing to change"
                options={CHANGE_OPTIONS}
                values={answers.lifestyle.willing_to_change || []}
                onToggle={(item) => setAnswer('lifestyle.willing_to_change', toggleExclusive(answers.lifestyle.willing_to_change || [], item, 'none'))}
              />
              <MultiSelectField
                label="Food cravings"
                options={FOOD_CRAVING_OPTIONS}
                values={answers.lifestyle.food_cravings_list || []}
                onToggle={(item) => setAnswer('lifestyle.food_cravings_list', toggleExclusive(answers.lifestyle.food_cravings_list || [], item, 'none'))}
              />
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'checklists' ? (
          <WizardStep title="Context checklists" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Select none or all items that fit within each group." footer={FOOTER_COPY} actions={actions}>
            <div className="foundation-checklist-list">
              {Object.entries(catalog).filter(([groupKey]) => (
                !((sex !== 'male' && groupKey === 'male_urology') || (sex !== 'female' && groupKey === 'female_cycle_symptoms'))
              )).map(([groupKey, options]) => (
                <details key={groupKey} className="panel foundation-checklist-panel">
                  <summary>
                    <span>{groupKey.replace(/_/g, ' ')}</span>
                    <strong>{(answers.checklists[groupKey] || []).length || 0} selected</strong>
                  </summary>
                  <div className="foundation-checklist-options">
                    {options.map((option) => (
                      <label key={option.id} className="foundation-check">
                        <input
                          type="checkbox"
                          checked={(answers.checklists[groupKey] || []).includes(option.id)}
                          onChange={() => setAnswer(`checklists.${groupKey}`, toggleExclusive(answers.checklists[groupKey] || [], option.id, 'none'))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'sex_specific' ? (
          <WizardStep title="Sex-specific" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary={sex === 'female' ? 'Female-specific coaching context.' : 'Male-specific coaching context.'} footer={FOOTER_COPY} actions={actions}>
            {sex === 'female' ? (
              <div className="foundation-grid">
                <label className="foundation-field">
                  <span>Pregnant</span>
                  <select value={answers.sex_specific.pregnant || ''} onChange={(event) => setAnswer('sex_specific.pregnant', event.target.value)}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="unsure">Unsure</option>
                  </select>
                </label>
                <label className="foundation-field">
                  <span>Birth control</span>
                  <textarea rows={3} value={answers.sex_specific.birth_control || ''} onChange={(event) => setAnswer('sex_specific.birth_control', event.target.value)} />
                </label>
                <label className="foundation-field">
                  <span>Last cycle start</span>
                  <input type="date" value={answers.sex_specific.last_cycle_start || ''} disabled={Boolean(answers.sex_specific.last_cycle_unknown)} onChange={(event) => setAnswer('sex_specific.last_cycle_start', event.target.value)} />
                </label>
                <label className="foundation-check foundation-inline-check">
                  <input type="checkbox" checked={Boolean(answers.sex_specific.last_cycle_unknown)} onChange={(event) => {
                    setAnswer('sex_specific.last_cycle_unknown', event.target.checked)
                    if (event.target.checked) setAnswer('sex_specific.last_cycle_start', '')
                  }} />
                  <span>I do not know my last cycle start</span>
                </label>
                <label className="foundation-field foundation-field-wide">
                  <span>Cycle energy drops</span>
                  <textarea rows={3} value={answers.sex_specific.cycle_energy_drops || ''} onChange={(event) => setAnswer('sex_specific.cycle_energy_drops', event.target.value)} />
                </label>
                <label className="foundation-field foundation-field-wide">
                  <span>Are your periods regular?</span>
                  <textarea rows={3} value={answers.sex_specific.periods_regular || ''} onChange={(event) => setAnswer('sex_specific.periods_regular', event.target.value)} />
                </label>
                <label className="foundation-field foundation-field-wide">
                  <span>Perimenopause</span>
                  <textarea rows={3} value={answers.sex_specific.perimenopause || ''} onChange={(event) => setAnswer('sex_specific.perimenopause', event.target.value)} />
                </label>
              </div>
            ) : (
              <div className="foundation-grid">
                <label className="foundation-field foundation-field-wide">
                  <span>Drive in a calorie deficit</span>
                  <textarea rows={3} value={answers.sex_specific.deficit_drive || ''} onChange={(event) => setAnswer('sex_specific.deficit_drive', event.target.value)} />
                </label>
                <label className="foundation-field foundation-field-wide">
                  <span>TRT or hormone use</span>
                  <textarea rows={3} value={answers.sex_specific.trt_or_hormones || ''} onChange={(event) => setAnswer('sex_specific.trt_or_hormones', event.target.value)} />
                </label>
                <label className="foundation-field foundation-field-wide">
                  <span>Testosterone tested in the last year</span>
                  <textarea rows={3} value={answers.sex_specific.testosterone_tested_last_year || ''} onChange={(event) => setAnswer('sex_specific.testosterone_tested_last_year', event.target.value)} />
                </label>
              </div>
            )}
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'photos' ? (
          <WizardStep title="Baseline photos" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Upload each required pose privately through the portal." footer={FOOTER_COPY} actions={actions}>
            <p className="foundation-helper-copy">Use shirtless or sports-bra photos, avoid mirror selfies, keep the camera at eye level, and use a plain background.</p>
            <div className="foundation-photo-grid">
              {PHOTO_ORDER.map((view) => (
                <section key={view} className="panel foundation-photo-card">
                  <header>
                    <div>
                      <strong>{PHOTO_LABELS[view]}</strong>
                      <span>{photos[view] ? 'Uploaded' : 'Required on submit'}</span>
                    </div>
                  </header>
                  <div className="foundation-photo-body">
                    {photos[view]?.preview_url
                      ? <img src={photos[view].preview_url} alt={`${PHOTO_LABELS[view]} preview`} />
                      : <div className="foundation-photo-placeholder">No photo uploaded yet.</div>}
                    <label className="photo-upload foundation-photo-upload">
                      <span>{photos[view] ? 'Replace photo' : 'Upload photo'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => handlePhotoUpload(view, event.target.files?.[0])}
                      />
                    </label>
                  </div>
                </section>
              ))}
            </div>
          </WizardStep>
        ) : null}

        {currentStep?.[0] === 'waiver' ? (
          <WizardStep title="Waiver" stepLabel={`Step ${currentIndex + 1} of ${visibleSteps.length}`} summary="Read the waiver, then confirm agreement before submitting." footer={FOOTER_COPY} actions={actions}>
            <section className="panel foundation-waiver-panel">
              <header>
                <div>
                  <strong>Waiver text</strong>
                  <span>Scroll and review the full text below.</span>
                </div>
              </header>
              <div className="foundation-waiver-copy">
                {WAIVER_TEXT.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
            <section className="panel foundation-waiver-panel">
              <header>
                <div>
                  <strong>DO YOU AGREE TO THE TERMS OF THIS WAIVER AND FULLY ACCEPT RESPONSIBILITY FOR YOUR PARTICIPATION?</strong>
                  <span>Submission requires a Yes.</span>
                </div>
              </header>
              <label className="foundation-check foundation-inline-check foundation-waiver-check">
                <input
                  type="checkbox"
                  checked={Boolean(answers.waiver.accepted)}
                  onChange={(event) => setAnswer('waiver.accepted', event.target.checked)}
                />
                <span>I agree</span>
              </label>
            </section>
          </WizardStep>
        ) : null}
      </section>
    </main>
  )
}
