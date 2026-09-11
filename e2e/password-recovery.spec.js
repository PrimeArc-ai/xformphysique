import { test, expect } from '@playwright/test'

async function isolate(page, role, { rejectUpdate = false, rejectEmail = false } = {}) {
  const calls = [], unexpected = []
  const user = { id: `recovery-${role}`, email: `${role}@example.test`, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} }
  await page.route('**/*', route => {
    const u = new URL(route.request().url())
    if (!['localhost','127.0.0.1'].includes(u.hostname) || u.pathname.startsWith('/api/')) { unexpected.push(u.pathname); return route.abort() }
    return route.continue()
  })
  await page.route('**/auth/v1/**', route => {
    const req = route.request(), url = new URL(req.url())
    calls.push({ path: url.pathname, method: req.method(), body: req.postDataJSON() })
    if (url.pathname.endsWith('/recover')) return route.fulfill(rejectEmail ? { status: 429, json: { msg: 'Email rate limit exceeded' } } : { json: {} })
    if (req.method() === 'PUT') return route.fulfill(rejectUpdate ? { status: 401, json: { msg: 'Session expired. Request a new reset link.' } } : { json: user })
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 })
    return route.fulfill({ json: user })
  })
  await page.route('**/api/v1/auth/me*', route => { calls.push({ path: '/api/v1/auth/me' }); return route.fulfill({ json: { ...user, role, first_name: role, full_name: 'Recovery Test' } }) })
  return { calls, unexpected }
}

for (const role of ['client','coach','admin']) {
  test(`${role}: forgot password requests email proof without changing a password`, async ({ page }) => {
    const proof = await isolate(page, role)
    await page.goto('/')
    await page.getByRole('radio', { name: role, exact: false }).check()
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await page.getByLabel('Email', { exact: true }).fill(`${role}@example.test`)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('status')).toContainText('If an account exists')
    expect(proof.calls.filter(c => c.path.endsWith('/recover'))).toHaveLength(1)
    expect(proof.calls.some(c => c.method === 'PUT' || c.path === '/api/v1/auth/me')).toBeFalsy()
    expect(proof.unexpected).toEqual([])
  })
  test(`${role}: recovery link validates confirmation, persists during reload and returns to sign-in`, async ({ page }) => {
    const proof = await isolate(page, role)
    await page.goto('/#access_token=recovery-test-token&refresh_token=recovery-refresh&expires_in=3600&token_type=bearer&type=recovery')
    await expect(page.getByRole('heading', { name: 'Set a new password.' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Set a new password.' })).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill('SyntheticOnly!123')
    await page.getByLabel('Confirm password', { exact: true }).fill('MismatchOnly!123')
    await page.getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
    expect(proof.calls.some(c => c.method === 'PUT')).toBeFalsy()
    await page.getByLabel('Confirm password', { exact: true }).fill('SyntheticOnly!123')
    await page.getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Password updated')
    expect(proof.calls.filter(c => c.method === 'PUT')).toHaveLength(1)
    expect(proof.calls.find(c => c.method === 'PUT').body).toMatchObject({ password: 'SyntheticOnly!123' })
    expect(proof.calls.some(c => c.path === '/api/v1/auth/me')).toBeFalsy()
    expect(await page.evaluate(() => sessionStorage.getItem('xform.recovery-user'))).toBeNull()
    expect(proof.unexpected).toEqual([])
  })
}

test('expired or used email link stays out of all workspaces', async ({ page }) => {
  const proof = await isolate(page, 'client')
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('expired or already been used')
  await expect(page.getByRole('heading', { name: 'Set a new password.' })).toHaveCount(0)
  expect(proof.calls.some(c => c.method === 'PUT' || c.path === '/api/v1/auth/me')).toBeFalsy()
})

test('provider rejection never claims reset succeeded', async ({ page }) => {
  await isolate(page, 'client', { rejectUpdate: true })
  await page.goto('/#access_token=recovery-test-token&refresh_token=recovery-refresh&expires_in=3600&token_type=bearer&type=recovery')
  await page.getByLabel('New password', { exact: true }).fill('SyntheticOnly!123')
  await page.getByLabel('Confirm password', { exact: true }).fill('SyntheticOnly!123')
  await page.getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Session expired')
  await expect(page.getByText('Password updated.', { exact: false })).toHaveCount(0)
})

test('email provider rate limit is explicit and retry remains available', async ({ page }) => {
  await isolate(page, 'client', { rejectEmail: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill('client@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('alert')).toContainText('rate limit')
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeEnabled()
})

test('correcting the email clears the earlier confirmation and allows a new request', async ({ page }) => {
  const proof = await isolate(page, 'client')
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill('typo@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists')
  await page.getByLabel('Email', { exact: true }).fill('client@example.test')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  const requests = proof.calls.filter(c => c.path.endsWith('/recover'))
  expect(requests.map(c => c.body.email)).toEqual(['typo@example.test', 'client@example.test'])
  expect(proof.unexpected).toEqual([])
})

test('a reset link can be resent after the cooldown without leaving the form', async ({ page }) => {
  const proof = await isolate(page, 'coach')
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill('coach@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists')
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled()
  await page.clock.runFor(60_000)
  await page.getByRole('button', { name: 'Resend reset link', exact: true }).click()
  expect(proof.calls.filter(c => c.path.endsWith('/recover'))).toHaveLength(2)
  expect(proof.calls.some(c => c.method === 'PUT')).toBeFalsy()
  expect(proof.unexpected).toEqual([])
})

test('a recovery callback without a session explains how to request a fresh link', async ({ page }) => {
  const proof = await isolate(page, 'client')
  await page.goto('/#type=recovery')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Request a new link')
  expect(proof.calls.some(c => c.method === 'PUT' || c.path === '/api/v1/auth/me')).toBeFalsy()
  expect(new URL(page.url()).hash).toBe('')
})
