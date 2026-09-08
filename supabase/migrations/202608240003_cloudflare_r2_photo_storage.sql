-- New progress photos are stored in private Cloudflare R2 through FastAPI.
-- Existing Supabase objects remain readable until an explicit copy-and-verify
-- migration is performed; they are never deleted by this schema change.

alter table public.progress_photos
  add column storage_provider text;

update public.progress_photos
  set storage_provider = 'supabase'
  where storage_provider is null;

alter table public.progress_photos
  alter column storage_provider set not null,
  alter column storage_provider set default 'r2',
  add constraint progress_photos_storage_provider_check
    check (storage_provider in ('r2', 'supabase'));

comment on column public.progress_photos.storage_provider is
  'r2 for new private Cloudflare R2 objects; supabase only for legacy objects pending verified migration.';
