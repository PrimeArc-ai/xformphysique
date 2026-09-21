begin;

-- The queue is server-only. Tombstones and completed jobs remain durable so an
-- object key cannot be reused while deletion is in flight or after completion.
create table public.photo_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null unique references public.progress_photos(id),
  storage_path text not null,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_until is null))
);
alter table public.photo_cleanup_jobs enable row level security;
revoke all on public.photo_cleanup_jobs from public, anon, authenticated, service_role;
grant select on public.photo_cleanup_jobs to service_role;
create index photo_cleanup_jobs_ready_idx on public.photo_cleanup_jobs(available_at, created_at)
  where completed_at is null;

create function public.guard_photo_cleanup_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize reference creation and retirement for the same storage key.
  perform pg_advisory_xact_lock(hashtextextended('photo-cleanup:' || new.storage_path, 0));
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.photo_cleanup_jobs j where j.photo_id = old.id)
       and (new.deleted_at is null or new.storage_path is distinct from old.storage_path
            or new.storage_provider is distinct from old.storage_provider or new.id is distinct from old.id) then
      raise exception 'Queued photo references are immutable' using errcode = '23514';
    end if;
    if new.storage_path = old.storage_path and new.storage_provider = old.storage_provider
       and new.deleted_at is not null then return new; end if;
  end if;
  if exists (select 1 from public.photo_cleanup_jobs j where j.storage_path = new.storage_path) then
    raise exception 'Storage path is reserved for cleanup' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_photo_cleanup_reference() from public, anon, authenticated, service_role;
create trigger guard_photo_cleanup_reference before insert or update on public.progress_photos
  for each row execute function public.guard_photo_cleanup_reference();

create function public.enqueue_retired_photo_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and new.storage_provider = 'r2' then
    insert into public.photo_cleanup_jobs(photo_id, storage_path) values(new.id, new.storage_path)
      on conflict (photo_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_retired_photo_cleanup() from public, anon, authenticated, service_role;
create trigger enqueue_retired_photo_cleanup after update of deleted_at on public.progress_photos
  for each row execute function public.enqueue_retired_photo_cleanup();
-- Intentionally no backfill: only retirements after this migration enqueue work.

create function public.claim_photo_cleanup_jobs(p_limit integer default 10)
returns setof public.photo_cleanup_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select j.id from public.photo_cleanup_jobs j
    join public.progress_photos p on p.id = j.photo_id
    where j.completed_at is null and j.available_at <= clock_timestamp()
      and (j.lease_until is null or j.lease_until <= clock_timestamp())
      and p.deleted_at is not null and p.storage_provider = 'r2' and p.storage_path = j.storage_path
      and not exists (select 1 from public.progress_photos active
        where active.storage_path = j.storage_path and active.deleted_at is null)
    order by j.available_at, j.created_at, j.id
    for update of j skip locked
    limit greatest(0, least(coalesce(p_limit, 10), 100))
  )
  update public.photo_cleanup_jobs j set
    attempts = j.attempts + 1,
    lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '5 minutes'
  from candidates c where c.id = j.id returning j.*;
end;
$$;

create function public.finish_photo_cleanup_job(p_id uuid, p_lease_token uuid,
  p_success boolean, p_error_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.photo_cleanup_jobs j set
    completed_at = case when p_success then clock_timestamp() else null end,
    available_at = case when p_success then j.available_at else clock_timestamp() +
      make_interval(secs => least(86400.0, 60.0 * power(2.0, least(greatest(j.attempts - 1, 0), 11)))) end,
    last_error_code = case when p_success then null else left(coalesce(p_error_code, 'cleanup_failed'), 120) end,
    lease_token = null, lease_until = null
  where j.id = p_id and j.lease_token = p_lease_token
    and j.lease_until > clock_timestamp() and j.completed_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.claim_photo_cleanup_jobs(integer) from public, anon, authenticated;
revoke all on function public.finish_photo_cleanup_job(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_photo_cleanup_jobs(integer) to service_role;
grant execute on function public.finish_photo_cleanup_job(uuid, uuid, boolean, text) to service_role;
notify pgrst, 'reload schema';
commit;
