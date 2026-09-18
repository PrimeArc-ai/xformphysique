begin;

insert into auth.users(id, email) values
  ('80000000-0000-0000-0000-000000000001', 'foundation-coach-a@xform.test'),
  ('80000000-0000-0000-0000-000000000002', 'navaneet@xform.test'),
  ('80000000-0000-0000-0000-000000000004', 'foundation-coach-b@xform.test'),
  ('80000000-0000-0000-0000-000000000005', 'other-foundation-client@xform.test'),
  ('80000000-0000-0000-0000-000000000006', 'existing-foundation-client@xform.test'),
  ('80000000-0000-0000-0000-000000000007', 'foundation-admin@xform.test');

update public.profiles
set role = 'coach', email = 'foundation-coach-a@xform.test', first_name = 'Aisha', full_name = 'Aisha Coach'
where id = '80000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'client', email = 'navaneet@xform.test', first_name = 'Nav', full_name = 'Navaneet'
where id = '80000000-0000-0000-0000-000000000002';

update public.profiles
set role = 'coach', email = 'foundation-coach-b@xform.test', first_name = 'Other', full_name = 'Other Coach'
where id = '80000000-0000-0000-0000-000000000004';

update public.profiles
set role = 'client', email = 'other-foundation-client@xform.test', first_name = 'Other', full_name = 'Other Client'
where id = '80000000-0000-0000-0000-000000000005';

update public.profiles
set role = 'client', email = 'existing-foundation-client@xform.test', first_name = 'Existing', full_name = 'Existing Client'
where id = '80000000-0000-0000-0000-000000000006';

update public.profiles
set role = 'admin', email = 'foundation-admin@xform.test', first_name = 'Foundation', full_name = 'Foundation Admin'
where id = '80000000-0000-0000-0000-000000000007';

insert into public.coaches(id, is_active) values
  ('80000000-0000-0000-0000-000000000001', true),
  ('80000000-0000-0000-0000-000000000004', true);

update public.clients
set primary_goal = 'fat_loss', check_in_day = 'monday', timezone = 'Asia/Kolkata'
where id in (
  '80000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000006'
);

insert into public.coach_client_assignments(coach_id, client_id)
values ('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002');

insert into public.coach_client_assignments(coach_id, client_id)
values ('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000006');

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if value is distinct from true then
    raise exception '%', message;
  end if;
end
$$;

create or replace function pg_temp.foundation_submit_answers()
returns jsonb
language sql
as $$
  select '{"body": {"desired_weight_kg": 76.0, "height_cm": 176.0, "morning_weight_kg": 82.4, "visual_body_fat": "m_15_19", "waist_cm": 84.0}, "checklists": {"adrenal": ["none"], "afternoon_crash": ["none"], "allergy_environmental": ["none"], "autonomic_nervous": ["none"], "behavioral_patterns": ["none"], "blood_marker_symptoms": ["none"], "blood_sugar_metabolism": ["none"], "breathing_patterns": ["none"], "breathing_stress": ["none"], "cardiorespiratory": ["none"], "cognitive": ["none"], "digestion_advanced": ["none"], "emotional_stress": ["none"], "endocrine_signals": ["none"], "essential_fatty_acids": ["none"], "food_response": ["none"], "genetic_predisposition": ["none"], "gi_issues": ["none"], "gut_brain": ["none"], "gut_digestive": ["none"], "habit_barriers": ["none"], "histamine_meals": ["none"], "hormonal_health": ["none"], "hormonal_symptoms": ["none"], "hormone_brain_mood": ["none"], "hydration_minerals": ["none"], "immune_histamine": ["none"], "immune_system": ["none"], "inflammation_immune": ["none"], "large_intestine": ["none"], "longevity_aging": ["none"], "male_urology": ["none"], "mental_cognitive": ["none"], "mental_load": ["none"], "metabolic_signals": ["none"], "metabolic_warning": ["none"], "methylation_detox": ["none"], "movement_limitation": ["none"], "neuro_sleep": ["none"], "orthopedic": ["none"], "oxygen_fitness": ["none"], "pain_inflammation": ["none"], "recovery_biomarkers": ["none"], "skin_hair": ["none"], "sleep_recovery": ["none"], "stress_recovery": ["none"], "sugar_handling": ["none"], "temperature_regulation": ["none"], "thyroid_autoimmune": ["none"], "thyroid_symptoms": ["none"], "upper_gi": ["none"], "vitamin_mineral_needs": ["none"]}, "eating_pattern": {"breakfast": {"foods": "Eggs, toast, and fruit.", "time": "08:00 AM"}, "dinner": {"foods": "Paneer, vegetables, and roti.", "time": "08:30 PM"}, "evening": {"foods": "", "time": ""}, "late_night": {"foods": "", "time": ""}, "lunch": {"foods": "Rice, chicken, dal, and salad.", "time": "01:00 PM"}, "mid_morning": {"foods": "", "time": ""}}, "identity": {"date_of_birth": "1994-01-15", "full_name": "Taylor Example", "mobile": "+91 98765 43210", "place_of_living": "Pune, Maharashtra", "profession": "Software engineer", "sex": "male"}, "lifestyle": {"alcohol": "Occasional social drinking.", "anything_else": "", "body_feeling": "slightly_unhappy", "burnout_or_anxiety": "No major burnout currently.", "caloric_drinks": "One sweet coffee most days.", "craving_times": ["rarely_no_specific_time"], "craving_triggers": "Stress and boredom at night.", "days_you_will_not_show_up": "I will still do the minimum effective session.", "delivery_or_eat_out": "1 to 2 times per week.", "diet_styles": ["high_protein"], "disordered_eating": "No past disordered eating history.", "energy_1_to_10": 7, "energy_notes": "Best focus in the morning, dip in late afternoon.", "excuses_and_plan": "I will pre-plan meals and shorten workouts if work runs late.", "family_support": "Family is supportive.", "fat_storage_areas": "Lower abdomen and waist.", "food_cravings_list": ["none"], "hours_to_first_meal": "1 hour", "job_and_commute": "Desk job with a 30-minute car commute.", "libido_energy": "Normal.", "life_events": "No major events affecting training right now.", "lifestyle_activity": "light", "mental_health_diagnosis": "No formal diagnosis.", "milestone_celebration": "A photoshoot and a weekend trip.", "motivation_when_low": "Accountability and reminders of why I started.", "must_have_foods": "Eggs, rice, and dark chocolate.", "nightmares": "", "non_scale_victory": "Better stamina during weekend sports.", "one_year_vision": "Lean, strong, and training consistently.", "online_training_history": "I tried one online plan for 3 months.", "people_who_discourage": "No one actively discourages me.", "photoshoot_gift": "Yes, I would celebrate with a photoshoot.", "prior_bodycomp_attempts": "I have dieted twice and gained some weight back each time.", "priority_goals": "Lose fat, build muscle, and improve energy.", "relationship_status": "Single", "religious_cultural_diet": "No special restrictions.", "religious_fasting": "No regular fasting.", "skin_without_lotion": "normal", "sleep_notes": "Usually asleep by 11 PM and up around 6:30 AM.", "sleep_quality_1_to_10": 7, "smoking": "No smoking history.", "stopped_previous_programs": "Travel and poor planning interrupted consistency.", "success_definition": "Dropping body fat while staying consistent for months.", "three_habit_changes": "Better meal prep, consistent sleep, and daily steps.", "water_intake": "1_3l", "weekday_sleep_hours": "6_7", "weekend_sleep_hours": "7_8", "weekend_vs_weekday": "Weekends are slightly later for sleep and meals.", "what_kept_you": "I kept postponing until work calmed down.", "why_this_matters": "I want better health, confidence, and long-term consistency.", "willing_to_change": ["significantly_modify_your_diet"], "work_environment": ["desk_job_with_prolonged_sitting"], "work_shift_pattern": "Standard 9-5 workdays.", "work_stress_limits": "Sometimes, but I can still train with planning."}, "logistics": {"disliked_foods": "No strong dislikes.", "food_preference": "nonveg_home_and_outside", "ingredient_quantity": "raw", "knows_food_logging": "yes", "knows_food_scale": "yes", "meals_per_day": 4, "supplement_budget_monthly": "3000 INR", "training_days": "1_5", "training_location": "gym", "veg_days_separate": "no", "who_cooks": "I cook most meals at home.", "workout_time": "6:30 AM"}, "safety": {"blood_pressure_reading": "120/80 mmHg", "bone_density_over_50": "Not applicable.", "bowel_movements": "One to two consistent movements per day.", "current_supplements": "Creatine 5 g daily and whey protein.", "family_cardiac_or_untrained_age": "No known issues.", "fat_burner_history": "No.", "food_allergies": "No known allergies.", "hospitalized_recently": "No.", "imaging_mri_xray": "No relevant imaging.", "limits_on_activity": "No activity limits.", "major_surgery_injuries_illness": "No major surgeries or injuries.", "ortho_surgeries": "No.", "other_health_concerns": "No additional concerns.", "physician_said_no_exercise": "No.", "prescription_medication": "No prescription medication.", "psych_meds_or_insulin_etc": "No.", "recent_labs_note": "No recent blood, hair, or stool work.", "resting_heart_rate": "62 bpm", "snore_or_unrefreshed": "No loud snoring and usually feel rested."}, "sex_specific": {"deficit_drive": "Drive stays normal in a mild calorie deficit.", "testosterone_tested_last_year": "No.", "trt_or_hormones": "No TRT or hormone use."}, "training": {"athletic_ability": 3, "cardio_ability": 3, "current_program": "Upper/lower split for the last 4 months.", "dedication_1_to_10": 8, "dumbbell_increments": "2.5 kg increments.", "equipment": "Commercial gym with barbells, dumbbells, benches, cables, and machines.", "exercise_familiarity": "Comfortable with standard gym movements and machine setup.", "exercise_history": "Consistent lifting for 2 years.", "exercise_level": "moderate", "flexibility": 3, "hobbies_sports": "Weekend badminton.", "joint_flareups": "Occasional tight shoulders after long desk days.", "muscular_capacity": 3, "ped_steroids": "No.", "post_workout_routine": "Protein shake, breakfast, and commute to work.", "refused_exercises": "No exercise refusals.", "sitting_hours": "8_12", "strength_lifts": "Bench press 60 kg x 8, squat 90 kg x 5, deadlift 120 kg x 5.", "strong_weak_groups": "Strong legs, weaker upper chest.", "tracks_workouts": "notes_app", "transport": "vehicle", "weekly_exercise_hours": "3_6"}, "waiver": {"accepted": true}}'::jsonb
$$;

select pg_temp.assert_true(
  'not_required'::public.foundation_intake_status = 'not_required'::public.foundation_intake_status,
  'foundation intake status enum exists'
);

select pg_temp.assert_true(
  (select foundation_intake_status from public.clients
    where id = '80000000-0000-0000-0000-000000000005') = 'not_required',
  'existing clients stay not_required'
);

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select public.provision_foundation_intake('80000000-0000-0000-0000-000000000006');

select pg_temp.assert_true(
  (select foundation_intake_status from public.clients
    where id = '80000000-0000-0000-0000-000000000006') = 'pending',
  'assigned coach rpc sets pending status'
);

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000006') = 1,
  'assigned coach rpc provisions intake row'
);

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.provision_foundation_intake('80000000-0000-0000-0000-000000000006');
    raise exception 'unassigned coach provision should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.provision_foundation_intake('80000000-0000-0000-0000-000000000006');
    raise exception 'admin provision should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;

update public.clients
set foundation_intake_status = 'pending'
where id = '80000000-0000-0000-0000-000000000002';

insert into public.client_foundation_intakes(client_id)
values ('80000000-0000-0000-0000-000000000002');

insert into public.progress_photos(
  client_id,
  view,
  captured_on,
  original_filename,
  storage_path,
  storage_provider,
  content_type,
  byte_size
)
values
  ('80000000-0000-0000-0000-000000000002', 'front', '2026-09-18', 'front.webp', '80000000-0000-0000-0000-000000000002/front.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'back', '2026-09-18', 'back.webp', '80000000-0000-0000-0000-000000000002/back.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'side', '2026-09-18', 'side.webp', '80000000-0000-0000-0000-000000000002/side.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'front_double_bicep', '2026-09-18', 'front-double-bicep.webp', '80000000-0000-0000-0000-000000000002/front-double-bicep.webp', 'r2', 'image/webp', 2048),
  ('80000000-0000-0000-0000-000000000002', 'back_double_bicep', '2026-09-18', 'back-double-bicep.webp', '80000000-0000-0000-0000-000000000002/back-double-bicep.webp', 'r2', 'image/webp', 2048);

insert into public.body_entries(
  client_id,
  entry_date,
  weight_kg,
  waist_cm,
  hip_cm,
  body_fat_pct
)
select
  '80000000-0000-0000-0000-000000000002',
  (now() at time zone 'Asia/Kolkata')::date,
  90.0,
  99.0,
  101.0,
  20.0;

insert into public.client_targets(
  client_id,
  metric,
  target_value,
  is_active,
  set_by_profile_id
)
values (
  '80000000-0000-0000-0000-000000000002',
  'weight_kg',
  90.0,
  true,
  '80000000-0000-0000-0000-000000000001'
);

select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  (public.save_foundation_intake_draft('{"identity":{"full_name":"Navaneet"}}'::jsonb)
    ->>'status') = 'pending',
  'owner can draft'
);

select pg_temp.assert_true(
  (public.submit_foundation_intake(
    pg_temp.foundation_submit_answers(),
    'xform-foundation-waiver-v1'
  )->>'status') = 'submitted',
  'owner can submit'
);

select pg_temp.assert_true(
  (select foundation_intake_status from public.clients
    where id = '80000000-0000-0000-0000-000000000002') = 'submitted',
  'submit flips client status'
);

select pg_temp.assert_true(
  (select full_name from public.profiles
    where id = '80000000-0000-0000-0000-000000000002') = 'Taylor Example',
  'submit syncs profile full_name'
);

select pg_temp.assert_true(
  (select first_name from public.profiles
    where id = '80000000-0000-0000-0000-000000000002') = 'Taylor',
  'submit syncs profile first_name'
);

select pg_temp.assert_true(
  exists(
    select 1
    from public.body_entries
    where client_id = '80000000-0000-0000-0000-000000000002'
      and entry_date = (now() at time zone 'Asia/Kolkata')::date
      and weight_kg = 82.4
      and waist_cm = 84.0
      and hip_cm = 101.0
      and body_fat_pct = 20.0
  ),
  'submit upserts today body entry without overwriting other measurements'
);

select pg_temp.assert_true(
  (select starting_weight_kg from public.clients
    where id = '80000000-0000-0000-0000-000000000002') = 82.4,
  'submit seeds starting weight when absent'
);

select pg_temp.assert_true(
  (select count(*) from public.client_targets
    where client_id = '80000000-0000-0000-0000-000000000002'
      and metric = 'weight_kg') = 2,
  'submit keeps target history when replacing weight target'
);

select pg_temp.assert_true(
  exists(
    select 1
    from public.client_targets
    where client_id = '80000000-0000-0000-0000-000000000002'
      and metric = 'weight_kg'
      and is_active = false
      and target_value = 90.0
  ),
  'submit deactivates prior active weight target'
);

select pg_temp.assert_true(
  exists(
    select 1
    from public.client_targets
    where client_id = '80000000-0000-0000-0000-000000000002'
      and metric = 'weight_kg'
      and is_active = true
      and target_value = 76.0
  ),
  'submit inserts desired weight target as active'
);

select pg_temp.assert_true(
  (select allergies_injuries from public.clients
    where id = '80000000-0000-0000-0000-000000000002') like '%No known allergies.%'
  and (select allergies_injuries from public.clients
    where id = '80000000-0000-0000-0000-000000000002') like '%No major surgeries or injuries.%',
  'submit seeds allergies and injuries from safety answers'
);

select pg_temp.assert_true(
  (select dietary_preferences from public.clients
    where id = '80000000-0000-0000-0000-000000000002') = 'Nonveg home and outside',
  'submit seeds dietary preferences from the food preference label'
);

do $$
begin
  begin
    perform public.submit_foundation_intake(
      pg_temp.foundation_submit_answers(),
      'xform-foundation-waiver-v1'
    );
    raise exception 'second submit should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.save_foundation_intake_draft('{"identity":{"full_name":"Coach overwrite"}}'::jsonb);
    raise exception 'coach draft should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002'
      and answers->'identity'->>'full_name' = 'Taylor Example') = 1,
  'assigned coach can select answers'
);

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002') = 0,
  'unassigned coach cannot select answers'
);

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

do $$
begin
  begin
    perform public.save_foundation_intake_draft('{"identity":{"full_name":"Other client"}}'::jsonb);
    raise exception 'other client draft should fail';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.client_foundation_intakes', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'service_role cannot mutate foundation intakes directly'
);

select pg_temp.assert_true(
  (select count(*) from public.client_foundation_intakes
    where client_id = '80000000-0000-0000-0000-000000000002') = 0,
  'admin cannot select answers'
);

reset role;

rollback;
\echo PASS: foundation intake draft, submit, status, photos, RLS, waiver, audit contract
