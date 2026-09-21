# XForm Physique - Phase 1 Delivery Note

Date: 21 September 2026
Environment: `https://xform-client-demo.onrender.com/`

## Purpose

This note summarizes what is delivered in Phase 1 of the XForm Physique product, what is intentionally deferred to Phase 2, and what final user acceptance checks remain before declaring independent onboarding fully production-ready.

## Phase 1 Delivered Scope

### 1) Secure access and role-based workspaces
- Supabase-backed authentication and protected access.
- Distinct role experiences for Client, Coach, and Admin users.
- Server-side role and assignment enforcement for privacy boundaries.

### 2) Coach-led client onboarding
- Coach can enroll a new client from the app.
- Invitation-based account setup flow is in place (no plaintext password sharing).
- Onboarding captures core profile and setup context required for coaching.

### 3) Foundation intake gate for newly invited clients
- Newly invited clients complete an in-app Foundation Form before normal client workspace unlock.
- Intake supports draft/save progression and final submit flow.
- Intake status is visible in coach roster/review context.

### 4) Client progress capture and coaching loop
- Body tracking with persisted entries and historical visibility.
- Check-ins with ratings, notes, and photo capture.
- Coach review workflows and coach feedback visibility to client where applicable.
- Clear separation between client-visible guidance and coach-private notes.

### 5) Training and nutrition workspaces
- Nutrition planning and workout planning workspaces are available in current product scope.
- Coach library management supports food and exercise library item operations.

### 6) Coach operations and configuration
- Coach roster, client review, health context, and action audit visibility.
- Persisted coach settings for key tracking defaults and thresholds.
- Profile photo support and role-scoped media access behavior.

### 7) Admin operations (privacy-limited)
- Coach roster and high-level platform counts.
- Coach enrollment and controlled credential reset flow.
- Coach offboarding with preserved client records and ended active assignments.
- Privacy-limited assignment visibility in Admin (no client health/private note exposure).

### 8) Media reliability and cleanup hardening
- Retired/replaced R2 photo objects are queued for durable cleanup.
- Background cleanup supports retries, crash recovery, lease fencing, and safe idempotent deletion.
- Cleanup is designed to avoid deleting still-referenced objects.

### 9) Scope protection for Phase 1
- CSV preview/import/export controls are hidden from current coach UX.

## Phase 1 Final Acceptance Gate

SMTP for invitations and password recovery is configured with Brevo in Supabase Auth settings, and invite request flow has been validated in-app.

Final sign-off still requires real mailbox UAT:
- invitation email received by intended recipient,
- invitation link used to set password successfully,
- user signs in with the newly set password,
- same checks repeated for password recovery flow.

Until these mailbox checks are completed, email delivery should be treated as configured but not fully accepted.

## Deferred to Phase 2

- Automated WhatsApp reminder operations.
- AI-powered or richer recipe generation.
- Lab/blood report upload workflows.
- CSV import/export processing workflows.
- Admin UI for coach reassignment after offboarding.

## Policy Pending (Post-Phase 1)

- Formal data-retention period (time-based archive/purge policy) is not yet finalized.
- Current behavior preserves client history when coaches are offboarded.

## Recommended Client UAT Sign-off Checklist

1. Coach enrolls one new test client and confirms invite request success.
2. Test client receives invite email and completes password setup.
3. Test client signs in and completes foundation intake end-to-end.
4. Coach verifies client appears correctly in roster/review and intake status updates.
5. Test client submits one check-in with photo(s); coach reviews and responds.
6. Password recovery is executed and validated for at least one approved test account.

## Delivery Statement

Phase 1 is functionally delivered for core coaching operations, client onboarding pathway, role-based access, and protected progress workflows, with explicitly deferred Phase 2 items documented above. Final email mailbox UAT is the remaining acceptance gate for independent onboarding readiness.

