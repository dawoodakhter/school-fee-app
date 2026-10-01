// All talking to the backend goes through this file.
const TOKEN_KEY = 'fee_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// api('/classes')  or  api('/payments', { method: 'POST', body: { ... } })
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token

  let res
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // the answer had no body
  }

  if (!res.ok) {
    // a saved login that has expired: go back to the login screen
    if (res.status === 401 && token) {
      clearToken()
      window.dispatchEvent(new Event('auth-expired'))
    }
    throw new ApiError((data && data.message) || 'Something went wrong', res.status)
  }
  return data
}
