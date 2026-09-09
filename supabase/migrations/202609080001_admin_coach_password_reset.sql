-- Optional audit for admin password resets. Safe to apply after the admin portal migrations.
begin;

alter table public.admin_coach_events drop constraint if exists admin_coach_events_action_check;
alter table public.admin_coach_events add constraint admin_coach_events_action_check
  check (action in ('onboarded', 'offboarded', 'password_reset'));

create or replace function public.admin_record_coach_password_reset(target_coach_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.coaches where id = target_coach_id) then
    raise exception 'Coach not found' using errcode = 'P0002';
  end if;
  insert into public.admin_coach_events (actor_id, coach_id, action)
    values ((select auth.uid()), target_coach_id, 'password_reset');
end;
$$;

revoke all on function public.admin_record_coach_password_reset(uuid) from public, anon;
grant execute on function public.admin_record_coach_password_reset(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
