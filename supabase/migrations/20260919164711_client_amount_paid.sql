-- Record an externally received payment amount; no currency or payment processing.
alter table public.clients
  add column amount_paid numeric null
  check (amount_paid >= 0 and amount_paid < 'Infinity'::numeric);

-- Existing client-owner UPDATE access must not permit editing coach payment records.
create function public.protect_client_amount_paid()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.amount_paid is null) then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.amount_paid is not distinct from old.amount_paid then
      return new;
    end if;
  end if;
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if not (
    public.is_assigned_coach(new.id)
    and exists (
      select 1 from public.coaches
      where id = auth.uid() and is_active
    )
  ) then
    raise exception 'Only the assigned active coach may change amount paid'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_client_amount_paid() from public;
create trigger clients_protect_amount_paid
before insert or update on public.clients
for each row execute function public.protect_client_amount_paid();
