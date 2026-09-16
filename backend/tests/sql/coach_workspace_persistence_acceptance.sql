begin;

insert into auth.users(id, email) values
  ('51000000-0000-0000-0000-000000000001', 'library-coach-a@xform.test'),
  ('51000000-0000-0000-0000-000000000002', 'library-coach-b@xform.test');
update public.profiles
set role = 'coach', email = 'library-coach-a@xform.test', first_name = 'Library', full_name = 'Library Coach A'
where id = '51000000-0000-0000-0000-000000000001';
update public.profiles
set role = 'coach', email = 'library-coach-b@xform.test', first_name = 'Library', full_name = 'Library Coach B'
where id = '51000000-0000-0000-0000-000000000002';
insert into public.coaches(id, is_active) values
  ('51000000-0000-0000-0000-000000000001', true),
  ('51000000-0000-0000-0000-000000000002', true);

create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception '%', message; end if;
end $$;

select pg_temp.assert_true(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'audit_action' and e.enumlabel = 'food_library_item_saved'
  )
  and exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'audit_action' and e.enumlabel = 'exercise_library_item_saved'
  )
  and exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'audit_action' and e.enumlabel = 'coach_settings_saved'
  ),
  'library audit enum values missing'
);

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

insert into public.food_library_items(
  id, owner_coach_id, name, category, calories_kcal, protein_g, carbs_g, fat_g, is_active
) values (
  '51000000-0000-0000-0000-000000000011',
  '51000000-0000-0000-0000-000000000001',
  'QA Greek yoghurt', 'dairy', 73, 10, 4, 2, true
);

insert into public.exercise_library_items(
  id, owner_coach_id, name, body_region, training_focus, guidance, is_active
) values (
  '51000000-0000-0000-0000-000000000021',
  '51000000-0000-0000-0000-000000000001',
  'QA Goblet squat', 'legs', 'strength', 'Controlled tempo', true
);

insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, metadata)
values (
  '51000000-0000-0000-0000-000000000001',
  'food_library_item_saved',
  'food_library_item',
  '51000000-0000-0000-0000-000000000011',
  jsonb_build_object(
    'id', '51000000-0000-0000-0000-000000000011',
    'name', 'QA Greek yoghurt',
    'is_active', true
  )
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.food_library_items where id = '51000000-0000-0000-0000-000000000011'),
  'owner cannot select own food item'
);

do $$
begin
  insert into public.food_library_items(owner_coach_id, name, category)
  values ('51000000-0000-0000-0000-000000000001', 'QA Greek yoghurt', 'dairy');
  raise exception 'duplicate food name accepted';
exception
  when unique_violation then
    null;
end $$;

update public.food_library_items
set is_active = false
where id = '51000000-0000-0000-0000-000000000011';

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(is_active is false)
    from public.food_library_items
    where id = '51000000-0000-0000-0000-000000000011'
  ),
  'disable removed the food item'
);

reset role;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  (select count(*) = 0 from public.food_library_items where id = '51000000-0000-0000-0000-000000000011'),
  'other coach selected owner food item'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.exercise_library_items where id = '51000000-0000-0000-0000-000000000021'),
  'other coach selected owner exercise item'
);

insert into public.food_library_items(owner_coach_id, name, category)
values ('51000000-0000-0000-0000-000000000002', 'QA Greek yoghurt', 'dairy');

reset role;

rollback;
\echo PASS: coach library ownership, unique names, disable remains
