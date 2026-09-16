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
