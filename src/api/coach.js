const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1/client').replace(/\/client$/, '')

function endpoint(path) {
  if (path.startsWith('/api/')) return path
  return `${apiBase}${path}`
}

async function request(path, accessToken, options = {}) {
  const { headers, ...requestOptions } = options
  const response = await fetch(endpoint(path), {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
  })
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status})`)
  return payload
}

async function privateObjectUrl(path, accessToken) {
  const response = await fetch(endpoint(path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Could not load this protected photo.')
  return URL.createObjectURL(await response.blob())
}

export const coachApi = {
  getCheckIns: (clientId, token, offset = 0) => request(`/coach/clients/${clientId}/check-ins?offset=${offset}`, token),
  getPhotos: (clientId, token, offset = 0) => request(`/coach/clients/${clientId}/progress-photos?offset=${offset}`, token),
  deletePhoto: (clientId, photoId, token) => request(`/coach/clients/${clientId}/progress-photos/${photoId}`, token, { method: 'DELETE' }),
  getWorkoutHistory: (clientId, token) => request(`/coach/clients/${clientId}/workout-history`, token),
  getWorkoutProgram: (clientId, token) => request(`/coach/clients/${clientId}/workout-program`, token),
  saveWorkoutProgramDraft: (clientId, payload, token) => request(`/coach/clients/${clientId}/workout-program/draft`, token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  publishWorkoutProgram: (clientId, publishKey, program, token) => request(`/coach/clients/${clientId}/workout-program/publish`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish_key: publishKey, program }),
  }),
  getNutritionPlan: (clientId, token) => request(`/coach/clients/${clientId}/nutrition-plan`, token),
  saveNutritionPlanDraft: (clientId, plan, token) => request(`/coach/clients/${clientId}/nutrition-plan/draft`, token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan),
  }),
  publishNutritionPlan: (clientId, publishKey, plan, token) => request(`/coach/clients/${clientId}/nutrition-plan/publish`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish_key: publishKey, plan }),
  }),
  saveFeedback: (clientId, checkinId, payload, token) => request(`/coach/clients/${clientId}/check-ins/${checkinId}/feedback`, token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  listClients: (accessToken) => request('/coach/clients', accessToken),
  getClientReview: (clientId, accessToken) => request(`/coach/clients/${clientId}/review`, accessToken),
  getFoundationIntake: (clientId, accessToken) => request(`/coach/clients/${clientId}/foundation-intake`, accessToken),
  createPrivateNote: (clientId, payload, accessToken) => request(`/coach/clients/${clientId}/private-notes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateClientSetup: (clientId, payload, accessToken) => request(`/coach/clients/${clientId}/setup`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getLibraries: (accessToken) => request('/coach/libraries', accessToken),
  createFoodLibraryItem: (payload, accessToken) => request('/coach/libraries/food', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateFoodLibraryItem: (itemId, payload, accessToken) => request(`/coach/libraries/food/${itemId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  createExerciseLibraryItem: (payload, accessToken) => request('/coach/libraries/exercises', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateExerciseLibraryItem: (itemId, payload, accessToken) => request(`/coach/libraries/exercises/${itemId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getSettings: (accessToken) => request('/coach/settings', accessToken),
  saveSettings: (payload, accessToken) => request('/coach/settings', accessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  listAuditEvents: (accessToken, limit = 50, offset = 0) => request(`/coach/audit-events?limit=${limit}&offset=${offset}`, accessToken),
  getPrivatePhotoUrl: (contentPath, accessToken) => privateObjectUrl(contentPath, accessToken),
  updateClientCoachingContext: (clientId, payload, accessToken) => request(`/coach/clients/${clientId}/coaching-context`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  createClient: (payload, accessToken) => request('/coach/clients', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getProfilePhoto: (accessToken) => request('/coach/profile/photo', accessToken),
  getPrivateProfilePhotoUrl: (contentPath, accessToken) => privateObjectUrl(contentPath, accessToken),
  uploadProfilePhoto: (file, accessToken) => {
    const form = new FormData()
    form.set('file', file)
    return request('/coach/profile/photo', accessToken, { method: 'POST', body: form })
  },
}
