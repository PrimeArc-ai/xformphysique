# Admin portal

## Local access

Frontend: http://127.0.0.1:5173/ · FastAPI: http://127.0.0.1:8000/docs

Choose **Admin**, **Coach** or **Client** on the login screen. Selection expresses intent only. Supabase verifies the password; FastAPI reads the account's stored role and rejects a mismatched portal. Reloading an existing session restores its actual workspace. Coach activity is checked from the database, not from a potentially stale JWT role claim.

## Admin capabilities and privacy boundaries

- List/search/filter all coaches: professional name, business email, title, joined date, active/offboarded status and active client count.
- Onboard a coach using name, email and title. A strong initial password is generated server-side and returned only on creation, with `Cache-Control: private, no-store`. The dialog shows it until closed and supports explicit copying. It is not retained by the frontend. It remains valid until changed; it is not an expiring one-time password. Coach email sending is **not** part of this flow; share credentials privately.
- Inspect a coach's client assignments: **client code, assigned date and end date/status only**. Codes are pseudonyms, not anonymous public data. No client name, email, phone, internal identity UUID, goals, body measurements, health information, notes, photos or R2 paths are included.
- Offboard with confirmation: atomically mark the coach inactive, end active assignments and write an operational audit event. Repeated offboarding is safe and does not duplicate the event. Client accounts, health records, photos and assignment history are retained. Reassignment/reactivation are operator tasks, not implemented in this dashboard.
- Admins cannot use the coach/client APIs, read client PII through direct Supabase requests, change client guidance, or view clients' protected photos. There is no admin UI for creating additional admins or promoting an existing person.
- Active coaches keep access only to their currently assigned clients. Offboarded coaches lose that access even using a JWT issued before offboarding; the Auth service may still issue a token, but workspace/API/RLS authorization denies coaching operations. Data already viewed or downloaded before offboarding cannot be recalled.
- Clients retain access to their own records after their coach is offboarded.

The service-role key is used only server-side for staff Auth creation. Normal admin reads/offboarding use the admin's JWT and authorization-checked database functions. Client summaries are allowlisted both in SQL and FastAPI response models. R2 stays private; no storage settings were loosened.

## API additions

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/auth/me?portal=admin` | Stored role/workspace; 403 on mismatched portal or inactive coach |
| GET | `/api/v1/admin/coaches` | Coach roster and active client counts |
| POST | `/api/v1/admin/coaches` | `{full_name,email,professional_title}` → new coach ID/email and initial password; `email_sent:false` |
| GET | `/api/v1/admin/coaches/{coach_id}/clients` | Allowlisted client codes and assignment dates |
| POST | `/api/v1/admin/coaches/{coach_id}/offboard` | Inactive status and number of ended assignments |

All admin routes require a verified admin session. Request schemas forbid extra onboarding fields (including `role`). Duplicate emails are rejected, not promoted or overwritten. A network failure during creation can leave a successfully created account without the response reaching the browser: check the roster before retrying; password recovery needs operator assistance. An audit-write failure after successful Auth creation is explicitly reported without discarding the generated credentials.

## Migrations and bootstrap

Apply in order after the existing migrations:

1. `supabase/migrations/202609060001_admin_portal.sql`
2. `supabase/migrations/202609060002_staff_auth_creation.sql`
3. `supabase/migrations/202609060003_staff_role_variable.sql`

All are transactional and repeatable. The first removes the old blanket admin privileges from client RLS and adds sanitized management RPCs. The second handles GoTrue applying app metadata after inserting an Auth user, within the same creation transaction; the third fixes a variable collision with PostgreSQL's CURRENT_ROLE keyword found during live validation. Only empty defaults from that uncommitted transaction may be replaced with a staff workspace; existing client/coach identities must never be promoted through this mechanism. User-editable metadata is never a source of authority.

To bootstrap a **new** administrator as an operator, from `backend`:

```bash
PYTHONPATH=. .venv/bin/python scripts/bootstrap_admin.py --email YOUR_ADMIN_EMAIL --name 'Your Name' --output data/admin-login.json
```

Uses the existing server-side environment settings. Does not reset passwords or repurpose existing accounts. Generated credentials are stored in a mode-0600 file under gitignored `backend/data`; keep this file private. Do not commit credentials or put service keys in frontend environment variables.

### Rollback and preservation

For an application rollback, deploy the previous client/coach application and stop mounting the admin router; keep the tightened RLS policies and staff provisioning migrations. They are backward-compatible with the existing client/coach APIs. Do **not** restore the previous blanket admin bypass or downgrade staff to clients. Schema objects, role records, audits and offboard history remain for a forward fix. An offboarded coach's ended assignments are intentionally not automatically reactivated during a deployment rollback.

## Verification

`backend/tests/test_admin_portal.py` tests role rejection, constrained output, input validation, portal matching, inactive coaches, credential handling and audit partial failures. Existing coach/photo tests cover assigned-client access. `e2e/admin-portal.spec.js` uses mocked network responses to exercise login selection, privacy-limited views, onboarding, offboarding confirmation and mobile layout without mutating live data. `e2e/admin-live.spec.js` is separately opt-in and creates clearly marked synthetic QA accounts.

Security design references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function privileges](https://supabase.com/docs/guides/database/functions), [server-side Auth creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

### Live verification — 6 September 2026

All three migrations were applied to project `cdfzrbblffpctigvjnyl`. The admin account is `navaneet.admin@xform.test`; its credentials are in `backend/data/admin-login-20260906.json` (0600, gitignored).

The opt-in live Playwright journey passed: real admin UI login → create QA coach → actual Coach portal login → create/assign synthetic client → save 81.7 kg body entry → coach reads it → admin sees only XP-0010 and assignment dates → offboard via UI. Existing coach JWTs were denied afterwards, direct database reads returned no client rows, self-reactivation returned 403, and the client's 81.7 kg record remained readable by that client. Repeated offboarding ended zero additional assignments. An attempted signup role in user-editable metadata was ignored.

Direct Supabase reads as admin returned no client profiles, body/check-in/photo records, coaching context/private notes, targets, plans, raw assignments or notification deliveries. The client JWT could not execute the admin roster RPC. Two clearly labeled QA coaches (including an empty account left by an earlier test failure) are offboarded; one synthetic QA client remains for preservation/audit review. Existing coaches and clients were not offboarded or modified.

Run mocked UI tests with `npx playwright test e2e/admin-portal.spec.js --workers=1`. Live tests require explicit approval and `E2E_RUN_ADMIN_LIVE=1 npx playwright test e2e/admin-live.spec.js --workers=1`; they deliberately retain QA accounts and must not be used as an unattended recurring test against production.
