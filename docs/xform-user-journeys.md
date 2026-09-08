# XForm MVP User Journeys

Product review date: 26 August 2026.

This catalogue reflects the original scope specification, the extracted feature specification,
the client API contract, the React screens, FastAPI endpoints, Supabase authorization rules, and
private Cloudflare R2 photo handling currently in the repository.

## Journey 1: Secure workspace entry

Actor: coach or client.

1. The user opens the application and enters email and password.
2. Supabase verifies the session.
3. The React app calls `GET /api/v1/auth/me`.
4. The FastAPI service reads the user's role from the server-authorized profile and opens either
   the coach workspace or the client workspace.
5. No role selector is shown to the user, so the browser cannot elect a more privileged workspace.

Acceptance result: coach sign-in and server-authorized role routing were exercised before the
onboarding journey began.

## Journey 2: Coach creates a client workspace

Actor: assigned coach.

1. From Command Center or Clients, the coach selects **New client**.
2. The coach enters the client's name, email, goal, check-in day, target, timezone, dietary
   preferences, restrictions, selected measurements, and a private onboarding note.
3. React posts the documented JSON body to `POST /api/v1/coach/clients`.
4. FastAPI verifies an active coach role, invites the client through Supabase Admin Auth, creates
   the client record, creates the coach-client assignment, saves initial client context, and writes
   an audit event.
5. The coach sees confirmation that the setup invitation was issued.

Acceptance result: the modal was tested at a 720px-high viewport and corrected so its submit action
remains reachable. The live request reached Supabase with the correct contract and created
Navaneet Deshpande's assigned client record, `XP-0005`. A setup invitation was issued to the
user-authorized Gmail address.

## Journey 3: Client accepts the invitation

Actor: new client.

1. The client receives the time-limited Supabase setup link.
2. The client sets their own password; the product never emails a plaintext password.
3. The client signs in and is routed into the client workspace.

Acceptance result: the test harness set the invited client's password after the real invitation,
then signed in as the client and completed the remaining browser journey. The invitation-link click
inside the Gmail inbox was not automated because the mailbox is user-controlled.

## Journey 4: Client records private body and wellbeing signals

Actor: client.

1. The client saves profile preferences and an optional compact avatar.
2. In Body Tracker, the client saves dated body values such as weight and waist.
3. In Check-ins, the client submits energy, sleep, sentiment, observation, and optional concern.
4. In Progress Photos, the client uploads a compact front, side, or back image.
5. FastAPI stores structured values in Supabase. Photo bytes go to private Cloudflare R2; Supabase
   stores only the scoped metadata and object reference.

Acceptance result: the live journey saved a 69.5 kg target, 72.4 kg body weight, 84.2 cm waist,
`Good` check-in, an observation about three strength sessions, a right-knee pacing concern, and
private client avatar/progress-photo records. Tiny valid PNG files were used for storage testing.

The Nutrition and Workout routes were also verified for a newly onboarded client. Until the coach
publishes those assignments, each route now shows an explicit awaiting-plan state rather than an
empty workspace.

## Journey 5: Assigned coach monitors one client

Actor: assigned coach.

1. The coach opens Clients, searches for the client, and selects **Review**.
2. FastAPI fetches only RLS-authorized records for that coach-client assignment.
3. The review shows recent body entries, submitted check-ins, private coach notes, and the count
   of protected photo records.
4. The current release deliberately does not expose photo bytes or previews to the coach.

Acceptance result: the assigned coach searched for Navaneet, opened the live review, and saw the
72.4 kg entry, check-in narrative, and protected-photo record count. The browser flow did not
expose the photo bytes.

## Journey 6: Coach publishes scoped guidance

Actor: coach, then the assigned client.

1. The coach saves client-visible guidance, training considerations, and a safety boundary in the
   selected client's review.
2. FastAPI updates only that client's coaching context and writes an audit event.
3. The client sees that guidance in Health Summary.
4. Private coach notes remain excluded from the client response.

Acceptance result: the coach saved a client-visible note, two training considerations, and a safety
boundary. Navaneet then signed in and saw all three items in Health Summary.

## Journey 7: Check-in reminder

Actor: scheduled server job.

1. The server's daily scheduler selects clients whose configured check-in day is tomorrow.
2. It sends at most one approved WhatsApp reminder per client in the 9-10pm local-time window.
3. Delivery state is recorded so the same client is not reminded repeatedly.

Acceptance result: implemented and unit-tested, but deliberately inactive until approved WhatsApp
credentials and a production scheduler are configured.

## Current MVP Boundaries

- Coach workout/nutrition builders, libraries, system settings, CSV tools, and detailed coach
  progress-photo viewing are frontend previews rather than persisted workflows.
- Password reset and invitation email delivery require Supabase email configuration and a
  user-controlled recipient.
- The live review intentionally returns photo metadata/counts, not a direct R2 object URL.

## Verification Evidence

- The Playwright acceptance journey passed in 42.6 seconds. It covered coach sign-in and
  onboarding, client sign-in, no-plan Nutrition and Workout states, profile/photo/body/check-in/photo
  updates, coach avatar and review, scoped guidance, and the client's Health Summary view.
- 11 focused FastAPI regression tests pass, including the onboarding, monitoring, reminder, R2,
  and OpenAPI contract checks.
- The public onboarding contract was corrected to accept the documented client JSON body directly.
- The public OpenAPI schema no longer treats runtime settings as request data or exposes them.
- The Playwright script is [`e2e/user-journeys.spec.js`](../e2e/user-journeys.spec.js). It is
  repeatable: it reuses this authorised account, upserts body/check-in data, replaces profile
  photos, and verifies an existing progress photo instead of accumulating uploads.
