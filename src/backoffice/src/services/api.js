import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Requis pour envoyer le cookie CSRF (double-submit pattern)
})

// ── CSRF token cache + fetch ──────────────────────────────────────────────
let csrfToken = null
let csrfFetchPromise = null

async function fetchCsrfToken() {
  if (csrfFetchPromise) return csrfFetchPromise
  csrfFetchPromise = axios
    .get(`${BASE_URL}/api/csrf-token`, { withCredentials: true })
    .then((res) => {
      csrfToken = res.data?.csrfToken ?? null
      return csrfToken
    })
    .finally(() => {
      csrfFetchPromise = null
    })
  return csrfFetchPromise
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// ── Request interceptor: Bearer + CSRF ────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('ema_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  if (MUTATING_METHODS.has((config.method || '').toLowerCase())) {
    if (!csrfToken) await fetchCsrfToken()
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

// ── Response interceptor: 401 (refresh) + 403 CSRF_INVALID (refresh CSRF) ─
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    // ── 403 CSRF_INVALID: refresh token + retry once ──────────────────────
    if (
      err.response?.status === 403 &&
      err.response?.data?.code === 'CSRF_INVALID' &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true
      csrfToken = null
      try {
        await fetchCsrfToken()
        if (csrfToken) originalRequest.headers['X-CSRF-Token'] = csrfToken
        return api(originalRequest)
      } catch (csrfErr) {
        return Promise.reject(csrfErr)
      }
    }

    // ── 401: refresh access token + retry ─────────────────────────────────
    if (err.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('ema_refresh_token')

      if (!refreshToken) {
        localStorage.removeItem('ema_access_token')
        localStorage.removeItem('ema_refresh_token')
        window.location.href = '/login'
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        }).catch((e) => Promise.reject(e))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(
          `${BASE_URL}/api/auth/refresh`,
          { refreshToken }
        )
        const newAccessToken = res.data.accessToken || res.data.token
        const newRefreshToken = res.data.refreshToken

        localStorage.setItem('ema_access_token', newAccessToken)
        if (newRefreshToken) {
          localStorage.setItem('ema_refresh_token', newRefreshToken)
        }

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('ema_access_token')
        localStorage.removeItem('ema_refresh_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

export default api
export { fetchCsrfToken }
