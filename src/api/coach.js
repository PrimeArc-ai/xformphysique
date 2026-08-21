const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1/client').replace(/\/client$/, '')

async function request(path, accessToken, options = {}) {
  const { headers, ...requestOptions } = options
  const response = await fetch(`${apiBase}${path}`, {
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

export const coachApi = {
  createClient: (payload, accessToken) => request('/coach/clients', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
}
