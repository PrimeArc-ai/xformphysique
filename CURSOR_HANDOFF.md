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

Branch: `codex/reusable-workout-program-builder`

Reviewed Tasks 1–6 are complete on this branch:

- Task 1: database contract and fixtures (`e7bd121`, `7dce73d`, `a11769c`).
- Task 2: versioned persistence and immutability (`431aa0f`, `e942df1`).
- Task 3: coach API (`326f867`).
- Task 4: retired session reads (`8ecc376`).
- Task 5: builder UI and mocked Playwright (`45f3830`, `0317681`).
- Task 6: prefer-completed client read + rollout doc (`dbbe85a`, `0c9573f`).

Closeout commit: `19b7ab0` (`docs: close workout program builder handoff`).

Live rollout evidence: `docs/live-rollout-2026-09-16-workout-program.md`. Do not touch unrelated file `docs/live-rollout-2026-09-15.md`.

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

## Next product work

After this branch is merged or parked, start `docs/superpowers/plans/2026-09-16-coach-nutrition-plan-publisher.md` in a **new** worktree. Do not begin nutrition work in this worktree.

## Important ruling

For same-date republish, set archived prior program `active_to = greatest(previous.active_from, new_start - 1)` to satisfy existing `active_to >= active_from` constraint. New version owns active sessions; completed/in-progress history remains unchanged.
