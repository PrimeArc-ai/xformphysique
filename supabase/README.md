# Supabase setup: XForm Coaching OS

This directory is the database source of truth for the first Supabase deployment. The migration models the implemented client dashboard/API surface and the coach workspace already present in the React UI.

## What this migration creates

- Supabase Auth-linked profiles, clients, coaches, and one active coach-to-client assignment.
- Client data for body entries, weekly check-ins, progress-photo metadata, profile context, targets, and private coach notes.
- Normalised nutrition plans, meals, ingredients, adherence, and recipe-guide history.
- Normalised training programmes, sessions, exercises, and per-set workout logs.
- Coach food/exercise libraries, workspace settings, and append-only audit-event storage.
- A private `progress-photos` Storage bucket limited to JPEG, PNG, and WebP at 10 MB.
- Row Level Security policies for client ownership and assigned-coach access.

## Current deployment status

The initial migration was validated in a rollback-only transaction, then applied to the `cdfzrbblffpctigvjnyl` production project on 2026-08-21 through the Supabase SQL Editor. Deployment verification returned:

- 26 application tables, with RLS enabled on all 26.
- 53 `public`-schema RLS policies (plus 2 Storage-object policies).
- The private `progress-photos` bucket, limited to JPEG, PNG, and WebP at 10 MB.
- Two Auth triggers for client workspace provisioning and email synchronisation.

The SQL Editor does not create Supabase CLI migration-history records. Before the first future `supabase db push`, register this already-applied version with the CLI; do not rerun this file against the live database.

## Create the free project

1. Create or sign in to a Supabase account and create a project on the Free plan.
2. Select the region appropriate for the application’s intended users and data-residency needs. Keep the database password in a password manager.
3. In **Authentication → Providers**, enable Email. Configure the local Site URL as `http://127.0.0.1:5173`; add the eventual HTTPS frontend URL before releasing login.
4. Apply `migrations/202608200001_initial_coaching_os.sql` once, either through the Dashboard SQL Editor or a linked Supabase CLI project.
5. In **Settings → API Keys**, create/use a publishable key for the React app and a secret key for FastAPI. Never expose the secret key to Vite or the browser.

Supabase’s Free plan is appropriate for this MVP, but it has limits and pauses inactive projects. Review the current plan before launch: <https://supabase.com/pricing>.

## Recommended CLI path

The Supabase CLI is not installed in this workspace yet. Once a project exists:

```bash
supabase init
supabase login
supabase link --project-ref <your-project-ref>
supabase migration repair --status applied 202608200001
supabase migration list
supabase db push --dry-run
supabase db push
```

For the deployed `cdfzrbblffpctigvjnyl` project, run `migration repair` above before `db push`; it records the version that was applied through the Dashboard. For a freshly created project with no manual SQL, do **not** run `supabase db pull` before the first push: there is no application schema to baseline. For later Dashboard-only changes, use `supabase db pull` to capture them as a new migration before making another change.

## Runtime environment shape

```dotenv
# React: safe to expose; it is a low-privilege key and RLS still applies.
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# FastAPI only: keep outside source control and never serve to the browser.
XFORM_SUPABASE_URL=https://<project-ref>.supabase.co
XFORM_SUPABASE_SECRET_KEY=sb_secret_...
XFORM_CLIENT_INVITE_REDIRECT_URL=https://<your-frontend-domain>/
```

The next integration should replace `XFORM_DEMO_CLIENT_ID` in `backend/app/api/deps.py` with the authenticated Supabase user ID (`sub`), map it to `clients.id`, and replace local photo files with this private bucket. Keep FastAPI as the API boundary; do not let the browser use a secret key.

## Coach-led client onboarding

`POST /api/v1/coach/clients` is the first live coach endpoint. It accepts a
client profile, onboarding context, measurements, target weight and a private
coach note, and requires the caller's Supabase session plus the server-only
secret key. The endpoint:

1. verifies that the caller is an active coach using their own JWT;
2. calls Supabase Admin Auth to send an invite (the client sets their password
   through the time-limited link; passwords are never emailed);
3. lets the Auth trigger create the client workspace, then writes the initial
   onboarding fields, coach assignment, optional weight target, private note,
   and `client_created` audit event;
4. deletes the unaccepted Auth user if the database configuration step fails.

The invite redirect must be present in **Authentication → URL Configuration →
Redirect URLs**. For the current ngrok preview, add the exact public URL (or an
appropriately scoped wildcard) before sending a remote client invite.

Supabase's default email service only sends to project-team addresses and is
limited. Configure custom SMTP before inviting real clients. The recommended
MVP sender is Resend's free tier: it includes 3,000 transactional emails per
month / 100 per day, works with Supabase SMTP, and requires a verified sending
domain. Use a sending-only API key with `smtp.resend.com`, port `465`, username
`resend`, and the API key as the password. Do not use this auth sender for
marketing communication.

## Provisioning rule

New email-password registrations become `client` profiles through the migration’s `auth.users` trigger. A coach or administrator must be provisioned by a server-side action using the secret key (set `profiles.role = 'coach'`, create `coaches`, then create `coach_client_assignments`). Signup metadata is never trusted to grant a coach role.

## Deliberate MVP boundaries

- The migration stores only the client context currently shown in the UI. It does not create clinical-report storage, diagnosis, consent-retention, account-deletion, notifications, payments, or CSV import/export workflows because no approved API behavior exists for them yet.
- Private coach notes are separate from the client-visible coaching context. Clients cannot read `coach_private_notes`.
- The current workout-session RLS permits the client to update only their own session row. FastAPI remains responsible for limiting that update to status, completion time, difficulty, note, and set logs as specified by the existing API contract.
- WhatsApp/SMS is deliberately not integrated in this slice. See the product
  decision in the implementation handoff before selecting a production sender.

## Verify before deployment

Use a non-production project first. The schema should be applied from migrations and tested with separate client and coach accounts:

1. Register a client and confirm the trigger creates `profiles`, `clients`, tracking preferences, and coaching context.
2. Provision a coach server-side, assign the coach to the client, and verify both roles can read only their permitted rows.
3. Upload an image under `<client-auth-uuid>/<photo-uuid>.jpg`; verify the client and assigned coach can read it, while another client cannot.
4. Exercise the 16 client endpoints with a real JWT and confirm FastAPI only returns the authenticated client’s records.

Authoritative references: <https://supabase.com/docs/guides/auth/managing-user-data>, <https://supabase.com/docs/guides/database/postgres/row-level-security>, <https://supabase.com/docs/guides/storage/security/access-control>, and <https://supabase.com/docs/guides/local-development/overview>.
