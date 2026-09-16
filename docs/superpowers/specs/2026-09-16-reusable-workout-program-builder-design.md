# Reusable Workout Program Builder Design

Date: 2026-09-16
Status: Awaiting final user review

## Goal

Replace the coach portal's local-only workout preview with a persisted, reusable four-week training-program builder. A coach can create two to six weekly day templates, assign unique weekdays, add ordered exercises, save a draft, and publish an immutable program version for an assigned client. Publishing generates four weeks of client workout sessions without changing completed or in-progress history.

## Scope

### Included

- One draft program per coach/client editing flow.
- Two to six program days, each assigned a unique weekday.
- One to twelve ordered exercises per day.
- Exercise name or optional coach-owned library item, prescribed sets, rep target, rest seconds, and coach note.
- Four-week cycle beginning on a coach-selected start date.
- Draft save and transactional publish.
- Immutable published versions and explicit replacement lineage.
- Client sessions generated from each selected weekday within the four-week window.
- Existing client set logging and exercise-history features remain the execution path.
- Coach and client live browser acceptance using Navaneet's designated demo account.

### Excluded

- Indefinite recurrence, automatic renewal, deload rules, percentage-based loading, supersets, circuits, calendar drag-and-drop, notifications, and AI plan generation.
- Editing completed or in-progress sessions through republish.
- Restoring retired future sessions after republish.
- Admin access to client workout data.

## Existing Baseline

Existing tables already model `training_programs`, `training_program_days`, `workout_sessions`, `workout_exercises`, and `workout_set_logs`. Published programs have version and replacement fields. Client session retrieval and raw set persistence already exist.

Missing pieces:

- Program days have no weekday.
- Program templates have no reusable exercise rows; exercises exist only on generated sessions.
- Coach workout UI is a hard-coded local preview.
- No coach API persists or publishes programs.
- No atomic operation versions a program and generates sessions.

## Data Model

### `training_program_days`

Add `weekday smallint` with ISO values 1–7 (Monday–Sunday). Enforce uniqueness per program and weekday. Existing position uniqueness remains; position controls display order, while weekday controls scheduling.

### `training_programs`

Add `publish_key uuid` nullable with a unique `(client_id, publish_key)` index for publish idempotency. Add a partial unique index allowing one `draft` row per client. Existing status values are reused: replaced published programs and consumed drafts become `archived`; no new enum value is needed.

### `training_program_day_exercises`

New normalized template table:

- `id uuid` primary key.
- `program_day_id uuid` referencing `training_program_days` with cascade delete.
- `exercise_library_item_id uuid` nullable reference to `exercise_library_items` with `ON DELETE SET NULL`.
- `position smallint`, positive and unique within a program day.
- `name text`, required snapshot name.
- `prescribed_sets smallint`, 1–20.
- `prescribed_reps text`, 1–40 trimmed characters.
- `rest_seconds smallint`, nullable, 0–1800.
- `coach_note text`, maximum 1000 characters.
- created/updated timestamps.

The snapshot name preserves published meaning if a library entry is later renamed or retired.

### `workout_sessions`

Add:

- `program_id uuid` nullable reference to `training_programs` with `ON DELETE SET NULL`.
- `retired_at timestamptz` nullable.
- `retired_by_program_id uuid` nullable reference to `training_programs` with `ON DELETE SET NULL`.

Active reads exclude retired sessions. Historical completed/in-progress sessions never become retired during republish. Existing session rows keep null values and remain valid.

### Audit

Add audit actions for draft save and program publish. Record client, program/version, generated-session count, start/end dates, and replaced program ID. No exercise or health details go into audit metadata.

## Authorization and RLS

- Only an active coach with an active assignment may manage a client's program.
- Coach-owned exercise-library IDs must belong to the authenticated coach.
- Client reads only their non-retired sessions.
- Assigned coach reads program/template/session rows through existing client-assignment predicates.
- The new template-exercise table has RLS enabled immediately. Its policies derive access through program day, program, and active assignment; authenticated-role membership alone never grants access.
- Admin receives no new client workout access.
- Publish RPC uses `SECURITY DEFINER` only because the operation spans multiple RLS-protected tables. It sets an empty search path, validates `auth.uid()`, checks active assignment and ownership internally, revokes execution from `PUBLIC` and `anon`, and grants only `authenticated`.

## Publish Transaction

Input is client ID plus a fully validated program snapshot: name, start date, notes, and ordered day/exercise templates.

Within one transaction:

1. Lock the client's currently published program rows.
2. Confirm two to six days, unique ISO weekdays, one to twelve exercises per day, contiguous positions, field lengths, set/repetition/rest bounds, and optional library ownership.
3. Interpret the coach-selected start date as a date in the client's configured timezone, then calculate `active_to` as `active_from + 27 days`. Session dates are date-only; no UTC conversion may shift the selected weekday.
4. Determine next version from the client's maximum program version.
5. Create a new published program linked through `replaces_program_id`.
6. Insert program days and template exercises.
7. Mark the old published program `archived` and close its active date immediately before the new cycle.
8. Retire only `ready` sessions from the replaced program whose date is on or after the new cycle's start date. Preserve earlier ready sessions plus all `in_progress` and `completed` sessions unchanged.
9. Generate one session per selected weekday falling within the inclusive 28-day window. A selected weekday matching the start date is included.
10. Copy template exercises into each generated session with stable positions and snapshot prescriptions.
11. Write one audit event and return the complete published program plus generated dates/count.

Any validation, write, or conflict failure rolls back the entire publish operation. A unique program/day/date constraint, row locks, and caller-generated `publish_key` prevent duplicate versions or sessions from concurrent attempts and lost-response retries. Reusing the same key returns the original publish result.

## Draft Semantics

Draft save persists normalized program, day, and template-exercise rows but generates no client sessions. Re-saving replaces that draft snapshot transactionally. Publishing a draft produces a new immutable published version; the draft is marked `archived` inside the same transaction. Published versions are never edited in place.

Only one open draft per coach/client is supported in this version. Leaving the builder and reopening it restores that draft.

## Backend API

Routes use existing `/api/v1/coach/clients/{client_id}` scope:

- `GET /workout-program` — active published program, open draft, and coach-owned active exercise library.
- `PUT /workout-program/draft` — validate and atomically save the current draft snapshot.
- `POST /workout-program/publish` — publish the supplied snapshot through the transaction RPC and return generated sessions.

Pydantic models forbid unknown fields, trim strings, cap collections, validate unique weekdays and contiguous positions, and return actionable 422 errors. Service methods first resolve the client through the coach JWT, then call restricted RPCs using the same JWT. No service-role shortcut is used.

## Coach UI

Replace `WorkoutBuilder` hard-coded markup with controlled components:

- Program name, start date, and notes.
- Two default days; add up to six and remove down to two.
- Weekday selector with duplicate prevention.
- Day name and note.
- Exercise rows with library selector plus editable snapshot name, sets, reps, rest, and note.
- Add/remove/reorder exercises; current version uses up/down controls rather than drag-and-drop.
- Save Draft and Publish buttons with disabled/busy states.
- Inline validation summary and field-level errors.
- Publish confirmation states exact date range and session count.
- After success, refresh active-program card from API data; never claim local-only publication.

For live acceptance, create `QA Four-Week Strength`, starting Wednesday 2026-09-16, on Wednesday/Friday/Sunday. Each day contains three exercises with four prescribed sets. This produces twelve sessions, with today's Wednesday session immediately visible to Navaneet.

## Client Behavior

Client workout page continues using the existing today-session endpoint and existing atomic set-log RPC. Session payload now comes from published program data. Retired sessions are excluded. Client can log every prescribed set, save draft, complete, reload, and build exercise history without a new client-side contract.

When no session exists today, current empty state remains. Historical exercise data includes preserved old program versions and completed/in-progress sessions.

## Error Handling

- 403: inactive/unassigned coach or foreign library item.
- 404: client or draft not accessible.
- 409: concurrent publish/version conflict or duplicate active schedule.
- 422: invalid day count, duplicate weekday, empty exercise day, invalid positions or prescription bounds.
- 503: provider failure; transaction prevents partial program/session creation.

UI keeps unsaved form state after API errors and shows concise recovery guidance. Retrying a publish uses an idempotency key so a lost response cannot create a second program version.

## Testing

Follow red-green-refactor.

### PostgreSQL

- Migration applies to a realistic pre-migration database and preserves existing rows.
- Draft snapshot replacement is atomic.
- Publish creates correct program/day/template rows and exactly four occurrences per selected weekday.
- Start-date weekday inclusion and 28-day boundary are exact.
- Republish preserves completed/in-progress sessions and retires only future ready sessions.
- Invalid days, exercises, positions, library ownership, and unassigned callers roll back.
- Anonymous, client, unassigned coach, inactive coach, and Admin cannot publish.
- Concurrent/idempotent publish cannot duplicate sessions.

### FastAPI

- Schema validation for 2–6 days and 1–12 exercises.
- Get/save/publish routes preserve caller JWT and translate provider errors correctly.
- Response exposes program version, cycle dates, and generated session count.

### React

- Add/remove day limits, duplicate weekday prevention, exercise add/remove/reorder, controlled values, validation, busy/error states, draft restore, and publish refresh.
- No local preview state masquerades as persistence.

### Live Browser Acceptance

1. Coach signs in and creates the three-day demo plan through visible UI.
2. Save draft; reload; verify complete draft restoration.
3. Publish; verify version, four-week dates, and twelve generated sessions.
4. Client signs in; today's three exercises and four set rows each are visible.
5. Enter all twelve sets, save draft, reload, verify persistence and volume.
6. Complete session and verify exercise-history best set, frequency, charts, trend, and raw rows.
7. Coach edits and republishes; verify completed current session remains and future ready sessions use the new version.

## Rollout and Rollback

Before live migration, take a fresh public-schema data backup and inspect for conflicting columns/tables. Apply additive schema and RPC changes before deploying API/UI writers. Run permission checks and available Supabase advisors.

Rollback is non-destructive: revert API/UI writers, keep additive tables/columns and published data, and stop new publish calls. Do not delete program versions, generated sessions, completed logs, or enum values. If publish fails, its transaction rolls back without manual cleanup.

## Success Criteria

- Coach can persist and publish a reusable two-to-six-day program through the browser.
- Publish creates exactly four weeks of correctly dated sessions.
- Navaneet sees the intended three-exercise, four-set session today.
- Raw sets persist after reload and feed exercise history.
- Republish never alters completed or in-progress sessions.
- Authorization prevents cross-coach and non-coach mutations.
