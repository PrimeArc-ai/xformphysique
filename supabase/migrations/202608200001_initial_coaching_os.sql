-- XForm Coaching OS: initial Supabase schema
--
-- Scope: Auth identity, client and coach workspaces, the 16 implemented
-- client APIs, and the coach workspace already represented in the UI.
--
-- Conventions:
--   * auth.users is the identity source of truth.
--   * UUIDs are public resource identifiers; client_code is a display ID only.
--   * Progress images are private Storage objects; this database stores metadata.
--   * RLS is enabled on every exposed application table.

create type public.app_role as enum ('client', 'coach', 'admin');
create type public.photo_view as enum ('front', 'side', 'back');
create type public.checkin_sentiment as enum ('excellent', 'good', 'okay', 'low');
create type public.meal_plan_status as enum ('draft', 'published', 'archived');
create type public.meal_adherence_status as enum ('followed', 'partly', 'missed');
create type public.training_program_status as enum ('draft', 'published', 'archived');
create type public.workout_session_status as enum ('ready', 'in_progress', 'completed');
create type public.effort_level as enum ('easy', 'moderate', 'hard');
create type public.audit_action as enum (
  'client_created',
  'client_profile_updated',
  'body_entry_saved',
  'checkin_saved',
  'progress_photo_uploaded',
  'nutrition_plan_published',
  'workout_program_published',
  'coach_note_saved',
  'data_export_requested'
);

-- Auth identity and workspace extensions.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  email text,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_unique
  on public.profiles (lower(email))
  where email is not null;

create table public.clients (
  id uuid primary key references public.profiles(id) on delete cascade,
  member_number bigint generated always as identity unique,
  client_code text generated always as ('XP-' || lpad(member_number::text, 4, '0')) stored unique,
  primary_goal text not null default 'not_set'
    check (char_length(btrim(primary_goal)) between 1 and 100),
  starting_weight_kg numeric(6, 2) check (starting_weight_kg > 0),
  check_in_day text not null default 'sunday'
    check (check_in_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  timezone text not null default 'Asia/Kolkata' check (char_length(btrim(timezone)) between 1 and 100),
  dietary_preferences text not null default '' check (char_length(dietary_preferences) <= 2000),
  allergies_injuries text not null default '' check (char_length(allergies_injuries) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coaches (
  id uuid primary key references public.profiles(id) on delete cascade,
  professional_title text check (char_length(professional_title) <= 160),
  bio text not null default '' check (char_length(bio) <= 3000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one active coach is assigned to a client in this MVP. Historical
-- assignments remain available after a reassignment through ended_at.
create table public.coach_client_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= assigned_at),
  unique (coach_id, client_id, assigned_at)
);

create unique index coach_client_assignments_one_active_coach_per_client
  on public.coach_client_assignments (client_id)
  where ended_at is null;

create index coach_client_assignments_active_coach_idx
  on public.coach_client_assignments (coach_id, client_id)
  where ended_at is null;

-- Coach client setup and client-visible planning context.
create table public.client_tracking_preferences (
  client_id uuid primary key references public.clients(id) on delete cascade,
  enabled_measurements text[] not null default array['weight_kg', 'waist_cm']::text[],
  missing_weight_threshold_days smallint not null default 3
    check (missing_weight_threshold_days between 1 and 90),
  measurement_refresh_threshold_days smallint not null default 14
    check (measurement_refresh_threshold_days between 1 and 365),
  updated_by_coach_id uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  metric text not null check (metric in ('weight_kg', 'waist_cm', 'hip_cm', 'body_fat_pct')),
  target_value numeric(7, 2) not null check (target_value > 0),
  target_date date,
  is_active boolean not null default true,
  set_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index client_targets_one_active_metric_per_client
  on public.client_targets (client_id, metric)
  where is_active;

create index client_targets_client_active_idx
  on public.client_targets (client_id, is_active);

create table public.client_coaching_context (
  client_id uuid primary key references public.clients(id) on delete cascade,
  training_considerations text[] not null default array[]::text[],
  client_visible_coach_note text not null default '' check (char_length(client_visible_coach_note) <= 2000),
  safety_notice text not null default 'Coaching support only. Not medical advice.'
    check (char_length(safety_notice) <= 1000),
  updated_by_coach_id uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_private_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_coach_id uuid not null references public.coaches(id) on delete restrict,
  note text not null check (char_length(btrim(note)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_private_notes_client_created_idx
  on public.coach_private_notes (client_id, created_at desc);

-- Client body, check-in, and private photo records.
create table public.body_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(6, 2) not null check (weight_kg > 0),
  waist_cm numeric(6, 2) check (waist_cm > 0),
  hip_cm numeric(6, 2) check (hip_cm > 0),
  body_fat_pct numeric(5, 2) check (body_fat_pct > 0 and body_fat_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, entry_date)
);

create index body_entries_client_date_idx
  on public.body_entries (client_id, entry_date desc);

create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period_start date not null,
  submitted_at timestamptz not null default now(),
  energy_score smallint not null check (energy_score between 1 and 5),
  sleep_score smallint not null check (sleep_score between 1 and 5),
  sentiment public.checkin_sentiment not null,
  observation text not null check (char_length(btrim(observation)) between 1 and 1000),
  concern text check (char_length(concern) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period_start)
);

create index weekly_checkins_client_period_idx
  on public.weekly_checkins (client_id, period_start desc);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  view public.photo_view not null,
  captured_on date not null,
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  storage_path text not null unique
    check (storage_path like (client_id::text || '/%')),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index progress_photos_client_view_date_idx
  on public.progress_photos (client_id, view, captured_on desc, created_at desc);

-- Coach-owned nutrition planning, client meal tracking, and recipe output.
create table public.food_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_coach_id uuid not null references public.coaches(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  category text not null default 'other' check (char_length(btrim(category)) between 1 and 80),
  calories_kcal numeric(8, 2) check (calories_kcal >= 0),
  protein_g numeric(8, 2) check (protein_g >= 0),
  carbs_g numeric(8, 2) check (carbs_g >= 0),
  fat_g numeric(8, 2) check (fat_g >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_coach_id, name)
);

create index food_library_items_owner_active_idx
  on public.food_library_items (owner_coach_id, is_active, name);

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by_coach_id uuid not null references public.coaches(id) on delete restrict,
  replaces_plan_id uuid references public.nutrition_plans(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  status public.meal_plan_status not null default 'draft',
  active_from date not null,
  active_to date,
  calories_kcal integer not null check (calories_kcal > 0),
  protein_g integer not null check (protein_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_to is null or active_to >= active_from),
  unique (client_id, version)
);

create unique index nutrition_plans_one_open_published_per_client
  on public.nutrition_plans (client_id)
  where status = 'published' and active_to is null;

create index nutrition_plans_client_active_idx
  on public.nutrition_plans (client_id, status, active_from desc);

create table public.nutrition_plan_restrictions (
  plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  restriction text not null check (char_length(btrim(restriction)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (plan_id, restriction)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  position smallint not null check (position > 0),
  meal_time time not null,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  calories_kcal integer not null check (calories_kcal >= 0),
  protein_g integer not null check (protein_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position)
);

create index meals_plan_time_idx on public.meals (plan_id, meal_time, position);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_library_item_id uuid references public.food_library_items(id) on delete set null,
  position smallint not null check (position > 0),
  ingredient_name text not null check (char_length(btrim(ingredient_name)) between 1 and 180),
  quantity numeric(9, 2) not null check (quantity > 0),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_id, position)
);

create index meal_ingredients_meal_idx on public.meal_ingredients (meal_id, position);

create table public.meal_adherence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  entry_date date not null,
  status public.meal_adherence_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, meal_id, entry_date)
);

create index meal_adherence_client_date_idx
  on public.meal_adherence (client_id, entry_date desc);

create table public.recipe_guides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  request_date date not null default current_date,
  guide text not null check (char_length(btrim(guide)) between 1 and 5000),
  uses_assigned_ingredients_only boolean not null default true,
  created_at timestamptz not null default now()
);

create index recipe_guides_client_date_idx
  on public.recipe_guides (client_id, request_date desc, created_at desc);

-- Coach-owned training programmes and client session execution.
create table public.exercise_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_coach_id uuid not null references public.coaches(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  body_region text not null default 'other' check (char_length(btrim(body_region)) between 1 and 80),
  training_focus text not null default 'strength' check (char_length(btrim(training_focus)) between 1 and 80),
  guidance text not null default '' check (char_length(guidance) <= 3000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_coach_id, name)
);

create index exercise_library_items_owner_active_idx
  on public.exercise_library_items (owner_coach_id, is_active, name);

create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by_coach_id uuid not null references public.coaches(id) on delete restrict,
  replaces_program_id uuid references public.training_programs(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  status public.training_program_status not null default 'draft',
  active_from date not null,
  active_to date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_to is null or active_to >= active_from),
  unique (client_id, version)
);

create unique index training_programs_one_open_published_per_client
  on public.training_programs (client_id)
  where status = 'published' and active_to is null;

create index training_programs_client_active_idx
  on public.training_programs (client_id, status, active_from desc);

create table public.training_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  position smallint not null check (position > 0),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  coach_note text not null default '' check (char_length(coach_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, position)
);

create index training_program_days_program_idx on public.training_program_days (program_id, position);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  program_day_id uuid references public.training_program_days(id) on delete set null,
  session_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  week_label text not null check (char_length(btrim(week_label)) between 1 and 50),
  coach_note text not null default '' check (char_length(coach_note) <= 2000),
  status public.workout_session_status not null default 'ready',
  estimated_duration_minutes smallint not null check (estimated_duration_minutes between 1 and 600),
  completed_at timestamptz,
  overall_difficulty public.effort_level,
  client_note text check (char_length(client_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workout_sessions_one_program_day_per_date
  on public.workout_sessions (client_id, program_day_id, session_date)
  where program_day_id is not null;

create index workout_sessions_client_date_idx
  on public.workout_sessions (client_id, session_date desc);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_library_item_id uuid references public.exercise_library_items(id) on delete set null,
  position smallint not null check (position > 0),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  prescribed_sets smallint not null check (prescribed_sets between 1 and 20),
  prescribed_reps text not null check (char_length(btrim(prescribed_reps)) between 1 and 40),
  rest_seconds smallint check (rest_seconds between 0 and 1800),
  coach_note text not null default '' check (char_length(coach_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position)
);

create index workout_exercises_session_idx on public.workout_exercises (session_id, position);

create table public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 20),
  reps smallint not null check (reps between 0 and 200),
  load_kg numeric(7, 2) not null check (load_kg between 0 and 1000),
  difficulty public.effort_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, workout_exercise_id, set_number)
);

create index workout_set_logs_session_idx on public.workout_set_logs (session_id, workout_exercise_id);

-- Coach workspace settings and append-only activity trail. The audit table is
-- written by FastAPI or an approved database function, never directly by UI.
create table public.coach_settings (
  coach_id uuid primary key references public.coaches(id) on delete cascade,
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  default_check_in_day text not null default 'sunday'
    check (default_check_in_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  default_missing_weight_threshold_days smallint not null default 3
    check (default_missing_weight_threshold_days between 1 and 90),
  default_measurement_refresh_threshold_days smallint not null default 14
    check (default_measurement_refresh_threshold_days between 1 and 365),
  enabled_measurements text[] not null default array['weight_kg', 'waist_cm']::text[],
  formula_registry text[] not null default array['rolling_average', 'rate_of_change']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  action public.audit_action not null,
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 100),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_actor_occurred_idx
  on public.audit_events (actor_profile_id, occurred_at desc);
create index audit_events_client_occurred_idx
  on public.audit_events (client_id, occurred_at desc);

-- Timestamp maintenance.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger coaches_set_updated_at before update on public.coaches
  for each row execute function public.set_updated_at();
create trigger coach_client_assignments_set_updated_at before update on public.coach_client_assignments
  for each row execute function public.set_updated_at();
create trigger client_tracking_preferences_set_updated_at before update on public.client_tracking_preferences
  for each row execute function public.set_updated_at();
create trigger client_targets_set_updated_at before update on public.client_targets
  for each row execute function public.set_updated_at();
create trigger client_coaching_context_set_updated_at before update on public.client_coaching_context
  for each row execute function public.set_updated_at();
create trigger coach_private_notes_set_updated_at before update on public.coach_private_notes
  for each row execute function public.set_updated_at();
create trigger body_entries_set_updated_at before update on public.body_entries
  for each row execute function public.set_updated_at();
create trigger weekly_checkins_set_updated_at before update on public.weekly_checkins
  for each row execute function public.set_updated_at();
create trigger food_library_items_set_updated_at before update on public.food_library_items
  for each row execute function public.set_updated_at();
create trigger nutrition_plans_set_updated_at before update on public.nutrition_plans
  for each row execute function public.set_updated_at();
create trigger meals_set_updated_at before update on public.meals
  for each row execute function public.set_updated_at();
create trigger meal_ingredients_set_updated_at before update on public.meal_ingredients
  for each row execute function public.set_updated_at();
create trigger meal_adherence_set_updated_at before update on public.meal_adherence
  for each row execute function public.set_updated_at();
create trigger exercise_library_items_set_updated_at before update on public.exercise_library_items
  for each row execute function public.set_updated_at();
create trigger training_programs_set_updated_at before update on public.training_programs
  for each row execute function public.set_updated_at();
create trigger training_program_days_set_updated_at before update on public.training_program_days
  for each row execute function public.set_updated_at();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();
create trigger workout_exercises_set_updated_at before update on public.workout_exercises
  for each row execute function public.set_updated_at();
create trigger workout_set_logs_set_updated_at before update on public.workout_set_logs
  for each row execute function public.set_updated_at();
create trigger coach_settings_set_updated_at before update on public.coach_settings
  for each row execute function public.set_updated_at();

-- Auth trigger. Role always defaults to client: signup metadata is deliberately
-- not trusted for authorization. Coaches are provisioned server-side.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  ), 160);
  profile_first_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    split_part(profile_name, ' ', 1),
    'Member'
  ), 100);
begin
  insert into public.profiles (id, role, email, first_name, full_name)
  values (new.id, 'client', new.email, profile_first_name, profile_name)
  on conflict (id) do nothing;

  insert into public.clients (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.client_tracking_preferences (client_id)
  values (new.id)
  on conflict (client_id) do nothing;

  insert into public.client_coaching_context (client_id)
  values (new.id)
  on conflict (client_id) do nothing;

  return new;
end;
$$;

create function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute procedure public.sync_auth_user_email();

-- RLS helpers have fixed search paths and only return authorization booleans.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function public.is_assigned_coach(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_client_assignments
    where client_id = target_client_id
      and coach_id = (select auth.uid())
      and ended_at is null
  );
$$;

create function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = target_client_id
    or (select public.is_assigned_coach(target_client_id))
    or (select public.is_platform_admin());
$$;

create function public.can_manage_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_assigned_coach(target_client_id))
    or (select public.is_platform_admin());
$$;

create function public.can_access_coach(target_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = target_coach_id
    or exists (
      select 1
      from public.coach_client_assignments
      where coach_id = target_coach_id
        and client_id = (select auth.uid())
        and ended_at is null
    )
    or (select public.is_platform_admin());
$$;

create function public.can_access_nutrition_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plans
    where id = target_plan_id
      and (select public.can_access_client(client_id))
  );
$$;

create function public.can_manage_nutrition_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plans
    where id = target_plan_id
      and (select public.can_manage_client(client_id))
  );
$$;

create function public.can_access_meal(target_meal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meals
    where id = target_meal_id
      and (select public.can_access_nutrition_plan(plan_id))
  );
$$;

create function public.can_access_training_program(target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_programs
    where id = target_program_id
      and (select public.can_access_client(client_id))
  );
$$;

create function public.can_manage_training_program(target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_programs
    where id = target_program_id
      and (select public.can_manage_client(client_id))
  );
$$;

create function public.can_access_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions
    where id = target_session_id
      and (select public.can_access_client(client_id))
  );
$$;

create function public.can_manage_workout_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions
    where id = target_session_id
      and (select public.can_manage_client(client_id))
  );
$$;

create function public.is_workout_session_client(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions
    where id = target_session_id
      and client_id = (select auth.uid())
  );
$$;

create function public.can_access_progress_photo_storage_path(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.progress_photos
    where storage_path = target_storage_path
      and (select public.can_access_client(client_id))
  );
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.sync_auth_user_email() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_assigned_coach(uuid) from public;
revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_manage_client(uuid) from public;
revoke all on function public.can_access_coach(uuid) from public;
revoke all on function public.can_access_nutrition_plan(uuid) from public;
revoke all on function public.can_manage_nutrition_plan(uuid) from public;
revoke all on function public.can_access_meal(uuid) from public;
revoke all on function public.can_access_training_program(uuid) from public;
revoke all on function public.can_manage_training_program(uuid) from public;
revoke all on function public.can_access_workout_session(uuid) from public;
revoke all on function public.can_manage_workout_session(uuid) from public;
revoke all on function public.is_workout_session_client(uuid) from public;
revoke all on function public.can_access_progress_photo_storage_path(text) from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_assigned_coach(uuid) to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;
grant execute on function public.can_manage_client(uuid) to authenticated, service_role;
grant execute on function public.can_access_coach(uuid) to authenticated, service_role;
grant execute on function public.can_access_nutrition_plan(uuid) to authenticated, service_role;
grant execute on function public.can_manage_nutrition_plan(uuid) to authenticated, service_role;
grant execute on function public.can_access_meal(uuid) to authenticated, service_role;
grant execute on function public.can_access_training_program(uuid) to authenticated, service_role;
grant execute on function public.can_manage_training_program(uuid) to authenticated, service_role;
grant execute on function public.can_access_workout_session(uuid) to authenticated, service_role;
grant execute on function public.can_manage_workout_session(uuid) to authenticated, service_role;
grant execute on function public.is_workout_session_client(uuid) to authenticated, service_role;
grant execute on function public.can_access_progress_photo_storage_path(text) to authenticated, service_role;

-- Explicit grants plus RLS make the PostgREST surface safe when the React app
-- eventually reads direct. The FastAPI service can also use a server-only
-- Supabase secret key for privileged provisioning and audit writes.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.coaches enable row level security;
alter table public.coach_client_assignments enable row level security;
alter table public.client_tracking_preferences enable row level security;
alter table public.client_targets enable row level security;
alter table public.client_coaching_context enable row level security;
alter table public.coach_private_notes enable row level security;
alter table public.body_entries enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.progress_photos enable row level security;
alter table public.food_library_items enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plan_restrictions enable row level security;
alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.meal_adherence enable row level security;
alter table public.recipe_guides enable row level security;
alter table public.exercise_library_items enable row level security;
alter table public.training_programs enable row level security;
alter table public.training_program_days enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.coach_settings enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_self_or_assigned_coach
  on public.profiles for select to authenticated
  using (
    (select auth.uid()) = id
    or (select public.is_assigned_coach(id))
    or (select public.can_access_coach(id))
    or (select public.is_platform_admin())
  );

create policy clients_select_owner_or_assigned_coach
  on public.clients for select to authenticated
  using ((select public.can_access_client(id)));
create policy clients_update_owner
  on public.clients for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy clients_update_assigned_coach
  on public.clients for update to authenticated
  using ((select public.can_manage_client(id)))
  with check ((select public.can_manage_client(id)));

create policy coaches_select_owner_or_assigned_client
  on public.coaches for select to authenticated
  using ((select public.can_access_coach(id)));
create policy coaches_update_self
  on public.coaches for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy assignments_select_participant
  on public.coach_client_assignments for select to authenticated
  using (
    coach_id = (select auth.uid())
    or client_id = (select auth.uid())
    or (select public.is_platform_admin())
  );

create policy client_tracking_preferences_select_accessible_client
  on public.client_tracking_preferences for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy client_tracking_preferences_manage_assigned_coach
  on public.client_tracking_preferences for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check ((select public.can_manage_client(client_id)));

create policy client_targets_select_accessible_client
  on public.client_targets for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy client_targets_manage_assigned_coach
  on public.client_targets for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check ((select public.can_manage_client(client_id)));
create policy client_targets_owner_weight_target
  on public.client_targets for all to authenticated
  using ((select auth.uid()) = client_id and metric = 'weight_kg')
  with check ((select auth.uid()) = client_id and metric = 'weight_kg');

create policy client_coaching_context_select_accessible_client
  on public.client_coaching_context for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy client_coaching_context_manage_assigned_coach
  on public.client_coaching_context for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check ((select public.can_manage_client(client_id)));

create policy coach_private_notes_select_assigned_coach
  on public.coach_private_notes for select to authenticated
  using ((select public.can_manage_client(client_id)));
create policy coach_private_notes_manage_assigned_coach
  on public.coach_private_notes for all to authenticated
  using (
    (select public.can_manage_client(client_id))
    and author_coach_id = (select auth.uid())
  )
  with check (
    (select public.can_manage_client(client_id))
    and author_coach_id = (select auth.uid())
  );

create policy body_entries_select_accessible_client
  on public.body_entries for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy body_entries_write_owner
  on public.body_entries for insert to authenticated
  with check ((select auth.uid()) = client_id);
create policy body_entries_update_owner
  on public.body_entries for update to authenticated
  using ((select auth.uid()) = client_id)
  with check ((select auth.uid()) = client_id);

create policy weekly_checkins_select_accessible_client
  on public.weekly_checkins for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy weekly_checkins_write_owner
  on public.weekly_checkins for insert to authenticated
  with check ((select auth.uid()) = client_id);
create policy weekly_checkins_update_owner
  on public.weekly_checkins for update to authenticated
  using ((select auth.uid()) = client_id)
  with check ((select auth.uid()) = client_id);

create policy progress_photos_select_accessible_client
  on public.progress_photos for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy progress_photos_write_owner
  on public.progress_photos for insert to authenticated
  with check ((select auth.uid()) = client_id and storage_path like (client_id::text || '/%'));

create policy food_library_items_manage_owner_coach
  on public.food_library_items for all to authenticated
  using (owner_coach_id = (select auth.uid()) or (select public.is_platform_admin()))
  with check (owner_coach_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy nutrition_plans_select_accessible_client
  on public.nutrition_plans for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy nutrition_plans_manage_assigned_coach
  on public.nutrition_plans for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check (
    (select public.can_manage_client(client_id))
    and created_by_coach_id = (select auth.uid())
  );

create policy nutrition_plan_restrictions_select_accessible_plan
  on public.nutrition_plan_restrictions for select to authenticated
  using ((select public.can_access_nutrition_plan(plan_id)));
create policy nutrition_plan_restrictions_manage_assigned_coach
  on public.nutrition_plan_restrictions for all to authenticated
  using ((select public.can_manage_nutrition_plan(plan_id)))
  with check ((select public.can_manage_nutrition_plan(plan_id)));

create policy meals_select_accessible_plan
  on public.meals for select to authenticated
  using ((select public.can_access_nutrition_plan(plan_id)));
create policy meals_manage_assigned_coach
  on public.meals for all to authenticated
  using ((select public.can_manage_nutrition_plan(plan_id)))
  with check ((select public.can_manage_nutrition_plan(plan_id)));

create policy meal_ingredients_select_accessible_meal
  on public.meal_ingredients for select to authenticated
  using ((select public.can_access_meal(meal_id)));
create policy meal_ingredients_manage_assigned_coach
  on public.meal_ingredients for all to authenticated
  using (
    exists (
      select 1 from public.meals
      where id = meal_id and (select public.can_manage_nutrition_plan(plan_id))
    )
  )
  with check (
    exists (
      select 1 from public.meals
      where id = meal_id and (select public.can_manage_nutrition_plan(plan_id))
    )
  );

create policy meal_adherence_select_accessible_client
  on public.meal_adherence for select to authenticated
  using (
    (select public.can_access_client(client_id))
    and (select public.can_access_meal(meal_id))
  );
create policy meal_adherence_write_owner
  on public.meal_adherence for insert to authenticated
  with check (
    client_id = (select auth.uid())
    and (select public.can_access_meal(meal_id))
  );
create policy meal_adherence_update_owner
  on public.meal_adherence for update to authenticated
  using (client_id = (select auth.uid()))
  with check (
    client_id = (select auth.uid())
    and (select public.can_access_meal(meal_id))
  );

create policy recipe_guides_select_accessible_client
  on public.recipe_guides for select to authenticated
  using (
    (select public.can_access_client(client_id))
    and (select public.can_access_meal(meal_id))
  );
create policy recipe_guides_write_owner
  on public.recipe_guides for insert to authenticated
  with check (
    client_id = (select auth.uid())
    and (select public.can_access_meal(meal_id))
  );

create policy exercise_library_items_manage_owner_coach
  on public.exercise_library_items for all to authenticated
  using (owner_coach_id = (select auth.uid()) or (select public.is_platform_admin()))
  with check (owner_coach_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy training_programs_select_accessible_client
  on public.training_programs for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy training_programs_manage_assigned_coach
  on public.training_programs for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check (
    (select public.can_manage_client(client_id))
    and created_by_coach_id = (select auth.uid())
  );

create policy training_program_days_select_accessible_program
  on public.training_program_days for select to authenticated
  using ((select public.can_access_training_program(program_id)));
create policy training_program_days_manage_assigned_coach
  on public.training_program_days for all to authenticated
  using ((select public.can_manage_training_program(program_id)))
  with check ((select public.can_manage_training_program(program_id)));

create policy workout_sessions_select_accessible_client
  on public.workout_sessions for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy workout_sessions_manage_assigned_coach
  on public.workout_sessions for all to authenticated
  using ((select public.can_manage_client(client_id)))
  with check ((select public.can_manage_client(client_id)));
create policy workout_sessions_update_owner
  on public.workout_sessions for update to authenticated
  using ((select public.is_workout_session_client(id)))
  with check ((select public.is_workout_session_client(id)));

create policy workout_exercises_select_accessible_session
  on public.workout_exercises for select to authenticated
  using ((select public.can_access_workout_session(session_id)));
create policy workout_exercises_manage_assigned_coach
  on public.workout_exercises for all to authenticated
  using ((select public.can_manage_workout_session(session_id)))
  with check ((select public.can_manage_workout_session(session_id)));

create policy workout_set_logs_select_accessible_session
  on public.workout_set_logs for select to authenticated
  using ((select public.can_access_workout_session(session_id)));
create policy workout_set_logs_write_owner
  on public.workout_set_logs for insert to authenticated
  with check ((select public.is_workout_session_client(session_id)));
create policy workout_set_logs_update_owner
  on public.workout_set_logs for update to authenticated
  using ((select public.is_workout_session_client(session_id)))
  with check ((select public.is_workout_session_client(session_id)));

create policy coach_settings_manage_owner
  on public.coach_settings for all to authenticated
  using (coach_id = (select auth.uid()) or (select public.is_platform_admin()))
  with check (coach_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy audit_events_select_actor_or_admin
  on public.audit_events for select to authenticated
  using (actor_profile_id = (select auth.uid()) or (select public.is_platform_admin()));

-- Private bucket for the actual image bytes. Metadata lives in progress_photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy progress_photo_storage_read_authorized
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (select public.can_access_progress_photo_storage_path(name))
  );

create policy progress_photo_storage_upload_owner
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
