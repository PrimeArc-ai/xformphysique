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
  if (select count(*) from public.training_programs where status = 'draft') <> 1 then
    raise exception 'expected one draft';
  end if;
  if (select count(*) from public.workout_sessions) <> 0 then
    raise exception 'draft generated sessions';
  end if;
end $$;

rollback;
