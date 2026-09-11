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
  saveFeedback: (clientId, checkinId, payload, token) => request(`/coach/clients/${clientId}/check-ins/${checkinId}/feedback`, token, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  listClients: (accessToken) => request('/coach/clients', accessToken),
  getClientReview: (clientId, accessToken) => request(`/coach/clients/${clientId}/review`, accessToken),
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
