-- Securely promote a freshly provisioned Auth user to the coach workspace.
-- This function is intentionally unavailable to browser roles: a client can
-- never self-escalate through signup metadata or a direct Data API request.

create or replace function public.promote_user_to_coach(
  target_user_id uuid,
  title text default null,
  biography text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Auth user % does not have an XForm profile', target_user_id;
  end if;

  -- Signup trigger intentionally creates a client workspace. Removing it
  -- first cascades only that new, empty workspace and avoids dual personas.
  delete from public.clients where id = target_user_id;

  update public.profiles
  set role = 'coach'
  where id = target_user_id;

  insert into public.coaches (id, professional_title, bio, is_active)
  values (target_user_id, nullif(btrim(title), ''), coalesce(biography, ''), true)
  on conflict (id) do update
    set professional_title = excluded.professional_title,
        bio = excluded.bio,
        is_active = true;

  insert into public.coach_settings (coach_id)
  values (target_user_id)
  on conflict (coach_id) do nothing;
end;
$$;

revoke all on function public.promote_user_to_coach(uuid, text, text) from public, anon, authenticated;
grant execute on function public.promote_user_to_coach(uuid, text, text) to service_role;
