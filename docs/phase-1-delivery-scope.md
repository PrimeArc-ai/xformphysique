# Phase 1 delivery scope

## Included

The existing client tracking, check-ins, photos, nutrition and workout plans, coach review, foundation questionnaire, and privacy-limited admin features remain the Phase 1 product.

CSV preview, import and export controls are hidden because their file-processing implementation is incomplete.

Photo deletion and replacement enqueue durable R2 cleanup work in the same database transaction as retirement. The backend retries eligible work every minute while the production application is running, and resumes on startup. A five-minute lease allows recovery after a worker crash; failed work uses capped exponential backoff. Deleting an already absent R2 object is safe. Queue completion is recorded only after successful storage deletion. Active references and queued-key reuse are guarded.

Render Free can sleep when idle. Cleanup therefore has no wall-clock completion guarantee while the service is asleep; durable jobs resume when it wakes. No extra paid worker or public cleanup endpoint is required. Set `XFORM_PHOTO_CLEANUP_ENABLED=false` to pause processing. Existing retired records are not automatically backfilled, and unknown orphaned uploads are not swept.

## Email acceptance gate

Brevo Free was selected for invitation and password-recovery testing on 21 September 2026. Provider account activation, sender verification, SMTP configuration in Supabase, and a real recipient acceptance test must be completed before email delivery is considered ready. Credentials belong only in Supabase's server-side Auth settings.

## Deferred to Phase 2

- WhatsApp reminders and their operational scheduling.
- AI or richer recipe generation.
- Lab and blood-report uploads.
- CSV import/export.
- Admin UI for reassignment after coach offboarding.

## Data retention

Offboarding retains client history and ends the coach's access/assignments. No age-based retention period or automatic history purge has been approved yet. Reassignment can be done operationally outside the current admin UI while retaining full history continuity. Photo cleanup is limited to explicitly deleted/replaced images; it is not a client-history retention policy. Historical deletion backfill requires a separate reviewed decision.
