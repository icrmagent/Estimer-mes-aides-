import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('bo_token'))
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem('bo_token')
    if (!t) return null
    try { return JSON.parse(atob(t.split('.')[1])) } catch { return null }
  })

  const login = (newToken) => {
    localStorage.setItem('bo_token', newToken)
    setToken(newToken)
    try { setUser(JSON.parse(atob(newToken.split('.')[1]))) } catch { setUser(null) }
  }

  const logout = () => {
    localStorage.removeItem('bo_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
