-- Synthetic records inserted BEFORE the new migrations to prove preservation.
insert into auth.users(id,email,raw_app_meta_data) values
 ('10000000-0000-4000-8000-000000000001','client-one@example.test','{}'),
 ('10000000-0000-4000-8000-000000000002','client-two@example.test','{}'),
 ('20000000-0000-4000-8000-000000000001','coach-one@example.test','{"xform_role":"coach"}'),
 ('20000000-0000-4000-8000-000000000002','coach-two@example.test','{"xform_role":"coach"}'),
 ('30000000-0000-4000-8000-000000000001','admin@example.test','{"xform_role":"admin"}');
insert into public.coach_client_assignments(coach_id,client_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.weekly_checkins(id,client_id,period_start,energy_score,sleep_score,sentiment,observation) values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-08-31',4,3,'good','Original answer stays exact.');
insert into public.workout_sessions(id,client_id,session_date,title,week_label,estimated_duration_minutes) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-09-07','Lower body','Week 2',45),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','2026-09-07','Lower body','Week 2',45);
insert into public.workout_exercises(id,session_id,position,name,prescribed_sets,prescribed_reps) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,'Goblet squat',3,'8-10'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',2,'Romanian deadlift',2,'10'),
 ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002',1,'Goblet squat',3,'8-10');
insert into public.progress_photos(id,client_id,view,captured_on,original_filename,storage_path,content_type,byte_size,storage_provider) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','front','2026-09-01','progress.webp','10000000-0000-4000-8000-000000000001/older.webp','image/webp',2000,'r2'),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','front','2026-09-08','progress.webp','10000000-0000-4000-8000-000000000001/current.webp','image/webp',2000,'r2');
