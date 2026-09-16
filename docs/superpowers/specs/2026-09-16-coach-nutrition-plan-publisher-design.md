# Coach Nutrition Plan Publisher Design

Date: 2026-09-16
Status: Draft for plan execution (review before live apply)

## Goal

Replace the coach portal's local-only nutrition preview with a persisted daily meal-plan builder. A coach can save a draft and publish an immutable plan version for an assigned client. The existing client Nutrition page consumes that published plan unchanged.

## Scope

### Included

- One open draft per client.
- One to eight ordered meals per plan.
- One to twelve ordered ingredients per meal.
- Ingredient name or optional coach-owned `food_library_items` row, quantity, and unit.
- Meal name, clock time, macros, `coach_instructions`, and `preparation`.
- Plan-level name, start date, daily macro targets, and restriction tags.
- Atomic draft save (no client-visible change) and transactional publish.
- Immutable published versions and `replaces_plan_id` lineage.
- Existing client active-plan read, adherence, and preparation-guide paths stay the execution layer.

### Excluded

- Weekday templates, 28-day meal-instance generation, calendar expansion.
- Food-library or exercise-library create/edit/disable UI (read existing food items only).
- AI recipes, substitution engines, shopping lists, barcode lookup.
- Editing historical `meal_adherence` rows when a new plan version is published.
- Admin access to client nutrition data.

## Why this is not a workout clone

`nutrition_plans` already models a dated, versioned daily meal list. Client `GET /nutrition/active-plan` already selects a published plan by date. Workout needed weekday templates plus generated `workout_sessions`. Nutrition does not. Publish writes plan/meal/ingredient snapshots only.

## Data model (additive)

Existing tables stay: `nutrition_plans`, `nutrition_plan_restrictions`, `meals`, `meal_ingredients`, `food_library_items`.

Add:

- `nutrition_plans.publish_key uuid` nullable, unique `(client_id, publish_key)` where not null.
- Partial unique index: one `status = 'draft'` row per `client_id`.
- `nutrition_plans.version` becomes nullable. Published versions remain positive and unique per client. Drafts use null so saving a draft never consumes a published version number.

Do not add weekday columns or a meal-occurrence table.

## Authorization

- Only an active coach with an active assignment may draft or publish.
- Optional `food_library_item_id` values must belong to `auth.uid()` and be `is_active`.
- Client reads published plans through existing RLS; no new client write RPCs.
- New `SECURITY DEFINER` functions set `search_path = ''`, validate `auth.uid()` and assignment, revoke `PUBLIC` and `anon`, grant `authenticated` only.
- Direct authenticated DML on published plan/meal/ingredient rows is denied. Drafts remain writable. RPCs still archive and insert published snapshots.

## Draft

`save_nutrition_plan_draft(p_client_id uuid, p_snapshot jsonb) -> jsonb`

Replaces the client's open draft transactionally. Generates no adherence rows. Leaving the builder and reopening restores the draft.

## Publish

`publish_nutrition_plan(p_client_id uuid, p_publish_key uuid, p_snapshot jsonb) -> jsonb`

Within one transaction:

1. Lock the client row.
2. If `publish_key` already exists for this client, require an active assigned coach, then return the original published snapshot (idempotent).
3. Validate snapshot bounds and library ownership.
4. Archive the currently published plan: `status = 'archived'`, `active_to = greatest(previous.active_from, new_start - 1)`.
5. Insert a new published plan with next version, `replaces_plan_id`, `published_at`, `active_from`, `active_to` null (open-ended daily plan until replaced).
6. Insert meals, ingredients, and restrictions.
7. Archive the open draft.
8. Write `nutrition_plan_published` audit metadata: version, start date, replaced plan id, meal count. No ingredient lists in audit.
9. Return `{plan, meal_count}`.

Any failure rolls back. Republish does not mutate old `meal_adherence` rows. New meal ids mean today's client view starts with pending adherence on the new version.

## Backend API

Under `/api/v1/coach/clients/{client_id}`:

- `GET /nutrition-plan` — active published plan, open draft, coach-owned active food library.
- `PUT /nutrition-plan/draft` — save snapshot.
- `POST /nutrition-plan/publish` — `{ publish_key, plan }`.

Caller JWT only. Pydantic forbids extra fields, trims strings, requires contiguous positions.

## Coach UI

Replace `CoachNutrition` preview with a controlled builder: plan fields, add/remove meals (1–8), add/remove/reorder ingredients (1–12), library select plus editable snapshot name, Save draft, Publish with confirmation (name, start date, meal count). Load failure shows retry, not a blank writable form. Ignore in-flight responses after client change.

## Live acceptance

Create `QA Daily Fuel` for Navaneet, start `2026-09-16`, three meals (breakfast/lunch/dinner) with real portions. Save draft, reload, restore. Publish. Client Nutrition page shows the three meals. Log Followed on breakfast. Republish dinner name. Client still sees breakfast Followed for that date only if adherence is keyed to old meal id — record actual behavior: new version shows pending on new meal ids; that is accepted.

## Rollback

Revert API/UI writers. Keep additive columns and published plans. Do not delete adherence history.
