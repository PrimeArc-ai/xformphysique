import { expect, test } from '@playwright/test'

const coach = {
  portal: 'Coach',
  email: required('E2E_COACH_EMAIL'),
  password: required('E2E_COACH_PASSWORD'),
}

const client = {
  portal: 'Client',
  name: required('E2E_CLIENT_NAME'),
  email: required('E2E_CLIENT_EMAIL'),
  password: required('E2E_CLIENT_PASSWORD'),
}

const supabase = {
  url: required('E2E_SUPABASE_URL'),
  adminKey: required('E2E_SUPABASE_ADMIN_KEY'),
}

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQEpMEAAB/AEKRt5ikAAAAAElFTkSuQmCC',
  'base64',
)

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set before running the live journey test.`)
  return value
}

async function signIn(page, identity) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await page.getByRole('radio', { name: identity.portal, exact: true }).check()
  await page.getByLabel('Email').fill(identity.email)
  await page.getByLabel('Password').fill(identity.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
}

async function activateInvitedClient(clientId) {
  const response = await fetch(`${supabase.url}/auth/v1/admin/users/${clientId}`, {
    method: 'PUT',
    headers: {
      apikey: supabase.adminKey,
      Authorization: `Bearer ${supabase.adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: client.password,
      email_confirm: true,
      user_metadata: {
        full_name: client.name,
        first_name: client.name.split(' ')[0],
        xform_invitation: true,
        xform_password_set: true,
      },
    }),
  })
  if (!response.ok) throw new Error(`Unable to activate the invited test client (${response.status}).`)
}

test('coach onboarding and client-to-coach progress review', async ({ page }) => {
  await signIn(page, coach)
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()

  const invitationResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/coach/clients')
    && response.request().method() === 'POST'
  ), { timeout: 25_000 })
  await page.getByRole('button', { name: 'New client' }).first().click()
  await expect(page.getByRole('heading', { name: 'Create client workspace' })).toBeVisible()
  await page.getByLabel('Full name').fill(client.name)
  await page.getByLabel('Email').fill(client.email)
  await page.getByLabel('Primary goal').selectOption('body_recomposition')
  await page.getByLabel('Check-in day').selectOption('sunday')
  await page.getByLabel('Target weight (kg)').fill('70.0')
  await page.getByLabel('Timezone').fill('Asia/Kolkata')
  await page.getByLabel('Dietary preferences').fill('High-protein vegetarian weekdays')
  await page.getByLabel('Allergies, restrictions, injuries').fill('Monitor right knee comfort after long walks')
  await page.getByLabel('Private coach note').fill('Pilot account: confirm first check-in during the next review.')
  await page.getByRole('button', { name: /Create & email invite/ }).click()
  const invitation = await invitationResponse
  if (invitation.status() === 201) {
    const invitedClient = await invitation.json()
    expect(invitedClient.full_name).toBe(client.name)
    expect(invitedClient.invitation_sent).toBe(true)
    await activateInvitedClient(invitedClient.id)
    await expect(page.getByText(`${client.name} was created and sent a secure account-setup invitation.`)).toBeVisible()
  } else {
    // A rerun continues with the same authorised account after its first real invitation.
    expect([400, 422]).toContain(invitation.status())
    const rejection = await invitation.json()
    expect(rejection.error.code).toBe('supabase_validation_failed')
    await page.getByRole('button', { name: 'Close client onboarding' }).click()
  }
  await signOut(page)

  await signIn(page, client)
  await expect(page.getByRole('heading', { name: new RegExp(`Hello, ${client.name.split(' ')[0]}`) })).toBeVisible()

  await page.getByRole('button', { name: 'Nutrition', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Nutrition plan pending.' })).toBeVisible()
  await page.getByRole('button', { name: 'Workout', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Workout plan pending.' })).toBeVisible()

  await page.getByRole('button', { name: 'Profile', exact: true }).first().click()
  await page.getByRole('spinbutton', { name: 'Target weight kg' }).fill('69.5')
  await page.getByLabel('Dietary preferences').fill('Vegetarian weekdays; high protein')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved to your planning record.')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'navaneet-avatar.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await expect(page.getByText('Profile photo saved privately.')).toBeVisible()

  await page.getByRole('button', { name: 'Body Tracker', exact: true }).first().click()
  await page.getByPlaceholder('68.4').fill('72.4')
  await page.getByPlaceholder('71').fill('84.2')
  await page.getByRole('button', { name: 'Save body progress' }).click()
  await expect(page.getByText('Body progress saved to your XForm record.')).toBeVisible()

  await page.getByRole('button', { name: 'Check-ins', exact: true }).first().click()
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  await page.getByPlaceholder('Training, nutrition, routine, confidence…').fill('Completed three strength sessions and kept meals consistent.')
  await page.getByPlaceholder('A concern, barrier, or question…').fill('Right knee is comfortable, but I will keep the walking volume gradual.')
  await page.getByRole('button', { name: 'Submit check-in' }).click()
  await expect(page.getByText('Check-in saved to your private coaching record.')).toBeVisible()

  await page.getByRole('button', { name: 'Progress Photos', exact: true }).first().click()
  const existingFrontPhoto = page.getByRole('img', { name: 'front progress upload' })
  if (await existingFrontPhoto.count()) {
    await expect(existingFrontPhoto.first()).toBeVisible()
  } else {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'navaneet-front.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    })
    await expect(page.getByText('Front photo saved to private storage.')).toBeVisible()
  }
  await signOut(page)

  await signIn(page, coach)
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'aisha-avatar.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await expect(page.getByText('Profile photo saved privately.')).toBeVisible()

  await page.getByRole('button', { name: 'Clients', exact: true }).first().click()
  await page.getByPlaceholder('Search clients or ID').fill(client.name)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('heading', { name: client.name })).toBeVisible()
  await expect(page.getByText('72.4 kg').first()).toBeVisible()
  await expect(page.getByText(/Completed three strength sessions/)).toBeVisible()
  await expect(page.getByRole('img', { name: /front progress photo/i }).first()).toBeVisible()

  await page.getByLabel('Coach note').fill('Strong first week. Keep the same meal structure and steady training rhythm.')
  await page.getByLabel('Training considerations').fill('Monitor right knee comfort\nKeep walking volume gradual')
  await page.getByLabel('Safety boundary').fill('Pause training and seek appropriate professional advice if knee pain develops.')
  await page.getByRole('button', { name: 'Save client guidance' }).click()
  await expect(page.getByText(`Client-visible guidance saved for ${client.name}.`)).toBeVisible()
  await signOut(page)

  await signIn(page, client)
  await page.getByRole('button', { name: 'Health Summary', exact: true }).first().click()
  await expect(page.getByText('Strong first week. Keep the same meal structure and steady training rhythm.')).toBeVisible()
  await expect(page.getByText(/Monitor right knee comfort/).last()).toBeVisible()
  await expect(page.getByText(/Pause training and seek appropriate professional advice/)).toBeVisible()
})
