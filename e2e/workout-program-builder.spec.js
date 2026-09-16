import { test, expect } from '@playwright/test'

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

function persistedProgram(program, status, version = null) {
  return {
    id: `${status}-program-id`,
    client_id: 'client-id',
    ...structuredClone(program),
    status,
    version,
    active_to: status === 'published' ? '2026-10-13' : null,
    replaces_program_id: null,
    days: program.days.map((day, dayIndex) => ({
      id: `${status}-day-${dayIndex + 1}`,
      ...structuredClone(day),
      exercises: day.exercises.map((item, exerciseIndex) => ({
        id: `${status}-exercise-${dayIndex + 1}-${exerciseIndex + 1}`,
        ...structuredClone(item),
      })),
    })),
  }
}

function workoutProgramFixture() {
  return {
    workspace: {
      active_program: null,
      draft: null,
      exercise_library: [
        { id: '10000000-0000-4000-8000-000000000001', name: 'Goblet squat', body_region: 'lower_body', training_focus: 'strength' },
        { id: '10000000-0000-4000-8000-000000000002', name: 'Cable row', body_region: 'upper_body', training_focus: 'strength' },
      ],
    },
    draftCalls: [],
    publishCalls: [],
    failedPublishesRemaining: 0,
  }
}

async function mockWorkoutProgram(page, state) {
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
    if (path === '/api/v1/coach/clients') return json({ items: [rosterClient] })
    if (path === '/api/v1/coach/clients/client-id/workout-program' && method === 'GET') {
      return json(state.workspace)
    }
    if (path === '/api/v1/coach/clients/client-id/workout-program/draft' && method === 'PUT') {
      const program = request.postDataJSON()
      state.draftCalls.push(program)
      state.workspace.draft = persistedProgram(program, 'draft')
      return json(state.workspace.draft)
    }
    if (path === '/api/v1/coach/clients/client-id/workout-program/publish' && method === 'POST') {
      const payload = request.postDataJSON()
      state.publishCalls.push(payload)
      if (state.failedPublishesRemaining > 0) {
        state.failedPublishesRemaining -= 1
        return route.fulfill({ status: 503, json: { error: { message: 'Publish service unavailable. Retry safely.' } } })
      }
      const program = persistedProgram(payload.program, 'published', 1)
      state.workspace = { ...state.workspace, active_program: program, draft: null }
      return json({
        program,
        generated_session_count: payload.program.days.length * 4,
        generated_session_dates: Array.from({ length: payload.program.days.length * 4 }, (_, index) => `2026-09-${String(16 + index).padStart(2, '0')}`),
      })
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
  await page.getByRole('button', { name: 'Workout', exact: true }).first().click()
  await expect(page.getByLabel('Program name')).toBeVisible()
}

async function completeRequiredExercises(page, count) {
  for (let day = 1; day <= count; day += 1) {
    await page.getByLabel(`Day ${day} exercise 1 name`).fill(day === 1 ? 'Goblet squat' : `Exercise ${day}`)
  }
}

test('starts with two days and enforces day limits and unique weekdays', async ({ page }) => {
  const state = workoutProgramFixture()
  await mockWorkoutProgram(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await expect(page.getByLabel('Day 1 weekday')).toBeVisible()
  await expect(page.getByLabel('Day 2 weekday')).toBeVisible()
  await expect(page.getByLabel('Day 3 weekday')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Day 1', exact: true })).toBeDisabled()

  for (let day = 3; day <= 6; day += 1) {
    await page.getByRole('button', { name: 'Add training day' }).click()
    await expect(page.getByLabel(`Day ${day} weekday`)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Add training day' })).toBeDisabled()
  await page.getByRole('button', { name: 'Remove Day 6', exact: true }).click()

  await page.getByLabel('Day 2 weekday').selectOption(await page.getByLabel('Day 1 weekday').inputValue())
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Each training day needs a unique weekday.')).toBeVisible()
  expect(state.draftCalls).toHaveLength(0)
})

test('adds, removes, and reorders controlled exercises within bounds', async ({ page }) => {
  const state = workoutProgramFixture()
  await mockWorkoutProgram(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await page.getByLabel('Day 1 exercise 1 name').fill('Goblet squat')
  await page.getByRole('button', { name: 'Add exercise to Day 1' }).click()
  await page.getByLabel('Day 1 exercise 2 name').fill('Cable row')
  await page.getByRole('button', { name: 'Move Day 1 exercise 2 up' }).click()
  await expect(page.getByLabel('Day 1 exercise 1 name')).toHaveValue('Cable row')
  await expect(page.getByLabel('Day 1 exercise 2 name')).toHaveValue('Goblet squat')

  await page.getByRole('button', { name: 'Remove Day 1 exercise 2' }).click()
  await expect(page.getByLabel('Day 1 exercise 2 name')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Day 1 exercise 1' })).toBeDisabled()

  for (let exerciseIndex = 2; exerciseIndex <= 12; exerciseIndex += 1) {
    await page.getByRole('button', { name: 'Add exercise to Day 1' }).click()
  }
  await expect(page.getByRole('button', { name: 'Add exercise to Day 1' })).toBeDisabled()
  await expect(page.getByLabel('Day 1 exercise 12 name')).toBeVisible()
})

test('draft restores and publish refreshes persisted program', async ({ page }) => {
  const state = workoutProgramFixture()
  await mockWorkoutProgram(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await page.getByLabel('Program name').fill('QA Four-Week Strength')
  await page.getByRole('button', { name: 'Add training day' }).click()
  await page.getByLabel('Day 1 weekday').selectOption('3')
  await page.getByLabel('Day 2 weekday').selectOption('5')
  await page.getByLabel('Day 3 weekday').selectOption('7')
  await completeRequiredExercises(page, 3)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved.')).toBeVisible()
  expect(state.draftCalls[0].days.map(day => day.position)).toEqual([1, 2, 3])

  await page.reload()
  if (await page.getByRole('heading', { name: 'Welcome back.' }).isVisible()) await loginCoach(page)
  await openBuilder(page)
  await expect(page.getByLabel('Program name')).toHaveValue('QA Four-Week Strength')
  await expect(page.getByLabel('Day 3 weekday')).toHaveValue('7')

  await page.getByRole('button', { name: 'Publish 4-week program' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm four-week schedule' })
  await expect(dialog).toContainText('2026-09-16 to 2026-10-13')
  await expect(dialog).toContainText('12 sessions')
  await dialog.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText('12 sessions published')).toBeVisible()
  await expect(page.getByText('QA Four-Week Strength', { exact: true })).toBeVisible()
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible()
  expect(state.publishCalls).toHaveLength(1)
})

test('failed publish retains entries and retry reuses its publish key', async ({ page }) => {
  const state = workoutProgramFixture()
  state.failedPublishesRemaining = 1
  await mockWorkoutProgram(page, state)
  await loginCoach(page)
  await openBuilder(page)

  await page.getByLabel('Program name').fill('Retry-safe strength')
  await completeRequiredExercises(page, 2)
  await page.getByRole('button', { name: 'Publish 4-week program' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm four-week schedule' })
  await dialog.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText('Publish service unavailable. Retry safely.')).toBeVisible()
  await expect(page.getByLabel('Program name')).toHaveValue('Retry-safe strength')

  await dialog.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText('8 sessions published')).toBeVisible()
  expect(state.publishCalls).toHaveLength(2)
  expect(state.publishCalls[0].publish_key).toBe(state.publishCalls[1].publish_key)
  expect(state.publishCalls[0].program.name).toBe('Retry-safe strength')
})
