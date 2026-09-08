import { test, expect } from '@playwright/test'

const unavailable = 'XForm server is temporarily unavailable. Please try signing in again shortly.'
const invalidResponse = 'XForm returned an invalid response. Please try signing in again.'

async function prepareLogin(page, workspaceResponse) {
  // Every remote request is isolated from live accounts and services.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })
  const user = { id: 'login-test-coach', email: 'coach@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} }
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/token')
    ? { access_token: 'mock-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user }
    : user }))
  await page.route('**/api/v1/auth/me*', workspaceResponse)
  await page.goto('/')
  await page.getByRole('radio', { name: 'Coach', exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('MockOnly!123')
}

for (const scenario of [
  { name: 'empty proxy 502', response: { status: 502, contentType: 'text/plain', body: '' }, message: unavailable },
  { name: 'HTML proxy error', response: { status: 503, contentType: 'text/html', body: '<h1>Unavailable</h1>' }, message: unavailable },
  { name: 'truncated JSON error', response: { status: 500, contentType: 'application/json', body: '{"error":' }, message: unavailable },
  { name: 'empty successful response', response: { status: 200, body: '' }, message: invalidResponse },
  { name: 'portal mismatch', response: { status: 403, json: { error: { message: 'This account cannot access the selected portal.' } } }, message: 'This account cannot access the selected portal.' },
]) {
  test(`login handles ${scenario.name} without opening a workspace`, async ({ page }) => {
    await prepareLogin(page, route => route.fulfill(scenario.response))
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('alert')).toHaveText(scenario.message)
    await expect(page.getByRole('heading', { name: 'Command Center' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled()
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => /^sb-.*-auth-token$/.test(key)))).toEqual([])
  })
}

test('network failure allows a successful retry after the server returns', async ({ page }) => {
  let available = false
  await prepareLogin(page, route => available
    ? route.fulfill({ json: { id: 'login-test-coach', role: 'coach', full_name: 'Test Coach', first_name: 'Test', email: 'coach@example.com' } })
    : route.abort('connectionrefused'))
  await page.route('**/api/v1/coach/clients', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/v1/coach/profile/photo', route => route.fulfill({ json: { photo: null } }))
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to reach the XForm server. Check your connection and try again.')
  available = true
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
})
