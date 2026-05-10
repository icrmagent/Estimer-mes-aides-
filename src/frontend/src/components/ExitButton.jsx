import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const MODAL_TIMEOUT = 60 // secondes (R3.6 critère 32)

/**
 * ExitButton — bouton discret permettant à l'AdminBorne de quitter le mode kiosque.
 * Affiche une modal demandant le mot de passe AdminBorne.
 * Se ferme automatiquement après 60s sans interaction (R3.6).
 * Touch target ≥ 48px.
 */
export default function ExitButton({ className, style, children }) {
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(MODAL_TIMEOUT)
  const countdownRef = useRef(null)

  // Countdown auto-close
  useEffect(() => {
    if (!showModal) return
    setCountdown(MODAL_TIMEOUT)

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          closeModal()
          return MODAL_TIMEOUT
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownRef.current)
  }, [showModal])

  function openModal() {
    setShowModal(true)
    setPassword('')
    setError(null)
  }

  function closeModal() {
    setShowModal(false)
    setPassword('')
    setError(null)
    clearInterval(countdownRef.current)
  }

  async function handleVerify(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Vérifier le mot de passe en tentant un login
      const token = localStorage.getItem('borne_token')
      // Décoder l'email depuis le JWT
      let email = ''
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          email = payload.email || ''
        } catch { /* ignore */ }
      }

      if (!email) {
        setError('Session expirée. Veuillez vous reconnecter.')
        setLoading(false)
        return
      }

      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, context: 'borne' }),
      })

      if (res.ok) {
        closeModal()
        navigate('/login', { replace: true })
      } else {
        setError('Mot de passe incorrect')
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton Exit */}
      <button
        onClick={openModal}
        className={className || "fixed bottom-3 right-3 z-40 text-gray-400/50 hover:text-gray-400 bg-transparent rounded-lg px-3 py-2 transition-all font-medium"}
        style={style || {
          minHeight: '48px',
          minWidth: '48px',
          fontSize: '12px',
        }}
        aria-label="Quitter le mode kiosque"
      >
        {children || 'Exit AdminBorne'}
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Accès administrateur</h2>
              <span className="text-sm text-gray-400">Fermeture dans {countdown}s</span>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Mot de passe AdminBorne
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2"
                  style={{ minHeight: '52px', fontSize: '16px' }}
                  placeholder="••••••••"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-gray-300 rounded-xl py-3 font-medium text-gray-600 hover:bg-gray-50"
                  style={{ minHeight: '52px', fontSize: '16px' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 text-white font-bold rounded-xl py-3 disabled:opacity-50"
                  style={{ background: '#5B2D8E', minHeight: '52px', fontSize: '16px' }}
                >
                  {loading ? '...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
