# Free client demo on Render

Use `render.yaml` to create a **Free** Docker web service. Unlike the temporary
Cloudflare Tunnel, this service runs independently of your computer. It sleeps
after 15 idle minutes and can take about a minute to wake on the next visit.

The Render Dockerfile builds the frontend from source, so no local `dist/`
upload is required. Only the public `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are build arguments. All backend credentials
belong in Render environment variables, never Git or image layers.

1. Sign in to Render and connect the repository containing these deployment files.
2. Create a Blueprint using `render.yaml`, keeping the plan set to Free.
3. Populate the prompted environment variables from `.env.local` and
   `backend/.env`. Use the existing Supabase project and private R2 bucket.
4. Set `XFORM_CORS_ORIGINS` to the assigned HTTPS service origin and
   `XFORM_CLIENT_INVITE_REDIRECT_URL` to that origin plus `/`.
5. Add the same redirect URL to Supabase Auth's redirect allowlist. Preserve
   existing URLs. This is needed for invitations and password recovery.
6. Deploy and verify `/healthz`, login, authenticated client routes and photos.

The blueprint uses the existing `XFORM_SUPABASE_SERVICE_ROLE_KEY`. If migrating
to a newer Supabase secret key later, use `XFORM_SUPABASE_SECRET_KEY` instead.
No Render database or persistent disk is required. Existing Supabase and R2
quotas still apply. Do not select a paid service or add paid resources for this
demo. Remove or suspend the demo service when client testing is finished.

Deployment is not complete until the Render account is connected, environment
variables are set, and the public service passes verification.
