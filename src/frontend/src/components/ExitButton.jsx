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
      // Email depuis le JWT (champ ajouté v2) ou fallback localStorage
      let email = ''
      const token = localStorage.getItem('borne_token')
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          email = payload.email || ''
        } catch { /* ignore */ }
      }
      if (!email) email = localStorage.getItem('borne_email') || ''

      if (!email) {
        setError('Impossible d\'identifier la session. Veuillez contacter l\'administrateur.')
        setLoading(false)
        return
      }

      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, context: 'borne' }),
      })

      if (res.ok) {
        // Synchronise estConnectee = false côté backend pour le back-office
        const borneId = import.meta.env.VITE_BORNE_ID || localStorage.getItem('borne_id')
        if (borneId && token) {
          try {
            await fetch(`${API_URL}/api/bornes/${borneId}/session`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            })
          } catch { /* tolérant : exit kiosque doit toujours réussir côté borne */ }
        }
        closeModal()
        localStorage.removeItem('borne_token')
        localStorage.removeItem('borne_email')
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header band */}
            <div className="px-8 pt-7 pb-5">
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="flex items-center justify-center rounded-xl w-9 h-9 shrink-0"
                  style={{ background: 'rgba(91,45,142,0.1)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B2D8E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">Accès administrateur</h2>
              </div>
              <div className="flex items-center gap-1.5 mt-2 ml-12">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="text-xs font-medium text-amber-600">Fermeture dans {countdown}s</span>
              </div>
            </div>

            <div className="px-8 pb-7">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Mot de passe AdminBorne
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                    style={{ minHeight: '52px', fontSize: '16px', '--tw-ring-color': '#5B2D8E' }}
                    onFocus={e => { e.target.style.borderColor = '#5B2D8E' }}
                    onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
                    placeholder="••••••••"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-xl py-3 font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                    style={{ minHeight: '52px', fontSize: '15px' }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 text-white font-bold rounded-xl py-3 disabled:opacity-50 transition-opacity shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #6D35A8 0%, #5B2D8E 100%)', minHeight: '52px', fontSize: '15px' }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                        Vérification
                      </span>
                    ) : 'Confirmer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
