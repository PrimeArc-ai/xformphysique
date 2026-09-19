-- Additive: preserve the existing roster RPC for older application versions.
begin;
alter table public.coaches add column if not exists phone text
  check (phone is null or char_length(phone) <= 32);

-- Both staff-provisioning paths insert a coach in the auth-user transaction.
-- Copy contact information only; user metadata never decides authorization.
create or replace function public.initialize_coach_phone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is null then
    select nullif(left(btrim(u.raw_user_meta_data ->> 'phone'), 32), '')
      into new.phone from auth.users u where u.id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.initialize_coach_phone() from public, anon, authenticated;
drop trigger if exists initialize_coach_phone on public.coaches;
create trigger initialize_coach_phone before insert on public.coaches
  for each row execute function public.initialize_coach_phone();

create or replace function public.admin_list_coaches_v2()
returns table (id uuid, full_name text, email text, professional_title text,
  is_active boolean, created_at timestamptz, active_client_count bigint, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query select c.id, p.full_name, p.email, c.professional_title, c.is_active, c.created_at,
    (select count(*) from public.coach_client_assignments a where a.coach_id = c.id and a.ended_at is null), c.phone
    from public.coaches c join public.profiles p on p.id = c.id
    order by c.created_at desc, c.id;
end;
$$;

-- Counts bypass row visibility only after the same database-backed admin guard
-- as the existing roster. No client identities or records are returned.
create or replace function public.admin_platform_totals()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_coaches', (select count(*) from public.coaches),
    'total_clients', (select count(*) from public.clients));
end;
$$;
revoke all on function public.admin_list_coaches_v2() from public, anon;
revoke all on function public.admin_platform_totals() from public, anon;
grant execute on function public.admin_list_coaches_v2() to authenticated;
grant execute on function public.admin_platform_totals() to authenticated;
notify pgrst, 'reload schema';
commit;
