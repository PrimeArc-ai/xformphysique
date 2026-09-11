\echo 'Checking historical preservation and anonymous denial'
do $$ begin
  assert (select energy_score=4 and sleep_score=3 and observation='Original answer stays exact.' and questionnaire_version=1 and ratings='{}' from public.weekly_checkins where id='60000000-0000-4000-8000-000000000001');
  assert (select period_start='2026-08-31'::date and deleted_at is null from public.progress_photos where id='70000000-0000-4000-8000-000000000001');
  assert not has_function_privilege('anon','public.save_workout_log(uuid,jsonb)','execute');
  assert not has_function_privilege('anon','public.save_weekly_feedback(uuid,uuid,jsonb)','execute');
  assert not has_function_privilege('anon','public.save_progress_photo(jsonb,uuid)','execute');
  assert not has_function_privilege('anon','public.retire_progress_photo(uuid,uuid)','execute');
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
\echo 'Client writes all sets; removed sets disappear; invalid snapshot rolls back'
do $$ declare result jsonb; photo jsonb; begin
  result := public.save_workout_log('40000000-0000-4000-8000-000000000001', '{"status":"in_progress","exercise_logs":[{"plan_exercise_id":"50000000-0000-4000-8000-000000000001","sets":[{"set_number":1,"reps":10,"load_kg":20},{"set_number":2,"reps":10,"load_kg":25},{"set_number":3,"reps":8,"load_kg":30}]},{"plan_exercise_id":"50000000-0000-4000-8000-000000000002","sets":[{"set_number":1,"reps":10,"load_kg":40}]}]}');
  assert (select sum(reps*load_kg)=1090 from public.workout_set_logs);
  assert (select count(*)=4 from public.workout_set_logs);
  begin
    perform public.save_workout_log('40000000-0000-4000-8000-000000000001','{"exercise_logs":[{"plan_exercise_id":"50000000-0000-4000-8000-000000000003","sets":[]}]}');
    raise exception 'Cross-client exercise accepted';
  exception when insufficient_privilege then null; end;
  assert (select count(*)=4 from public.workout_set_logs);
  begin
    perform public.save_workout_log('40000000-0000-4000-8000-000000000001','{"exercise_logs":[{"plan_exercise_id":"50000000-0000-4000-8000-000000000001","sets":[{"set_number":1,"reps":201,"load_kg":20}]}]}');
    raise exception 'Invalid reps accepted';
  exception when check_violation then null; end;
  assert (select count(*)=4 from public.workout_set_logs);
  perform public.save_workout_log('40000000-0000-4000-8000-000000000001','{"status":"completed","exercise_logs":[{"plan_exercise_id":"50000000-0000-4000-8000-000000000001","sets":[{"set_number":1,"reps":10,"load_kg":20}]}]}');
  assert (select count(*)=1 and sum(reps*load_kg)=200 from public.workout_set_logs);
  assert (select completed_at is not null from public.workout_sessions where id='40000000-0000-4000-8000-000000000001');
  perform public.save_workout_log('40000000-0000-4000-8000-000000000001','{"status":"in_progress"}');
  assert (select completed_at is null from public.workout_sessions where id='40000000-0000-4000-8000-000000000001');
  begin
    perform public.save_workout_log('40000000-0000-4000-8000-000000000002','{"status":"completed"}');
    raise exception 'Cross-client session accepted';
  exception when insufficient_privilege then null; end;

  insert into public.weekly_checkins(id,client_id,period_start,energy_score,sleep_score,sentiment,observation,questionnaire_version,ratings)
    values('60000000-0000-4000-8000-000000000002',auth.uid(),'2026-09-07',4,4,'good','New week',2,
      '{"energy":8,"sleep_quality":7,"hunger":3,"digestion":8,"stress":4,"recovery":7,"strength":8,"workout_performance":8,"motivation":9,"adherence":8,"overall_wellbeing":8}');
  assert (select count(*)=2 from public.weekly_checkins);
  begin
    update public.weekly_checkins set ratings='{"energy":99}' where id='60000000-0000-4000-8000-000000000002';
    raise exception 'Invalid ratings accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update public.weekly_checkins set questionnaire_version=1,ratings='{}' where id='60000000-0000-4000-8000-000000000002';
    raise exception 'Ratings downgrade accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_weekly_feedback(auth.uid(),'60000000-0000-4000-8000-000000000002','{}');
    raise exception 'Client edited coach feedback';
  exception when insufficient_privilege then null; end;

  photo := public.save_progress_photo('{"client_id":"10000000-0000-4000-8000-000000000001","view":"front","captured_on":"2026-09-09","original_filename":"progress.webp","storage_path":"10000000-0000-4000-8000-000000000001/replaced.webp","storage_provider":"r2","content_type":"image/webp","byte_size":1800}', '70000000-0000-4000-8000-000000000002');
  assert (select deleted_at is null from public.progress_photos where id='70000000-0000-4000-8000-000000000001');
  assert not exists(select 1 from public.progress_photos where id='70000000-0000-4000-8000-000000000002');
  assert not public.can_access_progress_photo_storage_path('10000000-0000-4000-8000-000000000001/current.webp');
  assert public.can_access_progress_photo_storage_path('10000000-0000-4000-8000-000000000001/replaced.webp');
  begin
    perform public.save_progress_photo('{"client_id":"10000000-0000-4000-8000-000000000001","view":"front","captured_on":"2026-09-09","original_filename":"progress.webp","storage_path":"10000000-0000-4000-8000-000000000001/wrong-week.webp","storage_provider":"r2","content_type":"image/webp","byte_size":1800}', '70000000-0000-4000-8000-000000000001');
    raise exception 'Cross-week replacement accepted';
  exception when invalid_parameter_value then null; end;
end $$;

\echo 'Assigned coach can review and delete; other coach/client/Admin cannot'
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
do $$ begin
  perform public.save_weekly_feedback('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002', '{"observations":"Consistent sessions","adjustments":"Maintain load","instructions":"Keep form controlled","next_week_priorities":"Sleep routine"}');
  assert (select count(*)=1 from public.weekly_checkin_feedback);
  assert (select count(*)=1 from public.workout_set_logs);
  perform public.retire_progress_photo('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
  assert not public.can_access_progress_photo_storage_path('10000000-0000-4000-8000-000000000001/older.webp');
  begin
    perform public.save_workout_log('40000000-0000-4000-8000-000000000001','{"status":"completed"}');
    raise exception 'Coach altered client workout logs';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$ begin assert (select observations='Consistent sessions' from public.weekly_checkin_feedback); end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
do $$ begin
  assert (select count(*)=0 from public.weekly_checkin_feedback);
  begin
    perform public.save_weekly_feedback('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','{}');
    raise exception 'Unassigned coach changed feedback';
  exception when insufficient_privilege then null; end;
  begin
    perform public.retire_progress_photo('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
    raise exception 'Unassigned coach deleted photo';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$ begin assert (select count(*)=0 from public.weekly_checkin_feedback); assert (select count(*)=0 from public.progress_photos); end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',false);
do $$ begin assert (select count(*)=0 from public.weekly_checkins); assert (select count(*)=0 from public.weekly_checkin_feedback); assert (select count(*)=0 from public.progress_photos); assert (select count(*)=0 from public.workout_set_logs); end $$;
reset role;
update public.coaches set is_active=false where id='20000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
do $$ begin
  assert (select count(*)=0 from public.weekly_checkin_feedback);
  assert (select count(*)=0 from public.progress_photos);
  begin
    perform public.save_weekly_feedback('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','{}');
    raise exception 'Inactive coach changed feedback';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*)=3 from public.audit_events where action='workout_log_saved');
  assert (select count(*)=1 from public.audit_events where entity_type='weekly_checkin_feedback');
  assert (select count(*)=2 from public.audit_events where action='progress_photo_deleted');
  assert (select count(*)=2 from public.progress_photos where deleted_at is not null);
end $$;
\echo 'PASS: legacy preservation, atomic saves, ratings, feedback, photo replacement/deletion, role isolation, audit'
