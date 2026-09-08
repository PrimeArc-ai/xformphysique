-- Profile photos are personal avatars, not client progress records.
-- Keep their database mapping owner-only; FastAPI exposes no cross-profile path.

drop policy profile_photos_select_authorized on public.profile_photos;

create policy profile_photos_select_self
  on public.profile_photos for select to authenticated
  using (profile_id = (select auth.uid()));
