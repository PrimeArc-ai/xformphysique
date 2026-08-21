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
