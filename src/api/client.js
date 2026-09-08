const clientBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1/client').replace(/\/$/, '')
let accessToken = null

export function setAccessToken(token) {
  accessToken = token || null
}

function endpoint(path) {
  if (path.startsWith('/api/')) return path
  return `${clientBase}${path}`
}

async function request(path, options = {}) {
  const { headers, ...requestOptions } = options
  const response = await fetch(endpoint(path), {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload
}

async function optionalRequest(path, options = {}) {
  try {
    return await request(path, options)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function privateObjectUrl(path, label = 'private photo') {
  const response = await fetch(endpoint(path), {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (!response.ok) throw new Error(`Could not load this ${label}.`)
  return URL.createObjectURL(await response.blob())
}

export function resourceUrl(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (clientBase.startsWith('http://') || clientBase.startsWith('https://')) {
    return new URL(path, new URL(clientBase).origin).toString()
  }
  return path
}

export const clientApi = {
  getDashboard: () => request('/dashboard'),
  getBodyEntries: () => request('/body-entries?limit=100'),
  saveBodyEntry: (entry) => request(`/body-entries/${entry.date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight_kg: entry.weight, waist_cm: entry.waist }),
  }),
  getCheckIns: () => request('/check-ins?limit=12'),
  saveCheckIn: (checkIn) => request('/check-ins/current', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkIn),
  }),
  getPhotos: () => request('/progress-photos?limit=100'),
  getPrivatePhotoUrl: (contentPath) => privateObjectUrl(contentPath, 'private progress photo'),
  uploadPhoto: (file, view, capturedOn) => {
    const form = new FormData()
    form.set('file', file)
    form.set('view', view)
    form.set('captured_on', capturedOn)
    return request('/progress-photos', { method: 'POST', body: form })
  },
  getNutritionPlan: (day) => optionalRequest(`/nutrition/active-plan?date=${day}`),
  saveMealAdherence: (mealId, status, day) => request(`/nutrition/meals/${mealId}/adherence`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: day, status }),
  }),
  getRecipeGuide: (mealId) => request('/nutrition/recipe-guides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meal_id: mealId }),
  }),
  getWorkout: (day) => optionalRequest(`/workout-sessions/today?date=${day}`),
  saveWorkout: (sessionId, payload) => request(`/workout-sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getHealthSummary: () => request('/health-summary'),
  getProfile: () => request('/profile'),
  saveProfile: (profile) => request('/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  }),
  getProfilePhoto: () => request('/profile/photo'),
  getPrivateProfilePhotoUrl: (contentPath) => privateObjectUrl(contentPath, 'private profile photo'),
  uploadProfilePhoto: (file) => {
    const form = new FormData()
    form.set('file', file)
    return request('/profile/photo', { method: 'POST', body: form })
  },
}
