-- Reusable four-week templates; mutation RPCs are the atomic boundary.
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

alter table public.training_program_day_exercises enable row level security;
grant select, insert, update, delete on public.training_program_day_exercises
  to authenticated, service_role;

-- Published snapshots are mutated only by the SECURITY DEFINER publish RPC.
-- Direct authenticated DML remains available for drafts.
drop policy training_programs_manage_assigned_coach
  on public.training_programs;
create policy training_programs_manage_assigned_coach
  on public.training_programs for all to authenticated
  using (
    public.can_manage_client(client_id)
    and status = 'draft'
  )
  with check (
    public.can_manage_client(client_id)
    and created_by_coach_id = auth.uid()
    and status = 'draft'
  );

drop policy training_program_days_manage_assigned_coach
  on public.training_program_days;
create policy training_program_days_manage_assigned_coach
  on public.training_program_days for all to authenticated
  using (exists (
    select 1
    from public.training_programs p
    where p.id = program_id
      and p.status = 'draft'
      and public.can_manage_training_program(p.id)
  ))
  with check (exists (
    select 1
    from public.training_programs p
    where p.id = program_id
      and p.status = 'draft'
      and public.can_manage_training_program(p.id)
  ));

create policy training_program_day_exercises_select_accessible
  on public.training_program_day_exercises for select to authenticated
  using (exists (
    select 1
    from public.training_program_days d
    where d.id = program_day_id
      and public.can_access_training_program(d.program_id)
  ));

create policy training_program_day_exercises_manage_assigned_coach
  on public.training_program_day_exercises for all to authenticated
  using (exists (
    select 1
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    where d.id = program_day_id
      and p.status = 'draft'
      and public.can_manage_training_program(p.id)
  ))
  with check (exists (
    select 1
    from public.training_program_days d
    join public.training_programs p on p.id = d.program_id
    where d.id = program_day_id
      and p.status = 'draft'
      and public.can_manage_training_program(p.id)
  ));

create or replace function public.can_access_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions s
    where s.id = target_session_id
      and public.can_access_client(s.client_id)
      and (s.client_id <> auth.uid() or s.retired_at is null)
  )
$$;

create or replace function public.is_workout_session_client(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions s
    where s.id = target_session_id
      and s.client_id = auth.uid()
      and s.retired_at is null
  )
$$;

drop policy workout_sessions_select_accessible_client on public.workout_sessions;
create policy workout_sessions_select_accessible_client
  on public.workout_sessions for select to authenticated
  using (
    public.can_access_client(client_id)
    and (client_id <> auth.uid() or retired_at is null)
  );

create or replace function public.workout_program_snapshot_result(target_program_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'client_id', p.client_id,
    'name', p.name,
    'notes', p.coach_note,
    'status', p.status,
    'version', p.version,
    'active_from', p.active_from,
    'active_to', p.active_to,
    'replaces_program_id', p.replaces_program_id,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'position', d.position,
        'weekday', d.weekday,
        'name', d.name,
        'coach_note', d.coach_note,
        'exercises', coalesce((
          select jsonb_agg(
            to_jsonb(e) - 'created_at' - 'updated_at' - 'program_day_id'
            order by e.position
          )
          from public.training_program_day_exercises e
          where e.program_day_id = d.id
        ), '[]'::jsonb)
      ) order by d.position)
      from public.training_program_days d
      where d.program_id = p.id
    ), '[]'::jsonb)
  )
  from public.training_programs p
  where p.id = target_program_id
$$;

create or replace function public.assert_valid_workout_program_snapshot(
  p_client_id uuid,
  p_snapshot jsonb,
  p_coach_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_exercise jsonb;
  v_day_count integer;
  v_exercise_count integer;
begin
  if p_coach_id is null
     or p_coach_id is distinct from auth.uid()
     or not exists (
       select 1
       from public.coaches c
       join public.profiles pr
         on pr.id = c.id
        and pr.role = 'coach'
       join public.coach_client_assignments a
         on a.coach_id = c.id
       where c.id = p_coach_id
         and c.is_active
         and a.client_id = p_client_id
         and a.ended_at is null
     ) then
    raise exception using
      errcode = '42501',
      message = 'active coach assignment required';
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
     or jsonb_typeof(p_snapshot->'name') is distinct from 'string'
     or jsonb_typeof(p_snapshot->'active_from') is distinct from 'string'
     or (
       p_snapshot->'notes' is not null
       and jsonb_typeof(p_snapshot->'notes') not in ('string', 'null')
     )
     or char_length(btrim(coalesce(p_snapshot->>'name', ''))) not between 1 and 160
     or char_length(coalesce(p_snapshot->>'notes', '')) > 2000
     or coalesce(p_snapshot->>'active_from', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode = '22023', message = 'invalid program fields';
  end if;
  perform (p_snapshot->>'active_from')::date;

  if jsonb_typeof(p_snapshot->'days') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'days must be an array';
  end if;
  v_day_count := jsonb_array_length(p_snapshot->'days');
  if v_day_count not between 2 and 6 then
    raise exception using errcode = '22023', message = 'program requires 2 to 6 days';
  end if;
  if (
    select count(distinct (d->>'weekday')::integer)
    from jsonb_array_elements(p_snapshot->'days') d
  ) <> v_day_count then
    raise exception using errcode = '22023', message = 'weekdays must be unique';
  end if;

  for v_day in
    select value from jsonb_array_elements(p_snapshot->'days')
  loop
    if jsonb_typeof(v_day) is distinct from 'object'
       or coalesce((v_day->>'position')::integer, 0) not between 1 and v_day_count
       or coalesce((v_day->>'weekday')::integer, 0) not between 1 and 7
       or jsonb_typeof(v_day->'name') is distinct from 'string'
       or (
         v_day->'coach_note' is not null
         and jsonb_typeof(v_day->'coach_note') not in ('string', 'null')
       )
       or char_length(btrim(coalesce(v_day->>'name', ''))) not between 1 and 160
       or char_length(coalesce(v_day->>'coach_note', '')) > 2000 then
      raise exception using errcode = '22023', message = 'invalid program day';
    end if;

    if jsonb_typeof(v_day->'exercises') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'exercises must be an array';
    end if;
    v_exercise_count := jsonb_array_length(v_day->'exercises');
    if v_exercise_count not between 1 and 12 then
      raise exception using
        errcode = '22023',
        message = 'program day requires 1 to 12 exercises';
    end if;

    for v_exercise in
      select value from jsonb_array_elements(v_day->'exercises')
    loop
      if jsonb_typeof(v_exercise) is distinct from 'object'
         or coalesce((v_exercise->>'position')::integer, 0) not between 1 and v_exercise_count
         or jsonb_typeof(v_exercise->'name') is distinct from 'string'
         or jsonb_typeof(v_exercise->'prescribed_reps') is distinct from 'string'
         or (
           v_exercise->'coach_note' is not null
           and jsonb_typeof(v_exercise->'coach_note') not in ('string', 'null')
         )
         or char_length(btrim(coalesce(v_exercise->>'name', ''))) not between 1 and 160
         or coalesce((v_exercise->>'prescribed_sets')::integer, 0) not between 1 and 20
         or char_length(btrim(coalesce(v_exercise->>'prescribed_reps', ''))) not between 1 and 40
         or (
           v_exercise->>'rest_seconds' is not null
           and (v_exercise->>'rest_seconds')::integer not between 0 and 1800
         )
         or char_length(coalesce(v_exercise->>'coach_note', '')) > 1000 then
        raise exception using errcode = '22023', message = 'invalid program exercise';
      end if;

      if nullif(v_exercise->>'exercise_library_item_id', '') is not null
         and not exists (
           select 1
           from public.exercise_library_items i
           where i.id = (v_exercise->>'exercise_library_item_id')::uuid
             and i.owner_coach_id = p_coach_id
             and i.is_active
         ) then
        raise exception using
          errcode = '42501',
          message = 'exercise library item unavailable';
      end if;
    end loop;

    if (
      select count(distinct (e->>'position')::integer)
      from jsonb_array_elements(v_day->'exercises') e
    ) <> v_exercise_count then
      raise exception using
        errcode = '22023',
        message = 'exercise positions must be contiguous';
    end if;
  end loop;

  if (
    select count(distinct (d->>'position')::integer)
    from jsonb_array_elements(p_snapshot->'days') d
  ) <> v_day_count then
    raise exception using errcode = '22023', message = 'day positions must be contiguous';
  end if;
exception
  when data_exception then
    raise exception using
      errcode = '22023',
      message = 'invalid workout program snapshot';
end
$$;

create or replace function public.insert_workout_program_snapshot(
  p_program_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_exercise jsonb;
  v_day_id uuid;
begin
  for v_day in
    select value
    from jsonb_array_elements(p_snapshot->'days')
    order by (value->>'position')::integer
  loop
    insert into public.training_program_days(
      program_id,
      position,
      weekday,
      name,
      coach_note
    )
    values (
      p_program_id,
      (v_day->>'position')::smallint,
      (v_day->>'weekday')::smallint,
      v_day->>'name',
      coalesce(v_day->>'coach_note', '')
    )
    returning id into v_day_id;

    for v_exercise in
      select value
      from jsonb_array_elements(v_day->'exercises')
      order by (value->>'position')::integer
    loop
      insert into public.training_program_day_exercises(
        program_day_id,
        exercise_library_item_id,
        position,
        name,
        prescribed_sets,
        prescribed_reps,
        rest_seconds,
        coach_note
      )
      values (
        v_day_id,
        nullif(v_exercise->>'exercise_library_item_id', '')::uuid,
        (v_exercise->>'position')::smallint,
        v_exercise->>'name',
        (v_exercise->>'prescribed_sets')::smallint,
        v_exercise->>'prescribed_reps',
        nullif(v_exercise->>'rest_seconds', '')::smallint,
        coalesce(v_exercise->>'coach_note', '')
      );
    end loop;
  end loop;
end
$$;

create or replace function public.generate_workout_program_sessions(
  p_program_id uuid,
  p_client_id uuid,
  p_start date,
  p_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
begin
  for v_session in
    insert into public.workout_sessions(
      client_id,
      program_id,
      program_day_id,
      session_date,
      title,
      week_label,
      coach_note,
      status,
      estimated_duration_minutes
    )
    select
      p_client_id,
      p_program_id,
      d.id,
      g.day::date,
      d.name,
      'Week ' || (((g.day::date - p_start) / 7) + 1),
      d.coach_note,
      'ready',
      60
    from generate_series(p_start, p_end, interval '1 day') g(day)
    join public.training_program_days d
      on d.program_id = p_program_id
     and d.weekday = extract(isodow from g.day)::integer
    order by g.day
    returning id, program_day_id
  loop
    insert into public.workout_exercises(
      session_id,
      exercise_library_item_id,
      position,
      name,
      prescribed_sets,
      prescribed_reps,
      rest_seconds,
      coach_note
    )
    select
      v_session.id,
      e.exercise_library_item_id,
      e.position,
      e.name,
      e.prescribed_sets,
      e.prescribed_reps,
      e.rest_seconds,
      e.coach_note
    from public.training_program_day_exercises e
    where e.program_day_id = v_session.program_day_id
    order by e.position;
  end loop;
end
$$;

create or replace function public.save_workout_program_draft(
  p_client_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := auth.uid();
  v_program uuid;
begin
  perform public.assert_valid_workout_program_snapshot(
    p_client_id,
    p_snapshot,
    v_coach
  );
  perform 1
  from public.clients c
  where c.id = p_client_id
  for update;

  delete from public.training_programs
  where client_id = p_client_id
    and status = 'draft';

  insert into public.training_programs(
    client_id,
    created_by_coach_id,
    version,
    name,
    coach_note,
    status,
    active_from
  )
  values (
    p_client_id,
    v_coach,
    null,
    p_snapshot->>'name',
    coalesce(p_snapshot->>'notes', ''),
    'draft',
    (p_snapshot->>'active_from')::date
  )
  returning id into v_program;

  perform public.insert_workout_program_snapshot(v_program, p_snapshot);
  insert into public.audit_events(
    actor_profile_id,
    client_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_coach,
    p_client_id,
    'workout_program_draft_saved',
    'training_program',
    v_program,
    jsonb_build_object(
      'day_count',
      jsonb_array_length(p_snapshot->'days')
    )
  );

  return public.workout_program_snapshot_result(v_program);
end
$$;

create or replace function public.publish_workout_program(
  p_client_id uuid,
  p_publish_key uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := auth.uid();
  v_program uuid;
  v_previous uuid;
  v_existing uuid;
  v_start date;
  v_end date;
  v_version integer;
  v_count integer;
  v_dates jsonb;
begin
  -- Authorization precedes even an idempotent retry.
  if v_coach is null
     or not exists (
       select 1
       from public.coaches c
       join public.profiles pr
         on pr.id = c.id
        and pr.role = 'coach'
       join public.coach_client_assignments a
         on a.coach_id = c.id
       where c.id = v_coach
         and c.is_active
         and a.client_id = p_client_id
         and a.ended_at is null
     ) then
    raise exception using
      errcode = '42501',
      message = 'active coach assignment required';
  end if;
  if p_publish_key is null then
    raise exception using errcode = '22023', message = 'publish key required';
  end if;

  -- This row lock serializes draft replacement and all publishes per client.
  perform 1
  from public.clients c
  where c.id = p_client_id
  for update;

  select id
  into v_existing
  from public.training_programs
  where client_id = p_client_id
    and publish_key = p_publish_key;

  if v_existing is not null then
    select
      count(*),
      coalesce(jsonb_agg(session_date order by session_date), '[]'::jsonb)
    into v_count, v_dates
    from public.workout_sessions
    where program_id = v_existing;

    return jsonb_build_object(
      'program',
      public.workout_program_snapshot_result(v_existing),
      'generated_session_count',
      v_count,
      'generated_session_dates',
      v_dates
    );
  end if;

  perform public.assert_valid_workout_program_snapshot(
    p_client_id,
    p_snapshot,
    v_coach
  );
  v_start := (p_snapshot->>'active_from')::date;
  v_end := v_start + 27;

  select id
  into v_previous
  from public.training_programs
  where client_id = p_client_id
    and status = 'published'
  for update;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.training_programs
  where client_id = p_client_id
    and version > 0;

  update public.training_programs
  set
    status = 'archived',
    active_to = greatest(active_from, v_start - 1)
  where id = v_previous;

  insert into public.training_programs(
    client_id,
    created_by_coach_id,
    replaces_program_id,
    version,
    name,
    coach_note,
    status,
    active_from,
    active_to,
    published_at,
    publish_key
  )
  values (
    p_client_id,
    v_coach,
    v_previous,
    v_version,
    p_snapshot->>'name',
    coalesce(p_snapshot->>'notes', ''),
    'published',
    v_start,
    v_end,
    now(),
    p_publish_key
  )
  returning id into v_program;

  perform public.insert_workout_program_snapshot(v_program, p_snapshot);

  update public.workout_sessions
  set
    retired_at = now(),
    retired_by_program_id = v_program
  where program_id = v_previous
    and status = 'ready'
    and session_date >= v_start
    and retired_at is null;

  perform public.generate_workout_program_sessions(
    v_program,
    p_client_id,
    v_start,
    v_end
  );

  update public.training_programs
  set status = 'archived'
  where client_id = p_client_id
    and status = 'draft';

  select
    count(*),
    coalesce(jsonb_agg(session_date order by session_date), '[]'::jsonb)
  into v_count, v_dates
  from public.workout_sessions
  where program_id = v_program;

  insert into public.audit_events(
    actor_profile_id,
    client_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_coach,
    p_client_id,
    'workout_program_published',
    'training_program',
    v_program,
    jsonb_build_object(
      'version',
      v_version,
      'generated_session_count',
      v_count,
      'active_from',
      v_start,
      'active_to',
      v_end,
      'replaced_program_id',
      v_previous
    )
  );

  return jsonb_build_object(
    'program',
    public.workout_program_snapshot_result(v_program),
    'generated_session_count',
    v_count,
    'generated_session_dates',
    v_dates
  );
end
$$;

revoke all on function public.save_workout_program_draft(uuid, jsonb)
  from public, anon;
revoke all on function public.publish_workout_program(uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.assert_valid_workout_program_snapshot(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.insert_workout_program_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.generate_workout_program_sessions(uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.workout_program_snapshot_result(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.save_workout_program_draft(uuid, jsonb)
  to authenticated;
grant execute on function public.publish_workout_program(uuid, uuid, jsonb)
  to authenticated;

create trigger training_program_day_exercises_set_updated_at
before update on public.training_program_day_exercises
for each row execute function public.set_updated_at();
