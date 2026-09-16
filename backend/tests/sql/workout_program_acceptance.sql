begin;

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000001', 'program-coach@xform.test'),
  ('10000000-0000-0000-0000-000000000002', 'program-client@xform.test');
update public.profiles
set role = 'coach', email = 'program-coach@xform.test', first_name = 'Program', full_name = 'Program Coach'
where id = '10000000-0000-0000-0000-000000000001';
update public.profiles
set role = 'client', email = 'program-client@xform.test', first_name = 'Program', full_name = 'Program Client'
where id = '10000000-0000-0000-0000-000000000002';
insert into public.coaches(id, is_active) values
  ('10000000-0000-0000-0000-000000000001', true);
update public.clients
set primary_goal = 'strength', check_in_day = 'sunday', timezone = 'Asia/Kolkata'
where id = '10000000-0000-0000-0000-000000000002';
insert into public.coach_client_assignments(coach_id, client_id)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
insert into public.exercise_library_items(id, owner_coach_id, name, body_region, training_focus, guidance)
values ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Goblet squat', 'legs', 'strength', 'Controlled tempo');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select public.save_workout_program_draft(
  '10000000-0000-0000-0000-000000000002',
  '{"name":"QA Four-Week Strength","active_from":"2026-09-16","notes":"Controlled QA cycle","days":[{"position":1,"weekday":3,"name":"Wednesday Strength","coach_note":"","exercises":[{"position":1,"name":"Goblet squat","prescribed_sets":4,"prescribed_reps":"8-10","rest_seconds":90,"coach_note":"Controlled tempo"}]},{"position":2,"weekday":5,"name":"Friday Strength","coach_note":"","exercises":[{"position":1,"name":"Romanian deadlift","prescribed_sets":4,"prescribed_reps":"8","rest_seconds":120,"coach_note":"Neutral spine"}]}]}'::jsonb
);

reset role;

do $$
begin
  if (
    select count(*)
    from public.training_programs
    where client_id = '10000000-0000-0000-0000-000000000002'
      and status = 'draft'
  ) <> 1 then
    raise exception 'expected one draft';
  end if;
  if (
    select count(*)
    from public.workout_sessions
    where client_id = '10000000-0000-0000-0000-000000000002'
  ) <> 0 then
    raise exception 'draft generated sessions';
  end if;
end $$;

-- Publishing the wrong weekdays, mutating an old version, leaking retired sessions,
-- or bypassing RPC authorization must fail these real database checks.
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

create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000004', 'other-program-coach@xform.test'),
  ('10000000-0000-0000-0000-000000000005', 'program-admin@xform.test');
update public.profiles set role = 'coach' where id = '10000000-0000-0000-0000-000000000004';
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000005';
insert into public.coaches(id, is_active) values ('10000000-0000-0000-0000-000000000004', true);
insert into public.exercise_library_items(id, owner_coach_id, name, body_region, training_focus, guidance)
values ('10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', 'Foreign squat', 'legs', 'strength', 'Unavailable');

set role authenticated;
do $$ declare v_draft jsonb; v_first jsonb; v_retry jsonb; begin
  v_draft := public.save_workout_program_draft('10000000-0000-0000-0000-000000000002', pg_temp.three_day_snapshot());
  perform pg_temp.assert_true(v_draft->>'version' is null, 'draft must not consume a version');
  perform pg_temp.assert_true(jsonb_array_length(v_draft->'days') = 3, 'draft replacement did not return normalized days');
  perform pg_temp.assert_true((select count(*) = 1 from public.training_programs where client_id = '10000000-0000-0000-0000-000000000002'), 'draft replacement left old rows');
  v_first := public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', pg_temp.three_day_snapshot());
  perform pg_temp.assert_true(v_first->'program'->>'version' = '1', 'first publish version must be one');
  perform pg_temp.assert_true(v_first->>'generated_session_count' = '12', 'expected twelve generated sessions');
  perform pg_temp.assert_true(v_first->'generated_session_dates' = '["2026-09-16","2026-09-18","2026-09-20","2026-09-23","2026-09-25","2026-09-27","2026-09-30","2026-10-02","2026-10-04","2026-10-07","2026-10-09","2026-10-11"]'::jsonb, 'wrong four-week dates');
  perform pg_temp.assert_true(v_first->'program'->>'active_to' = '2026-10-13', 'wrong inclusive range');
  v_retry := public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', pg_temp.three_day_snapshot());
  perform pg_temp.assert_true(v_retry = v_first, 'retry did not return the original result');
  perform pg_temp.assert_true((select count(*) = 36 from public.workout_exercises e join public.workout_sessions s on s.id=e.session_id where s.client_id='10000000-0000-0000-0000-000000000002'), 'expected thirty-six copied exercises');
  perform pg_temp.assert_true((select count(*) = 1 from public.training_programs where client_id='10000000-0000-0000-0000-000000000002' and status='published'), 'retry created another version');
end $$;
reset role;
select pg_temp.assert_true((select count(*)=1 from public.audit_events where client_id='10000000-0000-0000-0000-000000000002' and action='workout_program_published'), 'retry duplicated publish audit');
select pg_temp.assert_true((select count(*)=2 from public.audit_events where client_id='10000000-0000-0000-0000-000000000002' and action='workout_program_draft_saved'), 'draft audit missing');

-- Capture historical rows byte-for-byte so accidental history changes are visible.
update public.workout_sessions set status='completed', completed_at=now(), client_note='Keep completed history'
where client_id='10000000-0000-0000-0000-000000000002' and session_date='2026-09-18';
update public.workout_sessions set status='in_progress', client_note='Keep active logging'
where client_id='10000000-0000-0000-0000-000000000002' and session_date='2026-09-20';
create temporary table preserved_sessions as select * from public.workout_sessions
where client_id='10000000-0000-0000-0000-000000000002' and status <> 'ready';
create temporary table preserved_exercises as select e.* from public.workout_exercises e
join public.workout_sessions s on s.id=e.session_id where s.client_id='10000000-0000-0000-0000-000000000002';
grant select on preserved_sessions, preserved_exercises to authenticated;
set role authenticated;
do $$ declare v_next jsonb; begin
  v_next := public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', jsonb_set(pg_temp.three_day_snapshot(), '{name}', '"Replacement"'));
  perform pg_temp.assert_true(v_next->'program'->>'version'='2', 'replacement version must be two');
  perform pg_temp.assert_true((select count(*)=10 from public.workout_sessions where client_id='10000000-0000-0000-0000-000000000002' and retired_at is not null), 'only ten old ready sessions should retire');
  perform pg_temp.assert_true((select count(*)=14 from public.workout_sessions where client_id='10000000-0000-0000-0000-000000000002' and retired_at is null), 'replacement changed protected history');
  perform pg_temp.assert_true(not exists(select * from preserved_sessions except select * from public.workout_sessions), 'completed or in-progress session changed');
  perform pg_temp.assert_true(not exists(select * from preserved_exercises except select * from public.workout_exercises), 'old session exercises changed');
  perform pg_temp.assert_true((select active_to='2026-09-16' from public.training_programs where client_id='10000000-0000-0000-0000-000000000002' and version=1), 'same-date archive violates date constraint');
end $$;
reset role;

-- A client cannot read/update retired sessions or their copied exercises.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set role authenticated;
select pg_temp.assert_true((select count(*)=14 from public.workout_sessions), 'client can see retired sessions');
select pg_temp.assert_true((select count(*)=42 from public.workout_exercises), 'client can see retired exercises');
do $$ declare v_count integer; begin
  update public.workout_sessions set client_note='forbidden' where retired_at is not null;
  get diagnostics v_count=row_count;
  perform pg_temp.assert_true(v_count=0, 'client updated retired sessions');
end $$;
reset role;

-- Invoker helper exercises both RPCs, including the existing-key fast path.
create function pg_temp.expect_denied() returns void language plpgsql as $$ begin
  begin
    perform public.save_workout_program_draft('10000000-0000-0000-0000-000000000002', pg_temp.three_day_snapshot());
    raise exception 'unauthorized draft accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', pg_temp.three_day_snapshot());
    raise exception 'unauthorized publish retry accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000099', pg_temp.three_day_snapshot());
    raise exception 'unauthorized new publish accepted';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
select pg_temp.expect_denied(); -- client
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select pg_temp.expect_denied(); -- unassigned coach
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select pg_temp.expect_denied(); -- Admin
reset role;
update public.coaches set is_active=false where id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set role authenticated;
select pg_temp.expect_denied(); -- inactive coach, including existing publish key
reset role;
update public.coaches set is_active=true where id='10000000-0000-0000-0000-000000000001';
update public.coach_client_assignments set ended_at=now() where coach_id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.expect_denied(); -- ended assignment
reset role;
update public.coach_client_assignments set ended_at=null where coach_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '', true);
set role anon;
select pg_temp.expect_denied();
reset role;

-- Each rejected statement must roll back all rows, not just program headers.
create function pg_temp.program_counts() returns jsonb language sql as $$
  select jsonb_build_array((select count(*) from public.training_programs),
    (select count(*) from public.training_program_days),
    (select count(*) from public.training_program_day_exercises),
    (select count(*) from public.workout_sessions), (select count(*) from public.workout_exercises),
    (select count(*) from public.audit_events))
$$;
create function pg_temp.expect_invalid(snapshot jsonb, expected_state text default '22023') returns void language plpgsql as $$
declare before_counts jsonb := pg_temp.program_counts(); begin
  begin
    perform public.save_workout_program_draft('10000000-0000-0000-0000-000000000002', snapshot);
    raise exception 'invalid draft accepted';
  exception when others then if sqlstate <> expected_state then raise; end if; end;
  begin
    perform public.publish_workout_program('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000099', snapshot);
    raise exception 'invalid publish accepted';
  exception when others then if sqlstate <> expected_state then raise; end if; end;
  perform pg_temp.assert_true(before_counts=pg_temp.program_counts(), 'invalid snapshot changed row counts');
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set role authenticated;
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,1,weekday}', '3'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days}', (select jsonb_agg(pg_temp.three_day_snapshot()->'days'->0) from generate_series(1,7))));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises}', '[]'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,position}', '2'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,position}', '3'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,exercise_library_item_id}', '"10000000-0000-0000-0000-000000000006"'), '42501');
select pg_temp.expect_invalid(null);
select pg_temp.expect_invalid('null');
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days}', '{}'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{active_from}', '"not-a-date"'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,position}', 'null'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,weekday}', '8'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,prescribed_sets}', '0'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,prescribed_sets}', 'null'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,rest_seconds}', '1801'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,position}', '1.5'));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{notes}', to_jsonb(repeat('x',2001))));
select pg_temp.expect_invalid(jsonb_set(pg_temp.three_day_snapshot(), '{days,0,exercises,0,coach_note}', to_jsonb(repeat('x',1001))));
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.publish_workout_program(uuid,uuid,jsonb)','execute'), 'anonymous publish grant');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.insert_workout_program_snapshot(uuid,jsonb)','execute'), 'insert helper is public');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.workout_program_snapshot_result(uuid)','execute'), 'serializer bypasses RLS');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.assert_valid_workout_program_snapshot(uuid,jsonb,uuid)','execute'), 'validator is public');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.generate_workout_program_sessions(uuid,uuid,date,date)','execute'), 'generator is public');
rollback;
\echo PASS: drafts, exact dates, immutable replacement, idempotency, retirement RLS, role isolation, invalid input rollback, audit
