# XForm Physique — enhancement requirements audit

Review date: 2026-09-08  
Repository baseline: `fa86452`  
Source: [XformPhysique Website Enhancement Specification.pdf](</home/navaneet/Downloads/XformPhysique Website Enhancement Specification.pdf>) — all 46 pages, numbered sections 1–66.

## Executive assessment

The app has a reusable, database-backed coaching foundation: authentication, client invitation, body entries, basic check-ins, private photos, assigned-plan consumption, limited workout logging and scoped coach review. It does not yet implement the complete enhanced coaching product described in this document. Several coach planning screens remain previews, and most of the proposed AI, reporting, supplementation, notification and historical analysis workflows are absent.

A page, table column or API route is not counted as a finished journey. “Implemented” below means the stated subset is present in the reviewed code; live deployment, provider delivery and access policies require separate acceptance checks.

- **25 partial sections:** some relevant implementation exists, with specific remaining work.
- **37 missing sections:** the requested capability is absent.
- **1 permission decision:** the document's full-access Admin conflicts with the earlier privacy-minimal Admin requirement.
- **3 preservation/integration guardrails:** cross-cutting acceptance requirements, not independent screens.

No numbered section is certified fully complete against every clause. This does **not** mean nothing is built: the working baseline is listed below. Sections overlap and differ greatly in size, so these counts are not a percentage-complete estimate.

## Important decision before prioritization

**Admin access must be resolved explicitly.** Section 42 grants Admin full access. The implemented Admin deliberately sees coaches plus client codes and assignment dates, not client PII, health records or photos, following your earlier requirement. This is a requirement conflict—not a reason to weaken access automatically.

Other specifications need choices, not assumptions: the seven-day schedule anchor; body-fat method and metric thresholds; legacy 1–5 versus new 1–10 ratings; package definitions; private PDF/AI handling; and archive/deletion retention.

## 1. Implemented features requested by the document

These are implemented subsets, not a claim that every associated section is complete.

### 1. Authentication and portal entry

Supabase email/password sign-in, session restoration, invitation password setup, sign-out and server-validated Client/Coach/Admin portal selection. The responsive Precision-Volt login uses a full-screen desktop split and stacked mobile layout. Password reset is not implemented.

Source coverage: §8, §17, §40, §41, §42, §44.  
Evidence: [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23).

### 2. Coach-led client onboarding

An active coach can invite a client and persist the client profile, coach assignment, goal, timezone, check-in weekday, measurement preferences, optional weight target and private onboarding note. Invitation request is implemented; actual inbox delivery is not established by the response flag.

Source coverage: §8, §41.  
Evidence: [ONBOARD: backend/app/services/supabase_coach.py:26](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:26).

### 3. Body entries and client progress

Client weight and optional waist save by date, load from the API and appear in history. Client dashboard shows recorded weight trend, change and target progress when starting/target data exist. Assigned coaches can review those raw measurements.

Source coverage: §7, §40, §41, §43, §59, §63.  
Evidence: [BODY: src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17) · [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### 4. Basic weekly check-ins

Energy and sleep on a 1-5 scale, sentiment, observations and concerns persist in weekly records. Coach review reads recent historical check-ins. This is not yet the expanded questionnaire, complete client history browser or rolling schedule.

Source coverage: §11, §14, §50, §55, §56.  
Evidence: [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127).

### 5. Private photos and basic comparison

Front/side/back photos persist in private R2 storage with DB metadata and authenticated retrieval. Client has a dated gallery and basic same-view comparison. The assigned coach has a real protected photo gallery.

Source coverage: §11, §13, §40, §41, §42.  
Evidence: [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264) · [R2: backend/app/services/r2_photo_storage.py:18](/home/navaneet/repo/xform/backend/app/services/r2_photo_storage.py:18).

### 6. Client-side nutrition consumption

The API reads a published assigned plan with meals, times, ingredient quantities and macros. Client can record daily meal adherence. UI omits ingredient quantities and the recipe helper is only a deterministic preparation template. Coach plan creation/publishing is not connected.

Source coverage: §1, §2, §9, §40.  
Evidence: [NUTRITION: src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111) · [PLAN_API: backend/app/services/supabase_client.py:173](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:173).

### 7. Workout persistence foundation

Assigned workouts can be read. API accepts raw per-exercise/per-set reps and load and calculates session volume. Dashboard aggregates real logged volume. Current client form only writes set 1 of the first exercise.

Source coverage: §3, §4, §40, §43.  
Evidence: [WORKOUT: src/ClientPages.jsx:162](/home/navaneet/repo/xform/src/ClientPages.jsx:162) · [WORKOUT_API: backend/app/services/supabase_client.py:205](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:205).

### 8. Scoped coaching guidance

Assigned coach can save client-visible guidance, training considerations and a safety notice. They appear in that client's Health Summary. Private onboarding notes are kept separate. Guidance saving writes a limited audit event.

Source coverage: §6, §14, §40, §42.  
Evidence: [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### 9. Privacy-limited admin operations

Admin can list/onboard/offboard coaches and see only client codes and assignment dates. Offboarding disables coach access and ends assignments while retaining client records. This is working additional scope, but differs from the new document's full-access Admin.

Source coverage: §42.  
Evidence: [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18).

### 10. Common UI and safeguards

Consistent design tokens, responsive navigation, keyboard focus, loading/error/empty states, status notices and destructive-action confirmation dialogs exist. API input validation, request IDs, role checks and assignment-scoped access are implemented for current routes.

Source coverage: §42, §44, §47.  
Evidence: [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23) · [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4).

## 2. Missing and incomplete implementation

### Main gaps at a glance

- **Finish core planning:** coach nutrition/workout create, edit, publish and assign are not connected; add immutable plan history, field-level changes and restore.
- **Complete workout logging:** every set of every exercise, exercise history and strength/volume charts. The current UI saves only the first set of the first exercise.
- **Complete the weekly workflow:** five poses, pose references, photo-to-week linkage, expanded ratings, per-week feedback, historical comparison, deletion and audit.
- **Add missing modules:** supplementation, body-fat calculation/history, client progress PDF/report history, client archive/restore and password recovery.
- **Add grounded AI:** three meal recipe options and the entire private questionnaire PDF → versioned analysis → insights workflow. The current recipe helper is a template, not AI.
- **Connect platform events:** comprehensive audit, plan-change notifications, in-app reminders/read history, timezone-correct schedules, missed-check-in counts and meaningful graph/attention states.
- **Replace preview metrics and screens:** synthetic coach dashboard values, local-only planning/settings/import controls and placeholder Health/Audit pages cannot be treated as production features.

### Complete section-by-section coverage

The section numbers below match the source PDF. Each entry identifies what exists and what remains. Evidence links point to current source code; schema evidence alone does not establish applied production migrations.

**Status definitions:** A visible page, database column, mocked test or API endpoint alone is not a completed feature. Partial means a reusable implemented subset or schema foundation exists, but the complete requested user journey does not. Missing means the requested capability is absent, even if related generic infrastructure exists. Decision marks a conflict with an earlier explicit requirement. Guardrail marks a cross-cutting acceptance requirement, not a standalone feature. These overlapping sections must not be treated as equal-sized tasks or a percentage-complete calculation.

### §1. Nutrition Plan - Complete Change Tracking

**Status:** Partial · **Source:** PDF pages 1-2.

**Current implementation:** Nutrition plans have version, replaces_plan_id, author and timestamp columns; the client can read an active published plan. Coach version UI is a preview.

**Missing / remaining work:** Implement coach plan create/edit/publish; immutable historical plan/meal/item snapshots; field-level old/new values with actor, role, client, meal/item and exact timestamp; Latest Changes; history, comparison and authorized restoration. A version integer does not enforce historical immutability.

**Evidence:** [PLAN_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:220](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:220) · [PLAN_API: backend/app/services/supabase_client.py:173](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:173) · [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188).

### §2. AI Recipe Options For Every Meal

**Status:** Partial · **Source:** PDF pages 2-3.

**Current implementation:** One saved guide is returned by a fixed ingredient-name string template. No AI provider or three-option workflow is present.

**Missing / remaining work:** Exactly three recipe cards per meal with name, optional image, ingredients and short preparation text; client/coach selection; a detailed selected recipe with exact quantities, steps, cooking instructions, serving size, nutrition and coach instructions. Generation must use portions, timing, preferences/restrictions and plan context and reject incompatible foods.

**Evidence:** [RECIPE: backend/app/services/supabase_client.py:197](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:197) · [NUTRITION: src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111).

### §3. Workout Sets, Reps & Weight Tracking

**Status:** Partial · **Source:** PDF pages 3-4.

**Current implementation:** API/DB persist numbered sets, reps and load; session volume sums reps multiplied by load. UI saves only set 1 of the first exercise, even when a different exercise's Log sets button is clicked.

**Missing / remaining work:** Editable per-exercise rows for every individual set; exercise selection; set volume and exercise totals; display/reload saved sets; correct completion semantics. For the PDF example, show 200, 250 and 240 kg and total 690 kg without losing raw rows.

**Evidence:** [WORKOUT: src/ClientPages.jsx:162](/home/navaneet/repo/xform/src/ClientPages.jsx:162) · [WORKOUT_API: backend/app/services/supabase_client.py:205](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:205) · [WORKOUT_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:368](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:368).

### §4. Strength & Volume Progress Tracker

**Status:** Partial · **Source:** PDF page 4.

**Current implementation:** Client dashboard derives aggregate recent training volume from actual set logs. There is no exercise-history selector or progression service.

**Missing / remaining work:** Per-exercise load/reps/volume history, best set, training frequency, weekly load/volume/rep charts and increasing/stable/decreasing trends for both roles. Use the same recorded set data, not preview figures.

**Evidence:** [WORKOUT_API: backend/app/services/supabase_client.py:205](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:205) · [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11).

### §5. Workout Import

**Status:** Missing · **Source:** PDF pages 4-5.

**Current implementation:** The Settings import control is a client-CSV preview notice, not a workout importer.

**Missing / remaining work:** Google Sheets and Excel .xlsx ingestion; upload, preview, map, validate and import; mappings for exercise, sets, reps, weight, rest, tempo, notes and category; correction of missing/invalid mappings and warnings before commit.

**Evidence:** [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §6. Complete Platform Audit Trail

**Status:** Partial · **Source:** PDF pages 5-6.

**Current implementation:** audit_events exists; onboarding and coaching guidance produce limited events. Admin coach operations use a separate admin_coach_events table. The coach Audit Log page is a placeholder.

**Missing / remaining work:** Centralized authorized history across nutrition, workouts, profiles, supplements, measurements, body-fat calculations, check-ins, plans, accounts, archive/delete, questionnaire uploads and analyses. Include old/new values, date/time, actor/role, client, module and record. Current body/check-in/plan writes are not a complete field-diff audit; guidance audit is a separate request from its update.

**Evidence:** [AUDIT: supabase/migrations/202608200001_initial_coaching_os.sql:441](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:441) · [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18) · [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188).

### §7. Automatic Body-Fat Calculator

**Status:** Missing · **Source:** PDF pages 6-7.

**Current implementation:** Schema can hold a body_fat_pct and hip measurement; coach table can display those values. Normal client API/form only accepts weight and waist. No calculation engine exists.

**Missing / remaining work:** Collect gender, height, weight and method-required measurements; calculate estimated body fat; display method; retain immutable historical inputs, method/version, result and date/time; add body-fat progress. Agree the calculation method before implementing it.

**Evidence:** [BODY: src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17) · [BODY_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:47](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:47).

### §8. Coach-Controlled Client Accounts

**Status:** Partial · **Source:** PDF page 7.

**Current implementation:** Coach invitation/provisioning and invitation activation work in code. UI has no public signup or self-deletion; current routes restrict client/coach roles and assignments.

**Missing / remaining work:** Package assignment, persisted coach nutrition/workout assignment, client access management and password reset. Admin cannot currently onboard clients under the privacy-limited model. Confirm Supabase public signup is disabled server-side; absence of a signup screen alone is insufficient. Verify real invitation delivery through configured SMTP.

**Evidence:** [ONBOARD: backend/app/services/supabase_coach.py:26](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:26) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18) · [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188).

### §9. Nutrition UX - Avoid Macro-Centric Design

**Status:** Partial · **Source:** PDF pages 7-8.

**Current implementation:** Meals and times appear, but a calorie target leads the page and a large macro panel remains. Ingredient names render without the quantities/unit already returned by the API.

**Missing / remaining work:** Make meal, food, portion, timing, recipe and instructions the primary hierarchy; display actual assigned quantities and coach instructions; keep nutrition/macros secondary. Remove fixed decorative macro-bar percentages as progress signals.

**Evidence:** [NUTRITION: src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111) · [PLAN_API: backend/app/services/supabase_client.py:173](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:173).

### §10. Supplementation Tab

**Status:** Missing · **Source:** PDF page 8.

**Current implementation:** No supplement feature, route or schema in the reviewed implementation.

**Missing / remaining work:** Per-client supplementation section with name, buying link, dosage, timing and usage/instructions; coach add/edit/delete/reorder/update/activate/deactivate; client display and audit every modification.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12) · [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33).

### §11. Weekly Check-In

**Status:** Partial · **Source:** PDF page 9.

**Current implementation:** Weekly answers persist separately by client and Monday-based period. Progress photos persist separately and have capture date/creation timestamps; only front/side/back are supported.

**Missing / remaining work:** Link photos to a specific check-in/week; add Front Double Bicep and Back Double Bicep; per-pose upload/replace/delete, visible upload timestamps and historical week access. Replacements must not overwrite past weeks.

**Evidence:** [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127) · [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66) · [PHOTO_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:185](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:185).

### §12. Gender-Specific Check-In Reference Images

**Status:** Missing · **Source:** PDF pages 9-10.

**Current implementation:** No pose reference images or profile-gender capture in the current upload journey. The login photograph is branding, not an assessment reference.

**Missing / remaining work:** Profile-driven male/female references for all five poses, visible during upload; professional neutral instructions for pose, camera position/distance, lighting, framing and body positioning. Define behavior if gender is not provided.

**Evidence:** [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66) · [BODY_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:47](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:47) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §13. Weekly Photo Comparison

**Status:** Partial · **Source:** PDF pages 10-11.

**Current implementation:** Client can select a dated image and compare it with another image of the same view. Comparison captions only say Earlier/Latest; the second image is not chosen by week and can be mislabelled after selecting an older image. Coach has a gallery, not the requested comparison tool.

**Missing / remaining work:** Current vs previous or selected historical week; all five categories; accurate week/date labels; historical week selector/navigation; zoom, full-screen viewing and coach notes; authorized coach comparison.

**Evidence:** [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### §14. Weekly Check-In Information

**Status:** Partial · **Source:** PDF page 11.

**Current implementation:** Energy, sleep, sentiment, observations and concern are saved. Coach reads recent check-ins and can save general client guidance, not feedback attached to a particular week.

**Missing / remaining work:** Hunger, stress, digestion, training performance and adherence fields; explicit challenges/comments; per-check-in coach observations, adjustments, instructions and next-week priorities; complete historical browsing for both roles. Retain current questions when extending.

**Evidence:** [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127) · [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150).

### §15. Professional Progress Report PDF

**Status:** Missing · **Source:** PDF pages 11-12.

**Current implementation:** Development documentation exports exist, but no client progress-report export or report-history product feature exists.

**Missing / remaining work:** Branded PDF including client/program/start/current week, start/current/change in weight, body-fat and measurement history, five-pose comparisons, starting/current loads, volume and strength trend, nutrition/check-in information and coach summary; secure retrieval and historical reports.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §16. Client Archive / Deletion

**Status:** Missing · **Source:** PDF pages 12-13.

**Current implementation:** Admin can offboard coaches, not clients. A client status column exists, but the sign-in workspace check only checks inactive coaches; no client archive/recovery journey is wired.

**Missing / remaining work:** Archive client, deny login and existing-session access, retain all historical records, admin-authorized restore. Permanent deletion is conditional, not mandatory: if offered, require authorization, clear irreversible warning, confirmation and explicit confirmation plus audit. Do not add client self-delete.

**Evidence:** [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18) · [BODY_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:47](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:47) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §17. Login Page Redesign

**Status:** Partial · **Source:** PDF pages 13-14.

**Current implementation:** Premium branded desktop split-screen, responsive mobile stack, Welcome back, email/password and enlarged Sign In are implemented, preserving Supabase auth. The approved Precision-Volt headline differs from the PDF's suggested copy, which is not a mandatory exact string.

**Missing / remaining work:** Forgot Password link and working recovery flow. Production speed/reliability still needs deployment-level acceptance; visual polish alone does not prove that.

**Evidence:** [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4).

### §18. Password Reset Via Email

**Status:** Missing · **Source:** PDF page 14.

**Current implementation:** Invitation password setup exists but is not password recovery. No Forgot Password request UI, reset-link handler or recovery confirmation flow is present.

**Missing / remaining work:** Email, secure reset link, new password, confirmation and login; time-limited single-use invalidated links; expired/used-link handling, delivery verification and no plaintext password persistence.

**Evidence:** [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §19. Client Prerequisite Questionnaire Upload

**Status:** Missing · **Source:** PDF pages 14-15.

**Current implementation:** Image uploads exist, but no client-scoped prerequisite PDF upload feature exists.

**Missing / remaining work:** Coach manually uploads the completed external questionnaire PDF to the client's profile; store privately, associate with that client, and offer analysis/insights. No Google Docs automation is required. Do not treat image-upload validation as PDF support.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [R2: backend/app/services/r2_photo_storage.py:18](/home/navaneet/repo/xform/backend/app/services/r2_photo_storage.py:18).

### §20. Deep AI Questionnaire Analysis

**Status:** Missing · **Source:** PDF pages 15-16.

**Current implementation:** No questionnaire parser or AI analysis pipeline exists.

**Missing / remaining work:** Read the complete PDF including questions, prose, multiple-choice, yes/no, numbers and tables; connect responses, patterns, themes, contradictions and lifestyle factors; prioritize and produce a structured profile grounded in source evidence, not answer repetition or fabricated facts.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33).

### §21. Client Prerequisite Insights Dashboard

**Status:** Missing · **Source:** PDF pages 16-17.

**Current implementation:** No insights tab or processing-state UI exists.

**Missing / remaining work:** Upload/replace/view PDF, upload date/time and uploader, Analyze Questionnaire; Uploaded/Analyzing/Complete/Failed-Try Again states; display generated insights below. Scope access to the client and authorized roles.

**Evidence:** [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §22. AI Client Summary

**Status:** Missing · **Source:** PDF page 17.

**Current implementation:** Existing profile and Health Summary are not an AI questionnaire summary.

**Missing / remaining work:** A concise meaningful overview of client, primary goals, fitness experience, nutrition/lifestyle/training background, patterns, major challenges and important information from the entire questionnaire.

**Evidence:** [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §23. Client Profile Analysis

**Status:** Missing · **Source:** PDF pages 17-18.

**Current implementation:** Manual profile fields do not analyze an uploaded questionnaire.

**Missing / remaining work:** Structured questionnaire-derived name, age, gender, occupation, location if given, lifestyle, daily routine and other relevant profile information; organize rather than repeat answers.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §24. Goals & Expectations Analysis

**Status:** Missing · **Source:** PDF page 18.

**Current implementation:** A primary goal can be stored manually; no AI interpretation exists.

**Missing / remaining work:** Primary/secondary goals, outcome, timeline, motivation, expectations, definition of success and reasons for transformation; distinguish explicit client goals from supported inferred patterns.

**Evidence:** [ONBOARD: backend/app/services/supabase_coach.py:26](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:26) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §25. Fitness & Training Analysis

**Status:** Missing · **Source:** PDF pages 18-19.

**Current implementation:** No questionnaire training analysis exists.

**Missing / remaining work:** Past/current training, frequency, coaches/programs/approaches, likes/dislikes, consistency, successes/failures, gym/equipment access, schedule and explicitly reported limitations; identify supported patterns.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §26. Nutrition & Eating Behaviour Analysis

**Status:** Missing · **Source:** PDF page 19.

**Current implementation:** Dietary preference text and assigned meals are not questionnaire analysis.

**Missing / remaining work:** Eating pattern/timing, likes/dislikes/preferences, previous diets/attempts, habits, cooking/preparation, eating out, cravings if stated, snacks/weekends, consistency and challenges; connect related answers without inventing behavior.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §27. Lifestyle Analysis

**Status:** Missing · **Source:** PDF pages 19-20.

**Current implementation:** No lifestyle analysis feature exists.

**Missing / remaining work:** Work/daily routine, activity, sleep schedule/quality when given, stress, travel, family/social responsibilities, time availability and constraints; explain grounded relationships with meals and training.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §28. Health Information Analysis

**Status:** Missing · **Source:** PDF page 20.

**Current implementation:** Manual allergies/injuries and coach safety notes exist; no questionnaire-derived health report exists.

**Missing / remaining work:** Health Information Reported by Client: conditions, symptoms, history, medications, injuries, surgeries, allergies, tests/reports and other stated information. Separate reported facts from AI observations; never invent health information.

**Evidence:** [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §29. Training & Physical Considerations

**Status:** Missing · **Source:** PDF pages 20-21.

**Current implementation:** A coach can manually enter training considerations; that is not the requested analyzed section.

**Missing / remaining work:** Derive current training, experience, preferences, gym/equipment, schedule, limitations, explicit injuries/restrictions, difficult movements and previous problems from the questionnaire, in a dedicated Training Considerations section.

**Evidence:** [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §30. Client Preferences

**Status:** Missing · **Source:** PDF page 21.

**Current implementation:** Only a general dietary-preferences text field is captured, with no AI extraction.

**Missing / remaining work:** Separate nutrition preferences (favorite/disliked foods, cooking, meals, diet), training preferences (style, exercises, dislikes, days/time) and lifestyle preferences (meal/schedule/communication and other stated preferences).

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §31. Behaviour & Adherence Analysis

**Status:** Missing · **Source:** PDF pages 21-22.

**Current implementation:** Meal-adherence logging exists but does not implement questionnaire-based behavior insights.

**Missing / remaining work:** Analyze consistency, motivation, previous adherence, obstacles, time management, food environment, training, interruptions, reasons for stopping and difficult situations; explain patterns rather than label a person as poor adherence.

**Evidence:** [NUTRITION: src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §32. Motivation & Mindset Analysis

**Status:** Missing · **Source:** PDF page 22.

**Current implementation:** No Motivation Profile feature exists.

**Missing / remaining work:** When enough source information exists, analyze transformation reasons, primary/secondary motivation, frustrations, expectations, concerns, confidence, barriers and desired outcome.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §33. Key Patterns & Connections

**Status:** Missing · **Source:** PDF pages 22-23.

**Current implementation:** No cross-answer relationship analysis exists.

**Missing / remaining work:** Key Patterns Identified connecting, for example, work/meal timing/food choices, sleep/energy/training, travel/routine/adherence, and previous diets/results/expectations; source-ground every relationship.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §34. Key Client Insights

**Status:** Missing · **Source:** PDF page 23.

**Current implementation:** No AI-derived prioritized insight list exists.

**Missing / remaining work:** Display the most important findings from the complete questionnaire with support from actual responses; do not present generic advice as a client-specific insight.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §35. Challenges Identified

**Status:** Missing · **Source:** PDF pages 23-24.

**Current implementation:** Free-text concern exists, not a questionnaire Challenges Mentioned feature.

**Missing / remaining work:** Identify explicit time, meal preparation, travel, training, sleep, work, eating-out, motivation and adherence challenges; connect supported responses and do not invent challenges.

**Evidence:** [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §36. Important Information

**Status:** Missing · **Source:** PDF page 24.

**Current implementation:** No questionnaire prioritization section exists.

**Missing / remaining work:** Concise, high-value Important Information prioritizing relevant source findings without repeating the full questionnaire.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §37. Missing Information

**Status:** Missing · **Source:** PDF page 24.

**Current implementation:** No questionnaire completeness analysis exists.

**Missing / remaining work:** Identify unanswered/unavailable information and explicitly label it Not provided in questionnaire; never guess missing answers.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §38. AI Analysis Principles

**Status:** Missing · **Source:** PDF pages 24-25.

**Current implementation:** There is no questionnaire AI implementation to enforce or evaluate these principles against.

**Missing / remaining work:** Grounded comparisons, connections, contradictions, recurring themes, prioritization and organized summaries; prohibit invented facts, missing-data assumptions, fabricated responses and speculation as fact. Label inference as AI-observed pattern based on questionnaire responses; add evaluations for these rules.

**Evidence:** [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53) · [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1).

### §39. Questionnaire Version History

**Status:** Missing · **Source:** PDF pages 25-26.

**Current implementation:** No prerequisite document, version or analysis persistence exists.

**Missing / remaining work:** Preserve every original PDF and associated analysis with uploader/upload time and analysis time; view previous PDFs/analyses, switch and compare versions; audit upload, replacement and analysis without destroying prior versions.

**Evidence:** [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §40. Unified Client Dashboard

**Status:** Partial · **Source:** PDF pages 26-27.

**Current implementation:** Existing dashboard, body tracker, check-in form, progress photos, nutrition, workout, Health Summary and Profile are connected to current APIs. Weight/volume are data-backed; no-plan states are explicit.

**Missing / remaining work:** Integrate body fat/current program week/package status/next check-in, today's supplements and instructions, complete strength/workout history, five-photo weekly workflow and historical answers, recipes/plan updates, supplementation, prerequisite PDFs/AI/version history and report history. Preserve current features; navigation labels are recommendations.

**Evidence:** [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12) · [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49).

### §41. Coach Dashboard

**Status:** Partial · **Source:** PDF page 27.

**Current implementation:** Assigned roster, latest weight/date, last check-in, basic stale-weight attention and live client review exist. Some overview numbers/text remain hardcoded, including published-plan count and check-in percentage.

**Missing / remaining work:** Real active/due/completed counts, recent nutrition/workout activity, package expirations, PDF upload/analysis activity; accurate per-client weight/body-fat change, program week and plan status. Replace synthetic metrics with authorized queries.

**Evidence:** [COACH_OVERVIEW: src/CoachWorkspace.jsx:98](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:98) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264) · [COACH_ATTENTION: backend/app/services/supabase_coach.py:306](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:306).

### §42. Role-Based Permissions

**Status:** Decision · **Source:** PDF page 28.

**Current implementation:** Client-owned and active-assigned-coach API/RLS protections are implemented. Admin is intentionally restricted to coach operations and minimal client codes/dates, per the earlier user requirement.

**Decision required:** Resolve the conflict: this PDF says Admin has full access. Do not broaden access without explicit review. Add role/ownership policy coverage for new supplements, reports and prerequisite features when built; verify deployed RLS independently before release.

**Evidence:** [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4).

### §43. Database Architecture

**Status:** Partial · **Source:** PDF pages 28-29.

**Current implementation:** Supabase migrations define existing identity/assignment, plan/meal, workout/session/set, body/check-in/photo, notes/targets/settings and limited audit structures. Nutrition/training versions already have reusable columns.

**Missing / remaining work:** Extend existing structures for immutable plan changes and recipe suggestions/selection, workout imports, method-specific body-fat calculations, supplements, photo-to-week association, reports, prerequisite documents/versions/analyses and richer audit/notifications. Reuse equivalent tables rather than create the PDF's example names verbatim. Verify live schema and migration safety separately.

**Evidence:** [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [PLAN_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:220](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:220) · [WORKOUT_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:368](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:368) · [AUDIT: supabase/migrations/202608200001_initial_coaching_os.sql:441](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:441).

### §44. UI/UX Requirements

**Status:** Partial · **Source:** PDF pages 29-30.

**Current implementation:** Premium typography/tokens, responsive layouts, mobile navigation, progress indicators, restrained transitions, focus states, inline notices, confirmations, empty/error/loading states are implemented.

**Missing / remaining work:** Skeleton loading, consistently interactive accessible charts/tooltips, a polished notification experience, completion of preview-only screens and production performance/reliability acceptance. Current notices are not a persistent notification center.

**Evidence:** [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23) · [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11) · [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1).

### §45. Coach Navigation

**Status:** Partial · **Source:** PDF page 30.

**Current implementation:** Overview, Clients, Body Tracker, Nutrition, Workout, Libraries, Settings, Health and Audit Log navigation exists. Health/Audit are placeholders and several destinations are preview-only.

**Missing / remaining work:** Working Supplements, dedicated weekly check-ins, complete Progress, Client Prerequisite Insights and Reports; connect Audit Log. Preserve existing useful destinations. Exact navigation wording/order is recommended, not mandatory.

**Evidence:** [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12) · [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188).

### §46. Client Navigation

**Status:** Partial · **Source:** PDF pages 30-31.

**Current implementation:** Overview, Body Tracker, Check-ins, Progress Photos, Nutrition, Workout, Health Summary and Profile exist with responsive navigation.

**Missing / remaining work:** Supplements, Client Prerequisite Insights and Reports; unify new progress/history features while retaining working pages. Exact label/order changes are optional design choices.

**Evidence:** [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §47. Production Safety Requirements

**Status:** Guardrail · **Source:** PDF pages 31-32.

**Current implementation:** The existing React/FastAPI/Supabase/R2 design can be extended incrementally. Auth/role checks and regression tests exist. This audit makes no live changes.

**Acceptance obligations:** Before each implementation: inspect architecture/data/permissions, reuse components/schema, preserve users/data/auth/features/URLs, avoid duplicates, prepare backup/rollback and compatibility checks. Required release journeys include both logins, recovery, onboarding, nutrition/versioning/recipes, full workout logging, supplements, check-ins/photos/comparison, body fat, prerequisite PDF/AI, audit, reports, archive/restore and mobile behavior. Existing tests do not certify missing journeys.

**Evidence:** [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1).

### §48. Smart Progress Graph Status & Risk Indicators

**Status:** Missing · **Source:** PDF pages 32-33.

**Current implementation:** A weight trend summary changes color by direction; this is not a metric-specific safe/warning/danger threshold system. Schema has freshness thresholds and targets, not validated risk rules for every metric.

**Missing / remaining work:** Extend actual weight/measurement/body-fat/strength/volume graphs with default, yellow-near-threshold and red-significant-change states using configurable metric-specific logic. Preserve data, filters and calculations; do not apply one universal threshold or invent clinical safety ranges.

**Evidence:** [BODY: src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17) · [THRESHOLDS: supabase/migrations/202608200001_initial_coaching_os.sql:96](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:96) · [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11).

### §49. Missed Check-In Alert

**Status:** Missing · **Source:** PDF page 33.

**Current implementation:** needs_attention is based on missing/stale weight entries, not scheduled check-in misses.

**Missing / remaining work:** Compute consecutive misses from due dates versus submissions; blue indicator only after more than two misses (three or more); show the true count and coach follow-up links.

**Evidence:** [COACH_ATTENTION: backend/app/services/supabase_coach.py:306](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:306) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127).

### §50. Weekly Check-In Schedule

**Status:** Partial · **Source:** PDF pages 33-34.

**Current implementation:** A stored weekday, Monday-based weekly upsert and next weekday calculation exist. The UI discards API schedule data and uses generic/hardcoded due copy.

**Missing / remaining work:** One authoritative seven-day schedule, current/next/previous/missed cycles and consecutive miss count; visible dated Next Check-In on client dashboard and use by coach. Decide whether a late completion shifts the next due date or retains the scheduled anchor; the PDF's Completed/Scheduled wording leaves this ambiguous.

**Evidence:** [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127) · [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49).

### §51. Automatic Live Date & Time Based on User Time Zone

**Status:** Partial · **Source:** PDF page 34.

**Current implementation:** Client timezone is stored and the WhatsApp worker uses ZoneInfo. DB timestamps generally use timestamptz/UTC. UI dates often use a module-level UTC ISO date; backend daily logic uses server date.today().

**Missing / remaining work:** Use stored client/user timezone consistently for current date, schedules, workouts, nutrition changes, audit, photos, entries, notifications and recovery; detect/store timezone when absent; local-midnight rollover without reload. Preserve UTC instants and distinguish date-only values. Avoid reinterpreting historical timestamps.

**Evidence:** [TIME: src/hooks/useClientData.js:4](/home/navaneet/repo/xform/src/hooks/useClientData.js:4) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127) · [REMINDERS: backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90).

### §52. Notification Panel

**Status:** Missing · **Source:** PDF pages 34-35.

**Current implementation:** Transient status notices and a WhatsApp delivery outbox exist, not an in-app panel.

**Missing / remaining work:** Client/coach notification panel linked to existing users and timezones; create targeted notifications on nutrition/workout/important plan changes and link to the relevant changes/workout. Do not create another communication silo.

**Evidence:** [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12) · [REMINDERS: backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90) · [NOTIFICATION_SCHEMA: supabase/migrations/202608240002_checkin_reminder_automation.sql:1](/home/navaneet/repo/xform/supabase/migrations/202608240002_checkin_reminder_automation.sql:1).

### §53. Check-In Reminder - Existing Notification System

**Status:** Missing · **Source:** PDF page 35.

**Current implementation:** Related WhatsApp backend can send on the night before a configured weekday, with consent and deduplication. It is not an in-platform reminder and local provider/job-token settings are absent.

**Missing / remaining work:** Generate the in-app reminder one day before the authoritative seven-day scheduled date, using client timezone and linking to photos/measurements/answers. Reuse scheduling/delivery infrastructure appropriately; WhatsApp alone does not satisfy this section.

**Evidence:** [REMINDERS: backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90) · [NOTIFICATION_SCHEMA: supabase/migrations/202608240002_checkin_reminder_automation.sql:1](/home/navaneet/repo/xform/supabase/migrations/202608240002_checkin_reminder_automation.sql:1) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127).

### §54. Notification Center

**Status:** Missing · **Source:** PDF page 36.

**Current implementation:** notification_deliveries contains outbound WhatsApp transport status, not user read/unread notifications.

**Missing / remaining work:** Type/title/message, date/time, related client/plan/check-in, deep link, unread indicator, open/mark-read/mark-all-read and history. Cover plan updates, tomorrow/missed check-ins, new reports, supplement updates and other events while preserving user isolation.

**Evidence:** [NOTIFICATION_SCHEMA: supabase/migrations/202608240002_checkin_reminder_automation.sql:1](/home/navaneet/repo/xform/supabase/migrations/202608240002_checkin_reminder_automation.sql:1) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §55. Expanded Weekly Check-In Questions

**Status:** Partial · **Source:** PDF pages 36-37.

**Current implementation:** The existing questionnaire has only energy and sleep ratings (1-5), sentiment and two free-text answers.

**Missing / remaining work:** Extend that form with consistent 1-10 ratings where appropriate: energy, sleep quality, hunger, digestion, stress, recovery, strength, workout performance, motivation, adherence and overall well-being. Retain existing questions and historical scale semantics; do not silently treat old 4/5 as new 4/10.

**Evidence:** [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [CHECKIN_SCHEMA: backend/app/schemas/client.py:10](/home/navaneet/repo/xform/backend/app/schemas/client.py:10).

### §56. Store Check-In Ratings in Existing Progress History

**Status:** Partial · **Source:** PDF page 37.

**Current implementation:** Weekly records store energy/sleep, client ID, period start and submitted timestamp. The expanded metrics and scale metadata are absent.

**Missing / remaining work:** Persist every question/metric/rating with client, check-in, week and date, retaining all earlier weeks; connect to the same history. Preserve legacy 1-5 data explicitly through a compatible schema/form version or equivalent migration design.

**Evidence:** [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127) · [CHECKIN_SCHEMA: backend/app/schemas/client.py:10](/home/navaneet/repo/xform/backend/app/schemas/client.py:10).

### §57. Add Check-In Rating Graphs to Existing Progress Tracker

**Status:** Missing · **Source:** PDF pages 37-38.

**Current implementation:** Current progress chart covers weight; no rating graph or metric selector exists.

**Missing / remaining work:** Reuse the progress area and graph style for all eleven rating metrics; line/dots, dates, week numbers, exact rating and hover/tap tooltip. Use stored check-in data, not a separate analytics data store.

**Evidence:** [BODY: src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17) · [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11) · [NAV: src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12).

### §58. Add Weekly Check-In Comparison Table

**Status:** Missing · **Source:** PDF pages 38-39.

**Current implementation:** Body-entry table and coach check-in cards do not provide a metric-by-week comparison.

**Missing / remaining work:** Matrix of metrics against historical weeks with ratings and trend, available to client/coach and derived from the same check-in history as the graphs. Trend interpretation must account for metric direction, such as stress versus strength.

**Evidence:** [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### §59. Graph Data Points, Dates & Week Labels

**Status:** Partial · **Source:** PDF page 39.

**Current implementation:** Client dashboard weight chart has recorded dots and SVG title values; volume bars have title labels. Body Tracker uses an unlabeled polyline with endpoint values/dates. No shared per-point week labeling or reliable tap tooltip exists.

**Missing / remaining work:** Every applicable graph must identify metric/value/date/week; dots or meaningful points for recorded values; accessible hover and tap tooltips, exact labels and consistent behavior across client/coach graphs. Do not call native SVG title a complete mobile tooltip implementation.

**Evidence:** [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11) · [BODY: src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17) · [COACH_PREVIEW: src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188).

### §60. Photo Deletion - Client & Coach

**Status:** Missing · **Source:** PDF pages 39-40.

**Current implementation:** Photo APIs allow upload/list/read; no client/coach Delete Photo journey is exposed.

**Missing / remaining work:** Owner client and actively assigned coach can delete a specific weekly photo after confirmation, without affecting another user's photo; coordinate DB reference and private object lifecycle. Existing cleanup after failed uploads is not user-facing deletion.

**Evidence:** [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66) · [PHOTO_ROUTES: backend/app/api/v1/client.py:83](/home/navaneet/repo/xform/backend/app/api/v1/client.py:83) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### §61. Photo Deletion Audit Trail

**Status:** Missing · **Source:** PDF pages 40-41.

**Current implementation:** No photo-deletion event workflow exists.

**Missing / remaining work:** Deletion audit must record client, check-in/week, category, actor/role, date/time and action; preserve internal deletion history if using soft deletion while hiding it in normal views; integrate with the authorized audit system.

**Evidence:** [AUDIT: supabase/migrations/202608200001_initial_coaching_os.sql:441](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:441) · [PHOTO_ROUTES: backend/app/api/v1/client.py:83](/home/navaneet/repo/xform/backend/app/api/v1/client.py:83).

### §62. Integrated Coach Attention System

**Status:** Partial · **Source:** PDF page 41.

**Current implementation:** Real roster flags no weight data or a weight entry older than three days; alert click can open the assigned client. Overview explanatory strings still use preview rules.

**Missing / remaining work:** Combine three-plus missed check-ins, significant weight/measurement/body-fat changes, near-threshold/danger states and new check-ins needing review; blue/yellow/red indicators with actual reasons and deep links. Reuse settings and authoritative data; track reviewed state.

**Evidence:** [COACH_ATTENTION: backend/app/services/supabase_coach.py:306](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:306) · [COACH_OVERVIEW: src/CoachWorkspace.jsx:98](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:98) · [THRESHOLDS: supabase/migrations/202608200001_initial_coaching_os.sql:96](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:96).

### §63. Integrated Progress Intelligence

**Status:** Partial · **Source:** PDF pages 41-42.

**Current implementation:** Body entries, set logs, current check-ins, photos and client guidance share client identity and some existing dashboard flows.

**Missing / remaining work:** Connect weight/measurement/body-fat graphs to labels/status; sets to exercise history; expanded ratings to graphs/table; nutrition/workout changes to history/audit/notifications; schedules to reminders/misses; weekly photos to comparison/delete/audit. No independent replacement data systems.

**Evidence:** [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49) · [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [ROUTES: backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53).

### §64. Do Not Duplicate Existing Systems

**Status:** Guardrail · **Source:** PDF page 43.

**Current implementation:** Reusable client IDs, tables and APIs exist, but SQLite demo and Supabase implementations coexist; multiple chart components and separate admin/general audit tables already exist for earlier reasons.

**Acceptance obligations:** Inspect and extend existing trackers/check-ins/clients/audits/charts/photos/notifications/workouts/nutrition before adding structures. Decide a shared audit contract/view while preserving the existing admin privacy boundary. Do not remove legacy/demo systems or data during this audit.

**Evidence:** [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [AUDIT: supabase/migrations/202608200001_initial_coaching_os.sql:441](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:441) · [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4).

### §65. Final Integration

**Status:** Partial · **Source:** PDF pages 43-44.

**Current implementation:** Basic authenticated client-to-coach data sharing works in the implemented domains. The requested event chains are not complete.

**Missing / remaining work:** Accept full journeys: plan edit to version/audit/notification; scheduled check-in to previous-day reminder; completion to history/ratings/graphs/table; missed schedule to count/blue alert; metric change to labels/status; photo upload to week/comparison/authorized delete/audit; all dates in relevant timezone.

**Evidence:** [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49) · [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [REMINDERS: backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90) · [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1).

### §66. Preserve Everything Already Implemented

**Status:** Guardrail · **Source:** PDF pages 44-46.

**Current implementation:** Authentication, identity/assignments, DB-backed baseline tracking, private photos, client/coach/admin portals and current design are the real preservation baseline. The PDF's final list repeats required outcomes; it is not evidence they are already implemented.

**Acceptance obligations:** Use the entire 1-65 matrix plus current working features as the release checklist: nutrition/history/latest changes/three recipes; sets/volume/strength/imports; audits/body-fat/history/accounts/invites/reset/supplements; weekly answers/five photos/references/comparison/reports/archive; prerequisite PDF/AI/all insight categories/versioning; dashboards/permissions/DB/auth; graph labels/statuses/timezones/schedules/notifications/ratings/tables/missed counts/photo deletion/intelligence. Inspect, extend, integrate, test and deploy incrementally, never rebuild/reset production.

**Evidence:** [TESTS: e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1) · [SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33) · [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4).

## 3. Implemented extras not explicitly requested in this document

“Extra” means outside the new PDF's explicit feature description—not unauthorized or unwanted. Many were requested in earlier conversations. Features that overlap generic requirements are identified as additional scope or implementation choices rather than unrelated products.

### 1. Coach onboarding/offboarding admin console

**State:** Implemented.

The new PDF defines Admin access but does not explicitly request a coach lifecycle-management console, coach credential generation, suspension or assignment release.

Evidence: [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18).

### 2. Privacy-limited admin client summaries

**State:** Implemented; conflicts with section 42.

Admin sees client codes and assignment dates, not client PII/health/photos. This follows an earlier explicit requirement and must not be removed implicitly.

Evidence: [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18).

### 3. Three-way login portal selector

**State:** Implemented.

Client/Coach/Admin selection with server-side role matching is additional UX; the PDF only requires authentication and role permissions.

Evidence: [AUTH: src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4) · [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23).

### 4. Client and coach profile avatars

**State:** Implemented.

Private owner-only avatar upload/replacement, independent of weekly physique photos; one compact current image per profile.

Evidence: [AVATAR: backend/app/services/profile_photo.py:17](/home/navaneet/repo/xform/backend/app/services/profile_photo.py:17) · [R2: backend/app/services/r2_photo_storage.py:18](/home/navaneet/repo/xform/backend/app/services/r2_photo_storage.py:18).

### 5. WhatsApp/Twilio reminder channel

**State:** Backend implemented; inactive locally.

Consent/opt-out, exact-minute dispatch, per-client local-date deduplication and transport records exist. Provider credentials and job token are absent locally. The new PDF requires in-app notifications, not WhatsApp or SMS.

Evidence: [REMINDERS: backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90) · [NOTIFICATION_SCHEMA: supabase/migrations/202608240002_checkin_reminder_automation.sql:1](/home/navaneet/repo/xform/supabase/migrations/202608240002_checkin_reminder_automation.sql:1).

### 6. Coach-private onboarding notes

**State:** Implemented.

A private onboarding note can be stored/read separately from client-visible guidance. The PDF requests coach notes but does not explicitly specify a private-note-only lane.

Evidence: [ONBOARD: backend/app/services/supabase_coach.py:26](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:26) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### 7. Standalone Health Summary and client-editable target/preferences

**State:** Implemented.

Current Health Summary shows manual client/coach context, not AI questionnaire analysis. Clients can edit target weight, check-in weekday, timezone, preferences and allergies/injuries; the new document does not explicitly assign these editing permissions to clients.

Evidence: [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [PROFILE: backend/app/schemas/client.py:67](/home/navaneet/repo/xform/backend/app/schemas/client.py:67).

### 8. Daily meal adherence controls

**State:** Implemented subset.

Followed/Partly/Missed is logged by meal/date. The PDF asks about adherence and nutrition/check-in context, but does not specifically prescribe this per-meal interaction.

Evidence: [NUTRITION: src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111) · [PLAN_API: backend/app/services/supabase_client.py:173](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:173).

### 9. Specific Precision-Volt design pack

**State:** Implemented design choice.

Chakra Petch/IBM Plex, carbon/graphite/Volt palette and chamfered controls are approved choices beyond the PDF's generic premium/responsive requirement, not a separate missing feature.

Evidence: [LOGIN: src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23).

### Do not confuse engineering choices or previews with extra features

- React, FastAPI, Supabase Auth/Postgres, private Cloudflare R2, UUID object references, image resizing/metadata removal and self-hosted fonts are implementation choices, not extra customer-facing requirements.
- SQLite demo fallback, OpenAPI documentation, tests and development documentation are engineering/support infrastructure. They are not substitutes for a client report-export feature.
- Food/exercise library editor, formula/settings editor, client CSV import/export, placeholder Health/Audit pages and local coach plan builder must not be counted as completed extra features.

## 4. Existing behavior requiring attention

These are observed code-level risks in the current baseline, independent of adding whole new modules.

### 1. Misleading progress and plan status

Some coach dashboard counts and plan states are hardcoded. They should not be used as production evidence of compliance. The recipe helper's remaining-request value is also constant.

Evidence: [COACH_OVERVIEW: src/CoachWorkspace.jsx:98](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:98) · [RECIPE: backend/app/services/supabase_client.py:197](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:197).

### 2. Check-in history versus current status

Client UI labels any existing check-in as Submitted and hardcodes Sunday fallback; it discards schedule returned by API. Older records can therefore look current. Historical rows are stored but client has no complete history browser; coach review is limited to 24 check-ins.

Evidence: [CHECKIN: src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17) · [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49) · [COACH_REVIEW: src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264).

### 3. Incorrect day boundary

Module-level UTC today does not roll at local midnight; server date.today() can disagree with client timezone. This affects body/photo dates, plans and check-ins.

Evidence: [TIME: src/hooks/useClientData.js:4](/home/navaneet/repo/xform/src/hooks/useClientData.js:4) · [CHECKIN_API: backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127).

### 4. Incomplete workout interaction

Every Log sets button toggles the same state; submission always uses firstExercise and set_number 1. API support for arrays is not full set-tracking UX.

Evidence: [WORKOUT: src/ClientPages.jsx:162](/home/navaneet/repo/xform/src/ClientPages.jsx:162).

### 5. Target progress direction

Dashboard uses absolute movement from starting weight, so movement away from a target can still increase the percentage. Verify goal-direction semantics before intelligent status work.

Evidence: [DASHBOARD: src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11).

### 6. Historical comparison labels

The comparison picks any other same-view photo, then labels it Earlier and the selection Latest; choosing an older photo can reverse that chronology.

Evidence: [PHOTOS: src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66).

### 7. Version and audit guarantees

Version fields do not make records immutable. Current guidance update and audit are separate writes, and admin audit can fail after onboarding; a complete change log needs stronger consistency guarantees.

Evidence: [PLAN_SCHEMA: supabase/migrations/202608200001_initial_coaching_os.sql:220](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:220) · [GUIDANCE: backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150) · [ADMIN: supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18).

### 8. Initial load couples all photos to the dashboard

Client data loader downloads every returned photo before completing the initial workspace load. This deserves lazy-loading/pagination work for the PDF's fast mobile experience, especially as historical weekly images grow.

Evidence: [CLIENT_DATA: src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49).

## 5. Decisions for your review

1. Admin scope: retain PII-minimal operations or adopt the PDF's full-access Admin? This affects client creation, recovery, reports, questionnaire data and RLS.

2. Seven-day schedule anchor: scheduled date or actual completion date? Define late/early submissions, timezone changes and which week owns a photo.

3. Legacy ratings: preserve 1-5 answers and identify questionnaire/scale versions before adding 1-10; never silently reinterpret history.

4. Body-fat method and status thresholds: specify approved calculation methods and metric-specific non-diagnostic thresholds; do not invent a universal safe/danger cutoff.

5. Packages: the PDF asks assignment/status/expiry but does not define packages, pricing, duration, renewals, payments or entitlements. Do not infer a billing system.

6. Email and deployment: confirm approved SMTP sender, redirect URLs and the authoritative production host before accepting invitation/recovery delivery. This audit does not reconfigure them.

7. Questionnaire/privacy: approve AI provider, data handling and access policy for health-related PDFs; decide supported scanned-PDF/OCR behavior, analysis retries and version comparison expectations.

8. Archive/photo retention: choose reversible archive/soft-delete, storage retention and admin restore behavior. Permanent deletion is optional in the PDF and requires a separate explicitly approved workflow.

## 6. Suggested grouping for prioritization — not a committed order

The following groups consolidate overlapping PDF sections. They are not estimates or an approved delivery plan. In particular, prerequisite sections 19–39 belong to one connected document/analysis workflow; notifications and audit should be shared foundations.

### 1. Identity, recovery and policy decisions

Sections: §8, §16, §17, §18, §42, §47.

Resolve Admin scope, verify invite delivery and signup policy, add recovery and client archive/restore without changing existing identities.

### 2. Finish coach planning and workout capture

Sections: §1, §2, §3, §4, §5, §9.

Persist coach nutrition/workout authoring and assignments; complete every-exercise/set logging; then history/recipes/imports. Version/audit foundations are dependencies, not follow-up decoration.

### 3. Weekly check-in, timezone and photo lifecycle

Sections: §11, §12, §13, §14, §50, §51, §55, §56, §60, §61.

Agree schedule anchor; extend existing check-ins/ratings, five photo categories, reference images, week comparison and scoped deletion with audit.

### 4. Unified audit, notifications and coach attention

Sections: §6, §48, §49, §52, §53, §54, §57, §58, §59, §62, §63, §64, §65.

Build shared event history and in-app notifications on existing records; metric-specific charts/thresholds and actual missed-check-in rules.

### 5. Body composition, supplements and client reports

Sections: §7, §10, §15, §40, §41, §43, §44, §45, §46.

Method-based historical body composition, supplement lifecycle and client PDF/report history, integrated into existing portals.

### 6. Prerequisite documents and grounded AI insights

Sections: §19, §20, §21, §22, §23, §24, §25, §26, §27, §28, §29, §30, §31, §32, §33, §34, §35, §36, §37, §38, §39.

One private PDF/version/analysis pipeline with all specified insight categories and source-grounding, not 21 independent AI systems.

## 7. Verification performed during this audit

### Production frontend build — PASS

pnpm build completed. Vite reported a JavaScript chunk larger than 500 kB; this is a performance warning, not a build failure.

### Mocked browser regression checks — 33 passed

precision-theme.spec.js, admin-portal.spec.js and login-errors.spec.js passed, including responsive layouts from 320 to 3440 CSS pixels, portal navigation and login error handling. API/auth responses are mocked; this is not a fresh live integration test.

### Isolated backend regression checks — 33 passed; 1 configuration-dependent failure, then targeted pass

The full pytest run used a temporary SQLite DB and disabled live credentials. The coach photo test mocked object reads but still required R2 constructor configuration, so it failed with r2_not_configured. That exact test passed when rerun with dummy R2 settings and mocked HTTP/object reads. No test or application code was changed. This exposes a test-fixture dependency, not proof of a live photo-access failure. One Starlette/httpx deprecation warning was also reported.

### Source coverage and evidence integrity — 66 of 66 sections mapped

All 46 source pages were read and visually inspected. Section IDs are unique; referenced repository files exist. Findings were checked against UI, API services and migration definitions, not accepted from labels or prior completion claims.

### Live services and delivery — Not revalidated

Local configuration indicates Supabase and R2 setup; WhatsApp provider and reminder-job token are absent. No fresh live Supabase schema/RLS reconciliation, account provisioning, email delivery, R2 upload/deletion or WhatsApp send was performed.

### Scope and limitations

All 46 PDF pages, sections 1-66, and the current local React/FastAPI implementation and checked-in Supabase migrations. This is a product gap analysis, not authorization to implement the PDF. No live records, policies, accounts, storage objects or application source were changed.

- The PDF repeatedly calls sections 1-47 existing functionality. That is the desired product baseline, not proof that this repository already implements it.
- No numbered section is certified fully complete against every clause in this audit. Several usable subfeatures are implemented; their remaining gaps are listed individually.
- Database findings refer to repository migrations and API use, not a fresh live Supabase schema/policy reconciliation. Supabase and R2 are configured locally; that does not establish production availability or email delivery.
- The earlier xformphysique.in prototype was not re-audited here. This report assesses the application being developed in /home/navaneet/repo/xform.
- The existing test suite demonstrates its own current scenarios, not acceptance of the missing features in the new specification. Live account-creation tests and outbound email/WhatsApp were not run.

The source PDF and app implementation were not edited. Test artifacts used temporary local storage and mocked external services. A later release review must exercise real configured services and both positive and negative ownership/role paths before accepting security-sensitive workflows.

## 8. Evidence index

Links are source-entry points for each finding. “Not found” findings use the route/navigation/schema inventory; a generic related component is not treated as the missing feature.

- **AUTH** — [src/hooks/useAuth.js:4](/home/navaneet/repo/xform/src/hooks/useAuth.js:4): Workspace loading, sign-in, local sign-out on failure, role routing and invitation activation; also src/App.jsx:101 and backend/app/api/v1/auth.py:17.
- **LOGIN** — [src/AuthGate.jsx:23](/home/navaneet/repo/xform/src/AuthGate.jsx:23): Current Sign In form and portal selector; shared full-screen responsive styling in src/precision.css and design rules in docs/design-system.md.
- **ONBOARD** — [backend/app/services/supabase_coach.py:26](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:26): Invitation/provisioning; related configuration writes at line 190 and onboarding UI in src/CoachWorkspace.jsx:144.
- **BODY** — [src/BodyTracker.jsx:17](/home/navaneet/repo/xform/src/BodyTracker.jsx:17): Recent trend, weight/waist form and history; request schema backend/app/schemas/client.py:17 and Supabase persistence at backend/app/services/supabase_client.py:102.
- **BODY_SCHEMA** — [supabase/migrations/202608200001_initial_coaching_os.sql:47](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:47): Clients/status/profile fields; body measurements at line 151 include hip/body-fat storage, not a calculator.
- **CLIENT_DATA** — [src/hooks/useClientData.js:49](/home/navaneet/repo/xform/src/hooks/useClientData.js:49): Parallel data loading, discarded schedule, photo-byte hydration and mutation refreshes.
- **CHECKIN** — [src/ClientPages.jsx:17](/home/navaneet/repo/xform/src/ClientPages.jsx:17): Actual check-in UI, limited questions and displayed status.
- **CHECKIN_API** — [backend/app/services/supabase_client.py:127](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:127): Monday period, next weekday, weekly upsert; _week_start/_next_weekday at lines 21-27.
- **CHECKIN_SCHEMA** — [backend/app/schemas/client.py:10](/home/navaneet/repo/xform/backend/app/schemas/client.py:10): Score 1-5; database weekly_checkins at supabase/migrations/202608200001_initial_coaching_os.sql:167.
- **PHOTOS** — [src/ClientPages.jsx:66](/home/navaneet/repo/xform/src/ClientPages.jsx:66): Three views, upload, dated gallery and non-week-based comparison.
- **PHOTO_SCHEMA** — [supabase/migrations/202608200001_initial_coaching_os.sql:185](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:185): Progress-photo identity/date/storage metadata; no check-in foreign key or five-category lifecycle.
- **PHOTO_ROUTES** — [backend/app/api/v1/client.py:83](/home/navaneet/repo/xform/backend/app/api/v1/client.py:83): Photo list/upload/read; coach protected content at backend/app/api/v1/coach.py:52. No user-facing DELETE endpoint.
- **R2** — [backend/app/services/r2_photo_storage.py:18](/home/navaneet/repo/xform/backend/app/services/r2_photo_storage.py:18): Private storage, upload processing and opaque image objects; not prerequisite PDF processing.
- **AVATAR** — [backend/app/services/profile_photo.py:17](/home/navaneet/repo/xform/backend/app/services/profile_photo.py:17): Owner-only current profile photo; client routes at backend/app/api/v1/client.py:187 and coach routes at backend/app/api/v1/coach.py:109.
- **NUTRITION** — [src/ClientPages.jsx:111](/home/navaneet/repo/xform/src/ClientPages.jsx:111): Client plan UI, macro emphasis, ingredient-name-only rendering and single guide.
- **PLAN_API** — [backend/app/services/supabase_client.py:173](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:173): Published assigned-plan reads and daily meal adherence.
- **PLAN_SCHEMA** — [supabase/migrations/202608200001_initial_coaching_os.sql:220](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:220): Nutrition version/replaces_plan_id; training programs have corresponding columns at line 331. Not immutable version history.
- **RECIPE** — [backend/app/services/supabase_client.py:197](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:197): Deterministic template string, saved guide, constant remaining_requests_today.
- **WORKOUT** — [src/ClientPages.jsx:162](/home/navaneet/repo/xform/src/ClientPages.jsx:162): FirstExercise/set 1 submission and identical Log sets behavior.
- **WORKOUT_API** — [backend/app/services/supabase_client.py:205](/home/navaneet/repo/xform/backend/app/services/supabase_client.py:205): Set array upserts, total volume and workout payload; dashboard aggregation at line 57.
- **WORKOUT_SCHEMA** — [supabase/migrations/202608200001_initial_coaching_os.sql:368](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:368): Workout sessions/exercises/set logs; raw reps/load/number persisted at line 409.
- **DASHBOARD** — [src/ClientDashboard.jsx:11](/home/navaneet/repo/xform/src/ClientDashboard.jsx:11): Current client dashboard and SVG labels; backend dashboard calculations at backend/app/services/supabase_client.py:57.
- **COACH_REVIEW** — [src/CoachWorkspace.jsx:264](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:264): Persisted review loader and real photo gallery at line 333; underlying authorized service backend/app/services/supabase_coach.py:95.
- **GUIDANCE** — [backend/app/services/supabase_coach.py:150](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:150): Scoped update and audit; client Health Summary at backend/app/services/supabase_client.py:233.
- **COACH_OVERVIEW** — [src/CoachWorkspace.jsx:98](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:98): Overview uses real roster alongside hardcoded published plans/check-in percentage and preview attention text.
- **COACH_ATTENTION** — [backend/app/services/supabase_coach.py:306](/home/navaneet/repo/xform/backend/app/services/supabase_coach.py:306): No entry or more than three days old; not consecutive check-in misses.
- **COACH_PREVIEW** — [src/CoachWorkspace.jsx:188](/home/navaneet/repo/xform/src/CoachWorkspace.jsx:188): Nutrition, workout, libraries and settings use preview notices/local state; Health/Audit placeholders at line 257; route selection at line 439.
- **NAV** — [src/App.jsx:12](/home/navaneet/repo/xform/src/App.jsx:12): Client navigation; coach navigation src/CoachWorkspace.jsx:4 and page routing at line 439.
- **ROUTES** — [backend/app/api/v1/client.py:53](/home/navaneet/repo/xform/backend/app/api/v1/client.py:53): Complete current client routes; coach.py:31 and admin.py define the other product APIs. No prerequisite/supplement/report/recovery/import/notification-center product routes found.
- **SCHEMA** — [supabase/migrations/202608200001_initial_coaching_os.sql:33](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:33): Existing schema and later migrations in supabase/migrations; no new-spec supplements/prerequisites/reports/body-fat-calculation/import schema found.
- **AUDIT** — [supabase/migrations/202608200001_initial_coaching_os.sql:441](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:441): General audit schema; limited guidance/onboarding writes; admin operational audit is separate.
- **ADMIN** — [supabase/migrations/202609060001_admin_portal.sql:18](/home/navaneet/repo/xform/supabase/migrations/202609060001_admin_portal.sql:18): Admin excluded from client access; minimal client RPC at line 122, offboarding at 145, separate admin audit at 94; service backend/app/services/supabase_admin.py:22.
- **THRESHOLDS** — [supabase/migrations/202608200001_initial_coaching_os.sql:96](/home/navaneet/repo/xform/supabase/migrations/202608200001_initial_coaching_os.sql:96): Freshness preferences/targets and coach settings at line 426; no generalized metric risk engine.
- **TIME** — [src/hooks/useClientData.js:4](/home/navaneet/repo/xform/src/hooks/useClientData.js:4): Module-level UTC today; same pattern src/BodyTracker.jsx:3 and src/ClientPages.jsx:3; backend daily logic uses date.today().
- **REMINDERS** — [backend/app/services/checkin_reminders.py:90](/home/navaneet/repo/xform/backend/app/services/checkin_reminders.py:90): WhatsApp consent/outbox; timezone/exact-minute gating at 178-195; external protected job trigger backend/app/api/v1/internal.py:14.
- **NOTIFICATION_SCHEMA** — [supabase/migrations/202608240002_checkin_reminder_automation.sql:1](/home/navaneet/repo/xform/supabase/migrations/202608240002_checkin_reminder_automation.sql:1): Consent/preferences and WhatsApp delivery history; not read/unread in-app notifications.
- **PROFILE** — [backend/app/schemas/client.py:67](/home/navaneet/repo/xform/backend/app/schemas/client.py:67): Client-editable fields; persistence backend/app/services/supabase_client.py:244.
- **TESTS** — [e2e/precision-theme.spec.js:1](/home/navaneet/repo/xform/e2e/precision-theme.spec.js:1): Mocked browser journeys; e2e/login-errors.spec.js, e2e/admin-portal.spec.js and backend/tests cover existing behavior. Live test files were not executed by this audit.


Audit data: [requirements-audit-2026-09-08.json](/home/navaneet/repo/xform/docs/requirements-audit-2026-09-08.json).

