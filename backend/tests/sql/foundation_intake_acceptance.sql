begin;

insert into auth.users(id, email) values
  ('80000000-0000-0000-0000-000000000001', 'foundation-coach-a@xform.test'),
  ('80000000-0000-0000-0000-000000000002', 'navaneet@xform.test'),
  ('80000000-0000-0000-0000-000000000004', 'foundation-coach-b@xform.test'),
  ('80000000-0000-0000-0000-000000000005', 'other-foundation-client@xform.test'),
  ('80000000-0000-0000-0000-000000000006', 'existing-foundation-client@xform.test'),
  ('80000000-0000-0000-0000-000000000007', 'foundation-admin@xform.test');

update public.profiles
set role = 'coach', email = 'foundation-coach-a@xform.test', first_name = 'Aisha', full_name = 'Aisha Coach'
where id = '80000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'client', email = 'navaneet@xform.test', first_name = 'Navaneet', full_name = 'Navaneet Deshpande'
where id = '80000000-0000-0000-0000-000000000002';

update public.profiles
set role = 'coach', email = 'foundation-coach-b@xform.test', first_name = 'Other', full_name = 'Other Coach'
where id = '80000000-0000-0000-0000-000000000004';

update public.profiles
set role = 'client', email = 'other-foundation-client@xform.test', first_name = 'Other', full_name = 'Other Client'
where id = '80000000-0000-0000-0000-000000000005';

update public.profiles
set role = 'client', email = 'existing-foundation-client@xform.test', first_name = 'Existing', full_name = 'Existing Client'
where id = '80000000-0000-0000-0000-000000000006';

update public.profiles
set role = 'admin', email = 'foundation-admin@xform.test', first_name = 'Foundation', full_name = 'Foundation Admin'
where id = '80000000-0000-0000-0000-000000000007';

insert into public.coaches(id, is_active) values
  ('80000000-0000-0000-0000-000000000001', true),
  ('80000000-0000-0000-0000-000000000004', true);

update public.clients
set primary_goal = 'fat_loss', check_in_day = 'monday', timezone = 'Asia/Kolkata'
where id in (
  '80000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000006'
);

insert into public.coach_client_assignments(coach_id, client_id)
values ('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002');

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
  'not_required'::public.foundation_intake_status = 'not_required'::public.foundation_intake_status,
  'foundation intake status enum exists'
);

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

insert into public.progress_photos(
  client_id,
  view,
  captured_on,
  original_filename,
  storage_path,
  storage_provider,
  content_type,
  byte_size
)
values
  ('80000000-0000-0000-0000-000000000002', 'front', '2026-09-18', 'front.webp', '80000000-0000-0000-0000-000000000002/front.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'back', '2026-09-18', 'back.webp', '80000000-0000-0000-0000-000000000002/back.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'side', '2026-09-18', 'side.webp', '80000000-0000-0000-0000-000000000002/side.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'front_double_bicep', '2026-09-18', 'front-double-bicep.webp', '80000000-0000-0000-0000-000000000002/front-double-bicep.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'back_double_bicep', '2026-09-18', 'back-double-bicep.webp', '80000000-0000-0000-0000-000000000002/back-double-bicep.webp', 'r2', 'image/webp', 2048);

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
    perform public.submit_foundation_intake(
      '{"identity":{"full_name":"Navaneet Deshpande"}}'::jsonb,
      'xform-foundation-waiver-v1'
    );
    raise exception 'second submit should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.save_foundation_intake_draft('{"identity":{"full_name":"Coach overwrite"}}'::jsonb);
    raise exception 'coach draft should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002'
      and answers->'identity'->>'full_name' = 'Navaneet Deshpande') = 1,
  'assigned coach can select answers'
);

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
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.save_foundation_intake_draft('{"identity":{"full_name":"Other client"}}'::jsonb);
    raise exception 'other client draft should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.client_foundation_intakes', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'service_role cannot mutate foundation intakes directly'
);

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002') = 0,
  'admin cannot select answers'
);

reset role;

rollback;
\echo PASS: foundation intake draft, submit, status, photos, RLS, waiver, audit contract
