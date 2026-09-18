import { test, expect } from '@playwright/test'
import { tinyImage } from './progress-fixture'

function foundationState() {
  return {
    authStatus: 'pending',
    intakeLoadError: null,
    answers: {},
    photos: {
      front: null,
      back: null,
      side: null,
      front_double_bicep: null,
      back_double_bicep: null,
    },
    catalog: {
      sleep_recovery: [
        { id: 'none', label: 'None' },
        { id: 'do_you_use_sleep_aids', label: 'Do you use sleep aids?' },
      ],
      gut_digestive: [
        { id: 'none', label: 'None' },
        { id: 'do_you_experience_bloating_without_eating_or_at_random_times', label: 'Do you experience bloating without eating or at random times?' },
      ],
    },
  }
}

function hasDraftSkeletonValue(value) {
  if (value === '') return true
  if (Array.isArray(value)) return value.length === 0 || value.some(hasDraftSkeletonValue)
  if (value && typeof value === 'object') {
    const values = Object.values(value)
    return values.length === 0 || values.some(hasDraftSkeletonValue)
  }
  return false
}

function intakePayload(state) {
  return {
    status: state.authStatus,
    schema_version: 1,
    answers: state.answers,
    prefill: {
      full_name: 'Navaneet Deshpande',
      email: 'navaneet@example.test',
    },
    photos: state.photos,
    catalog: state.catalog,
    waiver_version: 'xform-foundation-waiver-v1',
    attention_flags: [],
    submitted_at: state.authStatus === 'submitted' ? '2026-09-18T10:00:00Z' : null,
  }
}

async function mockPendingClient(page, state, rememberedStep = 'identity') {
  const user = {
    id: 'client-1',
    email: 'navaneet@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: {},
    app_metadata: {},
  }

  await page.addInitScript((step) => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('xform.foundation.step', step)
  }, rememberedStep)
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })

  await page.route('**/auth/v1/**', route => route.fulfill({
    json: route.request().url().includes('/token')
      ? {
          access_token: 'mock-foundation-jwt',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }
      : user,
  }))

  await page.route('**/api/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()
    const json = data => route.fulfill({ json: data })
    const jsonBody = req.headers()['content-type']?.includes('application/json') ? req.postDataJSON() : null

    if (path === '/api/v1/auth/me') {
      return json({
        id: 'client-1',
        role: 'client',
        foundation_intake_status: state.authStatus,
        full_name: 'Navaneet Deshpande',
        first_name: 'Navaneet',
        email: 'navaneet@example.test',
      })
    }

    if (path === '/api/v1/client/foundation-intake' && method === 'GET') {
      if (state.intakeLoadError) {
        return route.fulfill({
          status: state.intakeLoadError.status,
          json: { error: { message: state.intakeLoadError.message } },
        })
      }
      return json(intakePayload(state))
    }
    if (path === '/api/v1/client/foundation-intake' && method === 'PATCH') {
      if (hasDraftSkeletonValue(jsonBody.answers)) {
        return route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'foundation_invalid',
              message: 'Foundation intake answers are invalid',
              fields: { answers: 'Draft contains empty scaffold values.' },
            },
          },
        })
      }
      state.answers = jsonBody.answers
      return json(intakePayload(state))
    }
    if (path === '/api/v1/client/foundation-intake/submit') {
      if (jsonBody?.answers?.waiver?.accepted !== true) {
        return route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'foundation_waiver_required',
              message: 'Waiver xform-foundation-waiver-v1 must be accepted',
            },
          },
        })
      }
      state.authStatus = 'submitted'
      state.answers = jsonBody.answers
      return json(intakePayload(state))
    }
    if (path === '/api/v1/client/progress-photos' && method === 'POST') {
      const body = req.postDataBuffer().toString('utf8')
      const field = name => body.match(new RegExp(`name=\"${name}\"\\r\\n\\r\\n([^\\r]+)`))?.[1]
      const view = field('view')
      state.photos[view] = {
        id: `${view}-photo`,
        view,
        captured_on: field('captured_on'),
        file_name: `${view}.png`,
        content_url: `/api/v1/client/progress-photos/${view}-photo/content`,
        uploaded_at: '2026-09-18T10:00:00Z',
      }
      return json(state.photos[view])
    }
    if (path.includes('/progress-photos/') && path.endsWith('/content')) {
      return route.fulfill({ contentType: 'image/png', body: tinyImage })
    }
    if (path === '/api/v1/client/progress-photos') return json({ items: Object.values(state.photos).filter(Boolean), has_more: false })
    if (path === '/api/v1/client/profile/photo') return json({ photo: null })
    if (path === '/api/v1/client/dashboard') {
      return json({
        client: { first_name: 'Navaneet' },
        body: { current_weight_kg: null, trend: [], target_progress_percent: null },
        check_ins: { count: 0 },
        training_volume: { total_kg: 0, daily_kg: [], sessions: 0, training_days: 0, best_day_kg: 0 },
        next_actions: [],
      })
    }
    if (path === '/api/v1/client/body-entries') return json({ items: [] })
    if (path === '/api/v1/client/check-ins') {
      return json({
        items: [],
        schedule: {
          timezone: 'Asia/Kolkata',
          today: '2026-09-18',
          period_start: '2026-09-14',
          due_on: '2026-09-20',
          next_due_on: '2026-09-27',
          previous_due_on: '2026-09-13',
          current_status: 'upcoming',
          day_of_week: 'sunday',
          missed_count: 0,
          consecutive_missed: 0,
        },
        has_more: false,
      })
    }
    if (path === '/api/v1/client/nutrition/active-plan') return json(null)
    if (path === '/api/v1/client/workout-sessions/today') return json(null)
    if (path === '/api/v1/client/health-summary') return json({ wellbeing: {}, planning_context: {} })
    if (path === '/api/v1/client/profile') {
      return json({
        client_id: 'client-1',
        name: 'Navaneet Deshpande',
        email: 'navaneet@example.test',
        primary_goal: 'Lose fat',
        target_weight_kg: null,
        check_in_day: 'sunday',
        timezone: 'Asia/Kolkata',
        dietary_preferences: '',
        allergies_injuries: '',
      })
    }

    return route.fulfill({ status: 501, json: { error: { message: `Unmocked ${method} ${path}` } } })
  })

  await page.goto('/')
}

async function loginPendingClient(page, state = foundationState(), rememberedStep = 'identity') {
  await mockPendingClient(page, state, rememberedStep)
  await page.getByRole('radio', { name: 'Client', exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill('navaneet@example.test')
  await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly!123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  return state
}

function coachFoundationState() {
  return {
    roster: [{
      id: 'client-1',
      client_code: 'XP-0012',
      full_name: 'Navaneet Deshpande',
      email: 'navaneet@example.test',
      primary_goal: 'fat_loss',
      check_in_day: 'sunday',
      timezone: 'Asia/Kolkata',
      latest_weight_kg: 78,
      latest_entry_date: '2026-09-18',
      latest_checkin_period_start: null,
      needs_attention: false,
      foundation_intake_status: 'submitted',
      check_in_schedule: {
        timezone: 'Asia/Kolkata',
        today: '2026-09-18',
        period_start: '2026-09-14',
        due_on: '2026-09-20',
        next_due_on: '2026-09-27',
        previous_due_on: '2026-09-13',
        current_status: 'upcoming',
        day_of_week: 'sunday',
        missed_count: 0,
        consecutive_missed: 0,
      },
      attention_reasons: [],
    }],
    intake: {
      status: 'submitted',
      schema_version: 1,
      answers: {
        identity: {
          full_name: 'Navaneet Deshpande',
          date_of_birth: '1994-01-15',
          sex: 'male',
          mobile: '+91 98765 43210',
          place_of_living: 'Pune, Maharashtra',
          profession: 'Software engineer',
        },
        training: {
          exercise_history: 'Never been to the gym',
          current_program: 'No current training program.',
        },
        safety: {
          physician_said_no_exercise: 'No.',
        },
      },
      prefill: {
        full_name: 'Navaneet Deshpande',
        email: 'navaneet@example.test',
      },
      photos: {
        front: null,
        back: null,
        side: null,
        front_double_bicep: null,
        back_double_bicep: null,
      },
      waiver_version: 'xform-foundation-waiver-v1',
      attention_flags: [],
      submitted_at: '2026-09-18T10:00:00Z',
    },
    review: {
      client: {
        id: 'client-1',
        client_code: 'XP-0012',
        full_name: 'Navaneet Deshpande',
      },
      body_entries: [],
      checkins: [],
      photo_count: 0,
      progress_photos: [],
      private_notes: [],
      coaching_context: {
        client_visible_coach_note: '',
        training_considerations: [],
        safety_notice: '',
      },
      setup: {
        primary_goal: 'fat_loss',
        check_in_day: 'sunday',
        timezone: 'Asia/Kolkata',
        dietary_preferences: '',
        allergies_injuries: '',
        enabled_measurements: ['weight_kg', 'waist_cm'],
        target_weight_kg: null,
        target_waist_cm: null,
        target_date: null,
      },
    },
  }
}

async function mockCoachFoundation(page, state) {
  const user = {
    id: 'coach-1',
    email: 'coach@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: {},
    app_metadata: {},
  }

  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })

  await page.route('**/auth/v1/**', route => route.fulfill({
    json: route.request().url().includes('/token')
      ? {
          access_token: 'mock-coach-jwt',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }
      : user,
  }))

  await page.route('**/api/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()
    const json = data => route.fulfill({ json: data })

    if (path === '/api/v1/auth/me') {
      return json({
        id: 'coach-1',
        role: 'coach',
        full_name: 'Aisha Kapoor',
        first_name: 'Aisha',
        email: 'coach@example.test',
      })
    }
    if (path === '/api/v1/coach/profile/photo') return json({ photo: null })
    if (path === '/api/v1/coach/clients' && method === 'GET') return json({ items: state.roster })
    if (path === '/api/v1/coach/clients/client-1/review' && method === 'GET') return json(state.review)
    if (path === '/api/v1/coach/clients/client-1/foundation-intake' && method === 'GET') return json(state.intake)
    if (path === '/api/v1/coach/clients/client-1/progress-photos/front-photo/content' && method === 'GET') return route.fulfill({ contentType: 'image/png', body: tinyImage })
    if (path.match(/^\/api\/v1\/coach\/clients\/client-1\/progress-photos\/.+-photo\/content$/) && method === 'GET') {
      return route.fulfill({ status: 403, json: { error: { message: 'Forbidden' } } })
    }
    if (path === '/api/v1/coach/clients/client-1/progress-photos' && method === 'GET') return json({ items: [], has_more: false })
    if (path === '/api/v1/coach/clients/client-1/check-ins' && method === 'GET') return json({ items: [], has_more: false })
    if (path === '/api/v1/coach/clients/client-1/workout-history' && method === 'GET') return json({ items: [] })
    if (path === '/api/v1/coach/clients/client-1/nutrition-plan' && method === 'GET') return json({ active_plan: null, draft: null, food_library: [] })
    if (path === '/api/v1/coach/clients/client-1/workout-program' && method === 'GET') return json({ active_program: null, draft: null, exercise_library: [] })
    if (path === '/api/v1/coach/clients/client-1/lab-reports' && method === 'GET') return json({ items: [], has_more: false })
    if (path === '/api/v1/coach/clients/client-1/lab-reports/request' && method === 'GET') return json({ request: null })

    return route.fulfill({ status: 501, json: { error: { message: `Unmocked ${method} ${path}` } } })
  })

  await page.goto('/')
}

async function loginCoach(page, state = coachFoundationState()) {
  await mockCoachFoundation(page, state)
  await page.getByRole('radio', { name: 'Coach', exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill('coach@example.test')
  await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly!123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  return state
}

test('pending client does not see dashboard navigation', async ({ page }) => {
  await loginPendingClient(page)
  await expect(page.getByRole('heading', { name: /Foundation form/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0)
})

test('uploading one pose shows a preview and saved status', async ({ page }) => {
  await loginPendingClient(page, foundationState(), 'photos')
  await expect(page.getByRole('heading', { name: 'Baseline photos' })).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: tinyImage })
  await expect(page.getByRole('status')).toContainText('Front photo uploaded.')
  await expect(page.getByAltText('Front preview')).toBeVisible()
})

test('next saves a compact partial draft without empty scaffold values', async ({ page }) => {
  await loginPendingClient(page, foundationState(), 'identity')
  await expect(page.getByRole('heading', { name: 'Foundation form' })).toBeVisible()
  await expect(page.getByText('Tell us how to identify and contact you.')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Body context for coaching support only.')).toBeVisible()
  await expect(page.getByText('Draft contains empty scaffold values.')).toHaveCount(0)
})

test('failed intake load shows the unavailable fallback and no editable wizard', async ({ page }) => {
  const state = foundationState()
  state.intakeLoadError = { status: 503, message: 'Foundation intake is temporarily unavailable.' }
  await loginPendingClient(page, state)
  await expect(page.getByRole('heading', { name: 'Foundation form unavailable.' })).toBeVisible()
  await expect(page.getByText('Foundation intake is temporarily unavailable.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
  await expect(page.getByLabel('Full name')).toHaveCount(0)
})

test('submit without waiver stays on the wizard and successful submit opens the dashboard', async ({ page }) => {
  await loginPendingClient(page, foundationState(), 'waiver')
  await expect(page.getByRole('heading', { name: 'Waiver' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.locator('.foundation-waiver-panel strong').filter({ hasText: 'DO YOU AGREE TO THE TERMS OF THIS WAIVER AND FULLY ACCEPT RESPONSIBILITY FOR YOUR PARTICIPATION?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiver' })).toBeVisible()
  await page.getByLabel('I agree', { exact: true }).check()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hello, Navaneet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Foundation form/i })).toHaveCount(0)
})

test('coach reads submitted foundation answers', async ({ page }) => {
  await loginCoach(page)
  await page.getByRole('button', { name: 'Health', exact: true }).click()
  await page.getByRole('combobox', { name: 'CLIENT', exact: true }).selectOption('client-1')
  await expect(page.getByRole('heading', { name: 'Foundation form', exact: true })).toBeVisible()
  await expect(page.getByText('Never been to the gym')).toBeVisible()
})

test('coach panel keeps submitted answers visible when a foundation photo fails to hydrate', async ({ page }) => {
  const state = coachFoundationState()
  for (const view of ['front', 'back', 'side', 'front_double_bicep', 'back_double_bicep']) {
    state.intake.photos[view] = {
      id: `${view}-photo`,
      view,
      captured_on: '2026-09-18',
      file_name: `${view}.png`,
      content_url: `/api/v1/coach/clients/client-1/progress-photos/${view}-photo/content`,
      uploaded_at: '2026-09-18T10:00:00Z',
    }
  }

  await loginCoach(page, state)
  await page.getByRole('button', { name: 'Health', exact: true }).click()
  await page.getByRole('combobox', { name: 'CLIENT', exact: true }).selectOption('client-1')

  await expect(page.getByText('Never been to the gym')).toBeVisible()
  await expect(page.getByAltText('Front foundation photo')).toBeVisible()
  await expect(page.getByText('No photo submitted.').first()).toBeVisible()
  await expect(page.getByText('Foundation form unavailable')).toHaveCount(0)
})
