import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes
const ATTEMPTS_KEY = 'borne_login_attempts'
const LOCKOUT_KEY = 'borne_login_lockout'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Page de connexion AdminBorne sur la borne.
 * Bloque après 5 échecs consécutifs pendant 5 minutes (R3.1).
 * Touch targets ≥ 48px, font-size ≥ 16px.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(() => {
    return parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10)
  })
  const [lockoutUntil, setLockoutUntil] = useState(() => {
    return parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10)
  })
  const [remaining, setRemaining] = useState(0)

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return
    const interval = setInterval(() => {
      const left = Math.ceil((lockoutUntil - Date.now()) / 1000)
      if (left <= 0) {
        setLockoutUntil(0)
        setAttempts(0)
        localStorage.removeItem(LOCKOUT_KEY)
        localStorage.removeItem(ATTEMPTS_KEY)
        clearInterval(interval)
      } else {
        setRemaining(left)
      }
    }, 1000)
    setRemaining(Math.ceil((lockoutUntil - Date.now()) / 1000))
    return () => clearInterval(interval)
  }, [lockoutUntil])

  const isLocked = lockoutUntil > Date.now()

  async function handleSubmit(e) {
    e.preventDefault()
    if (isLocked) return

    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, context: 'borne' }),
      })

      const data = await res.json()

      if (res.ok && data.token) {
        // Succès — stocker le JWT et réinitialiser les compteurs
        localStorage.setItem('borne_token', data.token)
        localStorage.removeItem(ATTEMPTS_KEY)
        localStorage.removeItem(LOCKOUT_KEY)
        navigate('/start', { replace: true })
      } else {
        // Échec — incrémenter le compteur
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        localStorage.setItem(ATTEMPTS_KEY, String(newAttempts))

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS
          setLockoutUntil(until)
          localStorage.setItem(LOCKOUT_KEY, String(until))
          setError(`Trop de tentatives. Réessayez dans 5 minutes.`)
        } else {
          setError(`Identifiants invalides. ${MAX_ATTEMPTS - newAttempts} tentative(s) restante(s).`)
        }
      }
    } catch {
      setError('Erreur de connexion. Vérifiez votre réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)' }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold"
            style={{ background: '#5B2D8E' }}
          >
            ila26
          </div>
          <h1 className="text-xl font-bold text-gray-900">Connexion Borne</h1>
          <p className="text-gray-500 text-sm mt-1">Accès administrateur</p>
        </div>

        {/* Lockout message */}
        {isLocked && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-red-700 font-semibold text-sm">Accès bloqué</p>
            <p className="text-red-600 text-sm mt-1">
              Réessayez dans <span className="font-bold">{remaining}s</span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && !isLocked && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isLocked}
              autoComplete="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ minHeight: '52px', fontSize: '16px' }}
              placeholder="admin@exemple.fr"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isLocked}
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ minHeight: '52px', fontSize: '16px' }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || isLocked}
            className="w-full text-white font-bold rounded-xl py-4 text-base transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#5B2D8E', minHeight: '52px' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
