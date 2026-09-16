-- Coach workspace persistence: library and settings audit actions.
-- Tables already exist; this adds enum values plus an insert policy so a coach
-- can audit their own library/settings writes without a client_id.
alter type public.audit_action add value if not exists 'food_library_item_saved';
alter type public.audit_action add value if not exists 'exercise_library_item_saved';
alter type public.audit_action add value if not exists 'coach_settings_saved';

drop policy if exists audit_events_insert_coach_workspace on public.audit_events;
create policy audit_events_insert_coach_workspace
  on public.audit_events for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid())
    and client_id is null
    and action::text in (
      'food_library_item_saved',
      'exercise_library_item_saved',
      'coach_settings_saved'
    )
    and public.is_active_coach()
  );
