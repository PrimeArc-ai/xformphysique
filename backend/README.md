# XForm API

FastAPI + SQLite service for the client dashboard contract. Routes are versioned under
`/api/v1/client`; the temporary development identity is server-configured and is never sent
as a client route parameter.

## Run

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

OpenAPI is available at `http://127.0.0.1:8000/docs`.

## Coach onboarding

`POST /api/v1/coach/clients` accepts an authenticated coach bearer token and
invites a client through Supabase Auth. It requires these additional server-only
variables in `backend/.env`:

```dotenv
XFORM_SUPABASE_SECRET_KEY=sb_secret_...
XFORM_CLIENT_INVITE_REDIRECT_URL=https://<allowed-frontend-url>/
```

The API uses the invite flow: the client receives a one-time setup link and
chooses their password in the XForm app. Configure Supabase custom SMTP before
using real external client addresses; the default Supabase mailer is intended
only for project-team testing.

## Test

```bash
cd backend
.venv/bin/pytest -q
```

SQLite schema and seed data are created on first startup. Progress-photo metadata is stored
in SQLite; bytes stay in the configured local storage directory. Replace only the storage
adapter when moving to object storage later.

## Cloudflare R2 private photos

Supabase runtime uploads use the private Cloudflare R2 adapter. The API removes image metadata
(including EXIF), stores opaque UUID-only object keys, and proxies reads only after validating
the caller's authenticated account. No R2 object URL or S3 credential is sent to the browser.

Progress photos retain their client UUID plus a random object UUID. Profile photos are smaller:
the API accepts a 2 MB source image, removes metadata, normalizes it to WebP at no more than
1024 px, and keeps exactly one current object at
`profiles/<profile-uuid>/<profile-photo-uuid>.webp`. Supabase stores only the photo UUID,
owner UUID, opaque storage path, content type, size and timestamps; it stores no image bytes or
original filename. Set the server-only R2 variables in `.env.example`, create the bucket with
public access disabled, then apply the `202608240003` through `202608240005` migrations.

Existing Supabase Storage objects remain available only as legacy records until they are copied
to R2 and verified; this project does not delete them automatically.

## Check-in reminder job

`POST /api/v1/internal/jobs/checkin-reminders/run` is a server-to-server endpoint.
Schedule it once per day at 9:30pm for each client timezone in use; it sends only to
consented clients whose check-in is due the following day. It writes an idempotent
delivery record, so a client gets at most one WhatsApp reminder per local reminder date.

Before enabling it, apply the reminder migration, configure the server-only values shown
in `.env.example`, set an approved privacy-minimal Twilio WhatsApp utility template, and
give the scheduler the `X-XForm-Job-Token` header. The endpoint requires the Supabase
server secret and must not be exposed through the frontend or ngrok.
