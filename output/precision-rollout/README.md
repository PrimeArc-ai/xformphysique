# Precision — Volt rollout proof

Screenshots of the implemented React app, using synthetic intercepted API/auth responses, at desktop and mobile sizes. These are not generated mockups and do not contain real client information.

- `login-desktop.png`, `login-mobile.png`
- `client-desktop.png`, `client-mobile.png`, `client-profile-mobile.png`
- `coach-desktop.png`, `coach-mobile.png`
- `admin-desktop.png`, `admin-mobile.png`

Validation: production build passed; 18 Playwright checks passed across 1440, 768 and 390 px. Tests cover all three portals, page navigation, selected client saves, auth errors, keyboard controls, invitation activation, admin privacy presentation and onboarding/offboarding confirmations. No live accounts, messages, database records or permissions were changed by these tests.

The normal local frontend and FastAPI backend were started for user review. Read-only checks returned frontend 200, OpenAPI 200 and unauthenticated auth endpoint 401 through the frontend proxy. That proves server/proxy availability, not successful live Supabase authentication.

Source of truth: `docs/design-system.md`, `src/design-tokens.css` and `src/precision.css`.

Existing coach functions labelled as local previews remain previews; theme rollout does not implement their missing backend behaviour. Vite still reports a non-blocking JavaScript chunk-size warning during the build.
