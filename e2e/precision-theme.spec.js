import { test, expect } from '@playwright/test'

const date = '2026-09-07'
const clientRecord = { id: 'design-client', full_name: 'Maya Shah', name: 'Maya Shah', client_code: 'XP-0017', email: 'maya@example.com', primary_goal: 'body_recomposition', check_in_day: 'sunday', timezone: 'Asia/Kolkata', target_weight_kg: 70, dietary_preferences: 'Vegetarian', allergies_injuries: '', latest_weight_kg: 72.4, latest_entry_date: date, latest_checkin_period_start: date, needs_attention: false }
const coachRecord = { id: 'design-coach', full_name: 'Aarav Rao', email: 'aarav@example.com', professional_title: 'Strength Coach', is_active: true, created_at: `${date}T12:00:00Z`, active_client_count: 1 }

async function mockWorkspace(page, role, { empty = false, invalidLogin = false, activation = false } = {}) {
  const errors = [], unexpected = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      unexpected.push(url.pathname)
      return route.abort()
    }
    return route.continue()
  })
  const user = { id: `design-${role}`, email: `${role}@example.com`, aud: 'authenticated', role: 'authenticated', user_metadata: activation ? { xform_invitation: true } : {}, app_metadata: {} }
  await page.route('**/auth/v1/**', route => {
    if (route.request().url().includes('/recover')) return route.fulfill({ json: {} })
    if (invalidLogin && route.request().url().includes('/token')) return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } })
    return route.fulfill({ json: route.request().url().includes('/token') ? { access_token: 'design-only-jwt', refresh_token: 'design-only-refresh', token_type: 'bearer', expires_in: 3600, user } : user })
  })
  let profile = { ...clientRecord }
  let body = empty ? [] : [72.4, 72.7, 72.6, 72.7, 73.1, 73.0, 73.2].map((weight, i) => ({ id: `entry-${i}`, date: `2026-09-${String(7 - i).padStart(2, '0')}`, weight_kg: weight, waist_cm: 84.2 }))
  let checkins = empty ? [] : [{ id: 'checkin', period_start: date, energy_score: 4, sleep_score: 3, sentiment: 'good', observation: 'Three consistent strength sessions.', concern: null }]
  const nutrition = { date, daily_targets: { calories_kcal: 1900, protein_g: 130, carbs_g: 210, fat_g: 60 }, restrictions: [], meals: [{ id: 'meal', name: 'Protein breakfast bowl', time: '08:00', ingredients: [{ name: 'Greek yoghurt' }, { name: 'Oats' }], calories_kcal: 420, adherence_status: 'pending' }] }
  const workout = { session_id: 'session', title: 'Upper strength', week_label: 'Week 04', coach_note: 'Move with control.', status: 'planned', estimated_duration_minutes: 45, exercises: ['Incline press', 'Cable row', 'Lateral raise', 'Triceps extension'].map((name, i) => ({ id: `exercise-${i}`, plan_exercise_id: `exercise-${i}`, name, prescription: { sets: 3, reps: '8–12', rest_seconds: 90 }, sets: [] })) }
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const data = ['PATCH', 'POST', 'PUT'].includes(request.method()) ? request.postDataJSON() : null
    requests.push({ path, method: request.method(), data })
    const json = value => route.fulfill({ json: value })
    if (path === '/api/v1/auth/set-password') return json({ updated: true, email: data?.email })
    if (path === '/api/v1/auth/me') {
      const portal = url.searchParams.get('portal')
      return portal && portal !== role ? route.fulfill({ status: 403, json: { error: { message: 'This account cannot access the selected portal.' } } }) : json({ id: user.id, full_name: role === 'client' ? 'Maya Shah' : role === 'coach' ? 'Aarav Rao' : 'Navaneet Deshpande', first_name: 'Maya', email: user.email, role })
    }
    if (path.endsWith('/profile/photo')) return json({ photo: null })
    if (path === '/api/v1/client/dashboard') return json({ client: { id: user.id, first_name: 'Maya' }, body: { current_weight_kg: body[0]?.weight_kg ?? null, latest_waist_cm: body[0]?.waist_cm ?? null, change_from_start_kg: body.length ? -3.6 : null, target_progress_percent: body.length ? 60 : null, trend: [...body].reverse() }, check_ins: { count: checkins.length, status: checkins.length ? 'submitted' : 'due' }, training_volume: { total_kg: empty ? 0 : 18240, sessions: empty ? 0 : 12, training_days: empty ? 0 : 12, best_day_kg: empty ? 0 : 2100, daily_kg: empty ? [] : [1200, 1500, 1920, 1800, 2100, 1440].map((volume_kg, i) => ({ date: `2026-09-0${i + 1}`, volume_kg })) } })
    if (path.startsWith('/api/v1/client/body-entries/')) { body = [{ id: 'new-entry', date: path.split('/').at(-1), ...data }, ...body.filter(item => item.date !== path.split('/').at(-1))]; return json(body[0]) }
    if (path === '/api/v1/client/body-entries') return json({ items: body })
    if (path.endsWith('/check-ins/current')) { const saved = { id: 'saved-checkin', period_start: date, ...data }; checkins = [saved, ...checkins]; return json(saved) }
    if (path.endsWith('/check-ins')) return json({ items: checkins })
    if (path.endsWith('/progress-photos')) return json({ items: [] })
    if (path.endsWith('/nutrition/active-plan')) return empty ? route.fulfill({ status: 404, json: { error: { message: 'No plan assigned' } } }) : json(nutrition)
    if (path.endsWith('/workout-sessions/today')) return empty ? route.fulfill({ status: 404, json: { error: { message: 'No session assigned' } } }) : json(workout)
    if (path.endsWith('/health-summary')) return json({ wellbeing: { energy_score: 4, sentiment: 'good' }, planning_context: { dietary_preferences: ['Vegetarian'], training_considerations: ['Steady training rhythm'], coach_note: 'Keep up your consistency.' }, safety_notice: 'Ask your health professional for clinical advice.' })
    if (path === '/api/v1/client/profile') { if (data) profile = { ...profile, ...data }; return json(profile) }
    if (path === '/api/v1/coach/clients') return json({ items: [clientRecord] })
    if (path.endsWith('/review')) return json({ client: clientRecord, body_entries: body.map(item => ({ ...item, entry_date: item.date })), checkins, progress_photos: [], photo_count: 0, private_notes: [], coaching_context: { client_visible_coach_note: 'Stay consistent.', training_considerations: [], safety_notice: '' } })
    if (path.endsWith('/coaching-context')) return json(data)
    if (path === '/api/v1/admin/coaches') return json({ items: [coachRecord] })
    if (path.endsWith('/clients') && path.includes('/admin/')) return json({ items: [{ client_code: 'XP-0017', assigned_at: `${date}T12:00:00Z`, ended_at: null }] })
    unexpected.push(`${request.method()} ${path}`)
    return route.fulfill({ status: 501, json: { error: { message: 'Unexpected request in isolated design test' } } })
  })
  await page.goto('/')
  return { errors, unexpected, requests }
}

async function signIn(page, role) {
  await page.getByRole('radio', { name: role, exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill(`${role.toLowerCase()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('DesignOnly!123')
  await page.getByRole('button', { name: 'Sign In' }).click()
}

async function noOverflow(page) {
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport)
  const uncentered = await page.locator('button').evaluateAll(buttons => buttons
    .filter(button => button.getBoundingClientRect().width && button.innerText.trim())
    .filter(button => getComputedStyle(button).textAlign !== 'center')
    .map(button => ({ text: button.innerText, className: button.className })))
  expect(uncentered, 'Button labels must be centered in every portal').toEqual([])
}

for (const [width, height] of [[3440, 1440], [2560, 1440], [1920, 1080], [1440, 900], [1024, 768], [960, 540], [768, 1024], [390, 844], [320, 640]]) {
  test(`login fills ${width}x${height} with readable, centered Sign In`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height })
    await mockWorkspace(page, 'client')
    await page.evaluate(() => document.fonts.ready)
    await noOverflow(page)
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.auth-login').getBoundingClientRect()
      const hero = document.querySelector('.auth-hero').getBoundingClientRect()
      const body = document.querySelector('.auth-login-body').getBoundingClientRect()
      const form = document.querySelector('.auth-login-body form').getBoundingClientRect()
      const heading = document.querySelector('.auth-login-body h1').getBoundingClientRect()
      const button = document.querySelector('.auth-login-body button')
      const bounds = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(button)
      const label = range.getBoundingClientRect()
      return { cardWidth: card.width, cardHeight: card.height, cardLeft: card.left, cardTop: card.top,
        heroRight: hero.right, heroBottom: hero.bottom, bodyLeft: body.left, bodyTop: body.top,
        formWidth: form.width, formLeft: form.left, headingLeft: heading.left,
        labelOffset: Math.abs(label.x + label.width / 2 - (bounds.x + bounds.width / 2)),
        buttonFont: parseFloat(getComputedStyle(button).fontSize), buttonHeight: bounds.height }
    })
    expect(layout.cardWidth).toBe(width)
    expect(layout.cardHeight).toBeGreaterThanOrEqual(height)
    expect(layout.cardLeft).toBe(0)
    expect(layout.cardTop).toBe(0)
    expect(layout.formWidth).toBeLessThanOrEqual(640)
    expect(Math.abs(layout.formLeft - layout.headingLeft)).toBeLessThan(1)
    expect(layout.labelOffset).toBeLessThan(1)
    expect(layout.buttonFont).toBeGreaterThanOrEqual(18)
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(56)
    if (width > 760) expect(Math.abs(layout.heroRight - layout.bodyLeft)).toBeLessThan(1)
    else expect(layout.bodyTop).toBeGreaterThanOrEqual(layout.heroBottom)
    const button = page.getByRole('button', { name: 'Sign In', exact: true })
    await expect(button).toBeVisible()
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport()
    if (width === 1920 || width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true })
    }
  })
}

async function checkTheme(page) {
  await page.evaluate(() => document.fonts.ready)
  const theme = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const heading = document.querySelector('h1, h2')
    const button = document.querySelector('.lime-button, .coach-primary')
    return { bg: root.getPropertyValue('--bg').trim(), accent: root.getPropertyValue('--accent').trim(),
      body: getComputedStyle(document.body).fontFamily, heading: getComputedStyle(heading).fontFamily,
      button: button ? getComputedStyle(button).backgroundColor : null,
      fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family) }
  })
  expect(theme.bg).toBe('#090a0b')
  expect(theme.accent).toBe('#c7f542')
  expect(theme.body).toContain('IBM Plex Sans')
  expect(theme.heading).toContain('Chakra Petch')
  expect(theme.fonts.join(' ')).toContain('Chakra Petch')
  if (theme.button) expect(theme.button).toBe('rgb(199, 245, 66)')
  await noOverflow(page)
}

for (const width of [1440, 768, 390]) {
  test(`Client theme and all navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const proof = await mockWorkspace(page, 'client')
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
    await signIn(page, 'Client')
    await expect(page.getByRole('heading', { name: 'Progress, in motion.' })).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('client-dashboard.png'), fullPage: true })
    const navigation = page.getByRole('navigation', { name: width <= 760 ? 'Mobile client navigation' : 'Client navigation', exact: true })
    for (const [label, heading] of [['Body Tracker', 'Track signal. See change.'], ['Check-ins', 'Check in with yourself.'], ['Progress Photos', 'Private progress, in view.'], ['Nutrition', 'Follow plan. Keep it simple.'], ['Workout', 'Today: upper strength.'], ['Health Summary', 'Your health context, protected.'], ['Profile', 'Your plan starts with context.']]) {
      await navigation.getByRole('button', { name: width <= 760 && label === 'Health Summary' ? 'Health' : label, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await noOverflow(page)
      if (label === 'Profile') await page.screenshot({ path: testInfo.outputPath('client-profile.png'), fullPage: true })
    }
    expect(proof.errors).toEqual([])
    expect(proof.unexpected).toEqual([])
  })

  test(`Coach theme and all navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const proof = await mockWorkspace(page, 'coach')
    await signIn(page, 'Coach')
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
    await expect(page.getByText('Maya Shah').first()).toBeVisible()
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('coach-dashboard.png'), fullPage: true })
    const navigation = page.getByRole('navigation', { name: width <= 760 ? 'Mobile coach navigation' : 'Coach navigation', exact: true })
    for (const label of ['Clients', 'Body Tracker', 'Nutrition', 'Workout', 'Libraries', 'Settings', 'Health', 'Audit Log']) {
      await navigation.getByRole('button', { name: width <= 760 && label === 'Body Tracker' ? 'Body' : label, exact: true }).click()
      await expect(page.locator('.os-topbar h1')).toHaveText(label)
      await expect(page.locator('.coach-page')).toBeVisible()
      if (label === 'Body Tracker') await expect(page.getByText('CLIENT-RECORDED BODY DATA')).toBeVisible()
      await noOverflow(page)
    }
    await navigation.getByRole('button', { name: 'Clients', exact: true }).click()
    await page.getByRole('button', { name: 'New client', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Create client workspace' })).toBeVisible()
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('coach-onboarding.png'), fullPage: true })
    await page.getByRole('button', { name: 'Close client onboarding' }).click()
    expect(proof.errors).toEqual([])
    expect(proof.unexpected).toEqual([])
  })

  test(`Admin theme, privacy and dialogs at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const proof = await mockWorkspace(page, 'admin')
    await signIn(page, 'Admin')
    await expect(page.getByRole('heading', { name: 'Coach management' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View Aarav Rao' })).toBeVisible()
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('admin-dashboard.png'), fullPage: true })
    await page.getByRole('button', { name: 'View Aarav Rao' }).click()
    await expect(page.getByRole('cell', { name: 'XP-0017', exact: true })).toBeVisible()
    await expect(page.getByText('Maya Shah', { exact: true })).toHaveCount(0)
    await expect(page.getByText('maya@example.com', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '+ Onboard coach' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await checkTheme(page)
    await page.screenshot({ path: testInfo.outputPath('admin-onboarding.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(proof.errors).toEqual([])
    expect(proof.unexpected).toEqual([])
  })
}

test('client forms preserve request contracts; dashboard shortcuts work', async ({ page }) => {
  const proof = await mockWorkspace(page, 'client')
  await signIn(page, 'Client')
  await page.getByRole('button', { name: 'Log body entry' }).click()
  await page.getByPlaceholder('68.4').fill('71.8')
  await page.getByPlaceholder('71', { exact: true }).fill('83.5')
  await page.getByRole('button', { name: 'Save body progress' }).click()
  await expect(page.getByText('Body progress saved to your XForm record.')).toBeVisible()
  expect(proof.requests.find(r => r.method === 'PUT' && r.path.includes('/body-entries/')).data).toEqual({ weight_kg: 71.8, waist_cm: 83.5 })
  const nav = page.getByRole('navigation', { name: 'Client navigation', exact: true })
  await nav.getByRole('button', { name: 'Check-ins', exact: true }).click()
  await page.getByPlaceholder('Training, nutrition, routine, confidence…').fill('Consistent training.')
  await page.getByRole('button', { name: 'Submit check-in' }).click()
  await expect(page.getByText('Check-in saved to your private coaching record.')).toBeVisible()
  expect(proof.requests.find(r => r.path.endsWith('/check-ins/current')).data.observation).toBe('Consistent training.')
  await nav.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Progress, in motion.' })).toBeVisible()
  await page.getByRole('button', { name: 'View workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today: upper strength.' })).toBeVisible()
  expect(proof.errors).toEqual([])
  expect(proof.unexpected).toEqual([])
})

test('empty client has no invented trend, volume bars or assigned workout', async ({ page }) => {
  await mockWorkspace(page, 'client', { empty: true })
  await signIn(page, 'Client')
  await expect(page.getByText('No body entries yet.', { exact: true })).toBeVisible()
  await expect(page.locator('.precision-weight-chart')).toHaveCount(0)
  await expect(page.locator('.precision-volume-bars i')).toHaveCount(0)
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  await page.getByRole('button', { name: 'Open workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workout plan pending.' })).toBeVisible()
})

test('login keeps accessible keyboard selection, errors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockWorkspace(page, 'client', { invalidLogin: true })
  await page.getByRole('radio', { name: 'Client', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Coach', exact: true })).toBeChecked()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Admin', exact: true })).toBeChecked()
  await signIn(page, 'Client')
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
  expect(await page.getByRole('alert').evaluate(el => getComputedStyle(el).color)).toBe('rgb(240, 170, 167)')
  await page.getByLabel('Password', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeFocused()
  expect(await page.getByRole('button', { name: 'Sign In' }).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
  await noOverflow(page)
})

test('forgot password sits under Sign In and asks for email and new password', async ({ page }) => {
  const proof = await mockWorkspace(page, 'client')
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible()
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot password.' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('maya@example.com')
  await page.getByLabel('New password', { exact: true }).fill('DesignOnly!123')
  await page.getByLabel('Confirm password', { exact: true }).fill('Different!123')
  await page.getByRole('button', { name: 'Save password and sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
  await page.getByLabel('Confirm password', { exact: true }).fill('DesignOnly!123')
  await page.getByRole('button', { name: 'Save password and sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Hello, Maya' })).toBeVisible()
  expect(proof.requests.some(item => item.path === '/api/v1/auth/set-password' && item.method === 'POST')).toBeTruthy()
})

test('invitation activation uses the same base design and password validation', async ({ page }) => {
  const proof = await mockWorkspace(page, 'client', { activation: true })
  await signIn(page, 'Client')
  await expect(page.getByRole('heading', { name: 'Set your password.' })).toBeVisible()
  await checkTheme(page)
  await page.getByLabel('New password', { exact: true }).fill('DesignOnly!123')
  await page.getByLabel('Confirm password', { exact: true }).fill('Different!123')
  await page.getByRole('button', { name: 'Activate workspace' }).click()
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
  expect(proof.errors).toEqual([])
  expect(proof.unexpected).toEqual([])
})
