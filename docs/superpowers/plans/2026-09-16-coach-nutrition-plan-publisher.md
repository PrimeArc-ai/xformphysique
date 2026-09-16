# Coach Nutrition Plan Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an assigned coach save and publish an immutable daily meal plan so Navaneet’s existing Nutrition page reads real meals instead of “plan pending.”

**Architecture:** PostgreSQL owns atomic draft replacement, immutable publication, RLS, and idempotent `publish_key`. FastAPI validates the snapshot and calls RPCs with the caller JWT. React replaces `CoachNutrition` preview with a controlled builder. Client `GET /nutrition/active-plan` is unchanged.

**Tech Stack:** React 19, Vite, Playwright, Python 3.11+, FastAPI, Pydantic 2, PostgreSQL 17/18, Supabase Auth/PostgREST/RLS.

**Spec:** `docs/superpowers/specs/2026-09-16-coach-nutrition-plan-publisher-design.md`

## Global Constraints

- Execute in a **new git worktree** on a new branch off the closed workout-program HEAD. Do not mix with uncommitted workout Task 6 work.
- Do not add weekday templates, 28-day meal instances, or library CRUD.
- Reuse `nutrition_plans`, `meals`, `meal_ingredients`, `nutrition_plan_restrictions`, `food_library_items`.
- Every mutation uses the authenticated coach JWT. No service-role shortcut.
- New `SECURITY DEFINER` functions set `search_path = ''`, revoke `PUBLIC` and `anon`, grant `authenticated` only.
- Same-date archive: `active_to = greatest(previous.active_from, new_start - 1)`.
- Do not modify `docs/live-rollout-2026-09-15.md`.
- Do not commit secrets, `supabase/.temp/`, or `test-results/` videos.
- Live backup/apply/browser writes need explicit human approval (Task 5).
- Leave workout builder files unchanged unless a shared OpenAPI/test fixture would otherwise fail.

## File and Interface Map

- Create: `supabase/migrations/202609160002_coach_nutrition_plan_publisher.sql`
- Create: `backend/tests/sql/nutrition_plan_acceptance.sql`
- Modify: `scripts/test-progress-migrations.sh` — run the new SQL file after workout acceptance
- Create: `backend/app/schemas/nutrition_plan.py`
- Create: `backend/app/services/nutrition_plan.py`
- Modify: `backend/app/api/v1/coach.py` — GET/PUT/POST `/clients/{id}/nutrition-plan`
- Create: `backend/tests/test_nutrition_plan_api.py`
- Modify: `src/api/coach.js`
- Create: `src/coach/nutritionPlanModel.js`
- Create: `src/coach/NutritionPlanBuilder.jsx`
- Modify: `src/CoachWorkspace.jsx` — `CoachNutrition` mounts the builder with `accessToken`
- Modify: `src/styles.css` — reuse workout-program spacing classes where possible
- Create: `e2e/nutrition-plan-builder.spec.js`
- Create: `docs/live-rollout-2026-09-16-nutrition-plan.md` (Task 5 only)

RPC signatures:

```sql
public.save_nutrition_plan_draft(p_client_id uuid, p_snapshot jsonb) returns jsonb
public.publish_nutrition_plan(p_client_id uuid, p_publish_key uuid, p_snapshot jsonb) returns jsonb
```

Snapshot JSON:

```json
{
  "name": "QA Daily Fuel",
  "active_from": "2026-09-16",
  "calories_kcal": 1860,
  "protein_g": 135,
  "carbs_g": 180,
  "fat_g": 55,
  "restrictions": ["shellfish-free"],
  "meals": [
    {
      "position": 1,
      "meal_time": "08:00:00",
      "name": "Breakfast bowl",
      "calories_kcal": 420,
      "protein_g": 35,
      "carbs_g": 41,
      "fat_g": 13,
      "coach_instructions": "",
      "preparation": "Mix yoghurt and berries.",
      "ingredients": [
        {
          "position": 1,
          "food_library_item_id": null,
          "ingredient_name": "Greek yoghurt",
          "quantity": 200,
          "unit": "g"
        }
      ]
    }
  ]
}
```

---

### Task 1: Red PostgreSQL contract

**Files:**
- Create: `backend/tests/sql/nutrition_plan_acceptance.sql`
- Modify: `scripts/test-progress-migrations.sh`

**Interfaces:**
- Consumes: existing auth bootstrap, `public.nutrition_plans`, `public.meals`, `public.food_library_items`.
- Produces: failing calls to the two RPCs named above.

- [ ] **Step 1: Hook the runner**

After the workout acceptance block in `scripts/test-progress-migrations.sh`:

```bash
if [[ -f "$repo_dir/backend/tests/sql/nutrition_plan_acceptance.sql" ]]; then
  psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/nutrition_plan_acceptance.sql"
fi
```

- [ ] **Step 2: Write the failing contract**

Create `backend/tests/sql/nutrition_plan_acceptance.sql`. Reuse the workout fixture pattern: begin, insert coach/client/assignment, owned food library item, `set_config` JWT claims, call missing RPC, assert, rollback.

```sql
begin;

insert into auth.users(id, email) values
  ('30000000-0000-0000-0000-000000000001', 'nutrition-coach@xform.test'),
  ('30000000-0000-0000-0000-000000000002', 'nutrition-client@xform.test');
insert into public.profiles(id, role, email, first_name, full_name) values
  ('30000000-0000-0000-0000-000000000001', 'coach', 'nutrition-coach@xform.test', 'Nutrition', 'Nutrition Coach'),
  ('30000000-0000-0000-0000-000000000002', 'client', 'nutrition-client@xform.test', 'Nutrition', 'Nutrition Client');
insert into public.coaches(id, is_active) values
  ('30000000-0000-0000-0000-000000000001', true);
insert into public.clients(id, primary_goal, check_in_day, timezone)
values ('30000000-0000-0000-0000-000000000002', 'strength', 'sunday', 'Asia/Kolkata');
insert into public.coach_client_assignments(coach_id, client_id)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
insert into public.food_library_items(id, owner_coach_id, name, category, calories_kcal, protein_g, carbs_g, fat_g, is_active)
values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Greek yoghurt', 'dairy', 73, 10, 4, 2, true);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.save_nutrition_plan_draft(
  '30000000-0000-0000-0000-000000000002',
  '{"name":"QA Daily Fuel","active_from":"2026-09-16","calories_kcal":1860,"protein_g":135,"carbs_g":180,"fat_g":55,"restrictions":["shellfish-free"],"meals":[{"position":1,"meal_time":"08:00:00","name":"Breakfast bowl","calories_kcal":420,"protein_g":35,"carbs_g":41,"fat_g":13,"coach_instructions":"","preparation":"Mix.","ingredients":[{"position":1,"food_library_item_id":"30000000-0000-0000-0000-000000000003","ingredient_name":"Greek yoghurt","quantity":200,"unit":"g"}]}]}'::jsonb
);

rollback;
```

Use the same auth-trigger-safe inserts as `backend/tests/sql/workout_program_acceptance.sql` if a trigger already creates profiles.

- [ ] **Step 3: Run red**

Run (Docker, not live):

```powershell
docker run --rm --user postgres --entrypoint bash -v "${PWD}:/repo" -w /repo postgres:18 -c "sed 's/\r$//' scripts/test-progress-migrations.sh > /tmp/t.sh && sed 's/\r$//' /tmp/t.sh | sed 's|repo_dir=.*|repo_dir=/repo|' > /tmp/run.sh && bash /tmp/run.sh"
```

Expected: FAIL containing `function public.save_nutrition_plan_draft(uuid, jsonb) does not exist`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/sql/nutrition_plan_acceptance.sql scripts/test-progress-migrations.sh
git commit -m "test: define nutrition plan database contract"
```

---

### Task 2: Schema, draft save, atomic publish

**Files:**
- Create: `supabase/migrations/202609160002_coach_nutrition_plan_publisher.sql`
- Modify: `backend/tests/sql/nutrition_plan_acceptance.sql`

**Interfaces:**
- Consumes: snapshot JSON above, `auth.uid()`.
- Produces: draft/publish RPCs returning `{plan: jsonb}` and `{plan: jsonb, meal_count: int}`.

- [ ] **Step 1: Write failing assertions for publish behavior**

Extend the acceptance file (still in a transaction with fixtures) to assert after both RPCs exist:

- Draft: one `nutrition_plans` row `status='draft'`, `version` is null, zero `meal_adherence` rows.
- Re-save draft: still one draft.
- Publish with key `40000000-0000-0000-0000-000000000001`: `status='published'`, `version=1`, three meals if the live QA snapshot is used in later tests; for this task a one-meal snapshot is enough if the contract file stays small — **use three meals in the helper** so counts match live QA.
- Retry same `publish_key`: one published row, one audit `nutrition_plan_published`.
- Client/admin/unassigned/inactive/anon cannot publish, including the existing-key path.
- Invalid meal count 0 or 9 rolls back.
- Direct `update nutrition_plans set name='x' where status='published'` as assigned coach changes 0 rows.
- Republish with new key: old plan `archived`, new `version=2`, old adherence rows unchanged.

Put the three-meal snapshot in a `pg_temp.qa_daily_fuel()` helper.

- [ ] **Step 2: Run and confirm still red or assertion-red**

Same Docker command as Task 1. Expected: missing function or failed assertions, not a silent pass.

- [ ] **Step 3: Write the migration**

`202609160002_coach_nutrition_plan_publisher.sql` must include:

```sql
alter table public.nutrition_plans add column if not exists publish_key uuid;
alter table public.nutrition_plans alter column version drop not null;
create unique index if not exists nutrition_plans_client_publish_key_uidx
  on public.nutrition_plans(client_id, publish_key) where publish_key is not null;
create unique index if not exists nutrition_plans_one_draft_per_client_uidx
  on public.nutrition_plans(client_id) where status = 'draft';
```

Then validator + `insert_nutrition_plan_snapshot` + `nutrition_plan_snapshot_result` + the two RPCs. Follow `save_workout_program_draft` / `publish_workout_program` for lock, idempotent key (auth **before** returning existing key), archive `greatest(active_from, v_start - 1)`, empty `search_path`, grant pattern.

Tighten published DML: drop/recreate manage policies on `nutrition_plans`, `meals`, `meal_ingredients`, `nutrition_plan_restrictions` so `FOR ALL` requires `status = 'draft'` (join through plan for child tables). Keep SELECT policies for assigned coach and client.

`active_to` on the new published plan stays null (open daily plan) unless a later slice adds a cycle end.

- [ ] **Step 4: Run green**

Same Docker command. Expected: exit `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609160002_coach_nutrition_plan_publisher.sql backend/tests/sql/nutrition_plan_acceptance.sql
git commit -m "feat: persist and publish daily nutrition plans"
```

---

### Task 3: FastAPI contract

**Files:**
- Create: `backend/app/schemas/nutrition_plan.py`
- Create: `backend/app/services/nutrition_plan.py`
- Modify: `backend/app/api/v1/coach.py`
- Create: `backend/tests/test_nutrition_plan_api.py`

**Interfaces:**
- Consumes: `WorkoutProgramService` JWT/error mapping pattern.
- Produces: GET workspace `{active_plan, draft, food_library}`, PUT draft, POST publish.

- [ ] **Step 1: Write failing API tests**

Mirror `backend/tests/test_workout_program_api.py` with a `FakeResponse` gateway. Cover:

- Snapshot rejects 0 meals, 9 meals, non-contiguous positions, extra fields.
- GET `/api/v1/coach/clients/{id}/nutrition-plan` sends the caller `Authorization` header.
- PUT `/nutrition-plan/draft` posts to `/rest/v1/rpc/save_nutrition_plan_draft`.
- POST `/nutrition-plan/publish` posts `p_publish_key` and `p_snapshot`.
- Provider 42501 maps to 403.

Pydantic bounds: name 1–180; calories_kcal > 0; macros >= 0; meals 1–8; ingredients 1–12; quantity > 0; unit 1–30; restriction 1–120; `meal_time` as `HH:MM:SS` or `HH:MM`.

- [ ] **Step 2: Run tests red**

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_nutrition_plan_api.py -q
```

Expected: FAIL import or 404 routes.

- [ ] **Step 3: Implement schemas, service, routes**

GET nested PostgREST select:

```text
id,client_id,name,status,version,active_from,active_to,replaces_plan_id,calories_kcal,protein_g,carbs_g,fat_g,nutrition_plan_restrictions(restriction),meals(id,position,meal_time,name,calories_kcal,protein_g,carbs_g,fat_g,coach_instructions,preparation,meal_ingredients(id,position,food_library_item_id,ingredient_name,quantity,unit))
```

Food library: `food_library_items` where `owner_coach_id=eq.{coach}` and `is_active=eq.true`.

- [ ] **Step 4: Run tests green plus OpenAPI smoke**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_nutrition_plan_api.py tests/test_workout_program_api.py -q
```

Expected: PASS. New paths appear in `/openapi.json`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/nutrition_plan.py backend/app/services/nutrition_plan.py backend/app/api/v1/coach.py backend/tests/test_nutrition_plan_api.py
git commit -m "feat: expose coach nutrition plan API"
```

---

### Task 4: Controlled coach builder

**Files:**
- Modify: `src/api/coach.js`
- Create: `src/coach/nutritionPlanModel.js`
- Create: `src/coach/NutritionPlanBuilder.jsx`
- Modify: `src/CoachWorkspace.jsx`
- Modify: `src/styles.css`
- Create: `e2e/nutrition-plan-builder.spec.js`

**Interfaces:**
- Consumes: Task 3 JSON.
- Produces: accessible builder; mocked Playwright covering 1–8 meals, restore, validation, retry.

- [ ] **Step 1: Write failing Playwright spec**

Mock `/api/v1/coach/clients/:id/nutrition-plan` like `e2e/workout-program-builder.spec.js`. Assert:

- Default two meals; Add meal disabled at 8; Remove disabled at 1.
- Save draft PUTs snapshot; reload fixture restores name `QA Daily Fuel`.
- Publish confirmation shows meal count 3; success notice `Plan published`.
- GET failure shows Retry, not a blank editor.

- [ ] **Step 2: Run red**

```powershell
npx playwright test e2e/nutrition-plan-builder.spec.js
```

Expected: FAIL missing labels / `CoachNutrition` still preview.

- [ ] **Step 3: Implement model + builder**

`validatePlan` errors for empty name, missing start, meal count, empty meal name, empty ingredient name, quantity <= 0. `publish_key` in a ref: reuse after transport failure; clear on edit and on success. Ignore RPC results if `client.id` changed.

Replace `CoachNutrition` body with:

```jsx
<NutritionPlanBuilder client={client} accessToken={accessToken} />
```

Pass `accessToken` into `CoachNutrition` from `CoachWorkspace` (same pattern as `CoachWorkout`). Delete the `clientPreviews` meal list usage from this page only. Do not rewrite Libraries.

Labels: `Plan name`, `Start date`, `Daily calories`, `Meal {n} name`, `Meal {n} time`, `Meal {n} ingredient {m} name`, `Save draft`, `Publish nutrition plan`, `Confirm publish`.

- [ ] **Step 4: Run UI tests and build**

```powershell
npx playwright test e2e/nutrition-plan-builder.spec.js e2e/workout-program-builder.spec.js
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/coach.js src/coach/nutritionPlanModel.js src/coach/NutritionPlanBuilder.jsx src/CoachWorkspace.jsx src/styles.css e2e/nutrition-plan-builder.spec.js
git commit -m "feat: add coach nutrition plan builder"
```

---

### Task 5: Live rollout (blocked until approval)

**Files:**
- Create: `docs/live-rollout-2026-09-16-nutrition-plan.md`

**Interfaces:**
- Consumes: Tasks 1–4 and live project `cdfzrbblffpctigvjnyl`.
- Produces: backup, apply `202609160002_coach_nutrition_plan_publisher.sql`, Navaneet browser evidence.

- [ ] **Step 1: Local gates**

```powershell
docker run --rm --user postgres --entrypoint bash -v "${PWD}:/repo" -w /repo postgres:18 -c "sed 's/\r$//' scripts/test-progress-migrations.sh > /tmp/t.sh && sed 's/\r$//' /tmp/t.sh | sed 's|repo_dir=.*|repo_dir=/repo|' > /tmp/run.sh && bash /tmp/run.sh"
cd backend; .\.venv\Scripts\python.exe -m pytest -q
cd ..; npm run build
npx playwright test e2e/nutrition-plan-builder.spec.js e2e/workout-program-builder.spec.js
```

Expected: all exit `0`.

- [ ] **Step 2–4: Inspect, backup, apply** — **stop until the user says apply live**

Inspect `to_regclass('public.save_nutrition_plan_draft')` is null. Dump public schema to `%TEMP%\xformphysique-before-nutrition-plan-20260916.dump`. Apply migration with `ON_ERROR_STOP=1`. `NOTIFY pgrst, 'reload schema'`. Verify anon cannot execute RPCs.

- [ ] **Step 5: Visible coach/client**

Coach: `QA Daily Fuel`, start 2026-09-16, three meals, save draft, reload, publish. Client Nutrition: three meals visible. Log Followed on breakfast.

- [ ] **Step 6: Commit rollout doc only after live evidence exists**

```bash
git add docs/live-rollout-2026-09-16-nutrition-plan.md
git commit -m "docs: record nutrition plan rollout"
```

## Completion Gate

- SQL acceptance: draft generates no adherence; publish is idempotent; published DML blocked; republish archives previous plan.
- FastAPI: caller JWT, 422 bounds, OpenAPI paths.
- Playwright: builder limits and draft restore.
- Live client Nutrition page shows `QA Daily Fuel` only after approved apply.

## Out of scope (next slices, not this plan)

- Coach food/exercise library CRUD.
- Removing leftover LOCAL Overview/CSV/Settings shells.
- 28-day nutrition calendars.
