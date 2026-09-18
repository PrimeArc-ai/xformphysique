# Client Foundation Intake Design

Date: 2026-09-18
Status: Approved for planning (Option B + blocking gate)

## Goal

After a coach sends the existing onboarding invite and the client sets a password, the client completes the **XFormphysique Client Foundation Form** on the website. Answers, baseline photos, and the waiver live in the client workspace. The assigned coach reads them in-app. Google Form / PDF / WhatsApp are not part of this path.

## Locked decisions

From the 18 Sep 2026 product conversation:

- **Option B** — same coaching topics as the Google Form, not a pixel clone. Deduplicate repeated questions. Reuse profile, body entries, progress photos, and (when present) Health lab reports. Version the answer schema.
- **Blocking gate** — after password setup, the client cannot use Dashboard, Body Tracker, Check-ins, Progress Photos (journal), Nutrition, Workout, Health Summary, or Profile until the foundation form is **submitted** and the **waiver is accepted**.
- **Existing clients** are not blocked. Only newly invited clients start in `pending`.
- **Labs** stay on the Health lab-report pipeline. This form asks whether recent blood/hair/stool work exists and stores a text note. It does not accept a second PDF upload.
- **Photos** use the existing private progress-photo pipeline (five poses). WhatsApp is not a supported intake path.
- **Admin** gets no foundation routes or answer bytes.
- **Copy** is coaching support only — not medical advice, not a diagnosis, not a lab interpretation. Symptom checklists are coaching context. Do not run the lab LLM on this form.
- **Body-fat** is a visual pick against the reference image. Do not invent a formula from photos or measurements.
- Do not modify `docs/live-rollout-2026-09-15.md`. Do not commit secrets.

## Approaches considered

1. **Chosen — Option B, gated wizard.** Structured JSON answers (`schema_version` 1), draft + submit RPCs, `/auth/me` flag, FastAPI allowlist while `pending`, five existing photo views, waiver version stamp, coach read-only panel.
2. **Rejected — Option A, literal Google clone.** ~190 undifferentiated items, duplicated disordered-eating and identity fields, medical-sounding parentheticals, WhatsApp photo fallback.
3. **Rejected — Option C, short intake now.** Leaves the Google Form as the source of truth, which this request replaces.
4. **Rejected — draft-and-use the rest of the app.** Contradicts the locked blocking gate.

## Why this is a new subsystem

Invite + password activation already exist (`AccountActivation`, `invite_and_onboard_client`). Health is safety text plus (on a separate branch) lab PDFs. Progress photos already have `front`, `back`, `side`, `front_double_bicep`, `back_double_bicep`. There is no one-time questionnaire, no waiver record, and no client-app gate after password set.

Reuse: caller JWT, `can_access_client` / `can_manage_client`, R2 photo storage, `audit_events`, invite email, photo views. Do not store foundation answers in `weekly_checkins` or `client_coaching_context`.

## Journey

1. Coach creates the client (name, email, goal, check-in day). XForm sends the Auth invite. No Google Form link.
2. Client opens the invite, sets a password (`xform_password_set`).
3. `/auth/me` returns `role: client` and `foundation_intake_status: pending`.
4. The app renders **only** the foundation wizard (plus Sign out). Sidebar and mobile nav are hidden.
5. Client saves drafts, uploads five baseline poses, accepts the waiver, submits.
6. Status becomes `submitted`. `/auth/me` refresh unlocks the normal client portal.
7. Assigned coach sees roster badge **Intake pending** until submit, then a read-only Foundation panel on that client’s Health / Review.

Password activation stays a separate step. The foundation form never replaces “Set your password.”

## Status model

`foundation_intake_status` on `public.clients`:

| Value | Who | App |
| --- | --- | --- |
| `not_required` | Clients that already existed when this ships | Full portal |
| `pending` | Newly invited clients, until submit | Foundation wizard only |
| `submitted` | After a valid submit including waiver | Full portal; form read-only |

Default for the new column is `not_required` so a backfill cannot lock current clients. Invite provisioning **explicitly** sets `pending` and inserts the intake row.

SQLite / local demo Maya: `not_required` so existing demo tests stay on the portal.

## Data model

### `public.client_foundation_intakes`

- `client_id` PK → `clients.id`
- `schema_version` int not null default `1`
- `answers` jsonb not null default `'{}'`
- `waiver_version` text null until submit
- `waiver_accepted_at` timestamptz null until submit
- `submitted_at` timestamptz null until submit
- `created_at`, `updated_at`

Intake **status** is denormalized on `clients.foundation_intake_status` for `/auth/me` and roster. The intake row exists only when status is `pending` or `submitted`. `not_required` clients have no row.

One row per client. Submit is irrevocable in v1 (no client edit, no coach edit, no second version). Wrong answers are a future “new version” feature, not this spec.

JSONB is the source of truth for questionnaire fields. On submit, FastAPI also writes existing planning tables (see Side effects). Do not add `date_of_birth` / `sex` / `mobile` columns on `clients` in v1.

### RLS

- SELECT: `can_access_client(client_id)` (owner client + assigned coach).
- No direct INSERT/UPDATE/DELETE for `authenticated`. Mutations go through SECURITY DEFINER RPCs.
- Admin is not `can_access_client` for this data. Confirm the existing helper still excludes admin; if an admin policy would leak answers, deny it in the SQL test.

### RPCs

```sql
public.save_foundation_intake_draft(p_answers jsonb) returns jsonb
public.submit_foundation_intake(p_answers jsonb, p_waiver_version text) returns jsonb
```

Both: `auth.uid()` must equal the client, status must be `pending`. Draft stores answers as-is (Pydantic still bounds size/types in FastAPI before the RPC). Submit runs full schema validation in FastAPI first, then the RPC stamps waiver + `submitted` and returns the public payload.

Coach has **no** write RPC.

### Audit

Add `foundation_intake_submitted`. Metadata: `client_id`, `schema_version`, `waiver_version`. Never answers, never photo filenames, never checklist selections.

Draft saves are not audited (too noisy).

## Answer schema (`schema_version` 1)

Canonical module: `backend/app/services/foundation_catalog.py` plus Pydantic models in `backend/app/schemas/foundation_intake.py`. Extra keys forbidden on submit. Draft may omit keys.

Text fields: trim; empty string is empty; max 4000 unless noted. Likert integers are closed ranges. Multi-selects are closed enums from the catalog; `none` is exclusive (if `none` is present it must be the only value).

Dedup vs the Google Form (do not ask twice):

- Email — account email, read-only, not stored in answers.
- Age — derive from `date_of_birth` in the UI; do not store age.
- Disordered eating / body-image struggle — **once** (`lifestyle.disordered_eating`).
- Food allergies — **once** (`safety.food_allergies`); submit also copies into `clients.allergies_injuries` merged with injuries text.
- Prescription meds — **once** (`safety.prescription_medication`).
- Sleep quality — structured hours + 1–10 + notes; drop the duplicate free-text-only sleep question.

Strip diagnosis parentheticals from checklist **labels** (example: PDF “Sweating on forehead easily (Vitamin D deficiency)” → UI “Sweating on forehead easily”). Store the catalog id, not the PDF’s medical claim.

### Wizard steps

1. **You** — `identity`
2. **Body** — `body`
3. **Food & training logistics** — `logistics`
4. **Eating pattern** — `eating_pattern`
5. **Training** — `training`
6. **Safety** — `safety`
7. **Lifestyle & goals** — `lifestyle`
8. **Context checklists** — `checklists` (accordions; required `none` or selections per group)
9. **Sex-specific** — `sex_specific` (step omitted for `other`; fields required only when `identity.sex` matches)
10. **Baseline photos** — not in JSON; five progress photos
11. **Waiver** — `waiver.accepted` plus displayed legal text

### `identity`

| Key | Type | Notes |
| --- | --- | --- |
| `full_name` | str 1–160 | Prefill from profile; submit updates `profiles.full_name` / `first_name` |
| `date_of_birth` | date | Must make the client ≥ 18 on submit day |
| `sex` | `male` \| `female` \| `other` | Drives step 9 |
| `mobile` | str 8–20 | Digits, `+`, spaces; store trimmed |
| `place_of_living` | str 1–200 | |
| `profession` | str 1–200 | |

### `body`

| Key | Type | Notes |
| --- | --- | --- |
| `morning_weight_kg` | 20–400 | Morning dry weight; unit kg only (UI can convert lb → kg before save) |
| `height_cm` | 100–250 | |
| `waist_cm` | 40–200 | Just above navel |
| `visual_body_fat` | closed enum | Pick from the reference image bands; **not** a measured `%` |
| `desired_weight_kg` | 20–400 | Submit writes `client_targets` metric `weight_kg` |

`visual_body_fat` enum (visual only, labels on the reference image):

- Male-presenting bands: `m_6_9`, `m_10_14`, `m_15_19`, `m_20_24`, `m_25_29`, `m_30_plus`
- Female-presenting bands: `f_12_16`, `f_17_21`, `f_22_26`, `f_27_31`, `f_32_36`, `f_37_plus`

Show male bands when `sex=male`, female bands when `sex=female`, both groups when `sex=other`. Do not compute a number from weight/height/photos.

Ship the reference image as `src/assets/foundation-bodyfat-reference.webp` extracted from the Google Form PDF. If extraction fails, use a clearly labeled still of the same band layout; never a third-party body-fat calculator.

### `logistics`

| Key | Type |
| --- | --- |
| `knows_food_logging` | `yes` \| `no` |
| `knows_food_scale` | `yes` \| `no` |
| `food_preference` | closed enum, one of: `vegetarian`, `eggetarian_outside`, `vegan`, `nonveg_outside`, `nonveg_home_and_outside`, `eggetarian_home_and_outside` |
| `training_location` | `gym` \| `home_no_dumbbells` \| `home_dumbbells` \| `home_dumbbells_no_bench` \| `home_dumbbells_bands` |
| `ingredient_quantity` | `raw` \| `cooked` |
| `training_days` | `1_3` \| `1_4` \| `1_5` \| `1_6` |
| `meals_per_day` | 1–8 |
| `veg_days_separate` | `yes` \| `no` |
| `disliked_foods` | str 1–2000 |
| `who_cooks` | str 1–500 |
| `supplement_budget_monthly` | str 1–200 |
| `workout_time` | str 1–200 |

`food_preference` submit-copies a human label into `clients.dietary_preferences` if that column is still empty; do not overwrite a coach-entered preference.

### `eating_pattern`

Six slots: `breakfast`, `mid_morning`, `lunch`, `evening`, `dinner`, `late_night`. Each:

- `time` str 0–80 (empty allowed for optional snacks)
- `foods` str 0–2000

`breakfast`, `lunch`, `dinner` require non-empty `foods`. Snacks may be empty.

### `training`

| Key | Type |
| --- | --- |
| `strength_lifts` | str 1–4000 | Beginner may write `Never been to the gym` |
| `equipment` | str 1–4000 |
| `dumbbell_increments` | str 1–500 |
| `refused_exercises` | str 1–2000 |
| `exercise_history` | str 1–2000 |
| `current_program` | str 1–2000 |
| `tracks_workouts` | `pen_paper` \| `notes_app` \| `hevy_strong` \| `mental` \| `none` |
| `joint_flareups` | str 1–2000 |
| `post_workout_routine` | str 1–1000 |
| `hobbies_sports` | str 1–1000 |
| `strong_weak_groups` | str 1–2000 |
| `exercise_familiarity` | str 1–2000 |
| `ped_steroids` | str 1–2000 | Honest coaching context, not a drug log product |
| `muscular_capacity` | 1–5 |
| `athletic_ability` | 1–5 |
| `flexibility` | 1–5 |
| `cardio_ability` | 1–5 |
| `exercise_level` | `none` \| `light` \| `moderate` \| `hard` \| `extreme` |
| `weekly_exercise_hours` | `under_3` \| `3_6` \| `6_10` \| `over_10` |
| `dedication_1_to_10` | 1–10 |
| `transport` | `vehicle` \| `walking` \| `jogging` \| `bicycle` |
| `sitting_hours` | `under_8` \| `8_12` \| `12_18` \| `over_18` |

### `safety`

All coaching context. Yes on pregnancy or “physician told you not to exercise” **does not** block submit. It sets `attention_flags` on the public payload for the coach.

| Key | Type |
| --- | --- |
| `family_cardiac_or_untrained_age` | str 1–2000 | Google Form combined PAR-Q prompt, kept as one text field |
| `hospitalized_recently` | str 1–2000 |
| `major_surgery_injuries_illness` | str 1–2000 |
| `other_health_concerns` | str 1–2000 |
| `recent_labs_note` | str 1–2000 | Yes/no in the prose; no file. UI copy: upload PDFs later in Health if the coach requests them |
| `food_allergies` | str 1–2000 |
| `limits_on_activity` | str 1–2000 |
| `bone_density_over_50` | str 1–1000 |
| `physician_said_no_exercise` | str 1–2000 |
| `ortho_surgeries` | str 1–2000 |
| `imaging_mri_xray` | str 1–2000 | No file upload |
| `prescription_medication` | str 1–4000 |
| `psych_meds_or_insulin_etc` | str 1–2000 | Antidepressants, antipsychotics, corticosteroids, thyroid meds, blood thinners, insulin |
| `blood_pressure_reading` | str 1–80 |
| `resting_heart_rate` | str 1–80 |
| `snore_or_unrefreshed` | str 1–1000 |
| `bowel_movements` | str 1–1000 |
| `current_supplements` | str 1–2000 |
| `fat_burner_history` | str 1–1000 |

Female-only pregnancy lives in `sex_specific.pregnant`, not here.

### `lifestyle`

| Key | Type |
| --- | --- |
| `job_and_commute` | str 1–2000 |
| `relationship_status` | str 1–200 |
| `motivation_when_low` | str 1–2000 |
| `prior_bodycomp_attempts` | str 1–2000 |
| `why_this_matters` | str 1–4000 |
| `photoshoot_gift` | str 1–2000 |
| `life_events` | str 1–2000 |
| `disordered_eating` | str 1–4000 | Single asking |
| `body_feeling` | `totally_unhappy` … `totally_happy` (9-point, same Google labels) |
| `nightmares` | str 0–1000 |
| `non_scale_victory` | str 1–2000 |
| `caloric_drinks` | str 1–1000 |
| `delivery_or_eat_out` | str 1–500 |
| `must_have_foods` | str 1–1000 |
| `religious_fasting` | str 1–1000 |
| `work_shift_pattern` | str 1–1000 |
| `hours_to_first_meal` | str 1–200 |
| `weekend_vs_weekday` | str 1–1000 |
| `stopped_previous_programs` | str 1–2000 |
| `craving_triggers` | str 1–1000 |
| `one_year_vision` | str 1–2000 |
| `priority_goals` | str 1–2000 |
| `what_kept_you` | str 1–2000 |
| `religious_cultural_diet` | str 1–2000 |
| `sleep_quality_1_to_10` | 1–10 |
| `sleep_notes` | str 1–2000 |
| `weekday_sleep_hours` | `under_6` \| `6_7` \| `7_8` \| `over_8` |
| `weekend_sleep_hours` | same enum |
| `energy_1_to_10` | 1–10 |
| `energy_notes` | str 1–2000 |
| `libido_energy` | str 1–500 |
| `fat_storage_areas` | str 1–500 |
| `days_you_will_not_show_up` | str 1–2000 |
| `excuses_and_plan` | str 1–2000 |
| `burnout_or_anxiety` | str 1–2000 |
| `mental_health_diagnosis` | str 1–2000 |
| `success_definition` | str 1–2000 |
| `family_support` | str 1–1000 |
| `people_who_discourage` | str 1–1000 |
| `work_stress_limits` | str 1–1000 |
| `smoking` | str 1–1000 |
| `alcohol` | str 1–1000 |
| `online_training_history` | str 1–2000 |
| `three_habit_changes` | str 1–2000 |
| `craving_times` | list of closed ids (see catalog; `rarely` exclusive) |
| `work_environment` | list of closed ids |
| `lifestyle_activity` | `sedentary` \| `light` \| `moderate` \| `active` \| `very_active` |
| `water_intake` | `under_1l` \| `1_3l` \| `3_5l` \| `over_5l` |
| `diet_styles` | list (low_fat, low_carb, … `other`) |
| `willing_to_change` | list (modify_diet, supplements_daily, … `none` exclusive) |
| `skin_without_lotion` | closed enum from the Google Form rank |
| `food_cravings_list` | list (sugar, fried, … `none` exclusive) |
| `milestone_celebration` | str 1–2000 |
| `anything_else` | str 0–4000 |

### `sex_specific`

When `sex=female` (all required except as noted):

| Key | Type |
| --- | --- |
| `pregnant` | `yes` \| `no` \| `unsure` |
| `birth_control` | str 1–1000 |
| `last_cycle_start` | date or `unknown` encoded as null + `last_cycle_unknown: true` |
| `cycle_energy_drops` | str 1–1000 |
| `periods_regular` | str 1–1000 |
| `perimenopause` | str 1–1000 |

When `sex=male`:

| Key | Type |
| --- | --- |
| `deficit_drive` | str 1–1000 |
| `trt_or_hormones` | str 1–1000 |
| `testosterone_tested_last_year` | str 1–1000 |

When `sex=other`: object may be `{}`. Optional `note` str 0–2000.

### `checklists`

Each group: list of catalog option ids, min 1 item, `none` exclusive.

Groups (closed; option ids live only in `foundation_catalog.py`, sourced from the Google Form with diagnosis asides removed). Every group is required on submit except the two sex-gated groups.

Always required:

- `sleep_recovery`, `gut_digestive`, `thyroid_autoimmune`, `mental_cognitive`, `hormonal_health`, `allergy_environmental`, `skin_hair`, `pain_inflammation`, `recovery_biomarkers`, `blood_sugar_metabolism`, `breathing_patterns`
- `metabolic_signals`, `endocrine_signals`, `gi_issues`, `immune_histamine`, `orthopedic`, `neuro_sleep`, `movement_limitation`, `cardiorespiratory`
- `genetic_predisposition`, `methylation_detox`, `hormone_brain_mood`, `breathing_stress`, `cognitive`, `longevity_aging`, `autonomic_nervous`
- `food_response`, `histamine_meals`, `oxygen_fitness`, `emotional_stress`, `behavioral_patterns`, `stress_recovery`
- `gut_brain`, `hydration_minerals`, `temperature_regulation`, `metabolic_warning`, `hormonal_symptoms`, `digestion_advanced`
- `afternoon_crash`, `habit_barriers`, `blood_marker_symptoms`, `inflammation_immune`, `mental_load`
- `upper_gi`, `large_intestine`, `immune_system`, `adrenal`, `thyroid_symptoms`, `sugar_handling`
- `essential_fatty_acids`, `vitamin_mineral_needs`

Sex-gated (omit from payload when sex does not match; required when it does):

- `male_urology` when `sex=male`
- `female_cycle_symptoms` when `sex=female`

A unit test compares group keys + option counts to a frozen snapshot so silent catalog drift fails CI.

### `waiver`

Submit requires `accepted: true` and `p_waiver_version = xform-foundation-waiver-v1`. Display the exact waiver text below (same legal meaning as the Google Form). UI is a scrollable text block + required Yes. `NO` cannot submit.

**Waiver text (v1):**

> IMPORTANT — PLEASE READ THIS WAIVER CAREFULLY BEFORE SUBMITTING YOUR APPLICATION:
>
> BY JOINING THE XFORMPHYSIQUE PROGRAM, YOU ACKNOWLEDGE AND ACCEPT THE INHERENT RISKS ASSOCIATED WITH PHYSICAL TRAINING, BODY TRANSFORMATIONS, CONTEST PREPARATION, OR ANY FITNESS-RELATED ACTIVITY. YOU FULLY UNDERSTAND THAT PARTICIPATION MAY INVOLVE THE RISK OF INJURY, PHYSICAL STRAIN, OR OTHER HEALTH ISSUES, AND YOU AGREE TO TAKE FULL RESPONSIBILITY FOR YOUR OWN HEALTH AND SAFETY.
>
> YOU HEREBY RELEASE, WAIVE, AND DISCHARGE XFORMPHYSIQUE AND ALL ITS COACHES, TEAM MEMBERS, ASSOCIATES, AND REPRESENTATIVES FROM ANY LIABILITY — NOW OR IN THE FUTURE — FOR ANY PHYSICAL OR MEDICAL COMPLICATIONS THAT MAY ARISE DURING OR AFTER YOUR PARTICIPATION IN OUR PROGRAMS.
>
> YOU CONFIRM THAT YOU ARE ENROLLING WILLINGLY, WITHOUT FORCE OR PRESSURE, AND HAVE HAD THE OPPORTUNITY TO ASK QUESTIONS REGARDING YOUR HEALTH, THE PROGRAM STRUCTURE, AND ALL RELATED SERVICES.
>
> FURTHERMORE, YOU AGREE THAT ALL PAYMENTS MADE TOWARD COACHING, CONSULTATION, OR ANY SERVICE BY XFORMPHYSIQUE ARE FINAL AND NON-REFUNDABLE, REGARDLESS OF CIRCUMSTANCE.
>
> BY SUBMITTING THIS FORM, YOU DECLARE THAT ALL INFORMATION SHARED BY YOU IS HONEST, ACCURATE, AND COMPLETE TO THE BEST OF YOUR KNOWLEDGE. YOU FULLY UNDERSTAND AND AGREE TO ALL TERMS LISTED ABOVE.
>
> DO YOU AGREE TO THE TERMS OF THIS WAIVER AND FULLY ACCEPT RESPONSIBILITY FOR YOUR PARTICIPATION?

Footer on every wizard step: “Coaching support only. This form is not medical advice or a diagnosis.”

## Photos

Required on submit: one non-deleted progress photo per view:

- `front`
- `back`
- `side`
- `front_double_bicep`
- `back_double_bicep`

Reuse `POST /api/v1/client/progress-photos`. These routes stay on the pending allowlist so the wizard can upload and replace. Copy: shirtless / sports-bra, no mirror selfie, eye-level, plain background. **Do not** tell the client to send photos on WhatsApp.

Submit RPC (or FastAPI before it) counts active photos per view for `auth.uid()`. Missing pose → 422 `foundation_photos_incomplete`.

## Side effects on submit

In one FastAPI transaction-equivalent (RPC then authenticated PostgREST writes with caller JWT):

1. Stamp intake `submitted`, waiver version, `submitted_at`.
2. Set `clients.foundation_intake_status = submitted`.
3. `profiles.full_name` / `first_name` from `identity.full_name`.
4. Upsert `body_entries` for **today in the client timezone**: `weight_kg`, `waist_cm`. If a row exists, overwrite those two fields only.
5. `clients.starting_weight_kg` if still null.
6. Active `client_targets` `weight_kg` = `desired_weight_kg`.
7. `clients.allergies_injuries` — if empty, set from `safety.food_allergies` plus `safety.major_surgery_injuries_illness` (joined, ≤ 2000 chars).
8. `clients.dietary_preferences` — if empty, set from `logistics.food_preference` label.
9. Audit `foundation_intake_submitted`.

If a side-effect write fails after the RPC, return 503 and keep status `pending` **only if** the RPC is in the same DB transaction. Prefer a single `submit_foundation_intake` RPC that performs the client-row, profile, body, and target writes internally so submit cannot half-apply.

## API

### `GET /api/v1/auth/me`

For `role=client`, add `foundation_intake_status`. Omit for coach/admin (or send null). Demo client: `not_required`.

### Client (pending allowlist)

While `pending`, FastAPI `get_client_service` (or a wrapper) allows only:

- `GET /api/v1/client/foundation-intake`
- `PATCH /api/v1/client/foundation-intake` `{ answers }`
- `POST /api/v1/client/foundation-intake/submit` `{ answers, waiver_version }`
- `GET|POST|DELETE /api/v1/client/progress-photos` and `GET .../content`

Everything else under `/api/v1/client/*` returns **403** `foundation_intake_required`.

`submitted` or `not_required`: all existing client routes stay as they are. Foundation GET remains available (read-only payload). PATCH/submit on a non-pending row → 409 `foundation_intake_locked`.

Public GET payload:

```json
{
  "status": "pending",
  "schema_version": 1,
  "answers": {},
  "prefill": {
    "full_name": "Navaneet Deshpande",
    "email": "navaneet@example.test"
  },
  "photos": {
    "front": null,
    "back": null,
    "side": null,
    "front_double_bicep": null,
    "back_double_bicep": null
  },
  "waiver_version": "xform-foundation-waiver-v1",
  "attention_flags": [],
  "submitted_at": null
}
```

Photo entries are metadata + `content_url` like other client photos (no `storage_path`).

### Coach

- Roster item adds `foundation_intake_status`. `pending` → `needs_attention` and reason `Foundation intake pending`.
- `GET /api/v1/coach/clients/{client_id}/foundation-intake` — same public payload, assigned coach only. 403 if unassigned. Empty/`not_required` → `{ "status": "not_required", "answers": null, ... }`.
- No coach PATCH. No Admin route. No answer bytes in list endpoints.

## UI

### Client wizard

Full-page `FoundationIntake` (auth shell, not `os-shell` nav). Progress 1–11. Back/Next. **Save draft** on Next and a manual Save. Resume last step from `localStorage` key `xform.foundation.step` **plus** server answers (server wins).

Validation: Next may proceed with partial data; **Submit** on step 11 runs full schema and lists missing fields by step.

After submit: call `refreshWorkspace`, then the normal client portal.

### Coach

Health / Review: panel **Foundation form** above lab/safety blocks. Pending: “Waiting for the client to finish intake.” Submitted: grouped read-only sections, attention flags (pregnancy, physician-said-no) as `Status` tones, photo thumbs via existing coach content URLs. `not_required`: “No foundation form for this client.”

Roster chip when pending.

### Copy not to include

- WhatsApp photo fallback
- “Screens sleep apnea / detects thyroid”
- Any implied diagnosis from checklists
- Google Form URL

## Error handling

| Code | When |
| --- | --- |
| 403 `foundation_intake_required` | Pending client hits a blocked route |
| 409 `foundation_intake_locked` | Draft/submit after submitted, or no pending row |
| 422 `foundation_invalid` | Schema errors; `details` is `{ field_path: message }` |
| 422 `foundation_photos_incomplete` | Missing pose |
| 422 `foundation_waiver_required` | `accepted` not true or wrong version |
| 403 | Other client / unassigned coach / admin |

Keep draft answers on 422.

## Testing

- SQL: invite-equivalent insert pending; existing row stays `not_required`; client draft; other client cannot; coach cannot draft; submit stamps; second submit fails; coach SELECT answers; other coach cannot; admin SELECT empty.
- Pytest: catalog snapshot; submit fixture valid; missing waiver; missing photos; blocked dashboard while pending; `/me` flag; side effects; coach GET; SQLite demo not gated.
- Playwright mocked: after login as pending client, no Dashboard heading; complete a fixture via API + UI waiver; then Dashboard appears. Coach sees answers. Existing mocked suites set `foundation_intake_status: 'not_required'` on `/auth/me`.
- Live `user-journeys.spec.js`: after password activation, POST submit with the pytest JSON fixture and five 1×1 PNG poses (API, not 11 UI screens), then continue the current review assertions.

## Success criteria

- A newly invited client cannot open Dashboard until submit + waiver.
- A client who already had a workspace before this ships is not blocked.
- Navaneet’s answers are visible to Aisha and never to another coach, another client, or Admin.
- Five baseline poses exist as normal progress photos after submit.
- Google Form is no longer required for this onboarding path.
- No lab PDF and no LLM on this form.

## Implementation base

New git worktree and branch `codex/client-foundation-intake` from `codex/coach-workspace-persistence` HEAD (invite, Health context, five photo views). Do not implement inside `reusable-workout-program-builder` or stack this onto unmerged `codex/health-lab-reports`. If Health lab reports later merge, this form still only links to that pipeline in copy.

Live backup/apply of the migration needs explicit human approval (not in the implementation plan tasks).
