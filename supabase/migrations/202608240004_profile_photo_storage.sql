-- One private, current-only profile photo per authenticated workspace.
-- The binary lives in Cloudflare R2; this table carries only the opaque map.

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_path text not null unique
    check (storage_path like ('profiles/' || profile_id::text || '/' || id::text || '.%')),
  content_type text not null check (content_type = 'image/webp'),
  byte_size integer not null check (byte_size between 1 and 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_photos_set_updated_at
  before update on public.profile_photos
  for each row execute function public.set_updated_at();

alter table public.profile_photos enable row level security;

-- The owner always has access. A client and their currently assigned coach may
-- read each other's profile image metadata, matching the existing profile RLS.
create policy profile_photos_select_authorized
  on public.profile_photos for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.can_access_client(profile_id))
    or (select public.can_access_coach(profile_id))
  );

create policy profile_photos_insert_self
  on public.profile_photos for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy profile_photos_update_self
  on public.profile_photos for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select, insert, update on public.profile_photos to authenticated, service_role;

comment on table public.profile_photos is
  'Private profile image references. Image bytes reside only in Cloudflare R2.';
