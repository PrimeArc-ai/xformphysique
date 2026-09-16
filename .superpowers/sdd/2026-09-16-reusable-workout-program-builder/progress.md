# SDD ledger — plan: docs/superpowers/plans/2026-09-16-reusable-workout-program-builder.md

Branch start: e7bd121
Worktree: C:/Users/AkshayPM/Documents/ChatGPT/sahilfit/xformphysique/.worktrees/reusable-workout-program-builder
Spec: docs/superpowers/specs/2026-09-16-reusable-workout-program-builder-design.md

## Baseline

- Python: 66 passed after installing environment-only `tzdata`; 2 pre-existing dependency deprecation warnings.
- Frontend build: passed.
- Full Playwright command cannot start without live credentials; mocked browser subset started separately.

## Pre-flight interface scan

| Scope | Producer / consumer | Finding |
|---|---|---|
| Task 1 internal | SQL acceptance file / fresh-cluster runner | Consistent: runner executes new red contract after migrations. |
| Task 2 internal | migration helpers / SQL acceptance | Consistent after plan self-review: nullable draft versions, normalized templates, restricted RPCs. |
| Task 3 internal | Pydantic models / service / coach routes | Consistent: request and response names match route annotations. |
| Task 4 internal | retired session schema / client service queries | Consistent: every active client read gets `retired_at=is.null`. |
| Task 5 internal | browser API / model helpers / controlled component / Playwright | Consistent: API payload and response names match Task 3. |
| Task 6 internal | automated gates / live rollout / browser acceptance | Consistent: live evidence exercises exact approved demo program. |
| Tasks 1 and 2 | failing SQL contract / migration implementation | Consistent: Task 1 names both RPC signatures produced by Task 2. |
| Tasks 2 and 3 | RPC JSON / FastAPI service | Consistent: `p_client_id`, `p_snapshot`, `p_publish_key`; response keys align. |
| Tasks 2 and 4 | `retired_at` / active client queries | Consistent: schema lands before reads change. |
| Tasks 3 and 5 | coach endpoints / browser API | Consistent route paths and request bodies. |
| Tasks 4 and 6 | active-session filtering / republish browser check | Consistent: completed/in-progress remain, retired ready rows disappear. |
| Tasks 5 and 6 | builder UI / visible acceptance | Consistent accessible labels and exact 12-session success copy. |
| Tasks 2 and 6 | migration / live application | Consistent, but exact migration filename must remain stable for rollout. |

Ruling: Treat plan filename `202609160001_reusable_workout_programs.sql` as authoritative even if local Supabase CLI generates a wall-clock name — rollout documentation and Task 6 name it exactly — cost if wrong: local migration history may need one rename before deployment.

Ruling: Environment-only `tzdata` stays uncommitted during baseline because this Windows Python 3.14 venv lacks OS IANA data while project runtime may already provide it — cost if wrong: deployed Windows environments would still require declaring `tzdata` later.

Task 1: fix round 1/5 (3 addressed, 0 open; commits 7dce73d..a11769c)
Task 1: minor (deferred): report prose says auth trigger uses `on conflict do nothing`, while final trigger uses plain inserts; duplicate-row diagnosis and code fix remain correct.
Task 1: minor (deferred): report names successful empty static checks without embedding empty output.
Task 1: complete (commits e7bd121..a11769c, review clean; SQL execution evidence blocked by absent host PostgreSQL binaries)

Ruling: On same-date republish, archive previous program with `active_to = greatest(previous.active_from, new_start - 1)` — existing `active_to >= active_from` constraint must remain valid while new version owns active sessions — cost if wrong: archived metadata can show one nominal day when replaced on its own start date.

Task 2: blocked — Luna and Terra implementer turns both hit account usage limit before completion; partial migration/test edits remain uncommitted and require fresh implementation/review after quota reset.

Task 2 BASE: b8918ee (HEAD before implementer dispatch)
Task 2: resume — quota reset; dispatching a fresh implementer on the uncommitted partial work.

Ruling: Rewrite `supabase/migrations/202609160001_reusable_workout_programs.sql` as one well-formed file; the uncommitted copy concatenates two function bodies and leaves an unclosed regex in `assert_valid_workout_program_snapshot` — cost if wrong: extra rewrite time vs shipping a migration that cannot parse.

Ruling: Idempotent `publish_workout_program` must still require an active assigned coach before returning an existing `publish_key` result — spec forbids non-coach management; Task 2 acceptance denies client/admin/unassigned/inactive/anon on the existing-key path — cost if wrong: a known key could leak publish JSON to unauthorized JWTs.

Ruling: Verify Task 2 with isolated Docker `postgres:18` (local image present; `XFORM_TEST_PG_BIN` default matches `/usr/lib/postgresql/18/bin`). Override image entrypoint and mount this worktree. Do not use live Supabase. Cost if wrong: Docker path differences vs the host script.

Ruling: Keep the uncommitted Task 2 expansions in `backend/tests/sql/workout_program_acceptance.sql` (dates, 12/36 counts, republish preservation, retirement RLS, role isolation, invalid-input rollback, helper-function grants). Fix those tests only if they contradict the spec. Cost if wrong: over-specific assertions may force extra RPC shape work.

Ruling: GRANT `select, insert, update, delete` on `training_program_day_exercises` to `authenticated, service_role` — the initial schema granted existing tables only, so the new table would otherwise be unreadable to PostgREST in Task 3. Cost if wrong: a slightly wider grant than the plan snippet.

Task 2: review 431aa0f — spec ❌, 1 Important (published rows still directly mutable via FOR ALL policies)

⚠️ resolved: production caller-JWT HTTP wiring is Task 3; Task 2 owns `auth.uid()` / role grants / RLS. Not a Task 2 gap.

Ruling: Spec “Published versions are immutable” is binding even though the Task 2 RLS snippet copies existing `FOR ALL` coach-manage policies — add database-level guards so assigned-coach DML cannot update/delete published program headers, days, or template exercises; drafts stay writable; SECURITY DEFINER RPCs still archive/publish. Cost if wrong: extra policy surface vs leaving a PostgREST bypass around versioning.

Task 2: fix round 1/5 (1 addressed, 0 open — published snapshot immutable to direct DML; commits 431aa0f..e942df1)
Task 2: complete (commits b8918ee..e942df1, review clean)

Task 3 BASE: e942df1
Task 3: complete (commits e942df1..326f867, review clean)
Task 3: minor (deferred): pytest still emits two FastAPI/Starlette deprecation warnings — same baseline noise as Task 1; report omitted exact diagnostic text
⚠️ Task 3: database publish/session semantics live in Task 2 — not a Task 3 gap

Task 4 BASE: 326f867
Task 4: complete (commits 326f867..8ecc376, review clean)
Task 4: minor (deferred): same two FastAPI/Starlette TestClient deprecation warnings as baseline

Task 5 BASE: 8ecc376

Ruling: `npm run test:e2e` cannot be the Task 5 gate because `e2e/user-journeys.spec.js` throws at import without live credentials. Run `npx playwright test e2e/workout-program-builder.spec.js` plus the existing mocked specs, excluding `user-journeys.spec.js` and `admin-live.spec.js`. Cost if wrong: mocked regressions in other files could slip until Task 6.

Ruling: Extra one-line mock in `e2e/precision-theme.spec.js` is in-scope for Task 5 because the new GET would otherwise abort existing coach navigation tests. Cost if wrong: a theme fixture now knows about workout-program.

Task 5: review 45f3830 — spec ❌, 1 Critical + 3 Important
⚠️ resolved: backend atomicity/immutability/session preservation belong to Tasks 2–4, not this UI diff.
Task 5: minor (deferred): mocked Playwright QA fixture uses 1 exercise/3 sets rather than live 3×4; Task 6 owns the live demo program.

Ruling: Ignore in-flight save/publish after client change (or ignore responses whose client id no longer matches) — a pending client-A RPC must not populate client-B’s editor. Cost if wrong: extra request-id plumbing.
Ruling: Client-side `validateProgram` must enforce the spec bounds the brief snippet omitted (weekday 1–7, reps 1–40 trimmed, rest null or 0–1800, notes/coach_note lengths, integer sets 1–20). Cost if wrong: duplicate of FastAPI 422.
Ruling: Clear `publish_key` on any form edit and on success; reuse only for unmodified retry after transport failure — same-key retry of an edited snapshot would return the old published version. Cost if wrong: extra UUID churn vs the brief’s “clear after success” wording.
Ruling: Load failure must not enable a blank writable program that can replace an unseen draft; show error + retry. Cost if wrong: coaches cannot start a program while GET is down.

Task 5: fix round 1/5 (4 addressed, 0 open; commits 45f3830..0317681)
Task 5: complete (commits 8ecc376..0317681, review clean)

Task 6 BASE: 0317681

Ruling: Stop before live backup, live migration apply, or live account mutation — those are irreversible side effects outside this worktree. Task 6 implementer runs local automated gates and drafts the rollout doc from local evidence only. Cost if wrong: live acceptance waits on an explicit go-ahead.

Task 6: complete (prefer-completed client read + live rollout doc). Live headed video gitignored under test-results/live-demo/. Full npm run test:e2e still needs E2E_* env.

Deferred minors for final review: Task 1 auth-trigger prose; Task 1 empty static-check output; Task 3/4 FastAPI/Starlette TestClient deprecation warnings; Task 5 mocked fixture is not the live 3×4 QA program.
