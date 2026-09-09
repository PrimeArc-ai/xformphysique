import { test, expect } from '@playwright/test'

const coach = { id: '12345678-1234-4234-8234-123456789012', full_name: 'Aisha Kapoor', email: 'aisha@example.com', professional_title: 'Strength Coach', is_active: true, created_at: '2026-09-06T12:00:00Z', active_client_count: 1 }

async function mockApp(page, role = 'admin') {
  let roster = [{ ...coach }]
  await page.route('**/auth/v1/**', async route => {
    const user = { id: 'admin-id', email: 'admin@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} }
    const payload = route.request().url().includes('/token') ? { access_token: 'fake-jwt', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, user } : user
    await route.fulfill({ json: payload })
  })
  await page.route('**/api/v1/auth/me*', route => {
    const portal = new URL(route.request().url()).searchParams.get('portal')
    return route.fulfill(portal && portal !== role
      ? { status: 403, json: { error: { message: 'This account cannot access the selected portal.' } } }
      : { json: { id: 'admin-id', full_name: 'Navaneet Deshpande', first_name: 'Navaneet', email: 'admin@example.com', role } })
  })
  await page.route('**/api/v1/admin/**', async route => {
    const url = route.request().url()
    if (url.endsWith('/reset-password')) return route.fulfill({ json: { id: coach.id, full_name: coach.full_name, email: coach.email, initial_password: 'ResetMock!NotReal123', email_sent: false, audit_recorded: true } })
    if (url.endsWith('/offboard')) { roster = roster.map(item => ({ ...item, is_active: false, active_client_count: 0 })); return route.fulfill({ json: { id: coach.id, is_active: false, released_client_count: 1 } }) }
    if (url.endsWith('/clients')) return route.fulfill({ json: { items: [{ client_code: 'XP-0005', assigned_at: '2026-09-06T12:00:00Z', ended_at: null }] } })
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON()
      roster.push({ ...coach, ...data, id: 'new-coach', active_client_count: 0 })
      return route.fulfill({ status: 201, json: { ...data, id: 'new-coach', initial_password: 'MockOnly!NotReal123', email_sent: false, audit_recorded: true } })
    }
    return route.fulfill({ json: { items: roster } })
  })
  await page.goto('/')
}

async function login(page, portal = 'Admin') {
  await page.getByRole('radio', { name: portal, exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Password', { exact: true }).fill('MockPassword!123')
  await page.getByRole('button', { name: 'Sign In' }).click()
}

test('portal mismatch stays at login and never opens an admin workspace', async ({ page }) => {
  await mockApp(page, 'client'); await login(page)
  await expect(page.getByRole('alert')).toContainText('cannot access the selected portal')
  await expect(page.getByRole('heading', { name: 'Coach management' })).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(3)
})

test('admin can inspect only minimal client assignments', async ({ page }) => {
  await mockApp(page); await login(page)
  await expect(page.getByRole('heading', { name: 'Coach management' })).toBeVisible()
  await page.getByRole('button', { name: 'View Aisha Kapoor' }).click()
  const detail = page.getByRole('region', { name: 'Coach details' })
  await expect(detail.getByRole('cell', { name: 'XP-0005', exact: true })).toBeVisible()
  await expect(detail.getByRole('columnheader')).toHaveText(['Client code', 'Assigned', 'Status', 'Ended'])
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
})

test('coach onboarding shows credentials once and no email claim', async ({ page }) => {
  await mockApp(page); await login(page)
  await page.getByRole('button', { name: '+ Onboard coach' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Full name').fill('Rohan Mehta')
  await dialog.getByLabel('Email', { exact: true }).fill('rohan@example.com')
  await dialog.getByRole('button', { name: 'Create coach', exact: true }).click()
  await expect(dialog.getByLabel('Initial password')).toHaveValue('MockOnly!NotReal123')
  await expect(dialog).toContainText('No email has been sent.')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View Rohan Mehta' })).toBeVisible()
})

test('password reset keeps the email and shows a new password once', async ({ page }) => {
  await mockApp(page); await login(page)
  await page.getByRole('button', { name: 'View Aisha Kapoor' }).click()
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('aisha@example.com')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await page.getByRole('button', { name: 'Generate new password' }).click()
  await expect(dialog.getByLabel('Login email')).toHaveValue('aisha@example.com')
  await expect(dialog.getByLabel('New password')).toHaveValue('ResetMock!NotReal123')
  await expect(dialog).toContainText('No email has been sent.')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('offboarding requires confirmation and updates status', async ({ page }) => {
  await mockApp(page); await login(page)
  await page.getByRole('button', { name: 'View Aisha Kapoor' }).click()
  await page.getByRole('button', { name: 'Offboard coach', exact: true }).click()
  await page.getByRole('button', { name: 'Keep coach active' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Offboard coach', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm offboarding' }).click()
  await expect(page.locator('.os-notice[role="status"]')).toContainText('records preserved')
  await expect(page.getByRole('cell', { name: 'Offboarded', exact: true })).toBeVisible()
})

test('mobile admin page stays within viewport and retains sign out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApp(page); await login(page)
  await expect(page.getByRole('heading', { name: 'Coach management' })).toBeVisible()
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })) }))
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width)
  await expect(page.locator('.admin-mobile-account').getByRole('button', { name: 'Sign out' })).toBeVisible()
})
