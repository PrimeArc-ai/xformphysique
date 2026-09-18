import { test, expect } from '@playwright/test'
import { tinyImage } from './progress-fixture'

function foundationState() {
  return {
    authStatus: 'pending',
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

  await page.addInitScript((step) => window.localStorage.setItem('xform.foundation.step', step), rememberedStep)
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

    if (path === '/api/v1/client/foundation-intake' && method === 'GET') return json(intakePayload(state))
    if (path === '/api/v1/client/foundation-intake' && method === 'PATCH') {
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

test('submit without waiver stays on the wizard and successful submit opens the dashboard', async ({ page }) => {
  await loginPendingClient(page, foundationState(), 'waiver')
  await expect(page.getByRole('heading', { name: 'Waiver' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.locator('.foundation-waiver-panel strong').filter({ hasText: 'DO YOU AGREE TO THE TERMS OF THIS WAIVER AND FULLY ACCEPT RESPONSIBILITY FOR YOUR PARTICIPATION?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiver' })).toBeVisible()
  await page.getByLabel('I agree', { exact: true }).check()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Foundation form/i })).toHaveCount(0)
})
