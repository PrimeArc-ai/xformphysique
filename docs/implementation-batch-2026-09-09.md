# Enhancement batch — 9 September 2026

Baseline: `000c174`. This batch extends existing React/FastAPI/Supabase data paths; it does not replace the application or broaden Admin access to client PII.

**Release status: implemented and locally verified; live Supabase rollout is pending approval and email configuration.** Do not treat the running port-8000 process as this release: it was started before these edits and has no auto-reload. No real account password was reset, email sent, or live client record changed during these tests.

## Prioritized requirements

1. **§17 — Authentication entry and recovery.** Preserve the responsive login; replace unauthenticated development password changes with secure email recovery for all three portals. Verify the already-added Admin-to-Coach password reset separately. §18 is a dependency, not a second counted requirement.
2. **§3 — Complete set logging.** Every exercise and set, raw reps/load, derived set/exercise/session volume, draft/completed states and persisted reload.
3. **§4 — Strength and volume history.** Client and assigned-coach exercise selector, raw history, best set/frequency, weekly load/reps/volume charts and explicit trend calculations.
4. **§9 — Meal-first nutrition.** Actual food/portions/timing/instructions first; recipe preparation access; macros secondary. No claim that the existing preparation template is AI.
5. **§50 — Weekly schedule.** One timezone-aware seven-day schedule, current/previous/next due dates, true submitted/missed states and consecutive misses. Default preserves configured weekdays; awaiting user preference on late-submission semantics.
6. **§55 — Expanded questionnaire.** Eleven 1–10 ratings, existing sentiment and free text retained; no invented defaults presented as client responses.
7. **§56 — Historical ratings.** Store ratings against client/check-in/week/date with explicit questionnaire version. Preserve legacy 1–5 values and historical browsing.
8. **§14 — Weekly information and feedback.** Historical client answers plus coach observations, adjustments, instructions and next-week priorities on the particular check-in.
9. **§11 — Five-pose weekly photos.** Front/back/side/front double bicep/back double bicep; week association, dated history, upload/replace/delete. Scope destructive operations to a selected photo after confirmation.
10. **§13 — Photo comparison.** Current/previous/selected historical weeks, all five views, accurate labels, zoom/fullscreen, client-visible weekly coach notes and assigned-coach access.

## Verification finding in the pulled changes

The pulled Forgot Password form calls an unauthenticated `/api/v1/auth/set-password` route. In development it changes a live Supabase password using only knowledge of the email address. This is not the PDF's email-verified recovery flow and is unsafe on an exposed development server. The existing `requestPasswordReset` hook is not connected to that form. The Admin-to-Coach operation has an Admin guard, generates a new password and keeps the original email/ID; it does not create an additional login ID.

### Corrections and authentication results

- The old email-only setter now always returns HTTP 410, including development. Tests prove it never constructs the privileged Auth gateway.
- Client, Coach and Admin now use the same email-ownership recovery flow: request link, validate recovery session, enter and confirm password, update through Supabase Auth, sign out, show confirmation and return to login.
- Recovery reload, an already-consumed URL fragment, expired/used links, provider rejection and email-rate-limit errors are covered. Recovery never opens a workspace while the new password is being set.
- Admin-to-Coach reset remains Admin-only, scoped to a coach in the roster, and keeps the coach's UUID/email. The generated password is shown once; the UI does not claim an email was sent. An audit failure is reported separately from a successful password update.
- All API responses now use `Cache-Control: private, no-store`, including sensitive credential and health-data responses.

### Live prerequisites observed read-only

On 9 September 2026 the Supabase project dashboard was healthy, but custom SMTP was disabled. Site URL was `http://localhost:3000`, and the only redirect allowlist entry was an older ngrok URL. These do not match the current local app at port 5173.

The proposed local URLs are `http://127.0.0.1:5173/` and `http://localhost:5173/`; a later shared deployment needs its own approved URL. Changing the live Site URL/allowlist is awaiting approval. SMTP also needs an actual mail provider and verified sender configuration: Supabase's default sender is restricted to project-team recipients, so general client email delivery has **not** passed live acceptance. Source: [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## Where to review the implementation after rollout

1. **All portals → Forgot Password:** request a secure link; set and confirm the replacement password through that link. **Admin → coach → Reset password:** confirm the existing login email and one-time new password.
2. **Client → Workout:** edit every exercise/set, add or remove rows, save draft or complete, navigate away and return. Reps and load persist; total volume is calculated from those raw values.
3. **Client → Workout → Exercise performance history**, or **Coach → Clients → Review → Exercise performance history:** select an exercise; inspect load, rep and volume charts plus the full set table.
4. **Client → Nutrition:** food quantities, timing, preparation and instructions are primary. Macro information is in collapsed reference sections. Meal adherence still saves through the existing API.
5. **Client → Dashboard / Check-ins**, and **Coach → Overview / client review:** the same timezone-aware schedule shows current, next, previous and missed check-ins. A fixed configured weekday remains the seven-day anchor; late submission does not silently move it.
6. **Client → Check-ins:** answer all eleven 1–10 detailed ratings, plus the retained original questions and free text. New ratings start unselected, not prefilled as fabricated answers.
7. **Client / assigned Coach → Weekly history:** open a week and view the exact stored responses, submission time, version and scale. Select a rating to plot loaded historical weeks; load older weeks to extend the graph.
8. **Coach → Clients → Review → Weekly history:** save observations, adjustments, instructions and next-week priorities for a specific check-in. That client sees the feedback; photo-comparison notes refresh immediately after the coach saves.
9. **Client → Progress Photos / Check-ins:** choose one of five poses, upload with a capture date, or confirm replacement/deletion for a selected photo. Older weeks remain separate. Assigned coaches can view or delete a selected client photo, not impersonate the client for an upload.
10. **Client → Progress Photos**, or **Coach → Clients → Review:** compare the same pose across current/previous/selected historical weeks; expand, zoom or request browser fullscreen. Exact photo IDs, capture dates and upload timestamps remain visible.

## Data and isolation decisions

- Existing `weekly_checkins` rows are extended, not replaced by a second check-in system. The client/week uniqueness remains intact. Version 1 retains its original energy/sleep 1–5 values; version 2 adds a JSON object containing exactly eleven integer 1–10 metrics. A version downgrade is rejected. Editing this week never writes another week.
- `weekly_checkin_feedback` references one existing check-in and its coach. Only the assigned active coach may write; that client and their assigned active coach may read. Admin gets no new client-health or photo access.
- Workout saves replace the selected session's complete raw set snapshot in one database transaction. Exercise IDs must belong to that owned session. Bad sets or IDs roll back the replacement; omitted rows represent removed sets.
- Exercise identity uses the library ID when present, otherwise normalized legacy exercise name. Weekly load means the heaviest recorded set; reps/volume are sums. Best set means highest load, with reps as the tiebreaker. Frequency means distinct recorded training dates. Trend compares the latest two recorded weeks; missing weeks are not zeros. Draft/in-progress saved sets are included and labeled.
- Photo bytes stay private in R2. The DB stores the exact UUID/object reference, pose, week/date and compact metadata; no image bytes/base64 are stored in the DB. Existing image optimization remains in place.
- Replacement atomically inserts the new photo metadata and retires the selected old version. Deletion first hides the record from both metadata and byte readers, then attempts R2 deletion. Minimal tombstone/audit metadata remains. If storage cleanup fails, the response/UI explicitly reports `cleanup_pending`; legacy non-R2 objects also require administrator cleanup. There is no new background cleanup worker in this batch.
- If the database response is lost after an upload, a read-back checks whether metadata committed. Object bytes are deleted only when absence is confirmed; an uncertain read leaves the private object intact for reconciliation.
- Coach reads retain the coach JWT and existing assignment RLS. No service-role shortcut is used to obtain client progress data. Read-only photo object URLs are revoked when their view is discarded.

## API additions and extensions

Existing prefix: `/api/v1`.

- `GET /client/workout-history` — complete exercise-oriented history, weekly aggregates and trend basis.
- `PUT /client/workout-sessions/{id}` — existing route now saves every raw set atomically through `save_workout_log` in Supabase; SQLite preserves the same snapshot behavior.
- `GET /client/check-ins?limit=12&offset=0` — expanded answers, per-week feedback, schedule and `has_more`.
- `PUT /client/check-ins/current` — existing route accepts questionnaire version, eleven ratings, challenges and comments alongside legacy fields.
- `GET /client/progress-photos?limit=50&offset=0&view=front` — active private metadata with week/upload timestamp and pagination.
- `POST /client/progress-photos` — multipart `file`, `view`, `captured_on`, optional `replace_photo_id`; supports all five poses.
- `DELETE /client/progress-photos/{photo_id}` — owner-scoped retirement and storage cleanup result.
- `GET /coach/clients/{client_id}/check-ins` — assigned-coach view of the same paginated weekly history/schedule.
- `PUT /coach/clients/{client_id}/check-ins/{checkin_id}/feedback` — four client-visible weekly feedback fields, each at most 4,000 characters.
- `GET /coach/clients/{client_id}/workout-history` — assigned-coach view of actual set history.
- `GET /coach/clients/{client_id}/progress-photos` — paginated authorized metadata with coach-scoped content URLs.
- `DELETE /coach/clients/{client_id}/progress-photos/{photo_id}` — assigned active coach may retire only that client's selected photo.
- Existing nutrition-plan responses now include `preparation` and `coach_instructions`; existing meal adherence and basic preparation-guide routes are retained.
- `POST /auth/set-password` — retired; HTTP 410, not a supported recovery method. Secure self-service recovery uses the Supabase Auth client, not this privileged route.

## Acceptance evidence

- **66 backend tests passed.** Temporary SQLite data and synthetic/mocked gateways, with live credentials excluded. Includes strict rating validation, legacy preservation, every set, pagination, signup-timezone boundary, email-only-reset denial, and uncertain R2/DB outcomes.
- **48 Playwright checks passed**, including immediate coach-feedback refresh. Browser tests exercise the React application with mocked API/Auth services and synthetic accounts. They do not prove real SMTP delivery or live R2/Supabase integration.
- **Isolated PostgreSQL acceptance passed.** Every repository migration applied to a fresh socket-only PostgreSQL 18 cluster. Synthetic legacy rows were inserted before the new migrations; assertions verify preservation, transactional rollback, original rating scales, new ratings, complete set replacement, coach feedback, photo retirement/replacement, RLS and RPC permissions for client/assigned coach/unassigned coach/inactive coach/Admin/anonymous contexts. Supabase-owned Auth/Storage schemas are stubbed locally; this is not a live project migration.
- Production frontend build and whitespace checks passed. Build still reports a non-blocking bundle-size warning; pytest reports the existing Starlette/httpx deprecation warning.
- Useful exact browser values: two exercises/four sets produce **900 kg**; removing one set persists **650 kg**. A new weekly hunger answer is **3/10**, while the legacy week's energy stays **4/5**. Coach feedback is visible on the selected week only. Test photo bytes are a synthetic one-pixel image, not real client photographs.

Test sources: `e2e/password-recovery.spec.js`, `e2e/progress-flows.spec.js`, `backend/tests/test_progress_completion.py`, `backend/tests/test_photo_commit_recovery.py`, `backend/tests/sql/progress_acceptance.sql`. PostgreSQL runner: `scripts/test-progress-migrations.sh`.

Browser screenshots: `/tmp/xform-acceptance-final-reviewed/`. PostgreSQL migration evidence: `/tmp/xform-progress-pg.Z2PZZt/`. These are temporary local evidence directories, not public artifacts.

## Controlled rollout and rollback

1. Approval gate: apply changes to the live project only after the pending migration approval is answered. Before applying, inspect schema/migration state and confirm the pulled `202609080001_admin_coach_password_reset.sql` function exists; do not blindly replay already-applied scripts.
2. Take/confirm a database backup. Apply `202609090001_progress_photo_poses.sql` and commit it before applying `202609090002_progress_completion.sql`. PostgreSQL requires enum additions committed before use. The second migration is transactional.
3. Verify the new columns/functions/policies, existing-row counts and legacy scales. Use designated synthetic accounts for live acceptance only with approval; do not reset an existing real user's password as a test.
4. Apply the separately approved local Auth Site URL/redirect entries. Configure custom SMTP with the chosen provider and verified sender before promising email delivery. Preserve unrelated existing redirect entries.
5. Restart the identified application backend after the schema is ready; then reload the frontend. Verify OpenAPI exposes the new routes and the retired setter returns 410. Port 8000 currently runs pre-batch code; a successful source test does not update that process. Do not re-expose that old backend through ngrok.
6. Run the actual approved coach/client journeys against Supabase and R2, then one genuine recovery-email receipt/reset journey for each role. These live gates remain open.

Rollback is non-destructive: roll back incompatible application writers, retain the additive columns/feedback/tombstones/enum values and all recorded data, and keep the authentication hotfix plus retired-photo read filters. Do **not** restore baseline `000c174` wholesale because it re-enables unsafe email-only password changes. Do not drop rating columns, unretire deleted images, or reset the database. If migration 2 fails, its transaction rolls back; migration 1's unused enum additions may safely remain while the issue is corrected.

## Boundaries and rollout

- No AI provider, paid messaging, body-fat method, package system or new Admin data permissions in this batch.
- Additive schema changes preserve old rows and rating scales. Do not remove historical photo records or reset a database.
- Apply and verify a compatible Supabase migration before enabling new writers in a live deployment. Production policies/delivery and live acceptance must be distinguished from mocked tests.
- Tests use temporary local data and synthetic/mocked services; do not reset existing real coach/client credentials to test recovery.
- Stop only after the ten acceptance paths are implemented and checked, or explicitly report a remaining external prerequisite. Do not count previews as complete.
