# Live rollout — coach workspace persistence — 17 September 2026

## Project

Project: `cdfzrbblffpctigvjnyl`. Applied `supabase/migrations/202609160003_coach_workspace_persistence.sql` once via session pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`). `NOTIFY pgrst, 'reload schema'` after apply. Branch `codex/coach-workspace-persistence` was **not** pushed.

## Backup

Private custom-format public-schema dump (not Auth/R2): `%TEMP%\xformphysique-before-coach-workspace-20260917\public-before.dump`. Size 276315 bytes. `pg_restore --list` includes `food_library_items`, `exercise_library_items`, `coach_settings`, `audit_events`, and type `audit_action`.

## Pre-apply inspection

Tables already existed. These were absent:

- `audit_action` labels `food_library_item_saved`, `exercise_library_item_saved`, `coach_settings_saved`
- policy `audit_events_insert_coach_workspace`

## Post-apply checks

- all three enum labels present
- `audit_events_insert_coach_workspace` present
- library and settings tables unchanged

## Browser acceptance

Headed Playwright against `http://127.0.0.1:5177/` (worktree Vite proxying backend `8004`). Video is gitignored under `test-results/live-demo/output/`. Command: `npx playwright test --config test-results/live-demo/playwright.config.js --headed` — **1 passed in 21.1s**.

Covered as coach Aisha against live Auth/RLS:

- Overview Attention Queue has no `LOCAL` badge; footnote is body-entry age and check-in schedule; assigned roster is non-empty
- Review: private note `QA workspace private note 20260917` saved and listed
- Libraries: unique `QA Workspace yoghurt …` food created and listed
- Settings: missing-weight threshold saved as 5, then restored to the prior value
- Health: `Not medical advice` visible; no `Blood reports`
- Audit Log: `food_library_item_saved` or `coach_settings_saved` visible (not empty)

Not claimed: Admin portal, client-app surfaces, live SMTP/WhatsApp, body-fat calculator (not applied; weight+waist is not a body-fat method).

## Body-fat ruling

No calculator was added. Optional stored `body_fat_pct` remains a typed measurement only.

## Rollback

Keep additive enum values (do not drop). Disable the insert policy `audit_events_insert_coach_workspace` if library/settings audits must stop. Revert API/UI writers independently of this schema file.

## Git

HEAD at apply time included `67073dc` (`test: cover coach workspace persistence in browser mocks`). This document is the Task 7 evidence commit only.
