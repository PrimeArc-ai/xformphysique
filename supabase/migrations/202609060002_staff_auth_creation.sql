-- GoTrue can set app_metadata in a second statement in the SAME creation
-- transaction. Finalize staff provisioning there, before credentials become usable.
begin;
create or replace function public.finalize_new_staff_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_role public.app_role;
  current_role public.app_role;
  profile_created_at timestamptz;
begin
  if coalesce(new.raw_app_meta_data ->> 'xform_role', '') not in ('coach', 'admin') then return new; end if;
  target_role := (new.raw_app_meta_data ->> 'xform_role')::public.app_role;
  select role, created_at into current_role, profile_created_at from public.profiles where id = new.id;
  if current_role = target_role then return new; end if;
  -- Never repurpose an existing person's workspace. Only empty default rows
  -- inserted by handle_new_auth_user within this uncommitted transaction qualify.
  if current_role <> 'client' or profile_created_at is distinct from transaction_timestamp() then
    raise exception 'Staff roles must be assigned during account creation';
  end if;
  delete from public.clients where id = new.id;
  update public.profiles set role = target_role where id = new.id;
  if target_role = 'coach' then
    insert into public.coaches (id, professional_title, is_active)
      values (new.id, left(new.raw_user_meta_data ->> 'professional_title', 120), true);
    insert into public.coach_settings (coach_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.finalize_new_staff_account() from public, anon, authenticated;
drop trigger if exists on_auth_staff_metadata_created on auth.users;
create trigger on_auth_staff_metadata_created after update of raw_app_meta_data on auth.users
  for each row execute function public.finalize_new_staff_account();
notify pgrst, 'reload schema';
commit;
