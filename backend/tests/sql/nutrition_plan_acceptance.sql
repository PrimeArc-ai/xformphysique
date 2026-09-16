begin;

insert into auth.users(id, email) values
  ('30000000-0000-0000-0000-000000000001', 'nutrition-coach@xform.test'),
  ('30000000-0000-0000-0000-000000000002', 'nutrition-client@xform.test'),
  ('30000000-0000-0000-0000-000000000004', 'other-nutrition-coach@xform.test'),
  ('30000000-0000-0000-0000-000000000005', 'nutrition-admin@xform.test');
update public.profiles
set role = 'coach', email = 'nutrition-coach@xform.test', first_name = 'Nutrition', full_name = 'Nutrition Coach'
where id = '30000000-0000-0000-0000-000000000001';
update public.profiles
set role = 'client', email = 'nutrition-client@xform.test', first_name = 'Nutrition', full_name = 'Nutrition Client'
where id = '30000000-0000-0000-0000-000000000002';
update public.profiles set role = 'coach'
where id = '30000000-0000-0000-0000-000000000004';
update public.profiles set role = 'admin'
where id = '30000000-0000-0000-0000-000000000005';
insert into public.coaches(id, is_active) values
  ('30000000-0000-0000-0000-000000000001', true),
  ('30000000-0000-0000-0000-000000000004', true);
update public.clients
set primary_goal = 'strength', check_in_day = 'sunday', timezone = 'Asia/Kolkata'
where id = '30000000-0000-0000-0000-000000000002';
insert into public.coach_client_assignments(coach_id, client_id)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
insert into public.food_library_items(
  id, owner_coach_id, name, category,
  calories_kcal, protein_g, carbs_g, fat_g, is_active
)
values (
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  'Greek yoghurt', 'dairy', 73, 10, 4, 2, true
);

create or replace function pg_temp.qa_daily_fuel() returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', 'QA Daily Fuel',
    'active_from', '2026-09-16',
    'calories_kcal', 1860,
    'protein_g', 135,
    'carbs_g', 180,
    'fat_g', 55,
    'restrictions', jsonb_build_array('shellfish-free'),
    'meals', jsonb_build_array(
      jsonb_build_object(
        'position', 1,
        'meal_time', '08:00:00',
        'name', 'Breakfast bowl',
        'calories_kcal', 420,
        'protein_g', 35,
        'carbs_g', 41,
        'fat_g', 13,
        'coach_instructions', '',
        'preparation', 'Mix yoghurt and fruit.',
        'ingredients', jsonb_build_array(jsonb_build_object(
          'position', 1,
          'food_library_item_id', '30000000-0000-0000-0000-000000000003',
          'ingredient_name', 'Greek yoghurt',
          'quantity', 200,
          'unit', 'g'
        ))
      ),
      jsonb_build_object(
        'position', 2,
        'meal_time', '13:00:00',
        'name', 'Chicken rice bowl',
        'calories_kcal', 610,
        'protein_g', 49,
        'carbs_g', 64,
        'fat_g', 15,
        'coach_instructions', 'Keep the serving balanced.',
        'preparation', 'Combine cooked chicken and rice.',
        'ingredients', jsonb_build_array(jsonb_build_object(
          'position', 1,
          'food_library_item_id', null,
          'ingredient_name', 'Chicken and rice',
          'quantity', 300,
          'unit', 'g'
        ))
      ),
      jsonb_build_object(
        'position', 3,
        'meal_time', '20:00:00',
        'name', 'Lentil vegetable plate',
        'calories_kcal', 520,
        'protein_g', 30,
        'carbs_g', 70,
        'fat_g', 12,
        'coach_instructions', '',
        'preparation', 'Warm and serve.',
        'ingredients', jsonb_build_array(jsonb_build_object(
          'position', 1,
          'food_library_item_id', null,
          'ingredient_name', 'Lentils and vegetables',
          'quantity', 430,
          'unit', 'g'
        ))
      )
    )
  )
$$;

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

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
declare
  v_draft jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_rows integer;
begin
  v_draft := public.save_nutrition_plan_draft(
    '30000000-0000-0000-0000-000000000002',
    pg_temp.qa_daily_fuel()
  );
  perform pg_temp.assert_true(
    v_draft->'plan'->>'version' is null,
    'draft must not consume a version'
  );
  perform pg_temp.assert_true(
    (
      select count(*) = 1
        and bool_and(status = 'draft' and version is null)
      from public.nutrition_plans
      where client_id = '30000000-0000-0000-0000-000000000002'
    ),
    'expected one null-version draft'
  );
  perform pg_temp.assert_true(
    (select count(*) = 0 from public.meal_adherence),
    'draft generated meal adherence'
  );

  perform public.save_nutrition_plan_draft(
    '30000000-0000-0000-0000-000000000002',
    jsonb_set(pg_temp.qa_daily_fuel(), '{name}', '"QA Daily Fuel Resaved"')
  );
  perform pg_temp.assert_true(
    (
      select count(*) = 1
      from public.nutrition_plans
      where client_id = '30000000-0000-0000-0000-000000000002'
        and status = 'draft'
    ),
    'draft replacement left multiple drafts'
  );

  v_first := public.publish_nutrition_plan(
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    pg_temp.qa_daily_fuel()
  );
  perform pg_temp.assert_true(
    v_first->'plan'->>'status' = 'published'
      and v_first->'plan'->>'version' = '1',
    'first publish must return published version one'
  );
  perform pg_temp.assert_true(
    v_first->>'meal_count' = '3',
    'first publish must return three meals'
  );
  perform pg_temp.assert_true(
    (
      select count(*) = 3
      from public.meals m
      join public.nutrition_plans p on p.id = m.plan_id
      where p.client_id = '30000000-0000-0000-0000-000000000002'
        and p.status = 'published'
        and p.version = 1
    ),
    'published version one does not contain three meals'
  );

  v_retry := public.publish_nutrition_plan(
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    jsonb_set(pg_temp.qa_daily_fuel(), '{name}', '"Ignored retry body"')
  );
  perform pg_temp.assert_true(v_retry = v_first, 'retry did not return original publish result');
  perform pg_temp.assert_true(
    (
      select count(*) = 1
      from public.nutrition_plans
      where client_id = '30000000-0000-0000-0000-000000000002'
        and status = 'published'
    ),
    'retry created another published version'
  );

  update public.nutrition_plans
  set name = 'Forbidden direct mutation'
  where client_id = '30000000-0000-0000-0000-000000000002'
    and status = 'published';
  get diagnostics v_rows = row_count;
  perform pg_temp.assert_true(v_rows = 0, 'assigned coach updated a published plan directly');
end
$$;

reset role;
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.audit_events
    where client_id = '30000000-0000-0000-0000-000000000002'
      and action = 'nutrition_plan_published'
  ),
  'retry duplicated nutrition publish audit'
);

insert into public.meal_adherence(client_id, meal_id, entry_date, status)
select
  p.client_id,
  m.id,
  '2026-09-16',
  'followed'
from public.nutrition_plans p
join public.meals m on m.plan_id = p.id and m.position = 1
where p.client_id = '30000000-0000-0000-0000-000000000002'
  and p.status = 'published';
create temporary table preserved_nutrition_adherence as
select *
from public.meal_adherence
where client_id = '30000000-0000-0000-0000-000000000002';

-- Every unauthorized caller must be rejected before the existing-key shortcut.
create or replace function pg_temp.expect_publish_denied() returns void
language plpgsql
as $$
begin
  begin
    perform public.publish_nutrition_plan(
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      pg_temp.qa_daily_fuel()
    );
    raise exception 'unauthorized existing-key publish accepted';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.publish_nutrition_plan(
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000099',
      pg_temp.qa_daily_fuel()
    );
    raise exception 'unauthorized new publish accepted';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
set role authenticated;
select pg_temp.expect_publish_denied(); -- client
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', true);
select pg_temp.expect_publish_denied(); -- unassigned coach
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000005', true);
select pg_temp.expect_publish_denied(); -- admin
reset role;

update public.coaches
set is_active = false
where id = '30000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
set role authenticated;
select pg_temp.expect_publish_denied(); -- inactive assigned coach
reset role;
update public.coaches
set is_active = true
where id = '30000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '', true);
set role anon;
select pg_temp.expect_publish_denied();
reset role;

create or replace function pg_temp.nutrition_counts() returns jsonb
language sql
as $$
  select jsonb_build_array(
    (select count(*) from public.nutrition_plans),
    (select count(*) from public.nutrition_plan_restrictions),
    (select count(*) from public.meals),
    (select count(*) from public.meal_ingredients),
    (select count(*) from public.meal_adherence),
    (select count(*) from public.audit_events)
  )
$$;

create or replace function pg_temp.expect_invalid_meal_count(snapshot jsonb)
returns void
language plpgsql
as $$
declare
  v_before jsonb := pg_temp.nutrition_counts();
begin
  begin
    perform public.save_nutrition_plan_draft(
      '30000000-0000-0000-0000-000000000002',
      snapshot
    );
    raise exception 'invalid draft meal count accepted';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;
  perform pg_temp.assert_true(
    v_before = pg_temp.nutrition_counts(),
    'invalid draft meal count changed rows'
  );

  begin
    perform public.publish_nutrition_plan(
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000099',
      snapshot
    );
    raise exception 'invalid publish meal count accepted';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;
  perform pg_temp.assert_true(
    v_before = pg_temp.nutrition_counts(),
    'invalid publish meal count changed rows'
  );
end
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
set role authenticated;
select pg_temp.expect_invalid_meal_count(
  jsonb_set(pg_temp.qa_daily_fuel(), '{meals}', '[]'::jsonb)
);
select pg_temp.expect_invalid_meal_count(
  jsonb_set(
    pg_temp.qa_daily_fuel(),
    '{meals}',
    (
      select jsonb_agg(
        (pg_temp.qa_daily_fuel()->'meals'->0)
          || jsonb_build_object('position', position)
        order by position
      )
      from generate_series(1, 9) positions(position)
    )
  )
);

do $$
declare
  v_next jsonb;
begin
  v_next := public.publish_nutrition_plan(
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    jsonb_set(pg_temp.qa_daily_fuel(), '{name}', '"QA Daily Fuel Version 2"')
  );
  perform pg_temp.assert_true(
    v_next->'plan'->>'version' = '2'
      and v_next->'plan'->>'status' = 'published',
    'replacement publish must be published version two'
  );
end
$$;
reset role;

select pg_temp.assert_true(
  (
    select status = 'archived'
      and active_to = active_from
    from public.nutrition_plans
    where client_id = '30000000-0000-0000-0000-000000000002'
      and version = 1
  ),
  'same-date replacement did not archive version one safely'
);
select pg_temp.assert_true(
  (
    select status = 'published'
      and active_to is null
      and replaces_plan_id = (
        select id
        from public.nutrition_plans
        where client_id = '30000000-0000-0000-0000-000000000002'
          and version = 1
      )
    from public.nutrition_plans
    where client_id = '30000000-0000-0000-0000-000000000002'
      and version = 2
  ),
  'version two is not an open replacement snapshot'
);
select pg_temp.assert_true(
  not exists (
    select * from preserved_nutrition_adherence
    except
    select * from public.meal_adherence
  )
    and (select count(*) = 1 from public.meal_adherence),
  'replacement changed old meal adherence'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.publish_nutrition_plan(uuid,uuid,jsonb)',
    'execute'
  ),
  'anonymous publish grant'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.assert_valid_nutrition_plan_snapshot(uuid,jsonb,uuid)',
    'execute'
  ),
  'nutrition validator is public'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.insert_nutrition_plan_snapshot(uuid,jsonb)',
    'execute'
  ),
  'nutrition snapshot inserter is public'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.nutrition_plan_snapshot_result(uuid)',
    'execute'
  ),
  'nutrition serializer bypasses RLS'
);

rollback;
\echo PASS: nutrition drafts, atomic publish, immutable versions, idempotency, authorization, invalid rollback, adherence preservation
