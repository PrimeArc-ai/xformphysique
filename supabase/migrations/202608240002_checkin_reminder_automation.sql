-- Consent-gated WhatsApp reminder configuration and delivery outbox.
-- Phone numbers stay private: coaches do not receive a select policy for them.

create table public.client_notification_preferences (
  client_id uuid primary key references public.clients(id) on delete cascade,
  whatsapp_destination text check (whatsapp_destination ~ '^\+[1-9][0-9]{7,14}$'),
  checkin_reminders_enabled boolean not null default false,
  whatsapp_consent_at timestamptz,
  whatsapp_opted_out_at timestamptz,
  reminder_time time not null default time '21:30:00'
    check (reminder_time >= time '21:00:00' and reminder_time < time '22:00:00'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not checkin_reminders_enabled
    or (whatsapp_destination is not null and whatsapp_consent_at is not null and whatsapp_opted_out_at is null)
  ),
  check (whatsapp_opted_out_at is null or not checkin_reminders_enabled)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  channel text not null check (channel = 'whatsapp'),
  provider text not null check (provider = 'twilio'),
  reminder_local_date date not null,
  scheduled_for timestamptz not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 1),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, channel, reminder_local_date)
);

create index notification_deliveries_client_created_idx
  on public.notification_deliveries (client_id, created_at desc);

create trigger client_notification_preferences_set_updated_at before update
  on public.client_notification_preferences
  for each row execute function public.set_updated_at();

insert into public.client_notification_preferences (client_id)
select id from public.clients
on conflict (client_id) do nothing;

create or replace function public.handle_new_auth_user()
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

  insert into public.client_notification_preferences (client_id)
  values (new.id)
  on conflict (client_id) do nothing;

  return new;
end;
$$;

alter table public.client_notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

create policy client_notification_preferences_select_owner
  on public.client_notification_preferences for select to authenticated
  using (client_id = (select auth.uid()));
create policy client_notification_preferences_update_owner
  on public.client_notification_preferences for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));
create policy notification_deliveries_select_owner
  on public.notification_deliveries for select to authenticated
  using (client_id = (select auth.uid()));
