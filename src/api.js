async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('iptv:unauthorized'))
    const message = await response.json().catch(() => ({}))
    throw new Error(message.error || message.message || `Falha HTTP ${response.status}`)
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: path => request(path, { method: 'DELETE' }),
}
