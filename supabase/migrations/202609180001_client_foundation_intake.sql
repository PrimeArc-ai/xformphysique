alter type public.audit_action add value if not exists 'foundation_intake_submitted';

do $$
begin
  create type public.foundation_intake_status as enum ('not_required', 'pending', 'submitted');
exception
  when duplicate_object then
    null;
end
$$;

alter table public.clients
  add column if not exists foundation_intake_status public.foundation_intake_status
  not null default 'not_required';

create table if not exists public.client_foundation_intakes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  answers jsonb not null default '{}'::jsonb,
  waiver_version text,
  waiver_accepted_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (submitted_at is null and waiver_accepted_at is null and waiver_version is null)
    or (
      submitted_at is not null
      and waiver_accepted_at is not null
      and waiver_version = 'xform-foundation-waiver-v1'
    )
  )
);

drop trigger if exists client_foundation_intakes_set_updated_at on public.client_foundation_intakes;
create trigger client_foundation_intakes_set_updated_at
  before update on public.client_foundation_intakes
  for each row execute function public.set_updated_at();

alter table public.client_foundation_intakes enable row level security;
revoke all on public.client_foundation_intakes from public, anon, authenticated;
grant select on public.client_foundation_intakes to authenticated;
grant all on public.client_foundation_intakes to service_role;

drop policy if exists foundation_intakes_select_accessible on public.client_foundation_intakes;
create policy foundation_intakes_select_accessible
  on public.client_foundation_intakes
  for select to authenticated
  using (public.can_access_client(client_id));

create or replace function public.save_foundation_intake_draft(
  p_answers jsonb
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
begin
  if v_client_id is null then
    raise exception using errcode = '42501', message = 'pending foundation intake required';
  end if;

  select c.foundation_intake_status
  into v_status
  from public.clients c
  join public.client_foundation_intakes intake
    on intake.client_id = c.id
  where c.id = v_client_id
  for update of c, intake;

  if not found or v_status <> 'pending' then
    raise exception using errcode = '42501', message = 'pending foundation intake required';
  end if;

  update public.client_foundation_intakes
  set answers = coalesce(p_answers, '{}'::jsonb),
      updated_at = now()
  where client_id = v_client_id
  returning * into v_result;

  return jsonb_build_object(
    'status', v_status,
    'schema_version', v_result.schema_version,
    'answers', v_result.answers,
    'submitted_at', v_result.submitted_at
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
begin
  if v_client_id is null then
    raise exception using errcode = '42501', message = 'pending foundation intake required';
  end if;

  select c.foundation_intake_status
  into v_status
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

  update public.client_foundation_intakes
  set answers = coalesce(p_answers, '{}'::jsonb),
      waiver_version = p_waiver_version,
      waiver_accepted_at = now(),
      submitted_at = now(),
      updated_at = now()
  where client_id = v_client_id
  returning * into v_result;

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

revoke all on function public.save_foundation_intake_draft(jsonb)
  from public, anon;
revoke all on function public.submit_foundation_intake(jsonb, text)
  from public, anon;
grant execute on function public.save_foundation_intake_draft(jsonb)
  to authenticated;
grant execute on function public.submit_foundation_intake(jsonb, text)
  to authenticated;

notify pgrst, 'reload schema';
