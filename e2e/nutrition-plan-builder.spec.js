import { test, expect } from '@playwright/test'
import { emptyPlan, validatePlan } from '../src/coach/nutritionPlanModel'

const rosterClient = {
  id: 'client-id',
  client_code: 'XP-0099',
  full_name: 'QA Client',
  email: 'qa-client@example.test',
  primary_goal: 'strength',
  check_in_day: 'wednesday',
  timezone: 'Asia/Kolkata',
  latest_weight_kg: 75,
  latest_entry_date: '2026-09-16',
  needs_attention: false,
  check_in_schedule: {
    current_status: 'upcoming',
    missed_count: 0,
    due_on: '2026-09-16',
    next_due_on: '2026-09-23',
    timezone: 'Asia/Kolkata',
  },
}

function persistedPlan(plan, status, version = null, clientId = 'client-id') {
  return {
    id: `${status}-plan-id`,
    client_id: clientId,
    ...structuredClone(plan),
    status,
    version,
    active_to: null,
    replaces_plan_id: null,
    meals: plan.meals.map((meal, mealIndex) => ({
      id: `${status}-meal-${mealIndex + 1}`,
      ...structuredClone(meal),
      ingredients: meal.ingredients.map((ingredient, ingredientIndex) => ({
        id: `${status}-ingredient-${mealIndex + 1}-${ingredientIndex + 1}`,
        ...structuredClone(ingredient),
      })),
    })),
  }
}

function nutritionPlanFixture() {
  const workspace = {
    active_plan: null,
    draft: null,
    food_library: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Greek yoghurt',
        category: 'dairy',
        calories_kcal: 73,
        protein_g: 10,
        carbs_g: 4,
        fat_g: 2,
      },
    ],
  }
  return {
    clients: [rosterClient],
    workspace,
    workspaces: { 'client-id': workspace },
    draftCalls: [],
    publishCalls: [],
    failedPublishesRemaining: 0,
    workspaceFailure: false,
    deferredDraft: null,
    deferredPublish: null,
    draftResponses: 0,
    publishResponses: 0,
  }
}

async function mockNutritionPlan(page, state) {
  await page.clock.setFixedTime(new Date('2026-09-16T10:00:00+05:30'))
  const user = {
    id: 'coach-id',
    email: 'coach@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: {},
    app_metadata: {},
  }

  await page.route('**/auth/v1/**', route => route.fulfill({
    json: route.request().url().includes('/token')
      ? { access_token: 'mock-coach-jwt', refresh_token: 'mock-refresh', expires_in: 3600, token_type: 'bearer', user }
      : user,
  }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const json = body => route.fulfill({ json: body })

    if (path === '/api/v1/auth/me') {
      return json({ ...user, role: 'coach', full_name: 'Aisha Kapoor', first_name: 'Aisha' })
    }
    if (path === '/api/v1/coach/profile/photo') return json({ photo: null })
    if (path === '/api/v1/coach/clients') return json({ items: state.clients })
    const planMatch = path.match(/^\/api\/v1\/coach\/clients\/([^/]+)\/nutrition-plan(?:\/(draft|publish))?$/)
    const clientId = planMatch?.[1]
    const action = planMatch?.[2]
    if (planMatch && !action && method === 'GET') {
      if (state.workspaceFailure) {
        return route.fulfill({ status: 503, json: { error: { message: 'Nutrition workspace unavailable. Retry safely.' } } })
      }
      return json(state.workspaces[clientId] ?? state.workspace)
    }
    if (action === 'draft' && method === 'PUT') {
      const plan = request.postDataJSON()
      state.draftCalls.push({ clientId, plan })
      if (state.deferredDraft) await new Promise(resolve => { state.deferredDraft.resolve = resolve })
      const persisted = persistedPlan(plan, 'draft', null, clientId)
      state.workspaces[clientId] = { ...(state.workspaces[clientId] ?? state.workspace), draft: persisted }
      if (clientId === 'client-id') state.workspace = state.workspaces[clientId]
      state.draftResponses += 1
      return json({ plan: persisted })
    }
    if (action === 'publish' && method === 'POST') {
      const payload = request.postDataJSON()
      state.publishCalls.push({ clientId, ...payload })
      if (state.failedPublishesRemaining > 0) {
        state.failedPublishesRemaining -= 1
        return route.fulfill({ status: 503, json: { error: { message: 'Publish service unavailable. Retry safely.' } } })
      }
      if (state.deferredPublish) await new Promise(resolve => { state.deferredPublish.resolve = resolve })
      const plan = persistedPlan(payload.plan, 'published', 1, clientId)
      state.workspaces[clientId] = { ...(state.workspaces[clientId] ?? state.workspace), active_plan: plan, draft: null }
      if (clientId === 'client-id') state.workspace = state.workspaces[clientId]
      state.publishResponses += 1
      return json({ plan, meal_count: payload.plan.meals.length })
    }
    return route.fulfill({ status: 501, json: { error: { message: `Unmocked ${method} ${path}` } } })
  })
  await page.goto('/')
}

async function loginCoach(page) {
  await page.getByRole('radio', { name: 'Coach', exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill('coach@example.test')
  await page.getByLabel('Password', { exact: true }).fill('MockPassword!123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

async function openBuilder(page) {
  await page.getByRole('button', { name: 'Nutrition', exact: true }).first().click()
  await expect(page.getByLabel('Plan name')).toBeVisible()
}

async function completeRequiredPlan(page, mealCount = 2, name = 'QA Daily Fuel') {
  await page.getByLabel('Plan name').fill(name)
  for (let meal = 1; meal <= mealCount; meal += 1) {
    await page.getByLabel(`Meal ${meal} ingredient 1 name`).fill(meal === 1 ? 'Greek yoghurt' : `Ingredient ${meal}`)
  }
}

test('validatePlan rejects required fields, non-positive quantity, and meal bounds', () => {
  const plan = emptyPlan('')
  plan.meals[0].name = ''
  plan.meals[0].ingredients[0].ingredient_name = ''
  plan.meals[0].ingredients[0].quantity = 0

  expect(validatePlan(plan)).toMatchObject({
    name: 'Plan name is required.',
    active_from: 'Start date is required.',
    'meals.0.name': 'Meal name is required.',
    'meals.0.ingredients.0.name': 'Ingredient name is required.',
    'meals.0.ingredients.0.quantity': 'Quantity must be greater than 0.',
  })
  expect(validatePlan({ ...plan, name: 'Valid plan', active_from: '2026-09-16', meals: [] })).toMatchObject({
    meals: 'Choose 1–8 meals.',
  })
  expect(validatePlan({
    ...plan,
    name: 'Valid plan',
    active_from: '2026-09-16',
    meals: Array.from({ length: 9 }, (_, index) => ({
      ...structuredClone(plan.meals[1]),
      position: index + 1,
    })),
  })).toMatchObject({ meals: 'Choose 1–8 meals.' })
})

test('starts with two meals and enforces the one-to-eight meal bounds', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await expect(page.getByLabel('Meal 1 name')).toBeVisible()
  await expect(page.getByLabel('Meal 2 name')).toBeVisible()
  await expect(page.getByLabel('Meal 3 name')).toHaveCount(0)

  for (let meal = 3; meal <= 8; meal += 1) {
    await page.getByRole('button', { name: 'Add meal', exact: true }).click()
    await expect(page.getByLabel(`Meal ${meal} name`)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Add meal', exact: true })).toBeDisabled()

  for (let meal = 8; meal >= 2; meal -= 1) {
    await page.getByRole('button', { name: `Remove Meal ${meal}`, exact: true }).click()
  }
  await expect(page.getByRole('button', { name: 'Remove Meal 1', exact: true })).toBeDisabled()
})

test('keeps controlled ingredients ordered and within one-to-twelve bounds', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await page.getByLabel('Meal 1 ingredient 1 name').fill('Greek yoghurt')
  await page.getByRole('button', { name: 'Add ingredient to Meal 1' }).click()
  await page.getByLabel('Meal 1 ingredient 2 name').fill('Berries')
  await page.getByRole('button', { name: 'Move Meal 1 ingredient 2 up' }).click()
  await expect(page.getByLabel('Meal 1 ingredient 1 name')).toHaveValue('Berries')
  await page.getByRole('button', { name: 'Remove Meal 1 ingredient 2' }).click()
  await expect(page.getByRole('button', { name: 'Remove Meal 1 ingredient 1' })).toBeDisabled()

  for (let ingredient = 2; ingredient <= 12; ingredient += 1) {
    await page.getByRole('button', { name: 'Add ingredient to Meal 1' }).click()
  }
  await expect(page.getByRole('button', { name: 'Add ingredient to Meal 1' })).toBeDisabled()
  await expect(page.getByLabel('Meal 1 ingredient 12 name')).toBeVisible()
})

test('shows required-field validation without sending a draft', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await page.getByLabel('Plan name').fill('')
  await page.getByLabel('Start date').fill('')
  await page.getByLabel('Meal 1 name').fill('')
  await page.getByLabel('Meal 1 ingredient 1 name').fill('')
  await page.getByLabel('Meal 1 ingredient 1 quantity').fill('0')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()

  await expect(page.getByText('Plan name is required.')).toBeVisible()
  await expect(page.getByText('Start date is required.')).toBeVisible()
  await expect(page.getByText('Meal name is required.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Meal 1 ingredient 1' }).getByText('Ingredient name is required.')).toBeVisible()
  await expect(page.getByText('Quantity must be greater than 0.')).toBeVisible()
  expect(state.draftCalls).toHaveLength(0)
})

test('saves a normalized draft snapshot and restores it after reload', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page)
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await page.getByLabel('Meal 3 ingredient 1 name').fill('Rice')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved.')).toBeVisible()
  expect(state.draftCalls[0].plan.meals.map(meal => meal.position)).toEqual([1, 2, 3])

  await page.reload()
  if (await page.getByRole('heading', { name: 'Welcome back.' }).isVisible()) await loginCoach(page)
  await openBuilder(page)
  await expect(page.getByLabel('Plan name')).toHaveValue('QA Daily Fuel')
  await expect(page.getByLabel('Meal 3 ingredient 1 name')).toHaveValue('Rice')
})

test('keeps restrictions editable while typing comma-separated tags', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  const restrictions = page.getByLabel('Restrictions')
  await restrictions.pressSequentially('shellfish-free, dairy')
  await expect(restrictions).toHaveValue('shellfish-free, dairy')
})

test('does not overwrite edits made while a draft save is in flight', async ({ page }) => {
  const state = nutritionPlanFixture()
  state.deferredDraft = {}
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page, 2, 'Before save')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect.poll(() => state.draftCalls.length).toBe(1)
  await page.getByLabel('Plan name').fill('Edited while saving')
  state.deferredDraft.resolve()

  await expect.poll(() => state.draftResponses).toBe(1)
  await expect(page.getByLabel('Plan name')).toHaveValue('Edited while saving')
  await expect(page.getByText('Draft saved.')).toBeVisible()
})

test('confirms the meal count and refreshes the published plan', async ({ page }) => {
  const state = nutritionPlanFixture()
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page)
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await page.getByLabel('Meal 3 ingredient 1 name').fill('Rice')
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm nutrition plan' })
  await expect(dialog).toContainText('3 meals')
  await dialog.getByRole('button', { name: 'Confirm publish', exact: true }).click()

  await expect(page.getByText('Plan published')).toBeVisible()
  await expect(page.getByText('QA Daily Fuel', { exact: true })).toBeVisible()
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible()
  expect(state.publishCalls).toHaveLength(1)
})

test('reuses a publish key after transport failure and clears it after edits', async ({ page }) => {
  const state = nutritionPlanFixture()
  state.failedPublishesRemaining = 2
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page)
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm nutrition plan' })
  await dialog.getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect(page.getByText('Publish service unavailable. Retry safely.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect(page.getByText('Publish service unavailable. Retry safely.')).toBeVisible()
  expect(state.publishCalls[0].publish_key).toBe(state.publishCalls[1].publish_key)

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByLabel('Plan name').fill('Changed daily fuel')
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect(page.getByText('Plan published')).toBeVisible()
  expect(state.publishCalls[2].publish_key).not.toBe(state.publishCalls[1].publish_key)
  expect(state.publishCalls[2].plan.name).toBe('Changed daily fuel')
})

test('keeps a failed publish key when saving a draft before retry', async ({ page }) => {
  const state = nutritionPlanFixture()
  state.failedPublishesRemaining = 1
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page)
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm nutrition plan' })
  await dialog.getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect(page.getByText('Publish service unavailable. Retry safely.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect(page.getByText('Plan published')).toBeVisible()

  expect(state.publishCalls).toHaveLength(2)
  expect(state.publishCalls[1].publish_key).toBe(state.publishCalls[0].publish_key)
})

test('ignores stale draft and publish responses after the selected client changes', async ({ page }) => {
  const state = nutritionPlanFixture()
  state.clients.push({ ...rosterClient, id: 'client-b', client_code: 'XP-0100', full_name: 'Client B' })
  state.workspaces['client-b'] = { ...structuredClone(state.workspace), active_plan: null, draft: null }
  state.deferredDraft = {}
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await completeRequiredPlan(page, 2, 'Client A draft')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect.poll(() => state.draftCalls.length).toBe(1)
  await page.getByRole('combobox', { name: 'CLIENT', exact: true }).selectOption('client-b')
  await expect(page.getByRole('region', { name: 'Nutrition plan editor for Client B' })).toBeVisible()
  await page.getByLabel('Plan name').fill('Client B untouched')
  state.deferredDraft.resolve()
  await expect.poll(() => state.draftResponses).toBe(1)
  await expect(page.getByLabel('Plan name')).toHaveValue('Client B untouched')
  await expect(page.getByText('Draft saved.')).toHaveCount(0)

  await page.getByRole('combobox', { name: 'CLIENT', exact: true }).selectOption('client-id')
  await expect(page.getByRole('region', { name: 'Nutrition plan editor for QA Client' })).toBeVisible()
  await completeRequiredPlan(page, 2, 'Client A publish')
  state.deferredPublish = {}
  await page.getByRole('button', { name: 'Publish nutrition plan', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm publish', exact: true }).click()
  await expect.poll(() => state.publishCalls.length).toBe(1)
  await page.getByRole('combobox', { name: 'CLIENT', exact: true }).selectOption('client-b', { force: true })
  await expect(page.getByRole('region', { name: 'Nutrition plan editor for Client B' })).toBeVisible()
  await page.getByLabel('Plan name').fill('Client B still untouched')
  state.deferredPublish.resolve()
  await expect.poll(() => state.publishResponses).toBe(1)
  await expect(page.getByLabel('Plan name')).toHaveValue('Client B still untouched')
  await expect(page.getByText('Plan published')).toHaveCount(0)
})

test('blocks editing after a load failure until retry succeeds', async ({ page }) => {
  const state = nutritionPlanFixture()
  state.workspaceFailure = true
  await mockNutritionPlan(page, state)
  await loginCoach(page)
  await page.getByRole('button', { name: 'Nutrition', exact: true }).first().click()

  await expect(page.getByText('Nutrition workspace unavailable. Retry safely.')).toBeVisible()
  await expect(page.getByLabel('Plan name')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry loading nutrition plan' })).toBeVisible()
  state.workspaceFailure = false
  await page.getByRole('button', { name: 'Retry loading nutrition plan' }).click()
  await expect(page.getByLabel('Plan name')).toBeVisible()
})
