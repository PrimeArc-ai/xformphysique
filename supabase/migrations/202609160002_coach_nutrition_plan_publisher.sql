-- Persist daily nutrition drafts and publish immutable plan snapshots.
alter table public.nutrition_plans add column if not exists publish_key uuid;
alter table public.nutrition_plans alter column version drop not null;

create unique index if not exists nutrition_plans_client_publish_key_uidx
  on public.nutrition_plans(client_id, publish_key)
  where publish_key is not null;
create unique index if not exists nutrition_plans_one_draft_per_client_uidx
  on public.nutrition_plans(client_id)
  where status = 'draft';

-- Published nutrition snapshots may only be changed by the SECURITY DEFINER
-- publish function. Assigned coaches retain direct DML access to drafts.
drop policy nutrition_plans_manage_assigned_coach
  on public.nutrition_plans;
create policy nutrition_plans_manage_assigned_coach
  on public.nutrition_plans for all to authenticated
  using (
    public.can_manage_client(client_id)
    and status = 'draft'
  )
  with check (
    public.can_manage_client(client_id)
    and created_by_coach_id = auth.uid()
    and status = 'draft'
  );

drop policy nutrition_plan_restrictions_manage_assigned_coach
  on public.nutrition_plan_restrictions;
create policy nutrition_plan_restrictions_manage_assigned_coach
  on public.nutrition_plan_restrictions for all to authenticated
  using (
    exists (
      select 1
      from public.nutrition_plans p
      where p.id = plan_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_plans p
      where p.id = plan_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  );

drop policy meals_manage_assigned_coach
  on public.meals;
create policy meals_manage_assigned_coach
  on public.meals for all to authenticated
  using (
    exists (
      select 1
      from public.nutrition_plans p
      where p.id = plan_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_plans p
      where p.id = plan_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  );

drop policy meal_ingredients_manage_assigned_coach
  on public.meal_ingredients;
create policy meal_ingredients_manage_assigned_coach
  on public.meal_ingredients for all to authenticated
  using (
    exists (
      select 1
      from public.meals m
      join public.nutrition_plans p on p.id = m.plan_id
      where m.id = meal_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  )
  with check (
    exists (
      select 1
      from public.meals m
      join public.nutrition_plans p on p.id = m.plan_id
      where m.id = meal_id
        and p.status = 'draft'
        and public.can_manage_nutrition_plan(p.id)
    )
  );

create or replace function public.nutrition_plan_snapshot_result(
  target_plan_id uuid
)
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
    'status', p.status,
    'version', p.version,
    'active_from', p.active_from,
    'active_to', p.active_to,
    'replaces_plan_id', p.replaces_plan_id,
    'publish_key', p.publish_key,
    'calories_kcal', p.calories_kcal,
    'protein_g', p.protein_g,
    'carbs_g', p.carbs_g,
    'fat_g', p.fat_g,
    'restrictions', coalesce((
      select jsonb_agg(r.restriction order by r.restriction)
      from public.nutrition_plan_restrictions r
      where r.plan_id = p.id
    ), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'position', m.position,
          'meal_time', m.meal_time,
          'name', m.name,
          'calories_kcal', m.calories_kcal,
          'protein_g', m.protein_g,
          'carbs_g', m.carbs_g,
          'fat_g', m.fat_g,
          'coach_instructions', m.coach_instructions,
          'preparation', m.preparation,
          'ingredients', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'position', i.position,
                'food_library_item_id', i.food_library_item_id,
                'ingredient_name', i.ingredient_name,
                'quantity', i.quantity,
                'unit', i.unit
              )
              order by i.position
            )
            from public.meal_ingredients i
            where i.meal_id = m.id
          ), '[]'::jsonb)
        )
        order by m.position
      )
      from public.meals m
      where m.plan_id = p.id
    ), '[]'::jsonb)
  )
  from public.nutrition_plans p
  where p.id = target_plan_id
$$;

create or replace function public.assert_valid_nutrition_plan_snapshot(
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
  v_meal jsonb;
  v_ingredient jsonb;
  v_restriction jsonb;
  v_meal_count integer;
  v_ingredient_count integer;
  v_restriction_count integer;
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
     or char_length(btrim(coalesce(p_snapshot->>'name', ''))) not between 1 and 180
     or jsonb_typeof(p_snapshot->'active_from') is distinct from 'string'
     or coalesce(p_snapshot->>'active_from', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(p_snapshot->'calories_kcal') is distinct from 'number'
     or coalesce(p_snapshot->>'calories_kcal', '') !~ '^[0-9]+$'
     or (p_snapshot->>'calories_kcal')::integer <= 0
     or jsonb_typeof(p_snapshot->'protein_g') is distinct from 'number'
     or coalesce(p_snapshot->>'protein_g', '') !~ '^[0-9]+$'
     or (p_snapshot->>'protein_g')::integer < 0
     or jsonb_typeof(p_snapshot->'carbs_g') is distinct from 'number'
     or coalesce(p_snapshot->>'carbs_g', '') !~ '^[0-9]+$'
     or (p_snapshot->>'carbs_g')::integer < 0
     or jsonb_typeof(p_snapshot->'fat_g') is distinct from 'number'
     or coalesce(p_snapshot->>'fat_g', '') !~ '^[0-9]+$'
     or (p_snapshot->>'fat_g')::integer < 0 then
    raise exception using errcode = '22023', message = 'invalid nutrition plan fields';
  end if;
  perform (p_snapshot->>'active_from')::date;

  if jsonb_typeof(p_snapshot->'restrictions') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'restrictions must be an array';
  end if;
  v_restriction_count := jsonb_array_length(p_snapshot->'restrictions');
  for v_restriction in
    select value
    from jsonb_array_elements(p_snapshot->'restrictions')
  loop
    if jsonb_typeof(v_restriction) is distinct from 'string'
       or char_length(btrim(v_restriction #>> '{}')) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'invalid restriction';
    end if;
  end loop;
  if (
    select count(distinct btrim(value #>> '{}'))
    from jsonb_array_elements(p_snapshot->'restrictions')
  ) <> v_restriction_count then
    raise exception using errcode = '22023', message = 'restrictions must be unique';
  end if;

  if jsonb_typeof(p_snapshot->'meals') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'meals must be an array';
  end if;
  v_meal_count := jsonb_array_length(p_snapshot->'meals');
  if v_meal_count not between 1 and 8 then
    raise exception using errcode = '22023', message = 'plan requires 1 to 8 meals';
  end if;

  for v_meal in
    select value
    from jsonb_array_elements(p_snapshot->'meals')
  loop
    if jsonb_typeof(v_meal) is distinct from 'object'
       or jsonb_typeof(v_meal->'position') is distinct from 'number'
       or coalesce(v_meal->>'position', '') !~ '^[0-9]+$'
       or (v_meal->>'position')::integer not between 1 and v_meal_count
       or jsonb_typeof(v_meal->'meal_time') is distinct from 'string'
       or coalesce(v_meal->>'meal_time', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
       or jsonb_typeof(v_meal->'name') is distinct from 'string'
       or char_length(btrim(coalesce(v_meal->>'name', ''))) not between 1 and 180
       or jsonb_typeof(v_meal->'calories_kcal') is distinct from 'number'
       or coalesce(v_meal->>'calories_kcal', '') !~ '^[0-9]+$'
       or (v_meal->>'calories_kcal')::integer < 0
       or jsonb_typeof(v_meal->'protein_g') is distinct from 'number'
       or coalesce(v_meal->>'protein_g', '') !~ '^[0-9]+$'
       or (v_meal->>'protein_g')::integer < 0
       or jsonb_typeof(v_meal->'carbs_g') is distinct from 'number'
       or coalesce(v_meal->>'carbs_g', '') !~ '^[0-9]+$'
       or (v_meal->>'carbs_g')::integer < 0
       or jsonb_typeof(v_meal->'fat_g') is distinct from 'number'
       or coalesce(v_meal->>'fat_g', '') !~ '^[0-9]+$'
       or (v_meal->>'fat_g')::integer < 0
       or (
         v_meal->'coach_instructions' is not null
         and jsonb_typeof(v_meal->'coach_instructions') not in ('string', 'null')
       )
       or (
         v_meal->'preparation' is not null
         and jsonb_typeof(v_meal->'preparation') not in ('string', 'null')
       ) then
      raise exception using errcode = '22023', message = 'invalid meal';
    end if;
    perform (v_meal->>'meal_time')::time;

    if jsonb_typeof(v_meal->'ingredients') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'ingredients must be an array';
    end if;
    v_ingredient_count := jsonb_array_length(v_meal->'ingredients');
    if v_ingredient_count not between 1 and 12 then
      raise exception using
        errcode = '22023',
        message = 'meal requires 1 to 12 ingredients';
    end if;

    for v_ingredient in
      select value
      from jsonb_array_elements(v_meal->'ingredients')
    loop
      if jsonb_typeof(v_ingredient) is distinct from 'object'
         or jsonb_typeof(v_ingredient->'position') is distinct from 'number'
         or coalesce(v_ingredient->>'position', '') !~ '^[0-9]+$'
         or (v_ingredient->>'position')::integer not between 1 and v_ingredient_count
         or jsonb_typeof(v_ingredient->'ingredient_name') is distinct from 'string'
         or char_length(btrim(coalesce(v_ingredient->>'ingredient_name', '')))
              not between 1 and 180
         or jsonb_typeof(v_ingredient->'quantity') is distinct from 'number'
         or (v_ingredient->>'quantity')::numeric <= 0
         or jsonb_typeof(v_ingredient->'unit') is distinct from 'string'
         or char_length(btrim(coalesce(v_ingredient->>'unit', ''))) not between 1 and 30
         or (
           v_ingredient->'food_library_item_id' is not null
           and jsonb_typeof(v_ingredient->'food_library_item_id') not in ('string', 'null')
         ) then
        raise exception using errcode = '22023', message = 'invalid meal ingredient';
      end if;

      if nullif(v_ingredient->>'food_library_item_id', '') is not null
         and not exists (
           select 1
           from public.food_library_items i
           where i.id = (v_ingredient->>'food_library_item_id')::uuid
             and i.owner_coach_id = p_coach_id
             and i.is_active
         ) then
        raise exception using
          errcode = '42501',
          message = 'food library item unavailable';
      end if;
    end loop;

    if (
      select count(distinct (ingredient->>'position')::integer)
      from jsonb_array_elements(v_meal->'ingredients') ingredient
    ) <> v_ingredient_count then
      raise exception using
        errcode = '22023',
        message = 'ingredient positions must be contiguous';
    end if;
  end loop;

  if (
    select count(distinct (meal->>'position')::integer)
    from jsonb_array_elements(p_snapshot->'meals') meal
  ) <> v_meal_count then
    raise exception using errcode = '22023', message = 'meal positions must be contiguous';
  end if;
exception
  when data_exception then
    raise exception using
      errcode = '22023',
      message = 'invalid nutrition plan snapshot';
end
$$;

create or replace function public.insert_nutrition_plan_snapshot(
  p_plan_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meal jsonb;
  v_ingredient jsonb;
  v_meal_id uuid;
begin
  insert into public.nutrition_plan_restrictions(plan_id, restriction)
  select p_plan_id, btrim(value #>> '{}')
  from jsonb_array_elements(p_snapshot->'restrictions')
  order by value #>> '{}';

  for v_meal in
    select value
    from jsonb_array_elements(p_snapshot->'meals')
    order by (value->>'position')::integer
  loop
    insert into public.meals(
      plan_id,
      position,
      meal_time,
      name,
      calories_kcal,
      protein_g,
      carbs_g,
      fat_g,
      coach_instructions,
      preparation
    )
    values (
      p_plan_id,
      (v_meal->>'position')::smallint,
      (v_meal->>'meal_time')::time,
      btrim(v_meal->>'name'),
      (v_meal->>'calories_kcal')::integer,
      (v_meal->>'protein_g')::integer,
      (v_meal->>'carbs_g')::integer,
      (v_meal->>'fat_g')::integer,
      coalesce(v_meal->>'coach_instructions', ''),
      coalesce(v_meal->>'preparation', '')
    )
    returning id into v_meal_id;

    for v_ingredient in
      select value
      from jsonb_array_elements(v_meal->'ingredients')
      order by (value->>'position')::integer
    loop
      insert into public.meal_ingredients(
        meal_id,
        food_library_item_id,
        position,
        ingredient_name,
        quantity,
        unit
      )
      values (
        v_meal_id,
        nullif(v_ingredient->>'food_library_item_id', '')::uuid,
        (v_ingredient->>'position')::smallint,
        btrim(v_ingredient->>'ingredient_name'),
        (v_ingredient->>'quantity')::numeric,
        btrim(v_ingredient->>'unit')
      );
    end loop;
  end loop;
end
$$;

create or replace function public.save_nutrition_plan_draft(
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
  v_plan uuid;
begin
  perform public.assert_valid_nutrition_plan_snapshot(
    p_client_id,
    p_snapshot,
    v_coach
  );

  perform 1
  from public.clients c
  where c.id = p_client_id
  for update;

  delete from public.nutrition_plans
  where client_id = p_client_id
    and status = 'draft';

  insert into public.nutrition_plans(
    client_id,
    created_by_coach_id,
    version,
    name,
    status,
    active_from,
    active_to,
    calories_kcal,
    protein_g,
    carbs_g,
    fat_g
  )
  values (
    p_client_id,
    v_coach,
    null,
    btrim(p_snapshot->>'name'),
    'draft',
    (p_snapshot->>'active_from')::date,
    null,
    (p_snapshot->>'calories_kcal')::integer,
    (p_snapshot->>'protein_g')::integer,
    (p_snapshot->>'carbs_g')::integer,
    (p_snapshot->>'fat_g')::integer
  )
  returning id into v_plan;

  perform public.insert_nutrition_plan_snapshot(v_plan, p_snapshot);

  return jsonb_build_object(
    'plan',
    public.nutrition_plan_snapshot_result(v_plan)
  );
end
$$;

create or replace function public.publish_nutrition_plan(
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
  v_plan uuid;
  v_previous uuid;
  v_existing uuid;
  v_start date;
  v_version integer;
  v_meal_count integer;
begin
  -- Authorization must precede the idempotent existing-key return path.
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

  -- Serialize all draft replacement and publish operations for this client.
  perform 1
  from public.clients c
  where c.id = p_client_id
  for update;

  select id
  into v_existing
  from public.nutrition_plans
  where client_id = p_client_id
    and publish_key = p_publish_key;

  if v_existing is not null then
    select count(*)
    into v_meal_count
    from public.meals
    where plan_id = v_existing;

    return jsonb_build_object(
      'plan',
      public.nutrition_plan_snapshot_result(v_existing),
      'meal_count',
      v_meal_count
    );
  end if;

  perform public.assert_valid_nutrition_plan_snapshot(
    p_client_id,
    p_snapshot,
    v_coach
  );
  v_start := (p_snapshot->>'active_from')::date;

  select id
  into v_previous
  from public.nutrition_plans
  where client_id = p_client_id
    and status = 'published'
  for update;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.nutrition_plans
  where client_id = p_client_id
    and version > 0;

  update public.nutrition_plans
  set
    status = 'archived',
    active_to = greatest(active_from, v_start - 1)
  where id = v_previous;

  insert into public.nutrition_plans(
    client_id,
    created_by_coach_id,
    replaces_plan_id,
    version,
    name,
    status,
    active_from,
    active_to,
    calories_kcal,
    protein_g,
    carbs_g,
    fat_g,
    published_at,
    publish_key
  )
  values (
    p_client_id,
    v_coach,
    v_previous,
    v_version,
    btrim(p_snapshot->>'name'),
    'published',
    v_start,
    null,
    (p_snapshot->>'calories_kcal')::integer,
    (p_snapshot->>'protein_g')::integer,
    (p_snapshot->>'carbs_g')::integer,
    (p_snapshot->>'fat_g')::integer,
    now(),
    p_publish_key
  )
  returning id into v_plan;

  perform public.insert_nutrition_plan_snapshot(v_plan, p_snapshot);

  update public.nutrition_plans
  set status = 'archived'
  where client_id = p_client_id
    and status = 'draft';

  select count(*)
  into v_meal_count
  from public.meals
  where plan_id = v_plan;

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
    'nutrition_plan_published',
    'nutrition_plan',
    v_plan,
    jsonb_build_object(
      'version', v_version,
      'active_from', v_start,
      'replaced_plan_id', v_previous,
      'meal_count', v_meal_count
    )
  );

  return jsonb_build_object(
    'plan',
    public.nutrition_plan_snapshot_result(v_plan),
    'meal_count',
    v_meal_count
  );
end
$$;

revoke all on function public.save_nutrition_plan_draft(uuid, jsonb)
  from public, anon;
revoke all on function public.publish_nutrition_plan(uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.assert_valid_nutrition_plan_snapshot(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.insert_nutrition_plan_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.nutrition_plan_snapshot_result(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.save_nutrition_plan_draft(uuid, jsonb)
  to authenticated;
grant execute on function public.publish_nutrition_plan(uuid, uuid, jsonb)
  to authenticated;
