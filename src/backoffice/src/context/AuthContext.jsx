import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const ACCESS_TOKEN_KEY = 'ema_access_token'
const REFRESH_TOKEN_KEY = 'ema_refresh_token'

/** Decode JWT payload without verifying signature (client-side only). */
function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

/** Returns true if the token's exp claim is in the past. */
function isTokenExpired(token) {
  const payload = decodeJwt(token)
  if (!payload?.exp) return true
  return Date.now() >= payload.exp * 1000
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(ACCESS_TOKEN_KEY))
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!t) return null
    return decodeJwt(t)
  })

  // ── Auto-logout: check refresh token expiry on mount ─────────────────────
  useEffect(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (refreshToken && isTokenExpired(refreshToken)) {
      // Refresh token has expired — force logout
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      setToken(null)
      setUser(null)
    }
  }, [])

  const login = useCallback((newAccessToken, newRefreshToken) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken)
    if (newRefreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken)
    }
    setToken(newAccessToken)
    setUser(decodeJwt(newAccessToken))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns the new access token on success, or throws on failure.
   */
  const refreshToken = useCallback(async () => {
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!storedRefresh) {
      logout()
      throw new Error('No refresh token available')
    }

    // Check if refresh token itself is expired before making the request
    if (isTokenExpired(storedRefresh)) {
      logout()
      throw new Error('Refresh token expired')
    }

    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const res = await axios.post(`${baseURL}/api/auth/refresh`, {
      refreshToken: storedRefresh,
    })

    const newAccessToken = res.data.accessToken || res.data.token
    const newRefreshToken = res.data.refreshToken

    localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken)
    if (newRefreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken)
    }

    setToken(newAccessToken)
    setUser(decodeJwt(newAccessToken))

    return newAccessToken
  }, [logout])

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        refreshToken,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
