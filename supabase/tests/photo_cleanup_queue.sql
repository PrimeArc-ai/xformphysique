\set ON_ERROR_STOP on
-- Run only in an EMPTY DISPOSABLE PostgreSQL database. This isolated contract
-- fixture mirrors the columns consumed by the queue; it is not a live migration.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.progress_photos (
 id uuid primary key default gen_random_uuid(), storage_path text not null unique,
 storage_provider text not null, deleted_at timestamptz
);
insert into public.progress_photos(storage_path,storage_provider,deleted_at)
 values ('historical','r2',now());
\ir ../migrations/20260921111616_durable_photo_cleanup_queue.sql

create function public.test_assert(ok boolean, message text) returns void
language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%', message; end if; end $$;
select test_assert((select count(*)=0 from photo_cleanup_jobs),'Historical tombstones must not be backfilled');
select test_assert(not has_table_privilege('anon','photo_cleanup_jobs','select'),'anon table denied');
select test_assert(not has_table_privilege('authenticated','photo_cleanup_jobs','select'),'authenticated table denied');
select test_assert(has_table_privilege('service_role','photo_cleanup_jobs','select'),'service can inspect');
select test_assert(not has_table_privilege('service_role','photo_cleanup_jobs','update'),'service cannot bypass fenced RPC');
set role authenticated;
do $$ begin
 begin perform public.claim_photo_cleanup_jobs(); raise exception 'Authenticated claim allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.finish_photo_cleanup_job(gen_random_uuid(),gen_random_uuid(),true); raise exception 'Authenticated finish allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
 begin perform public.claim_photo_cleanup_jobs(); raise exception 'Anonymous claim allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into progress_photos(storage_path,storage_provider) values ('retire-r2','r2'),('retire-supabase','supabase'),('still-active','r2');
update progress_photos set deleted_at=now() where storage_path in ('retire-r2','retire-supabase');
select test_assert((select count(*)=1 from photo_cleanup_jobs),'Only newly retired R2 enqueued');
update progress_photos set deleted_at=now() where storage_path='retire-r2';
select test_assert((select count(*)=1 from photo_cleanup_jobs),'Repeated retirement idempotent');

set role service_role;
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs(0)),'Zero claim bounded');
select test_assert((select count(*)=1 from claim_photo_cleanup_jobs(1)),'Service claims retired job');
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs(1)),'Active lease excludes second claimant');
reset role;
select test_assert((select attempts=1 and lease_until>now() from photo_cleanup_jobs),'Attempt and lease persisted');
do $$ declare j public.photo_cleanup_jobs; begin
 select * into j from photo_cleanup_jobs;
 perform test_assert(not finish_photo_cleanup_job(j.id,gen_random_uuid(),true),'Wrong token rejected');
 perform test_assert(finish_photo_cleanup_job(j.id,j.lease_token,false,'r2_unavailable'),'Failure acknowledged');
 perform test_assert(not finish_photo_cleanup_job(j.id,j.lease_token,true),'Old lease fenced after failure');
end $$;
select test_assert((select completed_at is null and lease_token is null and available_at>now() and last_error_code='r2_unavailable' from photo_cleanup_jobs),'Failure persists backoff');
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs()),'Backoff prevents hot retry');
update photo_cleanup_jobs set available_at=now()-interval '1 second';
select * from claim_photo_cleanup_jobs();
do $$ declare j public.photo_cleanup_jobs; begin
 select * into j from photo_cleanup_jobs;
 perform test_assert(j.attempts=2,'Retry increments attempts');
 perform test_assert(finish_photo_cleanup_job(j.id,j.lease_token,true),'Retry success');
 perform test_assert(not finish_photo_cleanup_job(j.id,j.lease_token,true),'Duplicate finish no-op');
end $$;
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs()),'Completed job excluded');
do $$ begin
 begin update progress_photos set deleted_at=null where storage_path='retire-r2'; raise exception 'Unretire allowed';
 exception when check_violation then null; end;
 begin update progress_photos set storage_path='different' where storage_path='retire-r2'; raise exception 'Queued path mutation allowed';
 exception when check_violation then null; end;
 begin insert into progress_photos(storage_path,storage_provider) values('retire-r2','r2'); raise exception 'Queued path reuse allowed';
 exception when check_violation then null; end;
end $$;

-- Defense in depth against malformed queue records: even an operator-inserted
-- job must never claim an active photo, foreign provider or mismatched path.
insert into photo_cleanup_jobs(photo_id,storage_path) select id,storage_path from progress_photos where storage_path='still-active';
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs()),'No active deletion');
delete from photo_cleanup_jobs where storage_path='still-active';
insert into photo_cleanup_jobs(photo_id,storage_path) select id,'mismatched' from progress_photos where storage_path='retire-supabase';
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs()),'No mismatched provider/path deletion');
delete from photo_cleanup_jobs where storage_path='mismatched';

insert into progress_photos(storage_path,storage_provider) values('concurrent-a','r2'),('concurrent-b','r2');
update progress_photos set deleted_at=now() where storage_path like 'concurrent-%';
create extension dblink;
select dblink_connect('claimer','dbname=' || current_database());
select dblink_exec('claimer','begin');
select * from dblink('claimer','select id::text from public.claim_photo_cleanup_jobs(1)') as claimed(id text);
-- A locked claim in another transaction does not block another ready job.
set statement_timeout='2s';
select test_assert((select count(*)=1 from claim_photo_cleanup_jobs(10)),'Concurrent claimant skips locked job');
reset statement_timeout;
select dblink_exec('claimer','commit');
select test_assert((select count(*)=0 from claim_photo_cleanup_jobs()),'Neither live lease can be claimed again');
select dblink_disconnect('claimer');
create temporary table old_leases as select id,lease_token from photo_cleanup_jobs where completed_at is null;
update photo_cleanup_jobs set lease_until=now()-interval '1 second' where completed_at is null;
select test_assert((select count(*)=2 from claim_photo_cleanup_jobs()),'Expired leases reclaimable');
select test_assert(not exists(select 1 from old_leases o where finish_photo_cleanup_job(o.id,o.lease_token,true)),'Reclaimed leases fence old workers');
update photo_cleanup_jobs set attempts=100 where completed_at is null;
select finish_photo_cleanup_job(id,lease_token,false,'persistent_failure') from photo_cleanup_jobs where completed_at is null;
select test_assert((select bool_and(available_at between now()+interval '23 hours' and now()+interval '25 hours') from photo_cleanup_jobs where completed_at is null),'Backoff capped at 24 hours without abandoning jobs');
select 'photo cleanup acceptance passed' as result;
