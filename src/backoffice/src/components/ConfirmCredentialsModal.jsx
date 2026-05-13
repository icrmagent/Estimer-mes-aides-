import { useState, useEffect, useRef } from 'react'
import api from '../services/api.js'
import { PRIMARY } from './ui.jsx'

/**
 * ConfirmCredentialsModal — re-auth obligatoire avant remote login/logout d'une borne.
 *
 * Pré-remplit l'email de l'acteur (lecture seule, depuis localStorage 'ema_user_email')
 * et ne demande que le mot de passe. Envoie au backend POST /api/bornes/:id/remote-action.
 *
 * Props :
 *   - borne : { id, idBorne, adresse, estConnectee }
 *   - action : 'login' | 'logout'
 *   - onSuccess(result) : appelé après succès
 *   - onCancel() : fermeture
 */
export default function ConfirmCredentialsModal({ borne, action, onSuccess, onCancel }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const actorEmail = localStorage.getItem('ema_user_email') || ''
  const isLogin = action === 'login'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) return
    setError(null)
    setLoading(true)
    try {
      const res = await api.post(`/api/bornes/${borne.id}/remote-action`, { action, password })
      onSuccess(res.data)
    } catch (err) {
      const apiErr = err.response?.data?.error
      const msg = typeof apiErr === 'string' ? apiErr : (apiErr?.message || 'Erreur lors de l\'opération')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cred-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div>
          <h2 id="cred-modal-title" className="text-base font-bold text-gray-900">
            {isLogin ? 'Forcer la connexion à distance' : 'Forcer la déconnexion à distance'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Borne <span className="font-mono text-gray-700">{borne.idBorne}</span> — {borne.adresse}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Confirmez votre mot de passe pour autoriser l'action.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={actorEmail}
              readOnly
              tabIndex={-1}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              style={{ minHeight: '40px' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mot de passe</label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                style={{ minHeight: '40px', fontSize: '14px', '--tw-ring-color': PRIMARY }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPw
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              style={{ minHeight: '40px' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-opacity disabled:opacity-60"
              style={{ background: isLogin ? PRIMARY : '#dc2626', minHeight: '40px' }}
            >
              {loading ? '...' : (isLogin ? 'Connecter' : 'Déconnecter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
