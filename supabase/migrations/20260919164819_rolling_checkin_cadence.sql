-- Keep historical period IDs; new cycles follow actual first submission + 7 days.
-- Serialize submissions per client so retries/concurrent requests update one cycle.
create function public.anchor_rolling_checkin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  client_zone text;
  local_day date;
  latest public.weekly_checkins%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.submitted_at := old.submitted_at;
    new.period_start := old.period_start;
    new.client_id := old.client_id;
    return new;
  end if;
  select timezone into client_zone from public.clients where id = new.client_id for update;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = client_zone) then
    client_zone := 'UTC';
  end if;
  local_day := (now() at time zone client_zone)::date;
  select * into latest from public.weekly_checkins where client_id = new.client_id
    order by submitted_at desc, id desc limit 1;
  if found and local_day < (latest.submitted_at at time zone client_zone)::date + 7 then
    new.period_start := latest.period_start;
    new.submitted_at := latest.submitted_at;
  else
    new.period_start := local_day;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.anchor_rolling_checkin() from public;
create trigger anchor_rolling_checkin before insert or update on public.weekly_checkins
for each row execute function public.anchor_rolling_checkin();
