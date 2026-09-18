create or replace function public.provision_foundation_intake(
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_manage_client(p_client_id) then
    raise exception using errcode = '42501', message = 'client management required';
  end if;

  update public.clients
  set foundation_intake_status = 'pending'
  where id = p_client_id;

  insert into public.client_foundation_intakes(client_id)
  values (p_client_id)
  on conflict (client_id) do nothing;

  return jsonb_build_object(
    'client_id', p_client_id,
    'status', 'pending'
  );
end
$$;

create or replace function public.submit_foundation_intake(
  p_answers jsonb,
  p_waiver_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_status public.foundation_intake_status;
  v_result public.client_foundation_intakes;
  v_photo_count integer;
  v_timezone text;
  v_current_date date;
  v_full_name text;
  v_first_name text;
  v_morning_weight_kg numeric(6, 2);
  v_waist_cm numeric(6, 2);
  v_desired_weight_kg numeric(6, 2);
  v_allergies_injuries text;
  v_dietary_preferences text;
begin
  if v_client_id is null then
    raise exception using errcode = '42501', message = 'pending foundation intake required';
  end if;

  select
    c.foundation_intake_status,
    c.timezone,
    c.allergies_injuries,
    c.dietary_preferences
  into
    v_status,
    v_timezone,
    v_allergies_injuries,
    v_dietary_preferences
  from public.clients c
  join public.client_foundation_intakes intake
    on intake.client_id = c.id
  where c.id = v_client_id
  for update of c, intake;

  if not found or v_status <> 'pending' then
    raise exception using errcode = '42501', message = 'pending foundation intake required';
  end if;

  if p_waiver_version is distinct from 'xform-foundation-waiver-v1' then
    raise exception using errcode = '22023', message = 'foundation waiver required';
  end if;

  select count(distinct p.view)
  into v_photo_count
  from public.progress_photos p
  where p.client_id = v_client_id
    and p.deleted_at is null
    and p.view in (
      'front'::public.photo_view,
      'back'::public.photo_view,
      'side'::public.photo_view,
      'front_double_bicep'::public.photo_view,
      'back_double_bicep'::public.photo_view
    );

  if v_photo_count <> 5 then
    raise exception using errcode = '22023', message = 'foundation photos incomplete';
  end if;

  v_full_name := btrim(coalesce(p_answers -> 'identity' ->> 'full_name', ''));
  v_first_name := split_part(v_full_name, ' ', 1);
  v_current_date := (now() at time zone coalesce(nullif(v_timezone, ''), 'Asia/Kolkata'))::date;
  v_morning_weight_kg := nullif(p_answers -> 'body' ->> 'morning_weight_kg', '')::numeric(6, 2);
  v_waist_cm := nullif(p_answers -> 'body' ->> 'waist_cm', '')::numeric(6, 2);
  v_desired_weight_kg := nullif(p_answers -> 'body' ->> 'desired_weight_kg', '')::numeric(6, 2);

  update public.client_foundation_intakes
  set answers = coalesce(p_answers, '{}'::jsonb),
      waiver_version = p_waiver_version,
      waiver_accepted_at = now(),
      submitted_at = now(),
      updated_at = now()
  where client_id = v_client_id
  returning * into v_result;

  if v_full_name <> '' then
    update public.profiles
    set full_name = v_full_name,
        first_name = v_first_name
    where id = v_client_id;
  end if;

  insert into public.body_entries(
    client_id,
    entry_date,
    weight_kg,
    waist_cm
  )
  values (
    v_client_id,
    v_current_date,
    v_morning_weight_kg,
    v_waist_cm
  )
  on conflict (client_id, entry_date) do update
  set weight_kg = excluded.weight_kg,
      waist_cm = excluded.waist_cm;

  update public.clients
  set starting_weight_kg = coalesce(starting_weight_kg, v_morning_weight_kg),
      allergies_injuries = case
        when btrim(coalesce(v_allergies_injuries, '')) <> '' then allergies_injuries
        else left(
          concat_ws(
            E'\n',
            nullif(btrim(coalesce(p_answers -> 'safety' ->> 'food_allergies', '')), ''),
            nullif(btrim(coalesce(p_answers -> 'safety' ->> 'major_surgery_injuries_illness', '')), '')
          ),
          2000
        )
      end,
      dietary_preferences = case
        when btrim(coalesce(v_dietary_preferences, '')) <> '' then dietary_preferences
        else case coalesce(p_answers -> 'logistics' ->> 'food_preference', '')
          when 'vegetarian' then 'Vegetarian'
          when 'eggetarian_outside' then 'Eggetarian outside'
          when 'vegan' then 'Vegan'
          when 'nonveg_outside' then 'Nonveg outside'
          when 'nonveg_home_and_outside' then 'Nonveg home and outside'
          when 'eggetarian_home_and_outside' then 'Eggetarian home and outside'
          else dietary_preferences
        end
      end
  where id = v_client_id;

  update public.client_targets
  set is_active = false
  where client_id = v_client_id
    and metric = 'weight_kg'
    and is_active = true;

  insert into public.client_targets(
    client_id,
    metric,
    target_value,
    is_active,
    set_by_profile_id
  )
  values (
    v_client_id,
    'weight_kg',
    v_desired_weight_kg,
    true,
    v_client_id
  );

  update public.clients
  set foundation_intake_status = 'submitted'
  where id = v_client_id;

  insert into public.audit_events(
    actor_profile_id,
    client_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_client_id,
    v_client_id,
    'foundation_intake_submitted'::text::public.audit_action,
    'client_foundation_intake',
    v_client_id,
    jsonb_build_object(
      'schema_version', 1,
      'waiver_version', 'xform-foundation-waiver-v1'
    )
  );

  return jsonb_build_object(
    'status', 'submitted',
    'schema_version', v_result.schema_version,
    'answers', v_result.answers,
    'submitted_at', v_result.submitted_at
  );
end
$$;

revoke all on function public.provision_foundation_intake(uuid)
  from public, anon, service_role;
revoke all on function public.submit_foundation_intake(jsonb, text)
  from public, anon;
grant execute on function public.provision_foundation_intake(uuid)
  to authenticated;
grant execute on function public.submit_foundation_intake(jsonb, text)
  to authenticated;

notify pgrst, 'reload schema';
