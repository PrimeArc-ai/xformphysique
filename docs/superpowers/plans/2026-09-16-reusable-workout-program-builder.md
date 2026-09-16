# Reusable Workout Program Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persisted coach workflow that saves and publishes reusable four-week workout programs with 2–6 weekly templates while preserving completed and in-progress client sessions across versions.

**Architecture:** FastAPI validates the coach-facing contract and calls restricted Supabase RPCs with the caller's JWT. PostgreSQL owns atomic draft replacement, immutable publication, session generation, idempotency, RLS, and republish history rules. React renders a controlled builder in a focused component and the existing client workout path consumes generated sessions unchanged.

**Tech Stack:** React 19, Vite, Playwright, Python 3.11+, FastAPI, Pydantic 2, httpx, PostgreSQL 17, Supabase Auth/PostgREST/RLS.

**Spec:** `docs/superpowers/specs/2026-09-16-reusable-workout-program-builder-design.md`

## Global Constraints

- A cycle is exactly 28 inclusive calendar days, beginning on the coach-selected `active_from` date.
- Each program has 2–6 unique ISO weekdays (`1` Monday through `7` Sunday).
- Each day has 1–12 ordered exercises; prescribed sets are 1–20, reps are 1–40 trimmed characters, rest is null or 0–1800 seconds, and coach note is at most 1000 characters.
- Published versions are immutable. Republish preserves all `completed` and `in_progress` sessions and retires only replaced-program `ready` sessions dated on or after the new start date.
- One open draft is allowed per client. Saving a draft creates no client sessions.
- Publish must be atomic and idempotent by caller-generated UUID `publish_key`.
- Every database mutation runs with the authenticated coach JWT. No service-role shortcut.
- New `SECURITY DEFINER` functions set `search_path = ''`, validate `auth.uid()` and active assignment internally, revoke `PUBLIC` and `anon`, and grant only `authenticated`.
- Client active reads exclude `retired_at IS NOT NULL`; preserved historical sessions remain visible to exercise history.
- Live acceptance uses `QA Four-Week Strength`, start date `2026-09-16`, Wednesday/Friday/Sunday, 3 exercises per day, and 4 prescribed sets per exercise.
- Do not modify or commit unrelated `docs/live-rollout-2026-09-15.md` unless a task explicitly names it.

## File and Interface Map

- `supabase/migrations/202609160001_reusable_workout_programs.sql`: additive schema, RLS, draft RPC, publish RPC, active-read indexes.
- `backend/tests/sql/workout_program_acceptance.sql`: PostgreSQL behavior, authorization, rollback, idempotency, and version-preservation acceptance suite.
- `scripts/test-progress-migrations.sh`: executes both existing progress acceptance and workout-program acceptance against a fresh local cluster.
- `backend/app/schemas/workout_program.py`: strict request/response models shared by coach routes.
- `backend/app/services/workout_program.py`: caller-JWT PostgREST/RPC adapter and provider-error translation.
- `backend/app/api/v1/coach.py`: three coach endpoints under the existing client scope.
- `backend/app/services/supabase_client.py`: excludes retired sessions from current dashboard/today/history reads.
- `backend/tests/test_workout_program_api.py`: schema, endpoint, JWT propagation, response, and error tests.
- `src/api/coach.js`: browser methods for get, draft-save, and publish.
- `src/coach/workoutProgramModel.js`: pure initial-state, normalization, validation, and immutable reorder helpers.
- `src/coach/WorkoutProgramBuilder.jsx`: controlled builder, draft restoration, publish confirmation, busy/error/success states.
- `src/CoachWorkspace.jsx`: replaces local preview builder with persisted component.
- `src/styles.css`: builder layout and responsive states following current coach visual language.
- `e2e/workout-program-builder.spec.js`: mocked UI acceptance for limits, restore, validation, retry, and refresh.
- `docs/live-rollout-2026-09-16-workout-program.md`: live backup, migration, browser evidence, and rollback record.

---

### Task 1: Database contract and failing PostgreSQL acceptance tests

**Files:**
- Create: `backend/tests/sql/workout_program_acceptance.sql`
- Modify: `scripts/test-progress-migrations.sh`

**Interfaces:**
- Consumes: existing `auth.uid()`, `public.training_programs`, `public.training_program_days`, `public.workout_sessions`, `public.workout_exercises`, and test bootstrap identities.
- Produces: executable assertions for `public.save_workout_program_draft(uuid,jsonb)` and `public.publish_workout_program(uuid,uuid,jsonb)` returning JSONB.

- [ ] **Step 1: Add the new acceptance file to the fresh-cluster runner**

Append after `progress_acceptance.sql`:

```bash
if [[ -f "$repo_dir/backend/tests/sql/workout_program_acceptance.sql" ]]; then
  psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/workout_program_acceptance.sql"
fi
```

- [ ] **Step 2: Write the failing SQL acceptance fixture**

Use a transaction, create deterministic coach/client/assignment/library fixtures, set the bootstrap JWT claim, and call the missing RPCs:

```sql
begin;

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000001', 'program-coach@xform.test'),
  ('10000000-0000-0000-0000-000000000002', 'program-client@xform.test');
insert into public.profiles(id, role, email, first_name, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'coach', 'program-coach@xform.test', 'Program', 'Program Coach'),
  ('10000000-0000-0000-0000-000000000002', 'client', 'program-client@xform.test', 'Program', 'Program Client');
insert into public.coaches(id, is_active) values
  ('10000000-0000-0000-0000-000000000001', true);
insert into public.clients(id, primary_goal, check_in_day, timezone)
values ('10000000-0000-0000-0000-000000000002', 'strength', 'sunday', 'Asia/Kolkata');
insert into public.coach_client_assignments(coach_id, client_id)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.save_workout_program_draft(
  '10000000-0000-0000-0000-000000000002',
  '{"name":"QA Four-Week Strength","active_from":"2026-09-16","notes":"Controlled QA cycle","days":[{"position":1,"weekday":3,"name":"Wednesday Strength","coach_note":"","exercises":[{"position":1,"name":"Goblet squat","prescribed_sets":4,"prescribed_reps":"8-10","rest_seconds":90,"coach_note":"Controlled tempo"}]},{"position":2,"weekday":5,"name":"Friday Strength","coach_note":"","exercises":[{"position":1,"name":"Romanian deadlift","prescribed_sets":4,"prescribed_reps":"8","rest_seconds":120,"coach_note":"Neutral spine"}]}]}'::jsonb
);

do $$
begin
  if (select count(*) from public.training_programs where status = 'draft') <> 1 then
    raise exception 'expected one draft';
  end if;
  if (select count(*) from public.workout_sessions) <> 0 then
    raise exception 'draft generated sessions';
  end if;
end $$;

rollback;
```

Extend this file in later tasks with reusable fixture functions and explicit assertions for publication, permissions, rollback, and republish.

- [ ] **Step 3: Run the database test and confirm red state**

Run: `bash scripts/test-progress-migrations.sh`

Expected: FAIL containing `function public.save_workout_program_draft(uuid, jsonb) does not exist`.

- [ ] **Step 4: Commit the red acceptance contract**

```bash
git add backend/tests/sql/workout_program_acceptance.sql scripts/test-progress-migrations.sh
git commit -m "test: define workout program database contract"
```

---

### Task 2: Add schema, secure draft save, and atomic publish

**Files:**
- Create: `supabase/migrations/202609160001_reusable_workout_programs.sql`
- Modify: `backend/tests/sql/workout_program_acceptance.sql`

**Interfaces:**
- Consumes: JSON snapshot `{name, active_from, notes, days[]}` and current `auth.uid()`.
- Produces: `save_workout_program_draft(p_client_id uuid, p_snapshot jsonb) -> jsonb`; `publish_workout_program(p_client_id uuid, p_publish_key uuid, p_snapshot jsonb) -> jsonb`.

- [ ] **Step 1: Create the migration and additive tables/columns**

Create the migration with `supabase migration new reusable_workout_programs`, rename only if necessary to preserve repository order, then add:

```sql
alter table public.training_programs add column if not exists publish_key uuid;
alter table public.training_programs add column if not exists coach_note text not null default ''
  check (char_length(coach_note) <= 2000);
alter table public.training_programs alter column version drop not null;
alter type public.audit_action add value if not exists 'workout_program_draft_saved';
create unique index if not exists training_programs_client_publish_key_uidx
  on public.training_programs(client_id, publish_key) where publish_key is not null;
create unique index if not exists training_programs_one_draft_per_client_uidx
  on public.training_programs(client_id) where status = 'draft';

alter table public.training_program_days add column if not exists weekday smallint;
alter table public.training_program_days
  add constraint training_program_days_weekday_check check (weekday between 1 and 7);
create unique index if not exists training_program_days_program_weekday_uidx
  on public.training_program_days(program_id, weekday) where weekday is not null;

create table public.training_program_day_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.training_program_days(id) on delete cascade,
  exercise_library_item_id uuid references public.exercise_library_items(id) on delete set null,
  position smallint not null check (position > 0),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  prescribed_sets smallint not null check (prescribed_sets between 1 and 20),
  prescribed_reps text not null check (char_length(btrim(prescribed_reps)) between 1 and 40),
  rest_seconds smallint check (rest_seconds between 0 and 1800),
  coach_note text not null default '' check (char_length(coach_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_day_id, position)
);

alter table public.workout_sessions
  add column if not exists program_id uuid references public.training_programs(id) on delete set null,
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by_program_id uuid references public.training_programs(id) on delete set null;
create index if not exists workout_sessions_active_client_date_idx
  on public.workout_sessions(client_id, session_date) where retired_at is null;
```

- [ ] **Step 2: Add RLS and template access policies**

```sql
alter table public.training_program_day_exercises enable row level security;

create policy training_program_day_exercises_select_accessible
  on public.training_program_day_exercises for select to authenticated
  using (exists (
    select 1 from public.training_program_days d
    where d.id = program_day_id and public.can_access_training_program(d.program_id)
  ));

create policy training_program_day_exercises_manage_assigned_coach
  on public.training_program_day_exercises for all to authenticated
  using (exists (
    select 1 from public.training_program_days d
    where d.id = program_day_id and public.can_manage_training_program(d.program_id)
  ))
  with check (exists (
    select 1 from public.training_program_days d
    where d.id = program_day_id and public.can_manage_training_program(d.program_id)
  ));

create or replace function public.can_access_workout_session(target_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workout_sessions s
    where s.id = target_session_id
      and public.can_access_client(s.client_id)
      and (s.client_id <> auth.uid() or s.retired_at is null)
  )
$$;

create or replace function public.is_workout_session_client(target_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workout_sessions s
    where s.id = target_session_id and s.client_id = auth.uid() and s.retired_at is null
  )
$$;

drop policy workout_sessions_select_accessible_client on public.workout_sessions;
create policy workout_sessions_select_accessible_client
  on public.workout_sessions for select to authenticated
  using (public.can_access_client(client_id) and (client_id <> auth.uid() or retired_at is null));
```

- [ ] **Step 3: Add one internal validator and result serializer**

Implement private functions in `public` with explicit schema qualification and no grants. Validator raises `22023` for invalid counts, positions, weekdays, bounds, or foreign library IDs. Serializer returns stable keys consumed by FastAPI:

```sql
create or replace function public.workout_program_snapshot_result(target_program_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'client_id', p.client_id, 'name', p.name, 'notes', p.coach_note,
    'status', p.status, 'version', p.version,
    'active_from', p.active_from, 'active_to', p.active_to,
    'replaces_program_id', p.replaces_program_id,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'position', d.position, 'weekday', d.weekday,
        'name', d.name, 'coach_note', d.coach_note,
        'exercises', coalesce((
          select jsonb_agg(to_jsonb(e) - 'created_at' - 'updated_at' - 'program_day_id' order by e.position)
          from public.training_program_day_exercises e where e.program_day_id = d.id
        ), '[]'::jsonb)
      ) order by d.position)
      from public.training_program_days d where d.program_id = p.id
    ), '[]'::jsonb)
  )
  from public.training_programs p where p.id = target_program_id
$$;
```

Add the validator and normalized insert helper. `assert_valid_workout_program_snapshot` first checks `auth.uid()` resolves to an active coach with an unended assignment, then validates exact contiguous positions and optional library ownership:

```sql
create or replace function public.assert_valid_workout_program_snapshot(
  p_client_id uuid, p_snapshot jsonb, p_coach_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_day jsonb; v_exercise jsonb; v_day_count integer; v_exercise_count integer;
begin
  if p_coach_id is null or not exists (
    select 1 from public.coaches c
    join public.coach_client_assignments a on a.coach_id = c.id
    where c.id = p_coach_id and c.is_active and a.client_id = p_client_id and a.ended_at is null
  ) then raise exception using errcode = '42501', message = 'active coach assignment required'; end if;
  if jsonb_typeof(p_snapshot) <> 'object'
     or char_length(btrim(coalesce(p_snapshot->>'name', ''))) not between 1 and 160
     or char_length(coalesce(p_snapshot->>'notes', '')) > 2000
     or (p_snapshot->>'active_from') is null then
    raise exception using errcode = '22023', message = 'invalid program fields';
  end if;
  perform (p_snapshot->>'active_from')::date;
  v_day_count := jsonb_array_length(coalesce(p_snapshot->'days', '[]'::jsonb));
  if v_day_count not between 2 and 6 then
    raise exception using errcode = '22023', message = 'program requires 2 to 6 days';
  end if;
  if (select count(distinct (d->>'weekday')::integer) from jsonb_array_elements(p_snapshot->'days') d) <> v_day_count then
    raise exception using errcode = '22023', message = 'weekdays must be unique';
  end if;
  for v_day in select value from jsonb_array_elements(p_snapshot->'days') loop
    if (v_day->>'position')::integer not between 1 and v_day_count
       or (v_day->>'weekday')::integer not between 1 and 7
       or char_length(btrim(coalesce(v_day->>'name', ''))) not between 1 and 160
       or char_length(coalesce(v_day->>'coach_note', '')) > 2000 then
      raise exception using errcode = '22023', message = 'invalid program day';
    end if;
    v_exercise_count := jsonb_array_length(coalesce(v_day->'exercises', '[]'::jsonb));
    if v_exercise_count not between 1 and 12 then
      raise exception using errcode = '22023', message = 'program day requires 1 to 12 exercises';
    end if;
    for v_exercise in select value from jsonb_array_elements(v_day->'exercises') loop
      if (v_exercise->>'position')::integer not between 1 and v_exercise_count
         or char_length(btrim(coalesce(v_exercise->>'name', ''))) not between 1 and 160
         or (v_exercise->>'prescribed_sets')::integer not between 1 and 20
         or char_length(btrim(coalesce(v_exercise->>'prescribed_reps', ''))) not between 1 and 40
         or (v_exercise->>'rest_seconds') is not null
            and (v_exercise->>'rest_seconds')::integer not between 0 and 1800
         or char_length(coalesce(v_exercise->>'coach_note', '')) > 1000 then
        raise exception using errcode = '22023', message = 'invalid program exercise';
      end if;
      if nullif(v_exercise->>'exercise_library_item_id', '') is not null and not exists (
        select 1 from public.exercise_library_items i
        where i.id = (v_exercise->>'exercise_library_item_id')::uuid
          and i.owner_coach_id = p_coach_id and i.is_active
      ) then raise exception using errcode = '42501', message = 'exercise library item unavailable'; end if;
    end loop;
    if (select count(distinct (e->>'position')::integer) from jsonb_array_elements(v_day->'exercises') e) <> v_exercise_count then
      raise exception using errcode = '22023', message = 'exercise positions must be contiguous';
    end if;
  end loop;
  if (select count(distinct (d->>'position')::integer) from jsonb_array_elements(p_snapshot->'days') d) <> v_day_count then
    raise exception using errcode = '22023', message = 'day positions must be contiguous';
  end if;
end $$;

create or replace function public.insert_workout_program_snapshot(p_program_id uuid, p_snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day jsonb; v_exercise jsonb; v_day_id uuid;
begin
  for v_day in select value from jsonb_array_elements(p_snapshot->'days') order by (value->>'position')::integer loop
    insert into public.training_program_days(program_id, position, weekday, name, coach_note)
    values (p_program_id, (v_day->>'position')::smallint, (v_day->>'weekday')::smallint,
      v_day->>'name', coalesce(v_day->>'coach_note', '')) returning id into v_day_id;
    for v_exercise in select value from jsonb_array_elements(v_day->'exercises') order by (value->>'position')::integer loop
      insert into public.training_program_day_exercises(program_day_id, exercise_library_item_id,
        position, name, prescribed_sets, prescribed_reps, rest_seconds, coach_note)
      values (v_day_id, nullif(v_exercise->>'exercise_library_item_id', '')::uuid,
        (v_exercise->>'position')::smallint, v_exercise->>'name',
        (v_exercise->>'prescribed_sets')::smallint, v_exercise->>'prescribed_reps',
        nullif(v_exercise->>'rest_seconds', '')::smallint, coalesce(v_exercise->>'coach_note', ''));
    end loop;
  end loop;
end $$;
```

Add `generate_workout_program_sessions`. It inserts one session for each selected weekday in range and copies the matching day template:

```sql
create or replace function public.generate_workout_program_sessions(
  p_program_id uuid, p_client_id uuid, p_start date, p_end date
) returns void language plpgsql security definer set search_path = '' as $$
declare v_session record;
begin
  for v_session in
    insert into public.workout_sessions(client_id, program_id, program_day_id, session_date,
      title, week_label, coach_note, status, estimated_duration_minutes)
    select p_client_id, p_program_id, d.id, g.day::date, d.name,
      'Week ' || (((g.day::date - p_start) / 7) + 1), d.coach_note, 'ready', 60
    from generate_series(p_start, p_end, interval '1 day') g(day)
    join public.training_program_days d
      on d.program_id = p_program_id and d.weekday = extract(isodow from g.day)::integer
    order by g.day
    returning id, program_day_id
  loop
    insert into public.workout_exercises(session_id, exercise_library_item_id, position, name,
      prescribed_sets, prescribed_reps, rest_seconds, coach_note)
    select v_session.id, e.exercise_library_item_id, e.position, e.name,
      e.prescribed_sets, e.prescribed_reps, e.rest_seconds, e.coach_note
    from public.training_program_day_exercises e
    where e.program_day_id = v_session.program_day_id order by e.position;
  end loop;
end $$;
```

- [ ] **Step 4: Implement atomic draft replacement**

`save_workout_program_draft` must validate active coach assignment, lock the client's draft, delete only the existing draft, insert a new normalized draft snapshot, write `workout_program_draft_saved`, and return `workout_program_snapshot_result`. Published rows retain positive versions; drafts use `NULL`, so draft saves never consume published version numbers and the existing unique constraint still protects published versions.

```sql
create or replace function public.save_workout_program_draft(p_client_id uuid, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_coach uuid := auth.uid(); v_program uuid;
begin
  perform public.assert_valid_workout_program_snapshot(p_client_id, p_snapshot, v_coach);
  perform 1 from public.clients c where c.id = p_client_id for update;
  delete from public.training_programs where client_id = p_client_id and status = 'draft';
  insert into public.training_programs(client_id, created_by_coach_id, version, name, coach_note, status, active_from)
  values (p_client_id, v_coach, null, p_snapshot->>'name', coalesce(p_snapshot->>'notes', ''),
          'draft', (p_snapshot->>'active_from')::date)
  returning id into v_program;
  perform public.insert_workout_program_snapshot(v_program, p_snapshot);
  insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
  values (v_coach, p_client_id, 'workout_program_draft_saved', 'training_program', v_program,
          jsonb_build_object('day_count', jsonb_array_length(p_snapshot->'days')));
  return public.workout_program_snapshot_result(v_program);
end $$;
```

- [ ] **Step 5: Implement idempotent immutable publish**

Publish checks `(client_id, publish_key)` first, locks the client row, calculates next version and 28-day range, archives the previous published row and draft, retires only qualifying future `ready` sessions, inserts the normalized published snapshot, generates dates with `generate_series(active_from, active_from + 27, interval '1 day')`, copies exercises into each session, writes one audit row, and returns `program`, `generated_session_count`, and `generated_session_dates`.

```sql
create or replace function public.publish_workout_program(
  p_client_id uuid, p_publish_key uuid, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_coach uuid := auth.uid(); v_program uuid; v_previous uuid; v_existing uuid;
  v_start date := (p_snapshot->>'active_from')::date; v_end date := v_start + 27;
  v_version integer; v_count integer; v_dates jsonb;
begin
  select id into v_existing from public.training_programs
  where client_id = p_client_id and publish_key = p_publish_key;
  if v_existing is not null then
    select count(*), coalesce(jsonb_agg(session_date order by session_date), '[]'::jsonb)
      into v_count, v_dates from public.workout_sessions where program_id = v_existing;
    return jsonb_build_object('program', public.workout_program_snapshot_result(v_existing),
      'generated_session_count', v_count, 'generated_session_dates', v_dates);
  end if;
  perform public.assert_valid_workout_program_snapshot(p_client_id, p_snapshot, v_coach);
  perform 1 from public.clients c where c.id = p_client_id for update;
  select id into v_previous from public.training_programs
    where client_id = p_client_id and status = 'published' for update;
  select coalesce(max(version), 0) + 1 into v_version
    from public.training_programs where client_id = p_client_id and version > 0;
  update public.training_programs set status = 'archived', active_to = v_start - 1
    where id = v_previous;
  insert into public.training_programs(client_id, created_by_coach_id, replaces_program_id,
    version, name, coach_note, status, active_from, active_to, published_at, publish_key)
  values (p_client_id, v_coach, v_previous, v_version, p_snapshot->>'name',
    coalesce(p_snapshot->>'notes', ''), 'published', v_start, v_end, now(), p_publish_key)
  returning id into v_program;
  perform public.insert_workout_program_snapshot(v_program, p_snapshot);
  update public.workout_sessions set retired_at = now(), retired_by_program_id = v_program
    where program_id = v_previous and status = 'ready' and session_date >= v_start and retired_at is null;
  perform public.generate_workout_program_sessions(v_program, p_client_id, v_start, v_end);
  update public.training_programs set status = 'archived'
    where client_id = p_client_id and status = 'draft';
  select count(*), coalesce(jsonb_agg(session_date order by session_date), '[]'::jsonb)
    into v_count, v_dates from public.workout_sessions where program_id = v_program;
  insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
  values (v_coach, p_client_id, 'workout_program_published', 'training_program', v_program,
    jsonb_build_object('version', v_version, 'generated_session_count', v_count,
      'active_from', v_start, 'active_to', v_end, 'replaced_program_id', v_previous));
  return jsonb_build_object('program', public.workout_program_snapshot_result(v_program),
    'generated_session_count', v_count, 'generated_session_dates', v_dates);
end $$;
```

- [ ] **Step 6: Lock down RPC grants and add updated-at trigger**

```sql
revoke all on function public.save_workout_program_draft(uuid,jsonb) from public, anon;
revoke all on function public.publish_workout_program(uuid,uuid,jsonb) from public, anon;
revoke all on function public.assert_valid_workout_program_snapshot(uuid,jsonb,uuid) from public;
revoke all on function public.insert_workout_program_snapshot(uuid,jsonb) from public;
revoke all on function public.generate_workout_program_sessions(uuid,uuid,date,date) from public;
revoke all on function public.workout_program_snapshot_result(uuid) from public;
grant execute on function public.save_workout_program_draft(uuid,jsonb) to authenticated;
grant execute on function public.publish_workout_program(uuid,uuid,jsonb) to authenticated;
create trigger training_program_day_exercises_set_updated_at
before update on public.training_program_day_exercises
for each row execute function public.set_updated_at();
```

- [ ] **Step 7: Complete PostgreSQL acceptance coverage**

Add assertions that:

```sql
create or replace function pg_temp.three_day_snapshot() returns jsonb language sql as $$
  select jsonb_build_object(
    'name', 'QA Four-Week Strength', 'active_from', '2026-09-16', 'notes', 'QA cycle',
    'days', (select jsonb_agg(jsonb_build_object(
      'position', d.position,
      'weekday', (array[3,5,7])[d.position],
      'name', (array['Wednesday Strength','Friday Strength','Sunday Strength'])[d.position],
      'coach_note', '',
      'exercises', (select jsonb_agg(jsonb_build_object(
        'position', e.position, 'exercise_library_item_id', null,
        'name', 'QA Exercise ' || d.position || '.' || e.position,
        'prescribed_sets', 4, 'prescribed_reps', '8-10',
        'rest_seconds', 90, 'coach_note', ''
      ) order by e.position) from generate_series(1,3) e(position))
    ) order by d.position) from generate_series(1,3) d(position))
  )
$$;

-- first publish: Wed/Fri/Sun across 28 days
select public.publish_workout_program(
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  pg_temp.three_day_snapshot()
);
do $$ begin
  if (select count(*) from public.workout_sessions where retired_at is null) <> 12 then
    raise exception 'expected twelve active sessions';
  end if;
  if (select count(*) from public.workout_exercises) <> 36 then
    raise exception 'expected thirty-six generated exercises';
  end if;
end $$;

-- same key returns same version and count
select public.publish_workout_program(
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  pg_temp.three_day_snapshot()
);
do $$ begin
  if (select count(*) from public.training_programs where status = 'published') <> 1 then
    raise exception 'idempotent retry created another version';
  end if;
end $$;
```

Also create one completed, one in-progress, and one future-ready old session before a second publish; assert the first two are unchanged and only the future-ready row has `retired_at`. Run calls under anonymous, client, inactive coach, unassigned coach, and Admin claims and assert rejection. Submit duplicate weekdays, seven days, zero exercises, non-contiguous positions, and a foreign library item and assert the transaction leaves counts unchanged.

- [ ] **Step 8: Run fresh-cluster database tests**

Run: `bash scripts/test-progress-migrations.sh`

Expected: PASS for all migrations, existing progress acceptance, and workout-program acceptance.

- [ ] **Step 9: Commit database behavior**

```bash
git add supabase/migrations/202609160001_reusable_workout_programs.sql backend/tests/sql/workout_program_acceptance.sql
git commit -m "feat: add versioned workout program persistence"
```

---

### Task 3: Add strict FastAPI contract and caller-JWT service

**Files:**
- Create: `backend/app/schemas/workout_program.py`
- Create: `backend/app/services/workout_program.py`
- Create: `backend/tests/test_workout_program_api.py`
- Modify: `backend/app/api/v1/coach.py`
- Modify: `backend/tests/test_openapi_contract.py`

**Interfaces:**
- Consumes: database RPCs from Task 2 and `AuthenticatedUser.access_token`.
- Produces: `WorkoutProgramSnapshot`, `WorkoutProgramResponse`, `WorkoutProgramWorkspaceResponse`, `WorkoutProgramPublishRequest`, `WorkoutProgramPublishResponse`, and three HTTP endpoints.

- [ ] **Step 1: Write failing schema tests**

```python
def snapshot(days=2):
    return {
        "name": "QA Four-Week Strength", "active_from": "2026-09-16", "notes": "",
        "days": [{
            "position": index, "weekday": weekday, "name": f"Day {index}", "coach_note": "",
            "exercises": [{"position": 1, "name": "Goblet squat", "prescribed_sets": 4,
                           "prescribed_reps": "8-10", "rest_seconds": 90, "coach_note": ""}],
        } for index, weekday in enumerate(range(3, 3 + days), 1)],
    }

def test_snapshot_rejects_duplicate_weekdays():
    payload = snapshot()
    payload["days"][1]["weekday"] = 3
    with pytest.raises(ValidationError):
        WorkoutProgramSnapshot.model_validate(payload)

def test_snapshot_rejects_non_contiguous_positions():
    payload = snapshot()
    payload["days"][1]["position"] = 3
    with pytest.raises(ValidationError):
        WorkoutProgramSnapshot.model_validate(payload)
```

- [ ] **Step 2: Run schema tests and confirm red state**

Run: `cd backend && python -m pytest tests/test_workout_program_api.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.workout_program'`.

- [ ] **Step 3: Implement strict Pydantic models**

```python
class WorkoutProgramAPIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class WorkoutProgramExerciseInput(WorkoutProgramAPIModel):
    position: Annotated[int, Field(ge=1, le=12)]
    exercise_library_item_id: UUID | None = None
    name: Annotated[str, Field(min_length=1, max_length=160)]
    prescribed_sets: Annotated[int, Field(ge=1, le=20)]
    prescribed_reps: Annotated[str, Field(min_length=1, max_length=40)]
    rest_seconds: Annotated[int | None, Field(ge=0, le=1800)] = None
    coach_note: Annotated[str, Field(max_length=1000)] = ""

class WorkoutProgramDayInput(WorkoutProgramAPIModel):
    position: Annotated[int, Field(ge=1, le=6)]
    weekday: Annotated[int, Field(ge=1, le=7)]
    name: Annotated[str, Field(min_length=1, max_length=160)]
    coach_note: Annotated[str, Field(max_length=2000)] = ""
    exercises: list[WorkoutProgramExerciseInput] = Field(min_length=1, max_length=12)

class WorkoutProgramSnapshot(WorkoutProgramAPIModel):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    active_from: date
    notes: Annotated[str, Field(max_length=2000)] = ""
    days: list[WorkoutProgramDayInput] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def validate_order_and_weekdays(self):
        if [day.position for day in self.days] != list(range(1, len(self.days) + 1)):
            raise ValueError("Program day positions must be contiguous from 1")
        if len({day.weekday for day in self.days}) != len(self.days):
            raise ValueError("Training weekdays must be unique")
        for day in self.days:
            if [exercise.position for exercise in day.exercises] != list(range(1, len(day.exercises) + 1)):
                raise ValueError(f"Exercise positions for {day.name} must be contiguous from 1")
        return self
```

Define response models with UUID/date/datetime fields matching the Task 2 JSON exactly:

```python
class WorkoutProgramExerciseResponse(WorkoutProgramExerciseInput):
    id: UUID

class WorkoutProgramDayResponse(WorkoutProgramAPIModel):
    id: UUID
    position: int
    weekday: int
    name: str
    coach_note: str
    exercises: list[WorkoutProgramExerciseResponse]

class WorkoutProgramResponse(WorkoutProgramAPIModel):
    id: UUID
    client_id: UUID
    name: str
    notes: str = ""
    status: Literal["draft", "published", "archived"]
    version: int | None
    active_from: date
    active_to: date | None
    replaces_program_id: UUID | None
    days: list[WorkoutProgramDayResponse]

class ExerciseLibraryOption(WorkoutProgramAPIModel):
    id: UUID
    name: str
    body_region: str
    training_focus: str

class WorkoutProgramWorkspaceResponse(WorkoutProgramAPIModel):
    active_program: WorkoutProgramResponse | None
    draft: WorkoutProgramResponse | None
    exercise_library: list[ExerciseLibraryOption]

class WorkoutProgramPublishRequest(WorkoutProgramAPIModel):
    publish_key: UUID
    program: WorkoutProgramSnapshot

class WorkoutProgramPublishResponse(WorkoutProgramAPIModel):
    program: WorkoutProgramResponse
    generated_session_count: int
    generated_session_dates: list[date]
```

- [ ] **Step 4: Write failing service and route tests**

Monkeypatch `SupabaseGateway.request`; assert GET issues RLS-filtered reads, PUT posts `{p_client_id, p_snapshot}`, POST posts `{p_client_id, p_publish_key, p_snapshot}`, and every request carries the coach JWT. Add API dependency overrides and assert 422/403/409/503 contracts.

```python
def test_publish_uses_caller_jwt_and_rpc(monkeypatch):
    seen = []
    def request(method, url, **kwargs):
        seen.append((method, url, kwargs))
        if url.endswith("/rest/v1/profiles"):
            return FakeResponse(200, [{"id": "coach-id", "role": "coach"}])
        if url.endswith("/rest/v1/coaches"):
            return FakeResponse(200, [{"id": "coach-id", "is_active": True}])
        if url.endswith("/rest/v1/clients"):
            return FakeResponse(200, [{"id": "client-id"}])
        if url.endswith("/rest/v1/rpc/publish_workout_program"):
            return FakeResponse(200, publish_result())
        raise AssertionError(url)
    monkeypatch.setattr(httpx, "request", request)
    result = WorkoutProgramService(settings(), coach_user()).publish(
        "client-id", UUID("20000000-0000-0000-0000-000000000001"),
        WorkoutProgramSnapshot.model_validate(snapshot()),
    )
    assert result["generated_session_count"] == 12
    assert seen[-1][2]["headers"]["Authorization"] == "Bearer coach-jwt"
```

- [ ] **Step 5: Implement focused service**

```python
class WorkoutProgramService:
    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.gateway = SupabaseGateway(settings, user.access_token) if settings.supabase_enabled else None

    def get_workspace(self, client_id: str) -> dict[str, Any]:
        self._require_client_access(client_id)
        select = (
            "id,client_id,name,coach_note,status,version,active_from,active_to,replaces_program_id,"
            "training_program_days(id,position,weekday,name,coach_note,"
            "training_program_day_exercises(id,position,exercise_library_item_id,name,"
            "prescribed_sets,prescribed_reps,rest_seconds,coach_note))"
        )
        active = self._rows("training_programs", {
            "select": select, "client_id": f"eq.{client_id}", "status": "eq.published",
            "order": "published_at.desc", "limit": 1,
        })
        draft = self._rows("training_programs", {
            "select": select, "client_id": f"eq.{client_id}", "status": "eq.draft", "limit": 1,
        })
        library = self._rows("exercise_library_items", {
            "select": "id,name,body_region,training_focus", "owner_coach_id": f"eq.{self.user.id}",
            "is_active": "eq.true", "order": "name.asc",
        })
        return {
            "active_program": self._normalize_program(active[0]) if active else None,
            "draft": self._normalize_program(draft[0]) if draft else None,
            "exercise_library": library,
        }

    def save_draft(self, client_id: str, snapshot: WorkoutProgramSnapshot) -> dict[str, Any]:
        self._require_client_access(client_id)
        return self.gateway.request("POST", "/rest/v1/rpc/save_workout_program_draft", json={
            "p_client_id": client_id,
            "p_snapshot": snapshot.model_dump(mode="json"),
        }).json()

    def publish(self, client_id: str, publish_key: UUID,
                snapshot: WorkoutProgramSnapshot) -> dict[str, Any]:
        self._require_client_access(client_id)
        return self.gateway.request("POST", "/rest/v1/rpc/publish_workout_program", json={
            "p_client_id": client_id,
            "p_publish_key": str(publish_key),
            "p_snapshot": snapshot.model_dump(mode="json"),
        }).json()

    def _rows(self, table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        return self.gateway.request("GET", f"/rest/v1/{table}", params=params).json()

    def _require_client_access(self, client_id: str) -> None:
        profile = self._rows("profiles", {"select": "id,role", "id": f"eq.{self.user.id}"})
        coach = self._rows("coaches", {"select": "id,is_active", "id": f"eq.{self.user.id}"})
        client = self._rows("clients", {"select": "id", "id": f"eq.{client_id}"})
        if not profile or profile[0]["role"] != "coach" or not coach or not coach[0]["is_active"]:
            raise APIError(403, "coach_role_required", "An active coach account is required")
        if not client:
            raise APIError(404, "client_not_found", "Client not found or not assigned to this coach")

    @staticmethod
    def _normalize_program(row: dict[str, Any]) -> dict[str, Any]:
        result = {key: value for key, value in row.items() if key != "training_program_days"}
        result["notes"] = result.pop("coach_note", "")
        result["days"] = sorted(row.get("training_program_days", []), key=lambda day: day["position"])
        for day in result["days"]:
            day["exercises"] = sorted(day.pop("training_program_day_exercises", []),
                                      key=lambda exercise: exercise["position"])
        return result
```

`_require_client_access` must perform the same active-coach/profile/client RLS checks as `SupabaseCoachService`. Convert PostgreSQL `23505`/`40001` conflicts to `APIError(409, "program_publish_conflict", ...)`, `22023` to 422, and upstream availability failures to 503.

- [ ] **Step 6: Add coach routes**

```python
@router.get("/clients/{client_id}/workout-program", response_model=WorkoutProgramWorkspaceResponse)
def get_workout_program(client_id: str, settings: Settings = Depends(get_settings),
                        user: AuthenticatedUser = Depends(get_authenticated_user)):
    return WorkoutProgramService(settings, user).get_workspace(client_id)

@router.put("/clients/{client_id}/workout-program/draft", response_model=WorkoutProgramResponse)
def save_workout_program_draft(client_id: str, payload: WorkoutProgramSnapshot,
                               settings: Settings = Depends(get_settings),
                               user: AuthenticatedUser = Depends(get_authenticated_user)):
    return WorkoutProgramService(settings, user).save_draft(client_id, payload)

@router.post("/clients/{client_id}/workout-program/publish", response_model=WorkoutProgramPublishResponse)
def publish_workout_program(client_id: str, payload: WorkoutProgramPublishRequest,
                            settings: Settings = Depends(get_settings),
                            user: AuthenticatedUser = Depends(get_authenticated_user)):
    return WorkoutProgramService(settings, user).publish(client_id, payload.publish_key, payload.program)
```

- [ ] **Step 7: Verify API and OpenAPI tests**

Run: `cd backend && python -m pytest tests/test_workout_program_api.py tests/test_openapi_contract.py -q`

Expected: PASS.

- [ ] **Step 8: Run complete backend suite and commit**

Run: `cd backend && python -m pytest -q`

Expected: PASS.

```bash
git add backend/app/schemas/workout_program.py backend/app/services/workout_program.py backend/app/api/v1/coach.py backend/tests/test_workout_program_api.py backend/tests/test_openapi_contract.py
git commit -m "feat: expose coach workout program API"
```

---

### Task 4: Exclude retired sessions from client active reads

**Files:**
- Modify: `backend/app/services/supabase_client.py`
- Modify: `backend/tests/test_client_api.py`
- Modify: `backend/tests/test_progress_completion.py`

**Interfaces:**
- Consumes: `workout_sessions.retired_at` from Task 2.
- Produces: dashboard, today-session, update, and history queries that never include retired replacements.

- [ ] **Step 1: Add failing query-contract tests**

Capture calls for dashboard, `get_workout_for_date`, `update_workout_session`, and `workout_history`; assert every `workout_sessions` read includes:

```python
assert params["retired_at"] == "is.null"
```

- [ ] **Step 2: Run focused tests and confirm red state**

Run: `cd backend && python -m pytest tests/test_client_api.py tests/test_progress_completion.py -q`

Expected: FAIL because current query dictionaries omit `retired_at`.

- [ ] **Step 3: Add active-session predicate to all client reads**

```python
sessions = self._rows("workout_sessions", {
    "client_id": f"eq.{self.client_id}",
    "session_date": f"gte.{today - timedelta(days=29)}",
    "retired_at": "is.null",
})
```

Apply the same predicate to exact-date, session-ID, and history reads. Preserve all completed/in-progress rows because Task 2 never retires them.

- [ ] **Step 4: Run backend suite and commit**

Run: `cd backend && python -m pytest -q`

Expected: PASS.

```bash
git add backend/app/services/supabase_client.py backend/tests/test_client_api.py backend/tests/test_progress_completion.py
git commit -m "fix: hide retired workout sessions from clients"
```

---

### Task 5: Build controlled coach program editor

**Files:**
- Create: `src/coach/workoutProgramModel.js`
- Create: `src/coach/WorkoutProgramBuilder.jsx`
- Create: `e2e/workout-program-builder.spec.js`
- Modify: `src/api/coach.js`
- Modify: `src/CoachWorkspace.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 3 endpoints and current `accessToken`, selected client `id/name`.
- Produces: `WorkoutProgramBuilder({ client, accessToken })`; pure `emptyProgram(startDate)`, `validateProgram(program)`, and `moveExercise(program, dayIndex, fromIndex, toIndex)`.

- [ ] **Step 1: Write mocked Playwright tests before UI code**

Mock `/api/v1/coach/clients/client-id/workout-program`, draft, and publish. Cover two-day default, day limits, duplicate weekday message, exercise add/remove/reorder, reload restoration, failed publish retaining form state, retry key reuse, and successful twelve-session refresh.

```javascript
test('draft restores and publish refreshes persisted program', async ({ page }) => {
  const state = workoutProgramFixture()
  await mockWorkoutProgram(page, state)
  await loginCoach(page)
  await page.getByRole('button', { name: 'Workout', exact: true }).click()
  await page.getByLabel('Program name').fill('QA Four-Week Strength')
  await page.getByRole('button', { name: 'Add training day' }).click()
  await page.getByLabel('Day 1 weekday').selectOption('3')
  await page.getByLabel('Day 2 weekday').selectOption('5')
  await page.getByLabel('Day 3 weekday').selectOption('7')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Workout', exact: true }).click()
  await expect(page.getByLabel('Program name')).toHaveValue('QA Four-Week Strength')
  await page.getByRole('button', { name: 'Publish 4-week program' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText('12 sessions published')).toBeVisible()
  expect(state.publishCalls).toHaveLength(1)
})
```

- [ ] **Step 2: Run the new UI test and confirm red state**

Run: `npx playwright test e2e/workout-program-builder.spec.js`

Expected: FAIL because persisted builder controls do not exist.

- [ ] **Step 3: Add coach API methods**

```javascript
getWorkoutProgram: (clientId, token) => request(`/coach/clients/${clientId}/workout-program`, token),
saveWorkoutProgramDraft: (clientId, payload, token) => request(`/coach/clients/${clientId}/workout-program/draft`, token, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
}),
publishWorkoutProgram: (clientId, publishKey, program, token) => request(`/coach/clients/${clientId}/workout-program/publish`, token, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ publish_key: publishKey, program }),
}),
```

- [ ] **Step 4: Implement pure builder model**

```javascript
export function validateProgram(program) {
  const errors = {}
  if (!program.name.trim()) errors.name = 'Program name is required.'
  if (!program.active_from) errors.active_from = 'Start date is required.'
  if (program.days.length < 2 || program.days.length > 6) errors.days = 'Choose 2–6 training days.'
  const weekdays = program.days.map(day => Number(day.weekday))
  if (new Set(weekdays).size !== weekdays.length) errors.weekdays = 'Each training day needs a unique weekday.'
  program.days.forEach((day, dayIndex) => {
    if (!day.name.trim()) errors[`days.${dayIndex}.name`] = 'Day name is required.'
    if (day.exercises.length < 1 || day.exercises.length > 12) errors[`days.${dayIndex}.exercises`] = 'Add 1–12 exercises.'
    day.exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise.name.trim()) errors[`days.${dayIndex}.exercises.${exerciseIndex}.name`] = 'Exercise name is required.'
      if (exercise.prescribed_sets < 1 || exercise.prescribed_sets > 20) errors[`days.${dayIndex}.exercises.${exerciseIndex}.sets`] = 'Sets must be 1–20.'
    })
  })
  return errors
}
```

Normalization rewrites every day/exercise position after add, remove, or reorder. Default state contains two unique weekdays and one blank exercise each.

- [ ] **Step 5: Implement `WorkoutProgramBuilder`**

On client change, load workspace and prefer open draft over active program over default. Keep all inputs controlled. Generate a `crypto.randomUUID()` publish key once per confirmation attempt and reuse it after transport failure; clear it only after confirmed success or form edit following success.

```jsx
export default function WorkoutProgramBuilder({ client, accessToken }) {
  const [program, setProgram] = useState(() => emptyProgram(localDate()))
  const [workspace, setWorkspace] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const publishKey = useRef(null)

  const publish = async () => {
    const nextErrors = validateProgram(program)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    publishKey.current ||= crypto.randomUUID()
    setBusy('publish')
    try {
      const result = await coachApi.publishWorkoutProgram(client.id, publishKey.current, program, accessToken)
      setWorkspace(current => ({ ...current, active_program: result.program, draft: null }))
      setNotice(`${result.generated_session_count} sessions published`)
      publishKey.current = null
    } catch (error) {
      setNotice(error.message || 'Publish failed. Your entries are still here; retry safely.')
    } finally {
      setBusy('')
    }
  }
```

Render accessible labels for every field, Add/Remove Day (bounded 2–6), Add/Remove Exercise (bounded 1–12), Move Up/Down, Save Draft, Publish, and confirmation containing exact start/end dates and computed session count.

- [ ] **Step 6: Replace local preview in coach workspace**

Delete the hard-coded `WorkoutBuilder` function and render:

```jsx
<WorkoutProgramBuilder client={selectedClient} accessToken={accessToken} />
```

Keep selected-client controls and existing coach navigation intact. Do not change unrelated nutrition/library preview screens.

- [ ] **Step 7: Add responsive builder styles**

Use existing coach variables/classes. Desktop: day cards in two columns where space permits. Mobile: one column, full-width actions, exercise controls remain keyboard reachable. Error text uses current warning color; published status uses current good/lime treatment. No new font, icon library, or dependency.

- [ ] **Step 8: Run focused UI tests and build**

Run: `npx playwright test e2e/workout-program-builder.spec.js`

Expected: PASS.

Run: `npm run build`

Expected: PASS without Vite warnings introduced by this feature.

- [ ] **Step 9: Run complete mocked browser suite and commit**

Run: `npm run test:e2e`

Expected: PASS.

```bash
git add src/api/coach.js src/coach/workoutProgramModel.js src/coach/WorkoutProgramBuilder.jsx src/CoachWorkspace.jsx src/styles.css e2e/workout-program-builder.spec.js
git commit -m "feat: add reusable workout program builder"
```

---

### Task 6: Full verification, live migration, and visible browser acceptance

**Files:**
- Create: `docs/live-rollout-2026-09-16-workout-program.md`
- Modify only if a defect is found: files named in Tasks 2–5 and their corresponding tests.

**Interfaces:**
- Consumes: complete feature and configured local frontend/backend, Supabase project, coach/client demo accounts.
- Produces: verified live program, twelve generated sessions, preserved history after republish, and rollback evidence.

- [ ] **Step 1: Run all local automated gates**

```bash
bash scripts/test-progress-migrations.sh
cd backend && python -m pytest -q
cd .. && npm run build
npm run test:e2e
```

Expected: every command exits `0`.

- [ ] **Step 2: Inspect migration against live schema before mutation**

Use read-only queries for conflicting columns, constraints, functions, draft duplicates, and existing active published programs. Record counts in rollout document. Stop if existing objects have incompatible types or multiple drafts exist for one client.

- [ ] **Step 3: Take recoverable pre-migration backup**

Create a timestamped custom-format public-schema backup outside repository, then verify it lists `training_programs`, `training_program_days`, `workout_sessions`, and `workout_exercises`:

```powershell
pg_dump --format=custom --schema=public --file="$env:TEMP\xformphysique-before-workout-program-20260916.dump" "$env:XFORM_DATABASE_URL"
pg_restore --list "$env:TEMP\xformphysique-before-workout-program-20260916.dump" | Select-String 'training_programs|training_program_days|workout_sessions|workout_exercises'
```

- [ ] **Step 4: Apply migration and verify permissions**

Apply only `202609160001_reusable_workout_programs.sql` with `ON_ERROR_STOP=1`. Verify `anon` and `PUBLIC` lack RPC execute privilege, `authenticated` has it, RLS is enabled on template exercises, and no partial program/session rows exist.

- [ ] **Step 5: Test visible coach draft and publish flow**

Through in-app browser at `http://127.0.0.1:5173/`, sign in as demo coach. Select Navaneet. Create:

- `QA Four-Week Strength`
- Start `2026-09-16`
- Wednesday: Goblet squat, Romanian deadlift, Incline dumbbell press
- Friday: Cable row, Split squat, Dumbbell shoulder press
- Sunday: Leg press, Lat pulldown, Hip thrust
- Every exercise: 4 sets with valid reps/rest values

Save Draft, reload page, and verify every field restores. Publish, confirm date range `2026-09-16` through `2026-10-13`, and verify UI reports exactly `12 sessions published`.

- [ ] **Step 6: Test visible client execution flow**

Sign out and sign in as Navaneet. Open Workout. Verify today's session has three prescribed exercises and four set rows each. Fill all twelve sets, Save Draft, reload, and verify all values and volume persist. Complete session. Open Exercise History and verify best set, frequency, chart/trend, and raw rows appear for completed data.

- [ ] **Step 7: Test visible republish preservation**

Sign back in as coach. Change one future template exercise and publish a new version with a new key. Sign in as Navaneet and verify completed current session remains unchanged while future active sessions use the new version. Confirm retired old future sessions do not appear in client dashboard, today lookup, or history.

- [ ] **Step 8: Record evidence and rollback path**

Document backup path, applied migration hash, database assertion output, automated test totals, program IDs/versions, generated dates, and browser screenshots. State rollback: revert API/UI writers and disable publish route; retain additive schema and all published/client history data.

- [ ] **Step 9: Final review and commit rollout evidence**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended feature changes plus the pre-existing untracked `docs/live-rollout-2026-09-15.md`.

```bash
git add docs/live-rollout-2026-09-16-workout-program.md
git commit -m "docs: record workout program rollout"
```

## Completion Gate

- Database acceptance verifies 12-date generation, rollback, authorization, retry idempotency, and republish preservation.
- FastAPI suite verifies strict validation, caller-JWT propagation, error mapping, and OpenAPI contract.
- Playwright verifies controlled builder behavior and persisted draft/publication states.
- Visible live browser verifies coach and client flows with Navaneet.
- No completion claim until all commands and live checks have fresh passing evidence.
