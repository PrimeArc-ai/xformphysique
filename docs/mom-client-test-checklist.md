# MoM client review checklist

Demo: https://xform-client-demo.onrender.com/

Use separate browser profiles/private windows for each role. Refresh before testing.
Use a dedicated test client for edits, password reset, enrollment and offboarding.

## Coach

- Open **Enroll client**. Name, email, goal, timezone, dietary preferences, restrictions, private note and Amount paid appear. No target weight, enabled measurements, or check-in weekday.
- Enter Amount paid (for example 1250.50), create a test client, then reopen its setup/review. Save a different amount and reload; it persists. Zero is valid, blank means unrecorded, negative values are rejected. Transactions happen outside the app; this is one editable number per client.
- Open Body Tracker/review. Date and weight appear; no waist column or body targets.
- Review a submitted check-in and its photos; save feedback. The client sees that feedback on the corresponding check-in.
- Due date displays as a date, with no named weekday. Check the rolling rules below.
- Confirm other coaches' clients are inaccessible. Private coach notes remain hidden from client.
- Nutrition plans, workout weekdays, exercise logs and libraries should still work.

## Client

- Newly enrolled account: set password using the invite, complete the existing foundation questionnaire, save a draft, return, then submit. Existing clients remain accessible without forced re-enrollment.
- Body Tracker: record date + weight, reload, verify entry and chart. No waist input or history column; dashboard no longer shows waist or body-target progress.
- Check-ins: photos first, then measurement date/weight, then questionnaire; final submit below all fields. Save photos, fill ratings and weight, submit, reload and verify.
- Photos save immediately. If questionnaire submission fails after weight saves, the message explains the partial save and answers stay available to retry. If saving succeeds but refreshing fails, the message says saved and asks you to reload.
- Confirm coach feedback appears in check-in history. Photo gallery still groups historical images by calendar week; feedback belongs to its check-in.
- Profile has no target-weight or weekday controls.
- Confirm another client's records are inaccessible. Admin/coach portal selection must not grant those roles.

## Admin

- Team snapshot shows total coaches and total clients across the platform, including unassigned clients. Active assignments are separate.
- **Enroll coach**: enter phone and basic details. Reopen coach details; phone and login email match. Existing coaches without phone show “Not provided.”
- Generated password appears once on enrollment/reset. Closing and reopening must not reveal the stored password. No email-delivery claim unless email was actually sent.
- Reset only a dedicated test coach; verify the new credential works and old credential fails.
- Offboard only a dedicated test coach; their access is blocked. Client totals remain unchanged.
- Client assignments show minimal identifiers only, not client health, photos, diet, or private coaching notes.

## Rolling check-in rules

- First due date: enrollment date + 7 days, in client's timezone. First submission may happen early.
- After submission: original submission date + 7 days. Example: submit 19 September, next due 26 September.
- Editing before next due updates the same check-in; original submission timestamp and next due stay fixed.
- On/after due date, submitting starts a new cycle from actual submission date. Late due dates remain overdue until submitted.
- Historical records keep original IDs and dates. Historical submitted timestamps cannot be reconstructed if old app edits already changed them.

## Scope notes

- Existing foundation questionnaire retains its separately specified baseline body questions. Recurring tracking and coach setup are weight-only.
- Payments are an amount field only: no gateway, currency, invoices, transaction history, or automatic totals.
- Existing Supabase database/Auth and R2 photo storage remain in use. Render hosts the demo; no PC needs to stay on.
