# Client Foundation Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After password setup, a newly invited client must complete an in-app Client Foundation Form (Option B) including the waiver before the rest of the client portal unlocks; the assigned coach reads the answers in Health.

**Architecture:** Postgres stores one intake row per new client (`pending` → `submitted`). FastAPI validates schema version 1, drafts and submits through SECURITY DEFINER RPCs with the caller JWT, and 403s every other client route while pending. Baseline poses reuse `progress_photos`. `/auth/me` exposes `foundation_intake_status` so the SPA can render only the wizard.

**Tech Stack:** React 19, Vite, Playwright, Python 3.11+, FastAPI, Pydantic 2, PostgreSQL 17/18, Supabase Auth/PostgREST/RLS, Cloudflare R2 (existing photo pipeline).

**Spec:** `docs/superpowers/specs/2026-09-18-client-foundation-intake-design.md`

## Global Constraints

- New worktree `.worktrees/client-foundation-intake` on branch `codex/client-foundation-intake` from `codex/coach-workspace-persistence` HEAD. Do not implement inside `reusable-workout-program-builder` or `health-lab-reports`.
- Caller JWT for every mutation. No service-role shortcut.
- Admin gets no foundation routes and no answer bytes.
- Copy: coaching support only; not medical advice; not a diagnosis.
- Do not invent a body-fat formula. Visual enum only.
- Do not upload lab PDFs on this form.
- Do not tell clients to send photos on WhatsApp.
- Existing clients stay `not_required` and unblocked.
- Do not modify `docs/live-rollout-2026-09-15.md`.
- Do not commit secrets, `supabase/.temp/`, or `test-results/`.
- Live backup/apply is not in these tasks.
- SQLite demo Maya is `not_required`.

## File and Interface Map

- Create: `supabase/migrations/202609180001_client_foundation_intake.sql`
- Create: `backend/tests/sql/foundation_intake_acceptance.sql`
- Modify: `scripts/test-progress-migrations.sh`
- Create: `backend/app/services/foundation_catalog.py`
- Create: `backend/app/schemas/foundation_intake.py`
- Create: `backend/app/services/foundation_intake.py`
- Create: `backend/tests/test_foundation_catalog.py`
- Create: `backend/tests/test_foundation_intake_api.py`
- Create: `backend/tests/fixtures/foundation_submit_valid.json`
- Modify: `backend/app/api/deps.py` — pending allowlist
- Modify: `backend/app/api/v1/client.py` — GET/PATCH/submit
- Modify: `backend/app/api/v1/coach.py` — GET foundation
- Modify: `backend/app/api/v1/auth.py` — `/me` status
- Modify: `backend/app/services/supabase_client.py` — workspace flag + service methods
- Modify: `backend/app/services/supabase_coach.py` — invite pending, roster, GET
- Modify: `backend/app/schemas/coach.py` — roster field
- Modify: `src/hooks/useAuth.js` — `refreshWorkspace`
- Modify: `src/App.jsx` — block portal while pending
- Create: `src/foundation/FoundationIntake.jsx`
- Create: `src/foundation/foundation.css`
- Create: `src/coach/FoundationPanel.jsx`
- Modify: `src/api/client.js`, `src/api/coach.js`
- Modify: `src/CoachWorkspace.jsx` — roster chip + Health panel
- Create: `e2e/foundation-intake.spec.js`
- Modify: existing e2e `/auth/me` mocks → `foundation_intake_status: 'not_required'`
- Modify: `e2e/user-journeys.spec.js` — API submit after activate

RPC signatures:

```sql
public.save_foundation_intake_draft(p_answers jsonb) returns jsonb
public.submit_foundation_intake(p_answers jsonb, p_waiver_version text) returns jsonb
```

Public payload:

```json
{
  "status": "pending",
  "schema_version": 1,
  "answers": {},
  "prefill": { "full_name": "Navaneet Deshpande", "email": "navaneet@example.test" },
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

`WAIVER_VERSION = "xform-foundation-waiver-v1"`

Fixture IDs (do not collide with lab `7000…` ids):

- coach A `80000000-0000-0000-0000-000000000001`
- client pending `80000000-0000-0000-0000-000000000002`
- coach B `80000000-0000-0000-0000-000000000004`
- other client `80000000-0000-0000-0000-000000000005`
- existing client `not_required` `80000000-0000-0000-0000-000000000006`

---

### Task 1: PostgreSQL contract

**Files:**
- Create: `backend/tests/sql/foundation_intake_acceptance.sql`
- Modify: `scripts/test-progress-migrations.sh`
- Create: `supabase/migrations/202609180001_client_foundation_intake.sql`

**Interfaces:**
- Consumes: `public.can_access_client`, `public.can_manage_client`, `audit_events`, `clients`, `profiles`, `body_entries`, `client_targets`, `progress_photos`.
- Produces: enum `foundation_intake_status`; column `clients.foundation_intake_status`; table `client_foundation_intakes`; RPCs above; audit value `foundation_intake_submitted`.

- [ ] **Step 1: Hook the runner**

After the last acceptance block in `scripts/test-progress-migrations.sh`:

```bash
if [[ -f "$repo_dir/backend/tests/sql/foundation_intake_acceptance.sql" ]]; then
  psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/foundation_intake_acceptance.sql"
fi
```

- [ ] **Step 2: Write the failing contract**

Create `backend/tests/sql/foundation_intake_acceptance.sql`. Copy the auth.users → profiles → coaches/clients → assignment pattern from `backend/tests/sql/health_lab_reports_acceptance.sql` (or nutrition if labs file is absent on this branch). Use the `8000…` IDs. Client `…0002` will be flipped to `pending` after the column exists. Client `…0006` stays default `not_required`. Assign `…0002` to coach A only.

```sql
begin;

-- inserts here (auth.users, profiles, coaches, clients, assignment for 0001→0002)

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if value is distinct from true then
    raise exception '%', message;
  end if;
end
$$;

select pg_temp.assert_true(
  (select foundation_intake_status from public.clients
    where id = '80000000-0000-0000-0000-000000000006') = 'not_required',
  'existing clients stay not_required'
);

update public.clients
set foundation_intake_status = 'pending'
where id = '80000000-0000-0000-0000-000000000002';

insert into public.client_foundation_intakes(client_id)
values ('80000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  (public.save_foundation_intake_draft('{"identity":{"full_name":"Navaneet"}}'::jsonb)
   ->>'status') = 'pending',
  'owner can draft'
);

select pg_temp.assert_true(
  (public.submit_foundation_intake(
    '{"identity":{"full_name":"Navaneet Deshpande"}}'::jsonb,
    'xform-foundation-waiver-v1'
  )->>'status') = 'submitted',
  'owner can submit'
);

select pg_temp.assert_true(
  (select foundation_intake_status from public.clients
    where id = '80000000-0000-0000-0000-000000000002') = 'submitted',
  'submit flips client status'
);

do $$
begin
  begin
    perform public.submit_foundation_intake('{}'::jsonb, 'xform-foundation-waiver-v1');
    raise exception 'second submit should fail';
  exception
    when others then
      if sqlerrm like '%second submit should fail%' then raise; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002') = 0,
  'unassigned coach cannot select answers'
);

reset role;
rollback;
```

The SQL test’s submit body can be a stub JSON; FastAPI enforces the full schema. The RPC must still reject submit unless status is `pending`, `p_waiver_version` equals `xform-foundation-waiver-v1`, and five photo views exist. For this SQL file, insert five dummy `progress_photos` rows for client `…0002` before submit (reuse the progress-photo insert style from `progress_acceptance.sql`: `view`, `captured_on`, `original_filename`, `storage_path`, `content_type`, `byte_size`). If `storage_provider` exists on the branch, set it to a legal value.

Also assert:

- client `…0005` draft RPC fails
- coach A cannot call `save_foundation_intake_draft`
- after submit, coach A `select answers from client_foundation_intakes` returns one row
- `starting_weight_kg` is **not** required in this SQL file (FastAPI/RPC side effects land in Task 5)

Run: `bash scripts/test-progress-migrations.sh`  
Expected: FAIL — type `foundation_intake_status` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/202609180001_client_foundation_intake.sql`:

```sql
alter type public.audit_action add value if not exists 'foundation_intake_submitted';

do $$ begin
  create type public.foundation_intake_status as enum ('not_required', 'pending', 'submitted');
exception
  when duplicate_object then null;
end $$;

alter table public.clients
  add column if not exists foundation_intake_status public.foundation_intake_status
  not null default 'not_required';

create table if not exists public.client_foundation_intakes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  answers jsonb not null default '{}'::jsonb,
  waiver_version text,
  waiver_accepted_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (submitted_at is null and waiver_accepted_at is null and waiver_version is null)
    or (submitted_at is not null and waiver_accepted_at is not null and waiver_version = 'xform-foundation-waiver-v1')
  )
);

alter table public.client_foundation_intakes enable row level security;
grant select on public.client_foundation_intakes to authenticated;

create policy foundation_intakes_select_accessible
  on public.client_foundation_intakes
  for select to authenticated
  using (public.can_access_client(client_id));
```

Implement the two RPCs as `security definer` `set search_path = public`. Both require `auth.uid()` = the intake `client_id` and `clients.foundation_intake_status = 'pending'`. Raise `42501` otherwise.

`save_foundation_intake_draft`: update `answers`, `updated_at`; return jsonb public fields (`status` from clients column, `schema_version`, `answers`, `submitted_at`).

`submit_foundation_intake`:

1. Require `p_waiver_version = 'xform-foundation-waiver-v1'`.
2. Require five active photos (`deleted_at is null` if that column exists) covering `front`,`back`,`side`,`front_double_bicep`,`back_double_bicep`.
3. Update intake: `answers`, `waiver_version`, `waiver_accepted_at = now()`, `submitted_at = now()`.
4. Update `clients.foundation_intake_status = 'submitted'`.
5. Insert `audit_events` (`foundation_intake_submitted`, metadata `{"schema_version":1,"waiver_version":"xform-foundation-waiver-v1"}` only).
6. Return public jsonb including `status`.

Profile/body/target side effects wait for Task 5 so this task stays the lock + photos + waiver.

Revoke execute from `anon,public`; grant to `authenticated`.

Because `alter type … add value` cannot run in a transaction with use of the new value on some Postgres versions, follow the lab/persistence pattern: add the enum value first, then use `'foundation_intake_submitted'::text::public.audit_action` in the function body.

- [ ] **Step 4: Run the SQL tests**

Run: `bash scripts/test-progress-migrations.sh`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609180001_client_foundation_intake.sql \
  backend/tests/sql/foundation_intake_acceptance.sql \
  scripts/test-progress-migrations.sh
git commit -m "$(cat <<'EOF'
feat: add foundation intake schema and submit RPCs

EOF
)"
```

---

### Task 2: Catalog, Pydantic schema, valid fixture

**Files:**
- Create: `backend/app/services/foundation_catalog.py`
- Create: `backend/app/schemas/foundation_intake.py`
- Create: `backend/tests/test_foundation_catalog.py`
- Create: `backend/tests/fixtures/foundation_submit_valid.json`

**Interfaces:**
- Consumes: spec field tables.
- Produces: `WAIVER_VERSION`, `WAIVER_TEXT`, `CHECKLIST_GROUPS`, `FoundationAnswers` (submit-strict), `FoundationAnswersDraft` (all optional), `valid_submit_answers()`, `attention_flags(answers) -> list[str]`.

- [ ] **Step 1: Write failing catalog tests**

```python
from app.services.foundation_catalog import CHECKLIST_GROUPS, WAIVER_VERSION, valid_submit_answers
from app.schemas.foundation_intake import FoundationAnswers

REQUIRED_GROUPS = {
    "sleep_recovery", "gut_digestive", "thyroid_autoimmune", "mental_cognitive",
    "hormonal_health", "allergy_environmental", "skin_hair", "pain_inflammation",
    "recovery_biomarkers", "blood_sugar_metabolism", "breathing_patterns",
    "metabolic_signals", "endocrine_signals", "gi_issues", "immune_histamine",
    "orthopedic", "neuro_sleep", "movement_limitation", "cardiorespiratory",
    "genetic_predisposition", "methylation_detox", "hormone_brain_mood",
    "breathing_stress", "cognitive", "longevity_aging", "autonomic_nervous",
    "food_response", "histamine_meals", "oxygen_fitness", "emotional_stress",
    "behavioral_patterns", "stress_recovery", "gut_brain", "hydration_minerals",
    "temperature_regulation", "metabolic_warning", "hormonal_symptoms",
    "digestion_advanced", "afternoon_crash", "habit_barriers",
    "blood_marker_symptoms", "inflammation_immune", "mental_load",
    "upper_gi", "large_intestine", "immune_system", "adrenal",
    "thyroid_symptoms", "sugar_handling", "essential_fatty_acids",
    "vitamin_mineral_needs",
}

def test_waiver_version():
    assert WAIVER_VERSION == "xform-foundation-waiver-v1"

def test_required_groups_present():
    assert REQUIRED_GROUPS <= set(CHECKLIST_GROUPS)

def test_each_group_has_none_and_unique_ids():
    for key, options in CHECKLIST_GROUPS.items():
        ids = [item["id"] for item in options]
        assert "none" in ids, key
        assert len(ids) == len(set(ids)), key
        assert all(item["label"] and "(" not in item["label"] for item in options)

def test_valid_fixture_parses():
    FoundationAnswers.model_validate(valid_submit_answers("male"))

def test_female_requires_cycle_group():
    payload = valid_submit_answers("female")
    assert "female_cycle_symptoms" in payload["checklists"]
    FoundationAnswers.model_validate(payload)
```

- [ ] **Step 2: Run tests — expect fail**

Run: `cd backend && python -m pytest tests/test_foundation_catalog.py -v`  
Expected: FAIL import error.

- [ ] **Step 3: Implement catalog + schema**

`foundation_catalog.py`:

- `WAIVER_VERSION`, `WAIVER_TEXT` (exact spec waiver).
- `CHECKLIST_GROUPS`: dict[str, list[{"id", "label"}]]. Source every option from the Google Form PDF. Strip parenthetical diagnosis claims from labels. Always include `{"id":"none","label":"None"}`.
- Sex-gated group maps: `male_urology`, `female_cycle_symptoms` in the same dict; `valid_submit_answers(sex)` includes them only when relevant.
- `valid_submit_answers(sex: str) -> dict`: every required scalar filled with legal dummy text/enums; every checklist group `["none"]`; `waiver: {accepted: true}`; body numbers in range; DOB `1994-01-15`; sex argument; female block or male block accordingly.

`FoundationAnswers` Pydantic: nested models matching the spec tables, `extra="forbid"`, `none` exclusive validator for every list field, age ≥ 18 from `date_of_birth` vs UTC today, `waiver.accepted is True`. Draft model: all nested fields optional, still forbid unknown keys at each present object.

`attention_flags`: append `reported_pregnancy` if female and `pregnant` in `{yes, unsure}`; append `physician_said_no_exercise` if `safety.physician_said_no_exercise` is non-empty and not a case-insensitive `no`.

Put a copy of `valid_submit_answers("male")` in `backend/tests/fixtures/foundation_submit_valid.json` for Playwright.

Checklist option ids: `snake_case` of the stripped label, truncated to 80 chars. If two labels collide, suffix `_2`.

Port **all** PDF checklist items for the groups listed in the spec. This is the Option B catalog — skipping a Google Form checklist group is a spec miss.

- [ ] **Step 4: Run tests — expect pass**

Run: `cd backend && python -m pytest tests/test_foundation_catalog.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/foundation_catalog.py \
  backend/app/schemas/foundation_intake.py \
  backend/tests/test_foundation_catalog.py \
  backend/tests/fixtures/foundation_submit_valid.json
git commit -m "$(cat <<'EOF'
feat: add foundation intake answer catalog

EOF
)"
```

---

### Task 3: Client GET/PATCH/submit API

**Files:**
- Create: `backend/app/services/foundation_intake.py`
- Create: `backend/tests/test_foundation_intake_api.py`
- Modify: `backend/app/api/v1/client.py`
- Modify: `backend/app/services/supabase_client.py`
- Modify: `backend/app/services/client.py` (SQLite: GET returns `not_required`, PATCH/submit 409)

**Interfaces:**
- Consumes: RPCs, `FoundationAnswers`, photo list.
- Produces: `FoundationIntakeService.get/save_draft/submit`; routes under `/client/foundation-intake`.

- [ ] **Step 1: Failing API tests**

Use the same FakeGateway / monkeypatch style as `backend/tests/test_lab_reports_api.py` if present, else `test_nutrition_plan_api.py`.

```python
from app.services.foundation_catalog import valid_submit_answers, WAIVER_VERSION

CLIENT_ID = "80000000-0000-0000-0000-000000000002"

def test_get_returns_pending_payload(service):
    payload = service.get_intake()
    assert payload["status"] == "pending"
    assert payload["prefill"]["email"]
    assert set(payload["photos"]) == {
        "front", "back", "side", "front_double_bicep", "back_double_bicep"
    }

def test_submit_without_waiver_422(service):
    answers = valid_submit_answers("male")
    answers["waiver"] = {"accepted": False}
    with pytest.raises(APIError) as err:
        service.submit(answers, WAIVER_VERSION)
    assert err.value.status_code == 422

def test_submit_without_photos_422(service):
    with pytest.raises(APIError) as err:
        service.submit(valid_submit_answers("male"), WAIVER_VERSION)
    assert err.value.code == "foundation_photos_incomplete"

def test_submit_happy_path(service_with_photos):
    result = service_with_photos.submit(valid_submit_answers("male"), WAIVER_VERSION)
    assert result["status"] == "submitted"
```

- [ ] **Step 2: Run — expect fail**

Run: `cd backend && python -m pytest tests/test_foundation_intake_api.py -v`  
Expected: FAIL — service missing.

- [ ] **Step 3: Implement service + routes**

`FoundationIntakeService` (caller JWT gateway):

- `get_intake()`: read `clients.foundation_intake_status`. If `not_required`, return status `not_required`, `answers: null`. If pending/submitted, read intake row + five photo slots (latest non-deleted per view) + profile email/name. Attach `attention_flags` from stored answers. Strip `storage_path`.
- `save_draft(answers)`: `FoundationAnswersDraft.model_validate`; RPC `save_foundation_intake_draft`.
- `submit(answers, waiver_version)`: `FoundationAnswers.model_validate`; require `waiver_version == WAIVER_VERSION`; if photos incomplete raise 422 `foundation_photos_incomplete`; RPC `submit_foundation_intake`.

Routes:

```python
@router.get("/foundation-intake")
def get_foundation_intake(service: Service):
    return FoundationIntakeService.from_client(service).get_intake()

@router.patch("/foundation-intake")
def save_foundation_intake(payload: FoundationDraftBody, service: Service):
    return FoundationIntakeService.from_client(service).save_draft(payload.answers)

@router.post("/foundation-intake/submit")
def submit_foundation_intake(payload: FoundationSubmitBody, service: Service):
    return FoundationIntakeService.from_client(service).submit(payload.answers, payload.waiver_version)
```

SQLite `ClientService`: `get_intake` → `{status: not_required, answers: null, ...empty photos}`; draft/submit raise 409 `foundation_intake_locked`.

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_foundation_intake_api.py tests/test_foundation_catalog.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/foundation_intake.py backend/app/api/v1/client.py \
  backend/app/services/supabase_client.py backend/app/services/client.py \
  backend/tests/test_foundation_intake_api.py
git commit -m "$(cat <<'EOF'
feat: add client foundation intake API

EOF
)"
```

---

### Task 4: Pending route gate

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/tests/test_foundation_intake_api.py`
- Modify: `backend/app/api/v1/client.py` if the allowlist is path-based in a dependency

**Interfaces:**
- Consumes: `clients.foundation_intake_status`.
- Produces: 403 `foundation_intake_required` on blocked client routes.

- [ ] **Step 1: Failing test**

```python
def test_pending_client_cannot_open_dashboard(client_app, pending_auth_header):
    response = client_app.get("/api/v1/client/dashboard", headers=pending_auth_header)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "foundation_intake_required"

def test_pending_client_can_get_intake(client_app, pending_auth_header):
    response = client_app.get("/api/v1/client/foundation-intake", headers=pending_auth_header)
    assert response.status_code == 200
```

Use FastAPI `TestClient` + monkeypatched `SupabaseClientService` like other API tests. If the suite tests services not apps, call a helper `assert_client_route_allowed(path, method)` from deps.

Allowed prefixes while pending:

- `/foundation-intake`
- `/progress-photos`

- [ ] **Step 2: Run — expect fail** (dashboard still 200)

- [ ] **Step 3: Implement**

In `get_client_service`, after role check, if supabase-enabled:

```python
request: Request  # add to the dependency
status = service.foundation_intake_status()  # clients row, default not_required
if status == "pending":
    path = request.url.path
    allowed = path.endswith("/foundation-intake") or "/foundation-intake/submit" in path \
        or "/progress-photos" in path
    if not allowed:
        raise APIError(403, "foundation_intake_required", "Complete your foundation form to open this workspace.")
```

Submit path is `.../foundation-intake/submit` — treat as allowed.

`foundation_intake_status()` reads `clients.foundation_intake_status` for `user.id`. Missing client row → 403 as today.

- [ ] **Step 4: Run API tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/app/api/v1/client.py \
  backend/app/services/supabase_client.py backend/tests/test_foundation_intake_api.py
git commit -m "$(cat <<'EOF'
feat: block client APIs until foundation intake is submitted

EOF
)"
```

---

### Task 5: Invite pending, `/me`, coach read, submit side effects

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/app/services/supabase_client.py` (`workspace`)
- Modify: `backend/app/services/supabase_coach.py` (`_configure_client`, `_client_list_item`, `get_foundation_intake`)
- Modify: `backend/app/api/v1/coach.py`
- Modify: `backend/app/schemas/coach.py` — `foundation_intake_status` on list item
- Modify: `backend/tests/test_coach_onboarding.py`
- Modify: `supabase/migrations/202609180001_client_foundation_intake.sql` — extend `submit_foundation_intake` with side effects **or** add `202609180002_foundation_submit_side_effects.sql` if Task 1 already shipped. Prefer amending only if Task 1 is not yet on the remote; otherwise a follow-up migration.

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: new invites `pending` + intake row; `/me.foundation_intake_status`; coach GET; submit writes profile/body/target/allergies as spec.

- [ ] **Step 1: Failing tests**

```python
def test_workspace_includes_pending_status(monkeypatch):
    # workspace() for client returns foundation_intake_status pending

def test_invite_sets_pending(monkeypatch):
    result = service.invite_and_onboard_client(payload)
    assert any("foundation_intake_status" in str(call) or call[0] == "client_foundation_intakes" for call in writes)

def test_unassigned_coach_get_403():
    ...

def test_submit_writes_body_entry(service_with_photos):
    service_with_photos.submit(valid_submit_answers("male"), WAIVER_VERSION)
    # fake gateway saw body_entries upsert and clients.starting_weight_kg
```

Onboarding test today patches `/auth/v1/invite`. Extend to assert a POST `client_foundation_intakes` and PATCH clients status `pending`.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

`workspace()` for role client:

```python
client = self._one_or_none("clients", {"id": f"eq.{self.user.id}"})
payload["foundation_intake_status"] = (client or {}).get("foundation_intake_status") or "not_required"
```

Demo `/me` client in `auth.py`: `"foundation_intake_status": "not_required"`.

`_configure_client`: after assignment insert, PATCH clients `foundation_intake_status=pending`, POST `client_foundation_intakes` `{client_id}`.

Roster: include `foundation_intake_status`. If `pending`, `needs_attention True` and append `"Foundation intake pending"`.

Coach route `GET /clients/{client_id}/foundation-intake` → same payload as client GET (RLS/assignment via `_one("clients", ...)` first).

Submit RPC (follow-up SQL): using `auth.uid()`:

- `update profiles set full_name, first_name` from `answers->identity->>'full_name'`
- upsert `body_entries` for `current_date` (client timezone is `clients.timezone`; use `(now() at time zone timezone)::date`) with `morning_weight_kg` / `waist_cm`
- `starting_weight_kg` only if null
- deactivate other weight targets then insert active `desired_weight_kg`
- if `allergies_injuries` is empty, set truncated merge of food allergies + surgeries
- if `dietary_preferences` is empty, set food preference label

Keep audit metadata free of answers.

- [ ] **Step 4: Run pytest onboarding + foundation + SQL script**

Run: `bash scripts/test-progress-migrations.sh` and `cd backend && python -m pytest tests/test_foundation_intake_api.py tests/test_coach_onboarding.py tests/test_admin_portal.py -v`  
Expected: PASS. Admin tests must still lack foundation routes.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/auth.py backend/app/api/v1/coach.py \
  backend/app/services/supabase_client.py backend/app/services/supabase_coach.py \
  backend/app/schemas/coach.py backend/tests supabase/migrations
git commit -m "$(cat <<'EOF'
feat: gate new invites and expose foundation intake to coaches

EOF
)"
```

---

### Task 6: Client SPA gate + wizard

**Files:**
- Modify: `src/hooks/useAuth.js`
- Modify: `src/App.jsx`
- Modify: `src/api/client.js`
- Create: `src/foundation/FoundationIntake.jsx`
- Create: `src/foundation/WizardStep.jsx`
- Create: `src/foundation/foundation.css`
- Create: `src/assets/foundation-bodyfat-reference.webp` (extract from the Google Form PDF; if extract fails, a labeled band chart with the spec enum captions)

**Interfaces:**
- Consumes: `/auth/me.foundation_intake_status`, client foundation + photo APIs.
- Produces: blocked portal; 11-step wizard.

- [ ] **Step 1: Failing Playwright mock**

Create `e2e/foundation-intake.spec.js` with the existing `page.route` style from `e2e/health-lab-reports.spec.js` / `progress-fixture.js`.

Pending client `/auth/me`: `{ role: 'client', foundation_intake_status: 'pending', full_name: 'Navaneet Deshpande', first_name: 'Navaneet', id: 'client-1', email: 'navaneet@example.test' }`.

```javascript
test('pending client does not see dashboard navigation', async ({ page }) => {
  await loginPendingClient(page)
  await expect(page.getByRole('heading', { name: /Foundation form/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0)
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm exec playwright test e2e/foundation-intake.spec.js --grep "does not see dashboard"`  
Expected: FAIL — Dashboard still renders.

- [ ] **Step 3: Gate in App.jsx**

`useAuth` add:

```javascript
const refreshWorkspace = useCallback(async () => {
  if (!state.session) return null
  const workspace = await getWorkspace(state.session.access_token)
  setState((current) => ({ ...current, workspace }))
  return workspace
}, [state.session])
```

Return it from the hook.

`App.jsx` after activation:

```javascript
if (auth.workspace.role === 'client' && auth.workspace.foundation_intake_status === 'pending') {
  return <FoundationIntake auth={auth} />
}
```

- [ ] **Step 4: Wizard UI**

`clientApi.getFoundationIntake`, `saveFoundationDraft`, `submitFoundationIntake` matching the three routes.

`FoundationIntake.jsx`:

- Load GET on mount.
- Steps array of 11 titles from the spec.
- Prefill identity name/email (email read-only).
- Controlled `answers` object; PATCH on Next and on “Save draft”.
- Step 10: five file inputs calling existing `uploadPhoto(file, view, today)`.
- Step 11: scroll `WAIVER_TEXT` (export a JS copy of the spec text in `src/foundation/waiver.js`) + checkbox “I agree” bound to `answers.waiver.accepted`.
- Submit POST; on success `auth.refreshWorkspace()`.
- Banner: “Coaching support only. This form is not medical advice or a diagnosis.”
- Sign out button.
- Sex-specific step skipped in the stepper when `sex === 'other'`.
- Checklist step: one accordion per group, checkboxes from GET `/foundation-intake` including a `catalog` **or** embed `CHECKLIST_GROUPS` by adding `GET` field `catalog` from FastAPI (`FoundationIntakeService.get_intake` adds `catalog: CHECKLIST_GROUPS` only when status is pending, to avoid duplicating Python/JS). Prefer **server-provided catalog** on GET so labels stay one source.

Add `catalog` to the GET payload in the Python service in this task if not already present (small additive JSON; coach GET may omit catalog).

- [ ] **Step 5: Expand Playwright**

- Fill identity + jump: easier path — mock PATCH/GET, on step 11 click submit after setting `answers` via the UI checkbox; for other steps click Next without filling, then submit returns 422 and lists errors **or** the test PATCHes nothing and uses the API mock to accept submit only when `waiver.accepted` and five photos uploaded through the UI.

Minimum UI assertions:

1. Pending hides Dashboard.
2. Upload one pose shows a preview/status.
3. Submit without waiver stays on wizard with `DO YOU AGREE` / waiver heading visible.
4. After mocked submit 200 and `/auth/me` now `submitted`, Dashboard heading appears.

- [ ] **Step 6: Run Playwright + pytest**

Run: `pnpm exec playwright test e2e/foundation-intake.spec.js`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src e2e/foundation-intake.spec.js backend/app/services/foundation_intake.py
git commit -m "$(cat <<'EOF'
feat: add blocking client foundation wizard

EOF
)"
```

---

### Task 7: Coach panel + existing e2e mocks

**Files:**
- Create: `src/coach/FoundationPanel.jsx`
- Modify: `src/CoachWorkspace.jsx` (`CoachHealth` / review)
- Modify: `src/api/coach.js`
- Modify: `e2e/progress-fixture.js`, `e2e/precision-theme.spec.js`, `e2e/workout-program-builder.spec.js`, `e2e/nutrition-plan-builder.spec.js`, `e2e/coach-workspace-persistence.spec.js`, `e2e/password-recovery.spec.js`, `e2e/login-errors.spec.js`, `e2e/admin-portal.spec.js`, and `e2e/health-lab-reports.spec.js` **only if that file exists on this branch**
- Modify: `e2e/foundation-intake.spec.js` — coach can read answers
- Modify: `e2e/user-journeys.spec.js`

**Interfaces:**
- Consumes: `GET /coach/clients/{id}/foundation-intake`, roster `foundation_intake_status`.
- Produces: Health panel; roster chip; live journey still passes.

- [ ] **Step 1: Failing coach test in `e2e/foundation-intake.spec.js`**

```javascript
test('coach reads submitted foundation answers', async ({ page }) => {
  await loginCoach(page)
  await page.getByRole('button', { name: 'Health' }).click()
  await page.getByRole('combobox').selectOption('client-1')
  await expect(page.getByRole('heading', { name: /Foundation form/i })).toBeVisible()
  await expect(page.getByText('Never been to the gym')).toBeVisible()
})
```

Mock coach GET with `status: 'submitted'` and a slice of `valid_submit_answers`.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement panel**

Read-only definition lists grouped by wizard section. Pending copy: “Waiting for the client to finish intake.” `not_required`: “No foundation form for this client.” Attention flags as `<Status tone="warn">`. Do not add edit controls.

Roster: if `foundation_intake_status === 'pending'`, show chip `Intake pending`.

- [ ] **Step 4: Patch `/auth/me` mocks**

Every client `/auth/me` mock must include `foundation_intake_status: 'not_required'` so existing Playwright suites do not get trapped in the wizard. Coach/admin mocks may omit it.

- [ ] **Step 5: Live journey**

In `e2e/user-journeys.spec.js`, after `activateInvitedClient`, sign in as the client, then:

```javascript
async function completeFoundationViaApi(page, token) {
  const answers = JSON.parse(fs.readFileSync('backend/tests/fixtures/foundation_submit_valid.json', 'utf8'))
  for (const view of ['front', 'back', 'side', 'front_double_bicep', 'back_double_bicep']) {
    const form = new FormData()
    form.set('file', new Blob([onePixelPng], { type: 'image/png' }), `${view}.png`)
    form.set('view', view)
    form.set('captured_on', new Date().toISOString().slice(0, 10))
    await fetch('/api/v1/client/progress-photos', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  }
  const response = await fetch('/api/v1/client/foundation-intake/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, waiver_version: 'xform-foundation-waiver-v1' }),
  })
  if (!response.ok) throw new Error(`foundation submit failed ${response.status}`)
}
```

Use the client session token from the SPA (localStorage/session) the same way other live tests read it. If the live test cannot see the token, perform submit from Node with the password grant against Supabase then call the API with `VITE` origin — follow the pattern already in `activateInvitedClient`.

Reload and assert Dashboard is visible, then continue the existing coach review flow. Assert coach Health shows the foundation panel.

- [ ] **Step 6: Run**

Run: `pnpm exec playwright test e2e/foundation-intake.spec.js e2e/progress-fixture.js e2e/precision-theme.spec.js e2e/login-errors.spec.js e2e/admin-portal.spec.js`  
Plus onboarding pytest.

Expected: PASS for mocked tests. Do not fail the task on live credentials if `E2E_*` is unset; keep live spec skipped unless env is present (current file already uses `required()`).

- [ ] **Step 7: Commit**

```bash
git add src e2e backend/tests/fixtures
git commit -m "$(cat <<'EOF'
feat: show foundation intake to assigned coaches

EOF
)"
```

---

## Self-review

1. **Spec coverage**
   - Blocking gate: Tasks 4, 6
   - Option B schema: Task 2
   - Invite pending + grandfather `not_required`: Tasks 1, 5
   - Photos reuse: Tasks 1, 3, 6
   - Waiver version: Tasks 1–3, 6
   - Coach read / admin isolation: Tasks 1, 5, 7
   - Side effects: Task 5
   - No lab PDF / no LLM / no WhatsApp: catalog + UI copy in Tasks 2, 6
   - Existing Playwright not trapped: Task 7
2. **Placeholders:** Catalog option *lists* are specified as “port every PDF item for the listed groups” with tests for group keys, `none`, and no `(` in labels — that is executable, not TBD. Do not ship empty groups.
3. **Types:** `foundation_intake_status` values `not_required|pending|submitted`; waiver `xform-foundation-waiver-v1`; RPCs `save_foundation_intake_draft` / `submit_foundation_intake` used under those names in every task.
