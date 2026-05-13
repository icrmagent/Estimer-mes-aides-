import { createContext, useContext, useState, useCallback } from 'react'
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


export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(ACCESS_TOKEN_KEY))
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!t) return null
    return decodeJwt(t)
  })

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
    localStorage.removeItem('ema_user_email')
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
