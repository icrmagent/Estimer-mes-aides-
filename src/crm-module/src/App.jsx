import { useState, useEffect } from 'react'
import SyncDashboard from './components/SyncDashboard.jsx'

const STORAGE_KEY = 'crm_jwt_token'
const ENV_TOKEN = import.meta.env.VITE_CRM_JWT || ''

function LoginScreen({ onLogin }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const t = token.replace(/\s+/g, '')
    if (!t) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/api/submissions?synced=false&limit=1`,
        { headers: { Authorization: `Bearer ${t}` } }
      )
      if (res.status === 401) throw new Error('Token invalide ou expiré')
      if (!res.ok) throw new Error(`Erreur serveur: ${res.status}`)
      localStorage.setItem(STORAGE_KEY, t)
      onLogin(t)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-surface-2)', padding: 24
    }}>
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--color-primary)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16
          }}>
            🔄
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
            CRM Sync
          </h1>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 14 }}>
            Estimer Mes Aides — Module de synchronisation
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
              Token JWT CRM
            </label>
            <textarea
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs…"
              rows={4}
              style={{
                width: '100%', border: '1.5px solid #E5E0F7', borderRadius: 10,
                padding: '10px 14px', fontSize: 13, fontFamily: 'monospace',
                resize: 'none', color: 'var(--color-text)', background: 'white',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FEE2E2', color: '#991B1B', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!token.replace(/\s+/g, '') || loading}
            style={{ width: '100%', padding: '12px', fontSize: 15 }}
          >
            {loading ? 'Vérification…' : 'Connexion'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-muted)', textAlign: 'center' }}>
          Générer un token : <code style={{ background: '#F0EBFF', padding: '2px 6px', borderRadius: 4 }}>
            cd src/backend && node scripts/generate-crm-jwt.js
          </code>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(null)

  useEffect(() => {
    const saved = ENV_TOKEN || localStorage.getItem(STORAGE_KEY)
    if (saved) setToken(saved)
  }, [])

  function logout() {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }

  if (!token) return <LoginScreen onLogin={setToken} />
  return <SyncDashboard token={token} onLogout={logout} />
}
