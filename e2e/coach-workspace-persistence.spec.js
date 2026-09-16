import { test, expect } from '@playwright/test'

const ATTENTION_REASON = 'No body entry in 9 days'

const rosterClient = {
  id: 'client-id',
  client_code: 'XP-0099',
  full_name: 'QA Client',
  email: 'qa-client@example.test',
  primary_goal: 'fat_loss',
  check_in_day: 'wednesday',
  timezone: 'Asia/Kolkata',
  latest_weight_kg: 80.4,
  latest_entry_date: '2026-09-15',
  latest_checkin_period_start: null,
  latest_checkin_submitted_at: null,
  needs_attention: true,
  attention_reasons: [ATTENTION_REASON],
  check_in_schedule: {
    current_status: 'overdue',
    missed_count: 3,
    consecutive_missed: 3,
    due_on: '2026-09-09',
    next_due_on: '2026-09-16',
    timezone: 'Asia/Kolkata',
  },
}

function workspaceFixture() {
  return {
    clients: [rosterClient],
    review: {
      client: rosterClient,
      body_entries: [
        {
          id: 'entry-1',
          entry_date: '2026-09-01',
          weight_kg: 82.1,
          waist_cm: 90,
          hip_cm: null,
          body_fat_pct: null,
          created_at: '2026-09-01T10:00:00Z',
        },
        {
          id: 'entry-2',
          entry_date: '2026-09-15',
          weight_kg: 80.4,
          waist_cm: 88.5,
          hip_cm: null,
          body_fat_pct: null,
          created_at: '2026-09-15T10:00:00Z',
        },
      ],
      checkins: [],
      photo_count: 0,
      progress_photos: [],
      private_notes: [],
      coaching_context: {
        client_id: 'client-id',
        client_visible_coach_note: 'Stay consistent.',
        training_considerations: ['Monitor knee comfort'],
        safety_notice: 'Ask a clinician for medical decisions.',
        updated_at: '2026-09-16T04:30:00Z',
      },
      setup: {
        primary_goal: 'fat_loss',
        check_in_day: 'wednesday',
        timezone: 'Asia/Kolkata',
        dietary_preferences: 'Vegetarian weekdays',
        allergies_injuries: 'Right knee sensitive after long walks',
        enabled_measurements: ['weight_kg', 'waist_cm'],
        target_weight_kg: 75,
        target_waist_cm: 80,
        target_date: '2026-12-01',
      },
    },
    libraries: { food: [], exercises: [] },
    settings: {
      weight_unit: 'kg',
      default_check_in_day: 'sunday',
      default_missing_weight_threshold_days: 3,
      default_measurement_refresh_threshold_days: 14,
      enabled_measurements: ['weight_kg', 'waist_cm'],
    },
    auditEvents: [
      {
        id: 'audit-1',
        action: 'nutrition_plan_published',
        entity_type: 'nutrition_plan',
        entity_id: 'plan-1',
        client_id: 'client-id',
        metadata: { version: 1 },
        occurred_at: '2026-09-16T04:30:00Z',
      },
    ],
  }
}

async function mockCoachWorkspace(page, state) {
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
    if (path === '/api/v1/coach/clients' && method === 'GET') return json({ items: state.clients })
    if (path === '/api/v1/coach/libraries' && method === 'GET') return json(state.libraries)
    if (path === '/api/v1/coach/libraries/food' && method === 'POST') {
      const payload = request.postDataJSON()
      const item = {
        id: `food-${state.libraries.food.length + 1}`,
        name: payload.name,
        category: payload.category,
        calories_kcal: payload.calories_kcal ?? null,
        protein_g: payload.protein_g ?? null,
        carbs_g: payload.carbs_g ?? null,
        fat_g: payload.fat_g ?? null,
        is_active: true,
      }
      state.libraries.food = [...state.libraries.food, item]
      return route.fulfill({ status: 201, json: item })
    }
    if (path === '/api/v1/coach/settings' && method === 'GET') return json(state.settings)
    if (path === '/api/v1/coach/settings' && method === 'PUT') {
      state.settings = { ...state.settings, ...request.postDataJSON() }
      return json(state.settings)
    }
    if (path === '/api/v1/coach/audit-events' && method === 'GET') {
      return json({ items: state.auditEvents, has_more: false })
    }

    const clientMatch = path.match(/^\/api\/v1\/coach\/clients\/([^/]+)\/(.+)$/)
    if (clientMatch) {
      const [, clientId, rest] = clientMatch
      if (rest === 'review' && method === 'GET') return json(state.review)
      if (rest === 'private-notes' && method === 'POST') {
        const payload = request.postDataJSON()
        const note = {
          id: `note-${state.review.private_notes.length + 1}`,
          note: payload.note,
          created_at: '2026-09-16T10:00:00+05:30',
        }
        state.review.private_notes = [note, ...state.review.private_notes]
        return route.fulfill({ status: 201, json: note })
      }
      if (rest === 'progress-photos' && method === 'GET') return json({ items: [], has_more: false })
      if (rest === 'check-ins' && method === 'GET') return json({ items: [], has_more: false })
      if (rest === 'workout-history' && method === 'GET') return json({ items: [] })
      if (rest === 'nutrition-plan' && method === 'GET') return json({ active_plan: null, draft: null, food_library: [] })
      if (rest === 'workout-program' && method === 'GET') return json({ active_program: null, draft: null, exercise_library: [] })
      return route.fulfill({ status: 501, json: { error: { message: `Unmocked ${method} ${path} (${clientId})` } } })
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

async function reloginIfNeeded(page) {
  if (await page.getByRole('heading', { name: 'Welcome back.' }).isVisible()) await loginCoach(page)
}

async function openNav(page, label) {
  await page.getByRole('navigation', { name: 'Coach navigation', exact: true }).getByRole('button', { name: label, exact: true }).click()
}

test('overview attention queue shows a live reason and no LOCAL status', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  const queue = page.locator('.coach-attention-panel')
  await expect(queue.getByText('ATTENTION QUEUE')).toBeVisible()
  await expect(queue.getByText(ATTENTION_REASON)).toBeVisible()
  await expect(queue.getByText('LOCAL')).toHaveCount(0)
})

test('review draws a two-point weight trend and keeps a saved private note after reload', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  await page.getByRole('button', { name: 'Review QA Client' }).click()
  await expect(page.getByText('WEIGHT TREND')).toBeVisible()
  await expect(page.locator('.coach-line-chart polyline')).toBeVisible()

  await page.getByPlaceholder('Add decision context, follow-up or plan rationale…').fill('QA private note')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByText('Private note saved.')).toBeVisible()
  await expect(page.locator('.coach-note-list').getByText('QA private note')).toBeVisible()

  await page.reload()
  await reloginIfNeeded(page)
  await page.getByRole('button', { name: 'Review QA Client' }).click()
  await expect(page.locator('.coach-note-list').getByText('QA private note')).toBeVisible()
})

test('libraries can add QA Greek yoghurt and show it in the food list', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  await openNav(page, 'Libraries')
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.getByLabel('Name').fill('QA Greek yoghurt')
  await page.getByLabel('Category').fill('dairy')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()

  await expect(page.getByText('Library item saved.')).toBeVisible()
  await expect(page.locator('.coach-library-list').getByText('QA Greek yoghurt')).toBeVisible()
})

test('settings persist a missing-weight threshold of 5 after reload', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  await openNav(page, 'Settings')
  const threshold = page.getByLabel('Missing weight threshold (days)')
  await expect(threshold).toHaveValue('3')
  await threshold.fill('5')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()

  await page.reload()
  await reloginIfNeeded(page)
  await openNav(page, 'Settings')
  await expect(page.getByLabel('Missing weight threshold (days)')).toHaveValue('5')
})

test('health shows not medical advice and never blood reports', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  await openNav(page, 'Health')
  const health = page.locator('.coach-page')
  await expect(health.getByText('Not medical advice').first()).toBeVisible()
  await expect(health.getByText('Blood reports')).toHaveCount(0)
  await expect(page.getByText('Blood reports')).toHaveCount(0)
})

test('audit log shows a nutrition_plan_published fixture row', async ({ page }) => {
  const state = workspaceFixture()
  await mockCoachWorkspace(page, state)
  await loginCoach(page)

  await openNav(page, 'Audit Log')
  await expect(page.getByRole('table', { name: 'Coach audit events' })).toBeVisible()
  await expect(page.getByText('nutrition_plan_published')).toBeVisible()
})
