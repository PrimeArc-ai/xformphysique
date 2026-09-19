-- Run after the full migration chain in a disposable local database.
begin;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','mom-coach@example.test','{"xform_role":"coach"}','{"phone":"+91 9876543210"}'),
 ('91000000-0000-4000-8000-000000000002','mom-other-coach@example.test','{"xform_role":"coach"}','{}'),
 ('91000000-0000-4000-8000-000000000003','mom-client@example.test','{}','{}'),
 ('91000000-0000-4000-8000-000000000004','mom-unassigned@example.test','{}','{}'),
 ('91000000-0000-4000-8000-000000000005','mom-admin@example.test','{"xform_role":"admin"}','{}');
insert into public.coach_client_assignments(coach_id,client_id) values
 ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003');
select set_config('test.expected_clients',(select count(*)::text from public.clients),true);
select set_config('test.expected_coaches',(select count(*)::text from public.coaches),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
do $$ begin
 assert (public.admin_platform_totals()->>'total_clients')::int = current_setting('test.expected_clients')::int;
 assert (public.admin_platform_totals()->>'total_coaches')::int = current_setting('test.expected_coaches')::int;
 assert (select phone = '+91 9876543210' and active_client_count=1 from public.admin_list_coaches_v2() where id='91000000-0000-4000-8000-000000000001');
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update public.clients set amount_paid=1250.5 where id='91000000-0000-4000-8000-000000000003';
do $$ begin
 assert (select amount_paid=1250.5 from public.clients where id='91000000-0000-4000-8000-000000000003');
 begin
  perform public.admin_platform_totals();
  raise exception 'Coach accessed admin totals';
 exception when insufficient_privilege then null; end;
 begin
  update public.clients set amount_paid='NaN'::numeric where id='91000000-0000-4000-8000-000000000003';
  raise exception 'Nonfinite payment accepted';
 exception when check_violation then null; end;
 begin
  update public.clients set amount_paid=-1 where id='91000000-0000-4000-8000-000000000003';
  raise exception 'Negative payment accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin
  update public.clients set amount_paid=0 where id=auth.uid();
  raise exception 'Client changed payment';
 exception when insufficient_privilege then null; end;
 update public.clients set dietary_preferences='Vegetarian' where id=auth.uid();
 assert (select amount_paid=1250.5 from public.clients where id=auth.uid());
 begin
  perform public.admin_list_coaches_v2();
  raise exception 'Client accessed admin roster';
 exception when insufficient_privilege then null; end;
end $$;
-- Fake period/timestamp input must be anchored by the database.
insert into public.weekly_checkins(id,client_id,period_start,submitted_at,energy_score,sleep_score,sentiment,observation)
values ('92000000-0000-4000-8000-000000000001',auth.uid(),'2000-01-01','2000-01-01',4,4,'good','First cycle');
do $$ begin
 assert (select period_start=(now() at time zone 'Asia/Kolkata')::date and submitted_at=now() from public.weekly_checkins where client_id=auth.uid());
end $$;
insert into public.weekly_checkins(client_id,period_start,submitted_at,energy_score,sleep_score,sentiment,observation)
values (auth.uid(),'2000-02-01','2000-02-01',3,3,'good','Retry')
on conflict (client_id,period_start) do update set observation=excluded.observation, submitted_at=excluded.submitted_at;
do $$ begin
 assert (select count(*)=1 from public.weekly_checkins where client_id=auth.uid());
 assert (select id='92000000-0000-4000-8000-000000000001' and submitted_at=now() and observation='Retry' from public.weekly_checkins where client_id=auth.uid());
end $$;
update public.weekly_checkins set submitted_at='2001-01-01',period_start='2001-01-01' where client_id=auth.uid();
do $$ begin
 assert (select submitted_at=now() and period_start=(now() at time zone 'Asia/Kolkata')::date from public.weekly_checkins where client_id=auth.uid());
end $$;
-- Simulate a historical cycle without waiting seven days; privileged fixture only.
reset role;
alter table public.weekly_checkins disable trigger anchor_rolling_checkin;
update public.weekly_checkins set submitted_at=now()-interval '9 days',period_start=(now() at time zone 'Asia/Kolkata')::date-9 where id='92000000-0000-4000-8000-000000000001';
alter table public.weekly_checkins enable trigger anchor_rolling_checkin;
set local role authenticated;
insert into public.weekly_checkins(client_id,period_start,energy_score,sleep_score,sentiment,observation)
values (auth.uid(),'2000-01-01',4,4,'good','Late cycle');
do $$ begin
 assert (select count(*)=2 from public.weekly_checkins where client_id=auth.uid());
 assert (select submitted_at=now() and period_start=(now() at time zone 'Asia/Kolkata')::date from public.weekly_checkins where client_id=auth.uid() and observation='Late cycle');
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ declare affected int; begin
 update public.clients set amount_paid=777 where id='91000000-0000-4000-8000-000000000003';
 get diagnostics affected = row_count;
 assert affected=0, 'Unassigned coach changed payment';
end $$;
reset role;
update public.coaches set is_active=false where id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$ declare affected int; begin
 begin
  update public.clients set amount_paid=77 where id='91000000-0000-4000-8000-000000000003';
  get diagnostics affected = row_count;
  assert affected=0, 'Inactive coach changed payment';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
