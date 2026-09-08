import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// Explicit opt-in: creates a QA coach and synthetic client and offboards ONLY that
// coach. Leaves the synthetic records for audit/review. Never mutates existing users.
test.skip(process.env.E2E_RUN_ADMIN_LIVE !== '1', 'Live admin lifecycle requires explicit opt-in')
test.use({ trace: 'off', video: 'off', screenshot: 'off' }) // No credential-bearing recordings.

test('live admin lifecycle, database privacy and stale-session revocation', async ({ page, browser }) => {
  test.setTimeout(180_000)
  process.loadEnvFile('backend/.env')
  const admin = JSON.parse(readFileSync('backend/data/admin-login-20260906.json', 'utf8'))
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
  const sb = process.env.XFORM_SUPABASE_URL.replace(/\/$/, '')
  const publicKey = process.env.XFORM_SUPABASE_PUBLISHABLE_KEY
  const serviceKey = process.env.XFORM_SUPABASE_SECRET_KEY || process.env.XFORM_SUPABASE_SERVICE_ROLE_KEY
  const stamp = Date.now()

  async function sbRequest(path, token, options = {}, privileged = false) {
    return fetch(`${sb}${path}`, { ...options, headers: {
      apikey: privileged ? serviceKey : publicKey, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', ...options.headers,
    } })
  }
  async function signInApi(email, password) {
    const response = await sbRequest('/auth/v1/token?grant_type=password', publicKey, { method: 'POST', body: JSON.stringify({ email, password }) })
    expect(response.status, 'Supabase login').toBe(200)
    return response.json()
  }
  async function appRequest(path, token, options = {}) {
    return fetch(`${base}/api/v1${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  }
  async function signInUi(target, portal, email, password) {
    await target.goto(base)
    await target.getByRole('radio', { name: portal, exact: true }).check()
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Password', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Sign in securely' }).click()
  }

  await signInUi(page, 'Admin', admin.email, admin.password)
  await expect(page.getByRole('heading', { name: 'Coach management' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^View / }).first()).toBeVisible()
  const adminSession = await signInApi(admin.email, admin.password)
  const adminToken = adminSession.access_token

  await page.getByRole('button', { name: '+ Onboard coach' }).click()
  const modal = page.getByRole('dialog')
  const coachName = `Rohan Mehta · Admin QA ${stamp}`
  await modal.getByLabel('Full name').fill(coachName)
  await modal.getByLabel('Email', { exact: true }).fill(`admin.qa.coach.${stamp}@example.com`)
  await modal.getByLabel('Professional title').fill('Strength Coach · QA account')
  const creation = page.waitForResponse(response => response.url().endsWith('/api/v1/admin/coaches') && response.request().method() === 'POST')
  await modal.getByRole('button', { name: 'Create coach', exact: true }).click()
  const createdResponse = await creation
  expect(createdResponse.status(), 'Live coach creation').toBe(201)
  const coach = await createdResponse.json()
  expect(coach.audit_recorded).toBe(true)
  expect(coach.email_sent).toBe(false)
  expect(createdResponse.headers()['cache-control']).toBe('private, no-store')
  await expect(modal.getByLabel('Initial password')).toHaveValue(coach.initial_password)
  await modal.getByRole('button', { name: 'Done', exact: true }).click()

  const coachSession = await signInApi(coach.email, coach.initial_password)
  const workspace = await appRequest('/auth/me?portal=coach', coachSession.access_token)
  expect(workspace.status, 'Coach was actually provisioned as coach').toBe(200)
  expect((await workspace.json()).role).toBe('coach')
  expect((await appRequest('/admin/coaches', coachSession.access_token)).status).toBe(403)
  expect((await appRequest('/auth/me?portal=admin', coachSession.access_token)).status).toBe(403)

  // Synthetic client fixture only: Auth creation sends no onboarding email.
  const clientEmail = `admin.qa.client.${stamp}@xform.test`
  const clientPassword = `Qa!9${randomBytes(18).toString('base64url')}`
  const clientResponse = await sbRequest('/auth/v1/admin/users', serviceKey, { method: 'POST', body: JSON.stringify({
    email: clientEmail, password: clientPassword, email_confirm: true,
    user_metadata: { full_name: 'Admin Privacy QA Client', role: 'admin' }, // Untrusted role must be ignored.
  }) }, true)
  expect(clientResponse.status).toBe(200)
  const client = await clientResponse.json()
  const assignment = await sbRequest('/rest/v1/coach_client_assignments', serviceKey, { method: 'POST', body: JSON.stringify({
    coach_id: coach.id, client_id: client.id, assigned_by: admin.id,
  }) }, true)
  expect(assignment.status).toBe(201)
  writeFileSync(`backend/data/admin-qa-${stamp}.json`, JSON.stringify({
    coach: { id: coach.id, name: coachName, email: coach.email, password: coach.initial_password },
    client: { id: client.id, email: clientEmail, password: clientPassword },
  }, null, 2), { mode: 0o600, flag: 'wx' })

  const clientSession = await signInApi(clientEmail, clientPassword)
  const clientWorkspace = await appRequest('/auth/me?portal=client', clientSession.access_token)
  expect(clientWorkspace.status).toBe(200)
  expect((await clientWorkspace.json()).role).toBe('client')
  expect((await appRequest('/admin/coaches', clientSession.access_token)).status).toBe(403)
  const today = new Date().toISOString().slice(0, 10)
  const body = await appRequest(`/client/body-entries/${today}`, clientSession.access_token, { method: 'PUT', body: JSON.stringify({ weight_kg: 81.7, waist_cm: 88.2 }) })
  expect(body.status).toBe(200)

  const coachContext = await browser.newContext()
  const coachPage = await coachContext.newPage()
  await signInUi(coachPage, 'Coach', coach.email, coach.initial_password)
  await expect(coachPage.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  const review = await appRequest(`/coach/clients/${client.id}/review`, coachSession.access_token)
  expect(review.status).toBe(200)
  expect((await review.json()).body_entries[0].weight_kg).toBe(81.7)

  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('button', { name: `View ${coachName}`, exact: true }).click()
  const detail = page.getByRole('region', { name: 'Coach details' })
  await expect(detail.getByRole('cell', { name: /^XP-/ })).toBeVisible()
  await expect(detail).not.toContainText('Admin Privacy QA Client')
  const summary = await appRequest(`/admin/coaches/${coach.id}/clients`, adminToken)
  const summaryRows = (await summary.json()).items
  expect(summaryRows.length).toBe(1)
  expect(Object.keys(summaryRows[0]).sort()).toEqual(['assigned_at', 'client_code', 'ended_at'])

  for (const table of ['clients', 'body_entries', 'weekly_checkins', 'progress_photos', 'profile_photos', 'client_coaching_context', 'coach_private_notes', 'client_targets', 'nutrition_plans', 'training_programs', 'workout_sessions', 'coach_client_assignments', 'notification_deliveries']) {
    const response = await sbRequest(`/rest/v1/${table}?select=*&limit=10`, adminToken)
    expect(response.status, `Admin RLS for ${table}`).toBe(200)
    expect((await response.json()).length, `No admin client data in ${table}`).toBe(0)
  }
  const profiles = await sbRequest('/rest/v1/profiles?role=eq.client&select=id,email,full_name', adminToken)
  expect(await profiles.json()).toEqual([])
  expect((await appRequest('/client/dashboard', adminToken)).status).toBe(403)
  expect((await appRequest(`/coach/clients/${client.id}/review`, adminToken)).status).toBe(403)
  const deniedRpc = await sbRequest('/rest/v1/rpc/admin_list_coaches', clientSession.access_token, { method: 'POST', body: '{}' })
  expect(deniedRpc.status).toBe(403)
  await page.screenshot({ path: 'test-results/admin-live-dashboard.png', fullPage: true })

  await detail.getByRole('button', { name: 'Offboard coach', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm offboarding', exact: true }).click()
  await expect(page.locator('.os-notice')).toContainText('1 client assignment(s) ended; records preserved')
  expect((await appRequest('/auth/me', coachSession.access_token)).status, 'Old coach session must be refused').toBe(403)
  expect((await appRequest(`/coach/clients/${client.id}/review`, coachSession.access_token)).status).toBe(403)
  const directRead = await sbRequest(`/rest/v1/body_entries?client_id=eq.${client.id}&select=*`, coachSession.access_token)
  expect(await directRead.json()).toEqual([])
  const selfReactivate = await sbRequest(`/rest/v1/coaches?id=eq.${coach.id}`, coachSession.access_token, { method: 'PATCH', body: JSON.stringify({ is_active: true }) })
  expect(selfReactivate.status, 'Offboarded coach cannot self-reactivate').toBe(403)
  const retained = await appRequest('/client/body-entries', clientSession.access_token)
  expect(retained.status).toBe(200)
  const retainedRows = await sbRequest(`/rest/v1/body_entries?client_id=eq.${client.id}&select=weight_kg`, clientSession.access_token)
  expect(Number((await retainedRows.json())[0].weight_kg)).toBe(81.7)
  const repeated = await appRequest(`/admin/coaches/${coach.id}/offboard`, adminToken, { method: 'POST' })
  expect((await repeated.json()).released_client_count).toBe(0)
  await coachPage.reload()
  await expect(coachPage.getByRole('heading', { name: 'Workspace unavailable.' })).toBeVisible()
  await coachContext.close()
  console.log('LIVE PASS: staff provisioning, onboarding, minimal roster, RLS privacy, offboarding, stale JWT denial, no self-reactivation, preserved client body entry.')
})
