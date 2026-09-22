begin;

create table if not exists public.auth_email_link_config (
  id boolean primary key default true check (id),
  app_redirect_url text not null check (app_redirect_url ~ '^https?://'),
  updated_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_email_link_config enable row level security;

revoke all on public.auth_email_link_config from public, anon;
grant select on public.auth_email_link_config to authenticated;
grant all on public.auth_email_link_config to service_role;

drop policy if exists auth_email_link_config_select_admin on public.auth_email_link_config;
create policy auth_email_link_config_select_admin on public.auth_email_link_config
for select to authenticated
using (public.is_platform_admin());

drop policy if exists auth_email_link_config_insert_admin on public.auth_email_link_config;
create policy auth_email_link_config_insert_admin on public.auth_email_link_config
for insert to authenticated
with check (public.is_platform_admin());

drop policy if exists auth_email_link_config_update_admin on public.auth_email_link_config;
create policy auth_email_link_config_update_admin on public.auth_email_link_config
for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop trigger if exists auth_email_link_config_set_updated_at on public.auth_email_link_config;
create trigger auth_email_link_config_set_updated_at
before update on public.auth_email_link_config
for each row execute function public.set_updated_at();

insert into public.auth_email_link_config (id, app_redirect_url)
values (true, 'https://hardcover-agreed-rebel-setup.trycloudflare.com/')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
