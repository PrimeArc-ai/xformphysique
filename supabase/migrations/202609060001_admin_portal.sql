-- Admin operations without access to client PII. Apply atomically after 202608240005.
begin;

create or replace function public.is_active_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coaches c join public.profiles p on p.id = c.id
    where c.id = (select auth.uid()) and c.is_active and p.role = 'coach');
$$;
revoke all on function public.is_active_coach() from public, anon;
grant execute on function public.is_active_coach() to authenticated, service_role;

create or replace function public.is_assigned_coach(target_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_coach() and exists (
    select 1 from public.coach_client_assignments
    where client_id = target_client_id and coach_id = (select auth.uid()) and ended_at is null);
$$;
create or replace function public.can_access_client(target_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = target_client_id or public.is_assigned_coach(target_client_id);
$$;
create or replace function public.can_manage_client(target_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_assigned_coach(target_client_id);
$$;
create or replace function public.can_access_coach(target_coach_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coaches c where c.id = target_coach_id and (
    c.id = (select auth.uid()) or public.is_platform_admin() or (c.is_active and exists (
      select 1 from public.coach_client_assignments a where a.coach_id = c.id
      and a.client_id = (select auth.uid()) and a.ended_at is null))));
$$;

drop policy if exists profiles_select_self_or_assigned_coach on public.profiles;
create policy profiles_select_self_or_assigned_coach on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_assigned_coach(id) or public.can_access_coach(id));
drop policy if exists assignments_select_participant on public.coach_client_assignments;
create policy assignments_select_participant on public.coach_client_assignments for select to authenticated
  using (client_id = (select auth.uid()) or (coach_id = (select auth.uid()) and public.is_active_coach()));

-- A coach must not reactivate themselves by calling PostgREST directly.
revoke update on public.coaches from authenticated;
grant update (professional_title, bio) on public.coaches to authenticated;
drop policy if exists coaches_update_self on public.coaches;
create policy coaches_update_self on public.coaches for update to authenticated
  using (id = (select auth.uid()) and public.is_active_coach())
  with check (id = (select auth.uid()) and public.is_active_coach());

drop policy if exists food_library_items_manage_owner_coach on public.food_library_items;
create policy food_library_items_manage_owner_coach on public.food_library_items for all to authenticated
  using (owner_coach_id = (select auth.uid()) and public.is_active_coach())
  with check (owner_coach_id = (select auth.uid()) and public.is_active_coach());
drop policy if exists exercise_library_items_manage_owner_coach on public.exercise_library_items;
create policy exercise_library_items_manage_owner_coach on public.exercise_library_items for all to authenticated
  using (owner_coach_id = (select auth.uid()) and public.is_active_coach())
  with check (owner_coach_id = (select auth.uid()) and public.is_active_coach());
drop policy if exists coach_settings_manage_owner on public.coach_settings;
create policy coach_settings_manage_owner on public.coach_settings for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_active_coach())
  with check (coach_id = (select auth.uid()) and public.is_active_coach());
drop policy if exists audit_events_select_actor_or_admin on public.audit_events;
create policy audit_events_select_actor_or_admin on public.audit_events for select to authenticated
  using (actor_profile_id = (select auth.uid()) and public.is_active_coach());

-- Role is provisioned only from server-controlled app_metadata, never signup user_metadata.
-- Existing profiles and their client records remain untouched.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  profile_name text := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Member'), 160);
  workspace_role public.app_role := case new.raw_app_meta_data ->> 'xform_role'
    when 'admin' then 'admin'::public.app_role when 'coach' then 'coach'::public.app_role
    else 'client'::public.app_role end;
begin
  insert into public.profiles (id, role, email, first_name, full_name)
    values (new.id, workspace_role, new.email, left(split_part(profile_name, ' ', 1), 100), profile_name);
  if workspace_role = 'client' then
    insert into public.clients (id) values (new.id);
    insert into public.client_tracking_preferences (client_id) values (new.id);
    insert into public.client_coaching_context (client_id) values (new.id);
    insert into public.client_notification_preferences (client_id) values (new.id);
  elsif workspace_role = 'coach' then
    insert into public.coaches (id, professional_title, is_active)
      values (new.id, left(new.raw_user_meta_data ->> 'professional_title', 120), true);
    insert into public.coach_settings (coach_id) values (new.id);
  end if;
  return new;
end;
$$;

-- Separate operational audit; never embeds a client's identity or health data.
create table if not exists public.admin_coach_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  coach_id uuid not null references public.coaches(id),
  action text not null check (action in ('onboarded', 'offboarded')),
  created_at timestamptz not null default now()
);
alter table public.admin_coach_events enable row level security;
revoke all on public.admin_coach_events from anon, authenticated;
grant select on public.admin_coach_events to authenticated;
grant all on public.admin_coach_events to service_role;
drop policy if exists admin_coach_events_select_admin on public.admin_coach_events;
create policy admin_coach_events_select_admin on public.admin_coach_events for select to authenticated
  using (public.is_platform_admin());

create or replace function public.admin_list_coaches()
returns table (id uuid, full_name text, email text, professional_title text,
  is_active boolean, created_at timestamptz, active_client_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query select c.id, p.full_name, p.email, c.professional_title, c.is_active, c.created_at,
    (select count(*) from public.coach_client_assignments a where a.coach_id = c.id and a.ended_at is null)
    from public.coaches c join public.profiles p on p.id = c.id
    order by c.created_at desc, c.id;
end;
$$;

create or replace function public.admin_coach_clients(target_coach_id uuid)
returns table (client_code text, assigned_at timestamptz, ended_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.coaches where id = target_coach_id) then
    raise exception 'Coach not found' using errcode = 'P0002';
  end if;
  return query select c.client_code, a.assigned_at, a.ended_at
    from public.coach_client_assignments a join public.clients c on c.id = a.client_id
    where a.coach_id = target_coach_id order by a.assigned_at desc;
end;
$$;

create or replace function public.admin_record_coach_onboarding(target_coach_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  insert into public.admin_coach_events (actor_id, coach_id, action)
    values ((select auth.uid()), target_coach_id, 'onboarded');
end;
$$;

create or replace function public.admin_offboard_coach(target_coach_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare was_active boolean; released_count integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select is_active into was_active from public.coaches where id = target_coach_id for update;
  if not found then raise exception 'Coach not found' using errcode = 'P0002'; end if;
  if was_active then
    update public.coaches set is_active = false where id = target_coach_id;
    update public.coach_client_assignments set ended_at = now() where coach_id = target_coach_id and ended_at is null;
    get diagnostics released_count = row_count;
    insert into public.admin_coach_events (actor_id, coach_id, action)
      values ((select auth.uid()), target_coach_id, 'offboarded');
  end if;
  return jsonb_build_object('id', target_coach_id, 'is_active', false, 'released_client_count', released_count);
end;
$$;

revoke all on function public.admin_list_coaches() from public, anon;
revoke all on function public.admin_coach_clients(uuid) from public, anon;
revoke all on function public.admin_record_coach_onboarding(uuid) from public, anon;
revoke all on function public.admin_offboard_coach(uuid) from public, anon;
grant execute on function public.admin_list_coaches() to authenticated;
grant execute on function public.admin_coach_clients(uuid) to authenticated;
grant execute on function public.admin_record_coach_onboarding(uuid) to authenticated;
grant execute on function public.admin_offboard_coach(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
