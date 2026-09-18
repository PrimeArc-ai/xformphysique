# Session feature status — 2026-09-18

Branch: `codex/client-foundation-intake`  
Base: `codex/coach-workspace-persistence` (`0c41de4`)  
Head: recorded at commit time on this document’s commit  
Worktree: `.worktrees/client-foundation-intake`

This note covers the coding session that implemented the in-app Client Foundation Form, plus sibling work that stayed parked.

---

## Feature finished

### Client Foundation Form (this branch)

Newly invited clients complete the foundation questionnaire in-app after password setup. Existing clients stay `not_required` and unblocked.

| Area | What landed |
| --- | --- |
| Postgres | `clients.foundation_intake_status` (`not_required` / `pending` / `submitted`), `client_foundation_intakes` table, RLS select via `can_access_client`, no `service_role` table DML |
| RPCs | `save_foundation_intake_draft`, `submit_foundation_intake` (side effects in SQL), `provision_foundation_intake` (coach JWT after invite assignment) |
| Catalog | Closed checklist groups from the Google Form PDF, parentheticals stripped, snapshot tests |
| Client API | GET / PATCH `/api/v1/client/foundation-intake`, POST `.../submit` |
| Gate | Pending clients: 403 `foundation_intake_required` except foundation-intake and progress-photos; profile-photo routes also gated |
| Invite | New invites set `pending` and create the intake row via coach JWT RPC |
| Auth | Client `/auth/me` / `workspace()` exposes `foundation_intake_status`; demo Maya is `not_required` |
| Coach API | `GET /api/v1/coach/clients/{id}/foundation-intake`; roster `needs_attention` + “Foundation intake pending” |
| Submit side effects | Profile name, timezone-local body entry, starting weight if empty, weight target history, allergies/diet if empty; audit metadata has no answers |
| Client SPA | Full-page 11-step wizard, draft on Next, five photo poses, waiver v1, coaching-not-diagnosis banner, unlock after submit |
| Coach UI | Read-only Foundation panel on Health and Review; roster chip `Intake pending` |
| Tests | SQL acceptance (Docker Postgres 18), backend pytest, Playwright foundation + existing mock suites |

Runtime fixes after whole-branch review:

- Draft PATCH prunes empty fields so Next can proceed with partial data
- Coach photo URLs use the coach content route (panel no longer 403s)
- Female submit accepts a cycle date without requiring `last_cycle_unknown`
- Submit RPC rejects empty `{}` answers (identity + waiver accepted + size cap)

### Earlier on this lineage (already in the base)

Coach workspace persistence, Health context, audit events, food/exercise libraries — present on `codex/coach-workspace-persistence`, not re-implemented here.

---

## Partial

| Item | Status | Why it is partial |
| --- | --- | --- |
| Body-fat reference image | Usable fallback | Labeled band chart with spec enum captions; not extracted from the Google Form PDF |
| Live client journey | Code present, not run | `e2e/user-journeys.spec.js` completes intake via API when `E2E_*` is set; skipped in this session |
| Coach checklist labels | Answers visible | Catalog is omitted from coach GET, so some labels titleize ids instead of catalog copy |
| SQL audit assertion | Insert is answer-free | Acceptance SQL does not assert `foundation_intake_submitted` metadata fields |
| History checklist wording | Spec-compliant | “Diagnosed …” history questions kept; diagnosis parentheticals already stripped |
| Health lab reports | Separate branch, unchanged | Prior finishing choice: keep `codex/health-lab-reports` as-is; not merged into this branch |

---

## Pending

| Item | Notes |
| --- | --- |
| Live schema apply | Migrations `202609180001` and `202609180002` are in git only. Do not apply to live Supabase until explicitly approved. |
| Integrate this branch | Merge or PR into `codex/coach-workspace-persistence` (then onward) is not done. |
| Health lab reports | Still its own worktree/branch; not stacked here. |
| Live invite demo | Needs live env + migration apply; mocked Playwright already covers the wizard and coach panel. |
| Optional polish | Restore lab-archive “Blood reports” assertions if that UI merges later; serve catalog on coach GET; keep JS/Python waiver text in sync with a test. |

Do not modify `docs/live-rollout-2026-09-15.md` as part of this feature.

---

## What this session added (commit range `0c41de4`..HEAD)

1. Foundation intake schema and submit/draft RPCs  
2. Locked table writes (JWT / SECURITY DEFINER only)  
3. Answer catalog + Pydantic submit/draft models  
4. Client GET/PATCH/submit API  
5. Pending-client route gate  
6. Invite → `pending`, `/me` status, coach read, SQL submit side effects  
7. Coach JWT `provision_foundation_intake` (no admin insert into intakes)  
8. Blocking client wizard + pending-only catalog on GET  
9. Load-fail fallback + Dashboard heading after submit  
10. Coach Foundation panel, roster chip, existing e2e mock updates  
11. Review-fix wave: compact drafts, coach photo URLs, female cycle XOR, profile-photo gate, RPC empty-submit floor  

Verification last run on this tree: backend pytest **174 passed**; Playwright **85 passed**, **2 skipped** (live specs).
