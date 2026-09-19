# Cloudflare deployment

## Free temporary client demo

Cloudflare Containers requires Workers Paid. For a free short-term demo, use
`compose.demo.yaml`: Docker runs on your computer and a Cloudflare Quick Tunnel
provides the public HTTPS address. Keep the computer awake, connected, and Docker
running. Quick Tunnels have no uptime guarantee and their URL changes when the
tunnel process restarts. Existing Supabase and R2 usage still counts toward their
respective service quotas.

```sh
backend/.venv/bin/python deploy/sync_env.py --check
pnpm build
docker compose -f compose.demo.yaml up -d --build
docker compose -f compose.demo.yaml logs tunnel
```

Copy the `https://...trycloudflare.com` URL from the tunnel logs. Set that exact
origin for the backend without restarting the tunnel:

```sh
XFORM_DEMO_ORIGIN=https://<assigned-name>.trycloudflare.com docker compose -f compose.demo.yaml up -d --no-deps app
```

Allow the same origin with a trailing `/` in Supabase Auth redirect URLs before
testing invitation or password recovery emails. Existing password login does not
need a redirect allowlist change. Never share administrative credentials with
the client. The container blocks internal reminder-job routes on this public
demo path. Stop the demo when testing finishes:

```sh
docker compose -f compose.demo.yaml down
```

This app uses Cloudflare Containers behind a Worker. The Docker image serves the
built React frontend and FastAPI on port 8080. Existing Supabase Auth/Postgres and
the existing private R2 bucket remain the persistent services. Container disk is
ephemeral; production startup rejects missing Supabase or R2 configuration.

The target account is `4a269f17a7c54e86f05aa8b207d1d6a5`. Wrangler pins the
Worker name, container binding, migration and one basic instance. No database or
bucket creation is required. The internal reminder-job route is blocked at the
public Worker; scheduling reminders is a separate deployment concern.

## Environment ownership

- `.env.local`: existing `VITE_SUPABASE_URL` and public
  `VITE_SUPABASE_PUBLISHABLE_KEY`, embedded by Vite at build time.
- `backend/.env`: existing Supabase server credentials and R2 settings, uploaded
  as Worker secrets and passed to the container at startup.
- `wrangler.jsonc`: nonsecret infrastructure and `XFORM_ENVIRONMENT=production`.
- `deploy/sync_env.py`: verifies frontend/backend consistency and the R2 account;
  overrides local CORS and invitation URLs with the public app origin. Secret
  values travel through stdin, never command arguments or committed files.

Docker uses an allowlisted build context. Environment files, database files,
photos, Git history and local credentials are excluded. The frontend bundle
contains only the public settings that the existing Vite application consumes.

## Build and deploy

Use a running Docker engine and an authenticated Wrangler session with access to
Containers in the target account. Install dependencies with `pnpm install`.

```sh
backend/.venv/bin/python deploy/sync_env.py --check
pnpm build
docker build -t xform-coaching-os:local .
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler types
pnpm exec wrangler deploy --dry-run
```

Determine the account's Workers subdomain in the Cloudflare dashboard. Replace
`<subdomain>` below with that value (or use the configured custom domain):

```sh
backend/.venv/bin/python deploy/sync_env.py --origin https://xform-coaching-os.<subdomain>.workers.dev
pnpm exec wrangler deploy
pnpm exec wrangler containers list
```

Ensure Supabase Auth allows that HTTPS origin with `/` as a redirect URL for
invitation and password-recovery flows. Do not remove existing development URLs.
After deployment, verify `/healthz`, login, authenticated API access, and private
photo uploads. Initial container provisioning can take several minutes.

After changing backend credentials, rerun `sync_env.py` and deploy to restart
containers with the updated settings. After changing public frontend settings,
rebuild the frontend and redeploy the image.

## Local container smoke test

```sh
docker run --rm -p 127.0.0.1:8080:8080 --env-file backend/.env -e XFORM_ENVIRONMENT=production xform-coaching-os:local
curl --fail http://127.0.0.1:8080/healthz
```

The Cloudflare plugin available during initial setup provided skills but no
callable Cloudflare MCP tools. Wrangler is the deployment path until an
authenticated Cloudflare MCP connection is available.
