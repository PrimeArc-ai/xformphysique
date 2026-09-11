begin;

alter table public.weekly_checkins
  add column if not exists questionnaire_version smallint not null default 1,
  add column if not exists ratings jsonb not null default '{}',
  add column if not exists challenges text not null default '',
  add column if not exists additional_comments text not null default '';

create or replace function public.validate_checkin_ratings()
returns trigger language plpgsql set search_path = '' as $$
declare k text; v jsonb;
begin
  if tg_op = 'UPDATE' and old.questionnaire_version > new.questionnaire_version then
    raise exception 'Questionnaire version cannot be downgraded' using errcode = '22023';
  end if;
  if new.questionnaire_version not in (1, 2) or jsonb_typeof(new.ratings) <> 'object' then
    raise exception 'Invalid questionnaire' using errcode = '22023';
  end if;
  if new.questionnaire_version = 1 and new.ratings <> '{}'::jsonb then
    raise exception 'Legacy answers must retain their scale' using errcode = '22023';
  end if;
  if new.questionnaire_version = 2 then
    if (select count(*) from jsonb_object_keys(new.ratings)) <> 11 then
      raise exception 'All eleven ratings are required' using errcode = '22023';
    end if;
    foreach k in array array['energy','sleep_quality','hunger','digestion','stress','recovery',
      'strength','workout_performance','motivation','adherence','overall_wellbeing'] loop
      v := new.ratings -> k;
      if v is null or jsonb_typeof(v) <> 'number' or (v::text)::numeric not between 1 and 10
        or trunc((v::text)::numeric) <> (v::text)::numeric then
        raise exception 'Ratings must be integers from 1 to 10' using errcode = '22023';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger validate_checkin_ratings before insert or update on public.weekly_checkins
for each row execute function public.validate_checkin_ratings();

create table public.weekly_checkin_feedback (
  checkin_id uuid primary key references public.weekly_checkins(id) on delete cascade,
  coach_id uuid not null references public.coaches(id),
  observations text not null default '' check (length(observations) <= 4000),
  adjustments text not null default '' check (length(adjustments) <= 4000),
  instructions text not null default '' check (length(instructions) <= 4000),
  next_week_priorities text not null default '' check (length(next_week_priorities) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.weekly_checkin_feedback enable row level security;
grant select on public.weekly_checkin_feedback to authenticated;
create policy weekly_feedback_read on public.weekly_checkin_feedback for select to authenticated
using (exists(select 1 from public.weekly_checkins c where c.id = checkin_id and public.can_access_client(c.client_id)));

create or replace function public.save_weekly_feedback(p_client_id uuid, p_checkin_id uuid, p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.weekly_checkin_feedback;
begin
  if not public.can_manage_client(p_client_id) then
    raise exception 'Assigned coach required' using errcode = '42501';
  end if;
  if not exists(select 1 from public.weekly_checkins where id = p_checkin_id and client_id = p_client_id) then
    raise exception 'Check-in not found' using errcode = 'P0002';
  end if;
  insert into public.weekly_checkin_feedback(checkin_id, coach_id, observations, adjustments, instructions, next_week_priorities)
    values(p_checkin_id, auth.uid(), p_feedback->>'observations', p_feedback->>'adjustments', p_feedback->>'instructions', p_feedback->>'next_week_priorities')
    on conflict(checkin_id) do update set coach_id = auth.uid(), observations = excluded.observations,
      adjustments = excluded.adjustments, instructions = excluded.instructions,
      next_week_priorities = excluded.next_week_priorities, updated_at = now() returning * into result;
  insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), p_client_id, 'coach_note_saved', 'weekly_checkin_feedback', p_checkin_id, '{"source":"weekly_review"}');
  return to_jsonb(result);
end $$;
revoke all on function public.save_weekly_feedback(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_weekly_feedback(uuid,uuid,jsonb) to authenticated;

alter table public.meals add column if not exists coach_instructions text not null default '',
  add column if not exists preparation text not null default '';

-- Snapshot replacement is atomic. Exercise IDs must belong to this owned session.
create or replace function public.save_workout_log(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workout_sessions; e jsonb; t jsonb;
begin
  select * into s from public.workout_sessions where id = p_session_id and client_id = auth.uid() for update;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;
  if p_payload ? 'exercise_logs' and jsonb_typeof(p_payload->'exercise_logs') = 'array' then
    if jsonb_array_length(p_payload->'exercise_logs') > 50 then raise exception 'Too many exercises'; end if;
    if (select count(*) <> count(distinct x->>'plan_exercise_id') from jsonb_array_elements(p_payload->'exercise_logs') x) then
      raise exception 'Duplicate exercises' using errcode = '22023';
    end if;
    for e in select * from jsonb_array_elements(p_payload->'exercise_logs') loop
      if not exists(select 1 from public.workout_exercises where id = (e->>'plan_exercise_id')::uuid and session_id = s.id) then
        raise exception 'Exercise outside session' using errcode = '42501';
      end if;
      if jsonb_array_length(e->'sets') > 20 then raise exception 'Too many sets'; end if;
    end loop;
    delete from public.workout_set_logs where session_id = s.id;
    for e in select * from jsonb_array_elements(p_payload->'exercise_logs') loop
      for t in select * from jsonb_array_elements(e->'sets') loop
        insert into public.workout_set_logs(session_id, workout_exercise_id, set_number, reps, load_kg, difficulty)
          values(s.id, (e->>'plan_exercise_id')::uuid, (t->>'set_number')::smallint,
            (t->>'reps')::integer, (t->>'load_kg')::numeric, (t->>'difficulty')::public.effort_level);
      end loop;
    end loop;
  end if;
  update public.workout_sessions set
    status = coalesce((p_payload->>'status')::public.workout_session_status, status),
    completed_at = case when p_payload->>'status' = 'completed' then coalesce((p_payload->>'completed_at')::timestamptz, now())
      when p_payload->>'status' in ('ready','in_progress') then null else completed_at end,
    overall_difficulty = case when p_payload ? 'overall_difficulty' then (p_payload->>'overall_difficulty')::public.effort_level else overall_difficulty end,
    client_note = case when p_payload ? 'note' then p_payload->>'note' else client_note end
    where id = s.id returning * into s;
  insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), s.client_id, 'workout_log_saved', 'workout_session', s.id, '{"source":"set_log"}');
  return to_jsonb(s);
end $$;
revoke all on function public.save_workout_log(uuid,jsonb) from public, anon;
grant execute on function public.save_workout_log(uuid,jsonb) to authenticated;

alter table public.progress_photos add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists period_start date generated always as (captured_on - ((extract(isodow from captured_on)::integer)-1)) stored;

create or replace function public.retire_progress_photo(p_client_id uuid, p_photo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare photo public.progress_photos;
begin
  if auth.uid() is null or not (auth.uid() = p_client_id or public.can_manage_client(p_client_id)) then
    raise exception 'Photo access denied' using errcode = '42501';
  end if;
  select * into photo from public.progress_photos where id = p_photo_id and client_id = p_client_id for update;
  if not found then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  if photo.deleted_at is null then
    update public.progress_photos set deleted_at = now(), deleted_by = auth.uid() where id = photo.id returning * into photo;
    insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
      values(auth.uid(), p_client_id, 'progress_photo_deleted', 'progress_photo', photo.id, '{"operation":"delete"}');
  end if;
  return to_jsonb(photo);
end $$;
revoke all on function public.retire_progress_photo(uuid,uuid) from public, anon;
grant execute on function public.retire_progress_photo(uuid,uuid) to authenticated;

-- Insert a newly uploaded private object and optionally retire its old version together.
create or replace function public.save_progress_photo(p_photo jsonb, p_replace_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_photo public.progress_photos; new_photo public.progress_photos; target_client uuid := (p_photo->>'client_id')::uuid;
begin
  if auth.uid() is null or auth.uid() <> target_client then raise exception 'Owner required' using errcode = '42501'; end if;
  if p_photo->>'storage_provider' <> 'r2' or split_part(p_photo->>'storage_path','/',1) <> target_client::text then
    raise exception 'Invalid private object path' using errcode = '42501';
  end if;
  if p_replace_id is not null then
    select * into old_photo from public.progress_photos where id = p_replace_id and client_id = target_client and deleted_at is null for update;
    if not found then raise exception 'Photo not found' using errcode = 'P0002'; end if;
    if old_photo.view::text <> p_photo->>'view' or date_trunc('week',old_photo.captured_on::timestamp) <> date_trunc('week',(p_photo->>'captured_on')::timestamp) then
      raise exception 'Replacement must match pose and week' using errcode = '22023';
    end if;
  end if;
  insert into public.progress_photos(client_id, view, captured_on, original_filename, storage_path, storage_provider, content_type, byte_size)
    values(target_client, (p_photo->>'view')::public.photo_view, (p_photo->>'captured_on')::date,
      p_photo->>'original_filename',p_photo->>'storage_path','r2',p_photo->>'content_type',(p_photo->>'byte_size')::integer) returning * into new_photo;
  if old_photo.id is not null then perform public.retire_progress_photo(target_client, old_photo.id); end if;
  insert into public.audit_events(actor_profile_id, client_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), target_client, 'progress_photo_uploaded', 'progress_photo', new_photo.id, jsonb_build_object('replaces', p_replace_id));
  return to_jsonb(new_photo);
end $$;
revoke all on function public.save_progress_photo(jsonb,uuid) from public, anon;
grant execute on function public.save_progress_photo(jsonb,uuid) to authenticated;

-- Deleted image metadata remains only for object cleanup/audit. Byte readers also check deleted_at.
create index progress_photos_active_week_idx on public.progress_photos(client_id,period_start,view) where deleted_at is null;
alter policy progress_photos_select_accessible_client on public.progress_photos
  using (deleted_at is null and public.can_access_client(client_id));

create or replace function public.can_access_progress_photo_storage_path(target_storage_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.progress_photos p
    where p.storage_path = target_storage_path and p.deleted_at is null and public.can_access_client(p.client_id));
$$;

-- The direct REST path must enforce the same session/exercise boundary as the RPC.
alter policy workout_set_logs_write_owner on public.workout_set_logs
  with check (public.is_workout_session_client(session_id) and exists (
    select 1 from public.workout_exercises e where e.id = workout_exercise_id and e.session_id = workout_set_logs.session_id));
alter policy workout_set_logs_update_owner on public.workout_set_logs
  with check (public.is_workout_session_client(session_id) and exists (
    select 1 from public.workout_exercises e where e.id = workout_exercise_id and e.session_id = workout_set_logs.session_id));
notify pgrst, 'reload schema';
commit;
