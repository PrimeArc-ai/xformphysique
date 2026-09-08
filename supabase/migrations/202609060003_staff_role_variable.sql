-- Fix a PL/pgSQL variable collision with SQL's CURRENT_ROLE keyword.
-- No trigger, grant, policy or role assignment changes in this migration.
begin;
create or replace function public.finalize_new_staff_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_role public.app_role;
  stored_profile_role public.app_role;
  profile_created_at timestamptz;
begin
  if coalesce(new.raw_app_meta_data ->> 'xform_role', '') not in ('coach', 'admin') then return new; end if;
  target_role := (new.raw_app_meta_data ->> 'xform_role')::public.app_role;
  select role, created_at into stored_profile_role, profile_created_at from public.profiles where id = new.id;
  if stored_profile_role = target_role then return new; end if;
  if stored_profile_role <> 'client' or profile_created_at is distinct from transaction_timestamp() then
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
commit;
