# Live rollout — workout program — 16 September 2026

## Project

Project: `cdfzrbblffpctigvjnyl`. Applied `supabase/migrations/202609160001_reusable_workout_programs.sql` once via session pooler. `NOTIFY pgrst, 'reload schema'` after apply.

## Backup

Private custom-format public-schema dump (not Auth/R2): `%TEMP%\xformphysique-before-workout-program-20260916\public-before.dump`. Size 215945 bytes. `pg_restore --list` includes training_programs, training_program_days, workout_sessions, workout_exercises.

## Pre-apply inspection

`training_program_day_exercises`, `save_workout_program_draft`, and `publish_workout_program` were absent. `training_programs` had zero rows. One unrelated `workout_sessions` row belonged to a different client. Navaneet client id `f824975d-6cbc-4d69-b71d-aeaf7662c52f`.

## Post-apply checks

- `to_regclass('public.training_program_day_exercises')` present
- RPCs `save_workout_program_draft` and `publish_workout_program` present
- `anon` execute on draft RPC is false; `authenticated` is true
- RLS enabled on `training_program_day_exercises`
- Coach GET `/api/v1/coach/clients/{navaneet}/workout-program` returned 200 with empty draft/active and empty exercise library

## Local automated gates

Recorded in `.superpowers/sdd/2026-09-16-reusable-workout-program-builder/task-6-report.md`: Docker Postgres 18 fresh-cluster migrations + workout SQL acceptance, 80 pytest, Vite build, 59 mocked Playwright. Full `npm run test:e2e` still requires live `E2E_*` secrets because `e2e/user-journeys.spec.js` throws at import.

## Browser acceptance

Headed Playwright against `http://127.0.0.1:5175/` (worktree Vite proxying backend 8002). Video (gitignored): `test-results/live-demo/qa-four-week-strength-live-acceptance.webm`. Final frame: Goblet squat 4×8 at 21–24 kg, status completed, date 2026-09-16.

Covered:

- Coach draft `QA Four-Week Strength`, start 2026-09-16, Wed/Fri/Sun, 3×4
- Reload restored draft
- Publish reported `12 sessions published` and range 2026-09-16 to 2026-10-13
- Client completed Wednesday Strength
- Coach republished Sunday exercise `Leg press — version 2`
- Client today still showed completed Wednesday Strength, not the new Sunday name

Not covered in the passing recording (do not claim they passed):

- Client save-draft then full page reload before complete
- Opening a future Sunday session in the client UI (client today endpoint has no date picker)

## Defect found and fixed

Republish generates a new `ready` session on dates that already have a preserved `completed` session. `get_workout_for_date` now ranks completed > in_progress > ready. Test: `test_get_workout_for_date_prefers_completed_over_ready_on_same_date`.

## Rollback

Revert API/UI writers (`WorkoutProgramBuilder`, coach workout-program routes, client retired_at filters, this today-session rank). Keep additive schema, RPCs, published programs, sessions, and set logs. Do not drop enum values. Disable publish by reverting the POST route if a hotfix is needed without a full UI rollback.
