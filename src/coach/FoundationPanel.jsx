import { useEffect, useRef, useState } from 'react'
import { coachApi } from '../api/coach'

const PHOTO_ORDER = ['front', 'back', 'side', 'front_double_bicep', 'back_double_bicep']
const PHOTO_LABELS = {
  front: 'Front',
  back: 'Back',
  side: 'Side',
  front_double_bicep: 'Front double bicep',
  back_double_bicep: 'Back double bicep',
}

const SEX_OPTIONS = optionMap([
  ['male', 'Male'],
  ['female', 'Female'],
  ['other', 'Other'],
])
const YES_NO_OPTIONS = optionMap([
  ['yes', 'Yes'],
  ['no', 'No'],
])
const FOOD_PREFERENCE_OPTIONS = optionMap([
  ['vegetarian', 'Vegetarian'],
  ['eggetarian_outside', 'Eggetarian outside'],
  ['vegan', 'Vegan'],
  ['nonveg_outside', 'Non-veg outside'],
  ['nonveg_home_and_outside', 'Non-veg home and outside'],
  ['eggetarian_home_and_outside', 'Eggetarian home and outside'],
])
const TRAINING_LOCATION_OPTIONS = optionMap([
  ['gym', 'Gym'],
  ['home_no_dumbbells', 'Home, no dumbbells'],
  ['home_dumbbells', 'Home with dumbbells'],
  ['home_dumbbells_no_bench', 'Home with dumbbells, no bench'],
  ['home_dumbbells_bands', 'Home with dumbbells and bands'],
])
const RAW_COOKED_OPTIONS = optionMap([
  ['raw', 'Raw'],
  ['cooked', 'Cooked'],
])
const TRAINING_DAYS_OPTIONS = optionMap([
  ['1_3', '3 days'],
  ['1_4', '4 days'],
  ['1_5', '5 days'],
  ['1_6', '6 days'],
])
const TRACKING_OPTIONS = optionMap([
  ['pen_paper', 'Pen and paper'],
  ['notes_app', 'Notes app'],
  ['hevy_strong', 'Hevy / Strong'],
  ['mental', 'Mentally'],
  ['none', 'I do not track'],
])
const EXERCISE_LEVEL_OPTIONS = optionMap([
  ['none', 'None'],
  ['light', 'Light'],
  ['moderate', 'Moderate'],
  ['hard', 'Hard'],
  ['extreme', 'Extreme'],
])
const WEEKLY_HOURS_OPTIONS = optionMap([
  ['under_3', 'Under 3 hours'],
  ['3_6', '3 to 6 hours'],
  ['6_10', '6 to 10 hours'],
  ['over_10', 'Over 10 hours'],
])
const TRANSPORT_OPTIONS = optionMap([
  ['vehicle', 'Vehicle'],
  ['walking', 'Walking'],
  ['jogging', 'Jogging'],
  ['bicycle', 'Bicycle'],
])
const SITTING_HOURS_OPTIONS = optionMap([
  ['under_8', 'Under 8 hours'],
  ['8_12', '8 to 12 hours'],
  ['12_18', '12 to 18 hours'],
  ['over_18', 'Over 18 hours'],
])
const SLEEP_HOURS_OPTIONS = optionMap([
  ['under_6', 'Under 6 hours'],
  ['6_7', '6 to 7 hours'],
  ['7_8', '7 to 8 hours'],
  ['over_8', 'Over 8 hours'],
])
const LIFESTYLE_ACTIVITY_OPTIONS = optionMap([
  ['sedentary', 'Sedentary'],
  ['light', 'Light'],
  ['moderate', 'Moderate'],
  ['active', 'Active'],
  ['very_active', 'Very active'],
])
const WATER_OPTIONS = optionMap([
  ['under_1l', 'Under 1L'],
  ['1_3l', '1 to 3L'],
  ['3_5l', '3 to 5L'],
  ['over_5l', 'Over 5L'],
])
const BODY_FEELING_OPTIONS = optionMap([
  ['totally_unhappy', 'Totally unhappy'],
  ['very_unhappy', 'Very unhappy'],
  ['moderately_unhappy', 'Moderately unhappy'],
  ['slightly_unhappy', 'Slightly unhappy'],
  ['neutral', 'Neutral'],
  ['slightly_happy', 'Slightly happy'],
  ['moderately_happy', 'Moderately happy'],
  ['very_happy', 'Very happy'],
  ['totally_happy', 'Totally happy'],
])
const SKIN_OPTIONS = optionMap([
  ['very_dry', 'Very dry'],
  ['oily', 'Oily'],
  ['dry', 'Dry'],
  ['combination', 'Combination'],
  ['normal', 'Normal'],
])
const CRAVING_TIME_OPTIONS = optionMap([
  ['mid_morning', 'Mid-morning'],
  ['late_afternoon_tea_time', 'Late afternoon / Tea time'],
  ['immediately_after_lunch_or_dinner', 'Immediately after lunch or dinner'],
  ['late_night_before_bed', 'Late night / Before bed'],
  ['during_high_stress_hours_at_work', 'During high-stress hours at work'],
  ['around_my_menstrual_cycle', 'Around my menstrual cycle'],
  ['rarely_no_specific_time', 'Rarely / No specific time'],
])
const WORK_ENVIRONMENT_OPTIONS = optionMap([
  ['desk_job_with_prolonged_sitting', 'Desk job with prolonged sitting'],
  ['hybrid_work', 'Hybrid work'],
  ['night_shift_rotational_shift_work', 'Night shift / Rotational shift work'],
  ['frequent_work_related_travel', 'Frequent work-related travel'],
  ['high_physical_activity_on_job', 'High physical activity on job'],
  ['frequent_long_driving_commute_hours', 'Frequent long driving / commute hours'],
  ['irregular_sleep_schedule_due_to_work_family_obligations', 'Irregular sleep schedule due to work/family obligations'],
])
const DIET_STYLE_OPTIONS = optionMap([
  ['low_fat', 'Low fat'],
  ['low_carb', 'Low carb'],
  ['low_sugar', 'Low sugar'],
  ['gluten_free', 'Gluten free'],
  ['dairy_free', 'Dairy free'],
  ['vegetarian', 'Vegetarian'],
  ['no_wheat', 'No wheat'],
  ['high_protein', 'High protein'],
  ['vegan', 'Vegan'],
  ['low_sodium', 'Low sodium'],
  ['diabetic', 'Diabetic'],
  ['other', 'Other'],
])
const CHANGE_OPTIONS = optionMap([
  ['none', 'None'],
  ['significantly_modify_your_diet', 'Significantly modify your diet'],
  ['take_nutritional_supplements_each_day', 'Take nutritional supplements each day'],
  ['keep_a_record_of_everything_you_eat_each_day', 'Keep a record of everything you eat each day'],
  ['modify_your_lifestyle', 'Modify your lifestyle'],
  ['practice_relaxation_techniques', 'Practice relaxation techniques'],
  ['engage_in_regular_exercise_physical_activity', 'Engage in regular exercise / physical activity'],
  ['have_periodic_lab_tests_to_assess_your_progress', 'Have periodic lab tests to assess your progress'],
])
const FOOD_CRAVING_OPTIONS = optionMap([
  ['none', 'None'],
  ['sugar', 'Sugar'],
  ['chocolate', 'Chocolate'],
  ['meats_fish', 'Meats / Fish'],
  ['fried_food', 'Fried food'],
  ['fat', 'Fat'],
  ['alcohol', 'Alcohol'],
  ['desserts', 'Desserts'],
  ['milk', 'Milk'],
  ['bread', 'Bread'],
])
const BODY_FAT_OPTIONS = optionMap([
  ['m_6_9', 'Male 6-9'],
  ['m_10_14', 'Male 10-14'],
  ['m_15_19', 'Male 15-19'],
  ['m_20_24', 'Male 20-24'],
  ['m_25_29', 'Male 25-29'],
  ['m_30_plus', 'Male 30+'],
  ['f_12_16', 'Female 12-16'],
  ['f_17_21', 'Female 17-21'],
  ['f_22_26', 'Female 22-26'],
  ['f_27_31', 'Female 27-31'],
  ['f_32_36', 'Female 32-36'],
  ['f_37_plus', 'Female 37+'],
])

const FIELD_SECTIONS = [
  {
    key: 'identity',
    title: 'You',
    fields: [
      field('identity.full_name', 'Full name'),
      field('identity.date_of_birth', 'Date of birth'),
      field('identity.sex', 'Sex', SEX_OPTIONS),
      field('identity.mobile', 'Mobile'),
      field('identity.place_of_living', 'Place of living'),
      field('identity.profession', 'Profession'),
    ],
  },
  {
    key: 'body',
    title: 'Body',
    fields: [
      field('body.morning_weight_kg', 'Morning dry weight (kg)'),
      field('body.height_cm', 'Height (cm)'),
      field('body.waist_cm', 'Waist just above navel (cm)'),
      field('body.visual_body_fat', 'Visual body fat', BODY_FAT_OPTIONS),
      field('body.desired_weight_kg', 'Desired weight (kg)'),
    ],
  },
  {
    key: 'logistics',
    title: 'Food & training logistics',
    fields: [
      field('logistics.knows_food_logging', 'Do you know food logging?', YES_NO_OPTIONS),
      field('logistics.knows_food_scale', 'Do you know how to use a food scale?', YES_NO_OPTIONS),
      field('logistics.food_preference', 'Food preference', FOOD_PREFERENCE_OPTIONS),
      field('logistics.training_location', 'Training location', TRAINING_LOCATION_OPTIONS),
      field('logistics.ingredient_quantity', 'Ingredient quantity', RAW_COOKED_OPTIONS),
      field('logistics.training_days', 'Training days per week', TRAINING_DAYS_OPTIONS),
      field('logistics.meals_per_day', 'Meals per day'),
      field('logistics.veg_days_separate', 'Keep veg days separate?', YES_NO_OPTIONS),
      field('logistics.disliked_foods', 'Disliked foods'),
      field('logistics.who_cooks', 'Who cooks?'),
      field('logistics.supplement_budget_monthly', 'Supplement budget per month'),
      field('logistics.workout_time', 'Preferred workout time'),
    ],
  },
  {
    key: 'training',
    title: 'Training',
    fields: [
      field('training.strength_lifts', 'Strength lifts'),
      field('training.equipment', 'Equipment you can use'),
      field('training.dumbbell_increments', 'Dumbbell increments'),
      field('training.refused_exercises', 'Exercises you refuse'),
      field('training.exercise_history', 'Exercise history'),
      field('training.current_program', 'Current program'),
      field('training.tracks_workouts', 'How do you track workouts?', TRACKING_OPTIONS),
      field('training.joint_flareups', 'Joint flare-ups'),
      field('training.post_workout_routine', 'Post-workout routine'),
      field('training.hobbies_sports', 'Hobbies or sports'),
      field('training.strong_weak_groups', 'Strong and weak muscle groups'),
      field('training.exercise_familiarity', 'Exercise familiarity'),
      field('training.ped_steroids', 'PED / steroid context'),
      field('training.muscular_capacity', 'Muscular capacity'),
      field('training.athletic_ability', 'Athletic ability'),
      field('training.flexibility', 'Flexibility'),
      field('training.cardio_ability', 'Cardio ability'),
      field('training.exercise_level', 'Current exercise level', EXERCISE_LEVEL_OPTIONS),
      field('training.weekly_exercise_hours', 'Weekly exercise hours', WEEKLY_HOURS_OPTIONS),
      field('training.dedication_1_to_10', 'Dedication (1-10)'),
      field('training.transport', 'Transport', TRANSPORT_OPTIONS),
      field('training.sitting_hours', 'Sitting hours', SITTING_HOURS_OPTIONS),
    ],
  },
  {
    key: 'safety',
    title: 'Safety',
    fields: [
      field('safety.family_cardiac_or_untrained_age', 'Family cardiac or untrained age context'),
      field('safety.hospitalized_recently', 'Hospitalized recently'),
      field('safety.major_surgery_injuries_illness', 'Major surgery, injuries, or illness'),
      field('safety.other_health_concerns', 'Other health concerns'),
      field('safety.recent_labs_note', 'Recent labs note'),
      field('safety.food_allergies', 'Food allergies'),
      field('safety.limits_on_activity', 'Limits on activity'),
      field('safety.bone_density_over_50', 'Bone density over 50'),
      field('safety.physician_said_no_exercise', 'Has a physician told you not to exercise?'),
      field('safety.ortho_surgeries', 'Orthopedic surgeries'),
      field('safety.imaging_mri_xray', 'Imaging, MRI, or X-ray context'),
      field('safety.prescription_medication', 'Prescription medication'),
      field('safety.psych_meds_or_insulin_etc', 'Psych meds, insulin, thyroid meds, blood thinners, etc.'),
      field('safety.blood_pressure_reading', 'Blood pressure reading'),
      field('safety.resting_heart_rate', 'Resting heart rate'),
      field('safety.snore_or_unrefreshed', 'Snore or wake unrefreshed'),
      field('safety.bowel_movements', 'Bowel movements'),
      field('safety.current_supplements', 'Current supplements'),
      field('safety.fat_burner_history', 'Fat-burner history'),
    ],
  },
  {
    key: 'lifestyle',
    title: 'Lifestyle & goals',
    fields: [
      field('lifestyle.job_and_commute', 'Job and commute'),
      field('lifestyle.relationship_status', 'Relationship status'),
      field('lifestyle.motivation_when_low', 'What keeps you going when motivation is low?'),
      field('lifestyle.prior_bodycomp_attempts', 'Prior body-composition attempts'),
      field('lifestyle.why_this_matters', 'Why does this matter to you?'),
      field('lifestyle.photoshoot_gift', 'Photoshoot or gift idea'),
      field('lifestyle.life_events', 'Life events affecting progress'),
      field('lifestyle.disordered_eating', 'Disordered eating context'),
      field('lifestyle.body_feeling', 'How do you feel about your body now?', BODY_FEELING_OPTIONS),
      field('lifestyle.nightmares', 'Nightmares'),
      field('lifestyle.non_scale_victory', 'Most meaningful non-scale victory'),
      field('lifestyle.caloric_drinks', 'Caloric drinks'),
      field('lifestyle.delivery_or_eat_out', 'Delivery or eating out'),
      field('lifestyle.must_have_foods', 'Must-have foods'),
      field('lifestyle.religious_fasting', 'Religious fasting'),
      field('lifestyle.work_shift_pattern', 'Work shift pattern'),
      field('lifestyle.hours_to_first_meal', 'Hours to first meal'),
      field('lifestyle.weekend_vs_weekday', 'Weekend vs weekday routine'),
      field('lifestyle.stopped_previous_programs', 'Why did previous programs stop?'),
      field('lifestyle.craving_triggers', 'Craving triggers'),
      field('lifestyle.one_year_vision', 'One-year vision'),
      field('lifestyle.priority_goals', 'Priority goals'),
      field('lifestyle.what_kept_you', 'What kept you from starting sooner?'),
      field('lifestyle.religious_cultural_diet', 'Religious or cultural diet notes'),
      field('lifestyle.sleep_quality_1_to_10', 'Sleep quality (1-10)'),
      field('lifestyle.sleep_notes', 'Sleep notes'),
      field('lifestyle.weekday_sleep_hours', 'Weekday sleep hours', SLEEP_HOURS_OPTIONS),
      field('lifestyle.weekend_sleep_hours', 'Weekend sleep hours', SLEEP_HOURS_OPTIONS),
      field('lifestyle.energy_1_to_10', 'Energy (1-10)'),
      field('lifestyle.energy_notes', 'Energy notes'),
      field('lifestyle.libido_energy', 'Libido and energy'),
      field('lifestyle.fat_storage_areas', 'Where do you store fat most easily?'),
      field('lifestyle.days_you_will_not_show_up', 'Days you feel least likely to show up'),
      field('lifestyle.excuses_and_plan', 'Excuses you use and your plan for them'),
      field('lifestyle.burnout_or_anxiety', 'Burnout or anxiety'),
      field('lifestyle.mental_health_diagnosis', 'Mental health diagnosis'),
      field('lifestyle.success_definition', 'What does success mean to you?'),
      field('lifestyle.family_support', 'Family support'),
      field('lifestyle.people_who_discourage', 'People who discourage you'),
      field('lifestyle.work_stress_limits', 'How does work stress limit you?'),
      field('lifestyle.smoking', 'Smoking'),
      field('lifestyle.alcohol', 'Alcohol'),
      field('lifestyle.online_training_history', 'Online training history'),
      field('lifestyle.three_habit_changes', 'Three habit changes you are willing to make'),
      field('lifestyle.craving_times', 'Craving times', CRAVING_TIME_OPTIONS),
      field('lifestyle.work_environment', 'Work environment', WORK_ENVIRONMENT_OPTIONS),
      field('lifestyle.lifestyle_activity', 'Lifestyle activity', LIFESTYLE_ACTIVITY_OPTIONS),
      field('lifestyle.water_intake', 'Water intake', WATER_OPTIONS),
      field('lifestyle.diet_styles', 'Diet styles', DIET_STYLE_OPTIONS),
      field('lifestyle.willing_to_change', 'Willing to change', CHANGE_OPTIONS),
      field('lifestyle.skin_without_lotion', 'Skin without lotion', SKIN_OPTIONS),
      field('lifestyle.food_cravings_list', 'Food cravings', FOOD_CRAVING_OPTIONS),
      field('lifestyle.milestone_celebration', 'Milestone celebration'),
      field('lifestyle.anything_else', 'Anything else?'),
    ],
  },
]

const EATING_SLOTS = [
  ['breakfast', 'Breakfast'],
  ['mid_morning', 'Mid-morning'],
  ['lunch', 'Lunch'],
  ['evening', 'Evening'],
  ['dinner', 'Dinner'],
  ['late_night', 'Late night'],
]

const SEX_SPECIFIC_FIELDS = {
  male: [
    field('sex_specific.deficit_drive', 'Drive in a calorie deficit'),
    field('sex_specific.trt_or_hormones', 'TRT or hormone use'),
    field('sex_specific.testosterone_tested_last_year', 'Testosterone tested in the last year'),
  ],
  female: [
    field('sex_specific.pregnant', 'Pregnant', optionMap([['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']])),
    field('sex_specific.birth_control', 'Birth control'),
    field('sex_specific.last_cycle_start', 'Last cycle start'),
    field('sex_specific.last_cycle_unknown', 'Last cycle unknown'),
    field('sex_specific.cycle_energy_drops', 'Cycle energy drops'),
    field('sex_specific.periods_regular', 'Periods regular'),
    field('sex_specific.perimenopause', 'Perimenopause'),
  ],
  other: [
    field('sex_specific.note', 'Sex-specific note'),
  ],
}

function optionMap(entries) {
  return Object.fromEntries(entries)
}

function field(path, label, options = null) {
  return { path, label, options }
}

function getAtPath(value, path) {
  return path.split('.').reduce((current, key) => (current == null ? current : current[key]), value)
}

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

function titleize(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function hasMeaningfulValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function formatFieldValue(fieldDef, answers) {
  const value = getAtPath(answers, fieldDef.path)
  if (!hasMeaningfulValue(value)) return null
  if (Array.isArray(value)) {
    return value
      .map((item) => fieldDef.options?.[item] || titleize(String(item)))
      .join(', ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (fieldDef.options) return fieldDef.options[value] || String(value)
  return String(value)
}

function renderFieldRows(fields, answers) {
  const rows = fields
    .map((fieldDef) => {
      const value = formatFieldValue(fieldDef, answers)
      return value ? { label: fieldDef.label, value } : null
    })
    .filter(Boolean)
  if (!rows.length) return null
  return <dl className="coach-detail-list">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
}

function renderEatingPattern(answers) {
  const rows = EATING_SLOTS.map(([key, label]) => {
    const slot = answers?.eating_pattern?.[key]
    if (!slot || (!hasMeaningfulValue(slot.time) && !hasMeaningfulValue(slot.foods))) return null
    const parts = []
    if (hasMeaningfulValue(slot.time)) parts.push(slot.time)
    if (hasMeaningfulValue(slot.foods)) parts.push(slot.foods)
    return { label, value: parts.join(' - ') }
  }).filter(Boolean)
  if (!rows.length) return null
  return <dl className="coach-detail-list">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
}

function checklistLabel(groupKey, itemId, catalog) {
  const option = catalog?.[groupKey]?.find((item) => item.id === itemId)
  if (option?.label) return option.label
  return titleize(itemId)
}

function renderChecklists(answers, catalog) {
  const groups = Object.entries(answers?.checklists || {})
    .filter(([, items]) => Array.isArray(items) && items.length)
    .map(([groupKey, items]) => ({
      label: titleize(groupKey),
      value: items.map((item) => checklistLabel(groupKey, item, catalog)).join(', '),
    }))
  if (!groups.length) return null
  return <dl className="coach-detail-list">{groups.map((group) => <div key={group.label}><dt>{group.label}</dt><dd>{group.value}</dd></div>)}</dl>
}

function renderSexSpecific(answers) {
  const sex = answers?.identity?.sex || 'other'
  return renderFieldRows(SEX_SPECIFIC_FIELDS[sex] || SEX_SPECIFIC_FIELDS.other, answers)
}

async function hydratePhotoSlots(slots, accessToken) {
  const next = {}
  for (const view of PHOTO_ORDER) {
    const photo = slots?.[view]
    if (!photo?.content_url) {
      next[view] = null
      continue
    }
    try {
      next[view] = {
        ...photo,
        preview_url: await coachApi.getPrivatePhotoUrl(photo.content_url, accessToken),
      }
    } catch {
      next[view] = null
    }
  }
  return next
}

function updateUrls(urlsRef, nextPhotos) {
  urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  urlsRef.current = Object.values(nextPhotos).map((photo) => photo?.preview_url).filter(Boolean)
}

export default function FoundationPanel({ clientId, accessToken, Status }) {
  const requestRef = useRef(0)
  const photoUrls = useRef([])
  const [payload, setPayload] = useState(null)
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => () => updateUrls(photoUrls, {}), [])

  useEffect(() => {
    if (!clientId) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const intake = await coachApi.getFoundationIntake(clientId, accessToken)
        const hydratedPhotos = await hydratePhotoSlots(intake.photos, accessToken)
        if (requestId !== requestRef.current) {
          updateUrls(photoUrls, hydratedPhotos)
          return
        }
        updateUrls(photoUrls, hydratedPhotos)
        setPhotos(hydratedPhotos)
        setPayload(intake)
      } catch (reason) {
        if (requestId === requestRef.current) {
          setPayload(null)
          setPhotos({})
          setError(reason.message || 'Could not load this foundation form.')
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    })()
  }, [accessToken, clientId])

  const answers = payload?.answers || {}
  const status = payload?.status || 'pending'

  return (
    <article className="panel coach-foundation-panel">
      <header>
        <div>
          <p className="kicker">FOUNDATION FORM</p>
          <h3>Foundation form</h3>
          <span>Read-only intake answers, baseline photos, and coaching flags.</span>
        </div>
        {loading ? <Status tone="preview">LOADING</Status> : <Status tone={status === 'submitted' ? 'good' : status === 'pending' ? 'warn' : 'preview'}>{status.replaceAll('_', ' ').toUpperCase()}</Status>}
      </header>

      {loading ? (
        <div className="coach-empty coach-foundation-empty">
          <strong>Loading foundation form…</strong>
          <span>Fetching the client&apos;s submitted intake and baseline photos.</span>
        </div>
      ) : error ? (
        <div className="coach-empty coach-foundation-empty">
          <strong>Foundation form unavailable</strong>
          <span>{error}</span>
        </div>
      ) : status === 'pending' ? (
        <div className="coach-foundation-copy">
          <p>Waiting for the client to finish intake.</p>
        </div>
      ) : status === 'not_required' ? (
        <div className="coach-foundation-copy">
          <p>No foundation form for this client.</p>
        </div>
      ) : (
        <>
          <div className="coach-foundation-summary">
            <div>
              <strong>Submitted</strong>
              <span>{formatDate(payload?.submitted_at) || 'Recorded'}</span>
            </div>
            <div>
              <strong>Waiver version</strong>
              <span>{payload?.waiver_version || '—'}</span>
            </div>
          </div>

          {payload?.attention_flags?.length ? (
            <div className="coach-foundation-flags">
              {payload.attention_flags.map((flag) => <Status key={flag} tone="warn">{flag}</Status>)}
            </div>
          ) : null}

          <section className="coach-foundation-sections">
            {FIELD_SECTIONS.map((section) => {
              const content = renderFieldRows(section.fields, answers)
              if (!content) return null
              return <section key={section.key}><h3>{section.title}</h3>{content}</section>
            })}

            {renderEatingPattern(answers) ? <section><h3>Eating pattern</h3>{renderEatingPattern(answers)}</section> : null}
            {renderChecklists(answers, payload?.catalog) ? <section><h3>Context checklists</h3>{renderChecklists(answers, payload?.catalog)}</section> : null}
            {renderSexSpecific(answers) ? <section><h3>Sex-specific</h3>{renderSexSpecific(answers)}</section> : null}

            <section>
              <h3>Baseline photos</h3>
              <div className="coach-photo-gallery coach-foundation-photos">
                {PHOTO_ORDER.map((view) => {
                  const photo = photos[view]
                  return (
                    <figure key={view}>
                      {photo?.preview_url
                        ? <img src={photo.preview_url} alt={`${PHOTO_LABELS[view]} foundation photo`} />
                        : <div className="coach-photo-unavailable"><span>No photo submitted.</span></div>}
                      <figcaption>
                        <strong>{PHOTO_LABELS[view]}</strong>
                        <span>{formatDate(photo?.captured_on) || '—'}</span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </section>
          </section>
        </>
      )}
    </article>
  )
}
