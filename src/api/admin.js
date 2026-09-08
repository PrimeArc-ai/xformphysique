const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1/client').replace(/\/client$/, '')

async function request(path, token, options = {}) {
  const response = await fetch(`${apiBase}/admin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok) {
    const fields = Object.entries(payload?.error?.fields || {}).map(([field, message]) => `${field}: ${message}`).join(' ')
    throw new Error(fields || payload?.error?.message || 'The admin workspace is unavailable.')
  }
  return payload
}

export const adminApi = {
  coaches: token => request('/coaches', token),
  clients: (id, token) => request(`/coaches/${id}/clients`, token),
  createCoach: (data, token) => request('/coaches', token, { method: 'POST', body: JSON.stringify(data) }),
  offboardCoach: (id, token) => request(`/coaches/${id}/offboard`, token, { method: 'POST' }),
}
