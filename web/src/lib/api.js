import axios from 'axios'

const TOKEN_KEY = 'vnc_token'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8473/api',
  headers: { Accept: 'application/json' },
  timeout: 30000,
})

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked: the session just won't survive a reload
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null)
      window.dispatchEvent(new CustomEvent('session-expired'))
    }
    return Promise.reject(error)
  },
)

/** Turns any request failure into a short, user-facing sentence. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (axios.isCancel(error)) return null
  if (!error?.response) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Check your connection and try again.'
    }
    if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.'
    return "We couldn't reach the server. Please try again in a moment."
  }
  const { status, data } = error.response
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return data?.message || "You don't have permission to do that."
  if (status === 404) return data?.message && data.message !== 'Not Found.' ? data.message : 'That item no longer exists.'
  if (status === 422) return data?.message || 'Please fix the highlighted fields.'
  if (status === 429) return data?.message || 'Too many requests. Please wait a minute and try again.'
  return fallback
}

/** Field errors from a 422 response, as { field: 'first message' }. */
export function fieldErrors(error) {
  if (error?.response?.status !== 422) return {}
  const errors = error.response.data?.errors ?? {}
  return Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages[0]]))
}
