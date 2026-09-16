begin;

insert into auth.users(id, email) values
  ('30000000-0000-0000-0000-000000000001', 'nutrition-coach@xform.test'),
  ('30000000-0000-0000-0000-000000000002', 'nutrition-client@xform.test');
update public.profiles
set role = 'coach', email = 'nutrition-coach@xform.test', first_name = 'Nutrition', full_name = 'Nutrition Coach'
where id = '30000000-0000-0000-0000-000000000001';
update public.profiles
set role = 'client', email = 'nutrition-client@xform.test', first_name = 'Nutrition', full_name = 'Nutrition Client'
where id = '30000000-0000-0000-0000-000000000002';
insert into public.coaches(id, is_active) values
  ('30000000-0000-0000-0000-000000000001', true);
update public.clients
set primary_goal = 'strength', check_in_day = 'sunday', timezone = 'Asia/Kolkata'
where id = '30000000-0000-0000-0000-000000000002';
insert into public.coach_client_assignments(coach_id, client_id)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
insert into public.food_library_items(id, owner_coach_id, name, category, calories_kcal, protein_g, carbs_g, fat_g, is_active)
values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Greek yoghurt', 'dairy', 73, 10, 4, 2, true);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select public.save_nutrition_plan_draft(
  '30000000-0000-0000-0000-000000000002'::uuid,
  '{"name":"QA Daily Fuel","active_from":"2026-09-16","calories_kcal":1860,"protein_g":135,"carbs_g":180,"fat_g":55,"restrictions":["shellfish-free"],"meals":[{"position":1,"meal_time":"08:00:00","name":"Breakfast bowl","calories_kcal":420,"protein_g":35,"carbs_g":41,"fat_g":13,"coach_instructions":"","preparation":"Mix.","ingredients":[{"position":1,"food_library_item_id":"30000000-0000-0000-0000-000000000003","ingredient_name":"Greek yoghurt","quantity":200,"unit":"g"}]}]}'::jsonb
);

reset role;
rollback;
