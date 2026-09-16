# XForm Coaching OS — Cursor Handoff

## Open this worktree

```powershell
cd C:\Users\AkshayPM\Documents\ChatGPT\sahilfit\xformphysique\.worktrees\reusable-workout-program-builder
git switch codex/reusable-workout-program-builder
```

Do not work from the main checkout while this branch is active.

## Objective

Implement the approved reusable multi-day workout program builder:

- Four-week, exactly 28-day cycle.
- Coach selects 2–6 unique training weekdays.
- Each day has 1–12 ordered exercises.
- Save normalized draft without generating sessions.
- Publish immutable version and generate sessions.
- Republish preserves completed/in-progress sessions and retires only future ready sessions.
- Caller-JWT authorization, RLS, atomic RPCs, idempotent publish key.

## Read first

1. `docs/superpowers/specs/2026-09-16-reusable-workout-program-builder-design.md`
2. `docs/superpowers/plans/2026-09-16-reusable-workout-program-builder.md`
3. `.superpowers/sdd/2026-09-16-reusable-workout-program-builder/progress.md`
4. `backend/tests/sql/workout_program_acceptance.sql`

## Git state

Completed reviewed commits:

- `3972b54` approved feature design.
- `e3ea551` implementation plan.
- `e7bd121` local worktree ignore rule.
- `7dce73d` initial red database contract.
- `a11769c` fixture fix: auth-trigger-safe setup, authenticated role, owned library item.

Task 2 is not complete. Current uncommitted files:

- `supabase/migrations/202609160001_reusable_workout_programs.sql`
- `backend/tests/sql/workout_program_acceptance.sql`

The migration was partially written by an interrupted agent. Audit it before relying on it; it previously contained malformed validator syntax. Do not commit until migration parses and acceptance tests pass.

Existing unrelated untracked file in the main checkout must remain untouched: `docs/live-rollout-2026-09-15.md`.

## Current verification

- Backend baseline: 66 tests passed after installing environment-only `tzdata`; two pre-existing dependency deprecation warnings.
- Frontend baseline build passed with `npm run build`.
- Full Playwright suite requires live environment credentials; mocked subset was started but stopped before completion because live-only tests were included.
- Host PostgreSQL `initdb` is absent. Docker is available with `postgres:17-alpine`; use an isolated container for SQL acceptance. Do not modify production Supabase during local verification.

## Local startup

Frontend:

```powershell
npm install --no-package-lock
$env:VITE_BACKEND_PROXY_TARGET = 'http://127.0.0.1:8000'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Backend in a second terminal:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Use `http://127.0.0.1:5174/` for Cursor/browser testing. Do not put Supabase service-role, R2, or API keys in source control or browser code.

## Required next order

1. Repair and syntax-check the partial migration.
2. Run Task 1 red contract in isolated PostgreSQL and capture the missing-RPC failure, then apply migration.
3. Make SQL acceptance green: exact Wed/Fri/Sun dates from `2026-09-16` through `2026-10-13`, 12 sessions, 36 exercises, republish preservation, retirement filtering, invalid-input rollback, authorization, and idempotency.
4. Commit Task 2 and perform an independent review.
5. Continue Tasks 3–6 in the plan: FastAPI contract, retired-read filtering, controlled React builder, mocked Playwright, then approved live browser acceptance.

## Important ruling

For same-date republish, set archived prior program `active_to = greatest(previous.active_from, new_start - 1)` to satisfy existing `active_to >= active_from` constraint. New version owns active sessions; completed/in-progress history remains unchanged.
