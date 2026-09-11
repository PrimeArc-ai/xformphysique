# Real email password recovery

Status as of 11 September 2026: frontend recovery is connected to Supabase Auth. The approved local Site URL and exact redirect entry have been saved in the live project. One live reset-email request for the user-approved client address was accepted by the current Supabase sender. Inbox receipt and password-change acceptance are still pending user verification. Custom SMTP remains disabled.

## What actually changes in the database

1. The app calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
2. Supabase generates a recovery link and sends it through the project's SMTP provider. Requesting a link does **not** change the password.
3. The user opens the valid link and enters and confirms a new password.
4. The app calls `supabase.auth.updateUser({ password })` using that authenticated recovery session. Supabase stores the replacement password hash in `auth.users.encrypted_password`.
5. The app signs out and returns to sign-in. The account UUID, email, role, client profile and coach assignments are unchanged.

Do not add passwords or recovery tokens to `public.profiles`, another application table, logs or analytics. No application-schema migration is required for this reset flow. The SMTP credential belongs in Supabase's server-side configuration, never a `VITE_*` variable or the React bundle.

References: [Supabase password storage](https://supabase.com/docs/guides/auth/password-security), [email recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [authenticated password updates](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Sender setup

Resend is the recommended starting provider if there is no existing SMTP account. It requires an account, an API key and a verified sending domain. Its free plan currently lists a 100-email daily limit. Verify the current plan before selecting it; do not purchase an upgrade for this setup.

- Sign in to the chosen provider yourself and complete any account verification.
- Choose a domain you control. A dedicated authentication subdomain can keep these messages separate from marketing and existing mailbox configuration.
- Add only the DNS records the provider supplies for that sending domain. Preserve existing MX/SPF records; do not replace the domain's receiving-mail setup.
- Verify the domain, then choose a sender such as `no-reply@<verified-sending-domain>` and display name **XForm Physique**.
- Generate a sending-only credential scoped to the verified domain where supported. Enter it directly into Supabase's SMTP password field; do not paste it into chat or commit it.
- Disable email link/open tracking for authentication messages. Do not rewrite the secure recovery link through marketing tools.

For Resend, configure Supabase → Authentication → Emails → SMTP Settings:

- Enable custom SMTP.
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the provider API key, entered privately.
- Sender email: the approved address on the verified domain.
- Sender name: `XForm Physique`

Save and inspect provider delivery logs for authentication/sender errors. SMTP acceptance is not proof of inbox delivery. This project-level setting also affects other Supabase Auth emails, including invitations.

References: [Resend's Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp), [current pricing](https://resend.com/pricing), [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

## Return links to the correct app

The previous Site URL was `http://localhost:3000`, and the allowlist contained only an older ngrok URL. The app requests a redirect to its own origin plus `/`.

Local configuration saved and visibly verified after user approval:

- Site URL: `http://127.0.0.1:5173/`
- Added exact redirect URL: `http://127.0.0.1:5173/`
- Preserved the existing ngrok entry. No broad wildcard redirects were added.

The separate `http://localhost:5173/` alias was not added. Use the approved `127.0.0.1` address for this test.

Open local reset links on the same computer running XForm. A phone cannot use this computer's `localhost`. For a shared demo, approve the exact public HTTPS app URL instead and keep that deployment running.

Keep the reset email's action pointed at Supabase's `{{ .ConfirmationURL }}`. A plain link to the app or `{{ .SiteURL }}` does not verify a recovery token. Do not switch to a custom token-hash template without implementing its verification route.

Reference: [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Safe live acceptance

Use an explicitly approved existing account with a working mailbox. The user should enter and submit their new password privately.

1. Note the account UUID and assigned role; do not retrieve or display its password hash.
2. In the relevant portal, choose **Forgot password?**, enter the account email and select **Send reset link**.
3. Confirm the request was accepted, inspect the provider's delivery event, and have the user confirm inbox/spam receipt. Never claim delivery solely from the app's generic confirmation.
4. Open the latest link on this computer. It should show **Set a new password**, not a dashboard or port 3000.
5. Enter and confirm a new password. A successful response must come from Supabase Auth, not a mock or privileged email-only setter.
6. Confirm the app returns to sign-in. In a fresh session, the user checks that the old password fails and the new password succeeds.
7. Confirm the same UUID and role remain and the correct portal opens. This fresh authentication is the durable-password-change check; no plaintext password needs to be inspected in the database.
8. Check an already-used/expired link reports a recoverable error. Wait for the resend cooldown rather than repeatedly requesting links.
9. Repeat on explicitly approved Coach and Admin accounts to claim all three roles passed **live** acceptance.

The live UI reset request has been accepted, but delivery, the password update and subsequent fresh sign-in are not yet verified. Supabase's generic confirmation does not prove inbox delivery. Latest unrelated progress migrations are outside this SMTP task and must not be applied implicitly.

## Local regression proof

The reset form now permits correcting an email after a request and resending after a 60-second UI cooldown. The provider remains responsible for server-side rate limits. An incomplete recovery callback reports how to request a fresh link, and the cancel action is disabled while a password save is in flight.

Run `pnpm exec playwright test e2e/password-recovery.spec.js` for isolated browser checks and, from `backend`, `.venv/bin/python -m pytest tests/test_direct_password_set.py -q` for rejection of the retired email-only setter. Browser checks use simulated Auth responses and do not prove SMTP delivery. The running port-8000 backend currently does not advertise `/api/v1/auth/set-password`; it was not restarted for this task.
