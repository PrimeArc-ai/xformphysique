export const metrics = ['energy','sleep_quality','hunger','digestion','stress','recovery','strength','workout_performance','motivation','adherence','overall_wellbeing']
export const tinyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S0AAAAASUVORK5CYII=', 'base64')
export function progressFixture() {
  return {
    calls: [], errors: [],
    profile: { id: 'client-1', client_id: 'client-1', full_name: 'Navaneet Deshpande', first_name: 'Navaneet', name: 'Navaneet Deshpande', client_code: 'XP-0012', email: 'navaneet@example.test', primary_goal: 'strength', check_in_day: 'sunday', timezone: 'Asia/Kolkata', dietary_preferences: '', allergies_injuries: '', latest_weight_kg: 78, latest_entry_date: '2026-09-09', needs_attention: false },
    schedule: { timezone: 'Asia/Kolkata', today: '2026-09-09', period_start: '2026-09-07', due_on: '2026-09-13', next_due_on: '2026-09-20', previous_due_on: '2026-09-06', current_status: 'upcoming', day_of_week: 'sunday', missed_count: 1, consecutive_missed: 0 },
    checkins: [{ id: 'legacy-checkin', period_start: '2026-08-31', submitted_at: '2026-09-06T12:00:00Z', energy_score: 4, sleep_score: 3, sentiment: 'good', observation: 'Walked consistently', concern: null, questionnaire_version: 1, ratings: {} }],
    photos: ['2026-08-31','2026-09-07'].flatMap((week, i) => ['front','back','side','front_double_bicep','back_double_bicep'].map(view => ({ id: `${i}-${view}`, view, period_start: week, captured_on: week, uploaded_at: `${week}T12:00:00Z`, file_name: 'progress.webp' }))),
    workout: { session_id: 'session-1', date: '2026-09-09', title: 'Lower body strength', week_label: 'Week 2', coach_note: 'Leave two reps in reserve.', status: 'ready', estimated_duration_minutes: 45, exercises: ['Goblet squat', 'Romanian deadlift'].map((name, i) => ({ plan_exercise_id: `exercise-${i}`, name, prescription: { sets: 2, reps: '8–10', rest_seconds: 90 }, sets: [] })) },
    nutrition: { plan_id: 'plan-1', date: '2026-09-09', name: 'Strength nutrition', restrictions: [], daily_targets: { calories_kcal: 2200, protein_g: 140, carbs_g: 260, fat_g: 70 }, meals: [{ id: 'meal-1', time: '08:00', name: 'Yoghurt oats bowl', ingredients: [{ name: 'Greek yoghurt', quantity: 200, unit: 'g' }, { name: 'Oats', quantity: 60, unit: 'g' }], preparation: 'Combine oats and yoghurt; chill overnight.', coach_instructions: 'Eat before your morning session.', calories_kcal: 420, macros: { protein_g: 30, carbs_g: 50, fat_g: 11 }, adherence_status: 'pending' }] },
  }
}

function history(workout) {
  return { items: workout.exercises.filter(e => e.sets.length).map(e => {
    const volume = e.sets.reduce((n, s) => n + s.reps * s.load_kg, 0), reps = e.sets.reduce((n, s) => n+s.reps, 0), load = Math.max(...e.sets.map(s => s.load_kg))
    return { id: e.plan_exercise_id, name: e.name, weeks: [{ week: '2026-09-07', load_kg: load, volume_kg: volume, reps, training_days: 1 }], trends: { load_kg: 'insufficient_data', volume_kg: 'insufficient_data', reps: 'insufficient_data' }, best_set: { ...e.sets[0], date: workout.date }, training_days: 1, history: [{ session_id: workout.session_id, exercise_id: e.plan_exercise_id, date: workout.date, status: workout.status, sets: e.sets }] }
  }) }
}

export async function mockProgress(page, role, state) {
  await page.clock.setFixedTime(new Date('2026-09-09T10:00:00Z'))
  page.on('pageerror', e => state.errors.push(e.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname.startsWith('/api/')) { state.errors.push(`Unexpected ${url.pathname}`); return route.abort() }
    return route.continue()
  })
  const user = { id: role === 'client' ? 'client-1' : 'coach-1', email: `${role}@example.test`, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} }
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: 'mock-progress-jwt', refresh_token: 'mock-refresh', expires_in: 3600, token_type: 'bearer', user } : user }))
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
    const jsonBody = req.headers()['content-type']?.includes('application/json') ? req.postDataJSON() : null
    state.calls.push({ path, method, body: jsonBody })
    const json = data => route.fulfill({ json: data })
    if (path === '/api/v1/auth/me') return json({ ...user, role, full_name: role === 'client' ? state.profile.name : 'Aisha Kapoor', first_name: 'Navaneet' })
    if (path.endsWith('/profile/photo')) return json({ photo: null })
    if (path.endsWith('/dashboard')) return json({ client: { first_name: 'Navaneet' }, body: { current_weight_kg: 78, trend: [], target_progress_percent: null }, check_ins: { count: state.checkins.length }, training_volume: { total_kg: 0, daily_kg: [], sessions: 0, training_days: 0, best_day_kg: 0 } })
    if (path.endsWith('/body-entries')) return json({ items: [] })
    if (path.endsWith('/check-ins/current')) { const saved = { ...jsonBody, id: 'current-checkin', period_start: state.schedule.period_start, submitted_at: '2026-09-09T10:00:00Z' }; state.checkins = [saved, ...state.checkins.filter(c => c.id !== saved.id)]; state.schedule.current_status = 'submitted'; return json(saved) }
    if (path.endsWith('/feedback')) { const entry = state.checkins.find(c => path.includes(`/${c.id}/`)); entry.feedback = { ...jsonBody, updated_at: '2026-09-09T11:00:00Z', checkin_id: entry.id }; return json(entry.feedback) }
    if (path.endsWith('/check-ins')) return json({ items: state.checkins, schedule: state.schedule, has_more: false })
    if (path.endsWith('/content') && path.includes('/progress-photos/')) { const id = path.split('/').at(-2); return state.photos.some(p => p.id === id) ? route.fulfill({ contentType: 'image/png', body: tinyImage }) : route.fulfill({ status: 404, json: { error: { message: 'Photo not found' } } }) }
    if (method === 'DELETE' && path.includes('/progress-photos/')) { const id = path.split('/').at(-1); state.photos = state.photos.filter(p => p.id !== id); return json({ id, deleted: true, cleanup_pending: false }) }
    if (path.endsWith('/progress-photos')) {
      if (method === 'POST') {
        const body = req.postDataBuffer().toString('utf8')
        const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1]
        const view = field('view'), captured_on = field('captured_on'), oldId = field('replace_photo_id')
        if (oldId) state.photos = state.photos.filter(p => p.id !== oldId)
        const photo = { id: `upload-${state.calls.length}`, view, captured_on, period_start: captured_on < '2026-09-07' ? '2026-08-31' : '2026-09-07', uploaded_at: '2026-09-09T10:00:00Z', file_name: 'progress.webp' }
        state.photos.unshift(photo)
        return json({ ...photo, content_url: `/api/v1/client/progress-photos/${photo.id}/content` })
      }
      return json({ items: state.photos.map(p => ({ ...p, content_url: `${role === 'coach' ? '/api/v1/coach/clients/client-1' : '/api/v1/client'}/progress-photos/${p.id}/content` })), has_more: false })
    }
    if (path.endsWith('/nutrition/active-plan')) return json(state.nutrition)
    if (path.endsWith('/adherence')) { state.nutrition.meals[0].adherence_status = jsonBody.status; return json(jsonBody) }
    if (path.endsWith('/recipe-guides')) return json({ guide: 'Combine 200 g yoghurt with 60 g oats.', meal_name: 'Yoghurt oats bowl' })
    if (path.endsWith('/workout-sessions/today')) return json(state.workout)
    if (path.endsWith('/workout-sessions/session-1')) { state.workout.status = jsonBody.status; state.workout.note = jsonBody.note; state.workout.exercises.forEach(e => { e.sets = jsonBody.exercise_logs.find(l => l.plan_exercise_id === e.plan_exercise_id)?.sets || [] }); return json({ session_id: 'session-1', status: state.workout.status }) }
    if (path.endsWith('/workout-history')) return json(history(state.workout))
    if (path.endsWith('/health-summary')) return json({ wellbeing: {}, planning_context: {} })
    if (path.endsWith('/profile')) return json(state.profile)
    if (path === '/api/v1/coach/clients') return json({ items: [{ ...state.profile, check_in_schedule: state.schedule }] })
    if (path.endsWith('/review')) return json({ client: state.profile, body_entries: [], checkins: state.checkins, progress_photos: [], photo_count: state.photos.length, coaching_context: { client_visible_coach_note: '', training_considerations: [], safety_notice: '' }, private_notes: [] })
    state.errors.push(`Unhandled ${method} ${path}`)
    return route.fulfill({ status: 501, json: { error: { message: 'Unmocked request' } } })
  })
  await page.goto('/')
}

export async function loginProgress(page, role = 'Client') {
  await page.getByRole('radio', { name: role, exact: true }).check()
  await page.getByLabel('Email', { exact: true }).fill(`${role.toLowerCase()}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly!123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}
