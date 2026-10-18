const TOKEN_KEY = 'vnc_token'
const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8473/api'
const DEFAULT_TIMEOUT = 30000

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

/** A request error. `response` ({ status, data }) is set when the server answered; `code` says why when it didn't. */
class RequestError extends Error {
  constructor(message, code, response) {
    super(message)
    this.name = code === 'ERR_CANCELED' ? 'CanceledError' : 'RequestError'
    this.code = code
    this.response = response
  }
}

export function isCancel(error) {
  return error?.code === 'ERR_CANCELED'
}

function buildUrl(path, params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) query.append(key, value)
  }
  const qs = query.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

function parseBody(xhr, responseType) {
  if (responseType === 'blob') return xhr.response
  const text = xhr.responseText
  if (!text) return ''
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Sends a request with XMLHttpRequest (for upload progress) and resolves to { data, status } on a 2xx answer.
 * Options: params, signal, timeout (ms), responseType ('blob'), onUploadProgress.
 */
function request(method, path, body, { params, signal, timeout = DEFAULT_TIMEOUT, responseType, onUploadProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestError('canceled', 'ERR_CANCELED'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open(method, buildUrl(path, params))
    xhr.timeout = timeout
    if (responseType === 'blob') xhr.responseType = 'blob'
    xhr.setRequestHeader('Accept', 'application/json')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    let payload = body
    if (body != null && !(body instanceof FormData)) {
      xhr.setRequestHeader('Content-Type', 'application/json')
      payload = JSON.stringify(body)
    }
    if (onUploadProgress) xhr.upload.onprogress = (e) => onUploadProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : undefined })

    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort)
    const settle = (fn, value) => {
      signal?.removeEventListener('abort', onAbort)
      fn(value)
    }

    xhr.onload = () => {
      const response = { status: xhr.status, data: parseBody(xhr, responseType) }
      if (xhr.status >= 200 && xhr.status < 300) {
        settle(resolve, response)
        return
      }
      if (xhr.status === 401 && getToken()) {
        setToken(null)
        window.dispatchEvent(new CustomEvent('session-expired'))
      }
      settle(reject, new RequestError(`Request failed with status code ${xhr.status}`, 'ERR_BAD_RESPONSE', response))
    }
    xhr.onerror = () => settle(reject, new RequestError('Network Error', 'ERR_NETWORK'))
    xhr.ontimeout = () => settle(reject, new RequestError(`timeout of ${timeout}ms exceeded`, 'ECONNABORTED'))
    xhr.onabort = () => settle(reject, new RequestError('canceled', 'ERR_CANCELED'))

    xhr.send(payload ?? null)
  })
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  delete: (path, options) => request('DELETE', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
}

/** Turns any request failure into a short, user-facing sentence. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (isCancel(error)) return null
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
  if (status === 413) return data?.message || 'That file is too large.'
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
