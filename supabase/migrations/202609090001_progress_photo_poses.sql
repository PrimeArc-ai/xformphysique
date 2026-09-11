-- Commit before the next migration: PostgreSQL enum values need a committed boundary.
alter type public.photo_view add value if not exists 'front_double_bicep';
alter type public.photo_view add value if not exists 'back_double_bicep';
alter type public.audit_action add value if not exists 'workout_log_saved';
alter type public.audit_action add value if not exists 'progress_photo_deleted';
