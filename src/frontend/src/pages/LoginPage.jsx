import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'

const MAX_ATTEMPTS  = 5
const LOCKOUT_MS    = 5 * 60 * 1000
const ATTEMPTS_KEY  = 'borne_login_attempts'
const LOCKOUT_KEY   = 'borne_login_lockout'
const IDLE_RESET_MS = 60 * 1000          // efface les champs après 60 s d'inactivité
const API_URL       = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/* ─── Icônes SVG légères (pas de lib externe requise) ──────────────────── */
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="3"/>
    <path d="M2 7l10 7 10-7"/>
  </svg>
)
const IconLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </svg>
)
const IconEye = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {off
      ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
    }
  </svg>
)
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)
const IconArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

/* ─── Indicateur de tentatives (points visuels) ────────────────────────── */
function AttemptDots({ attempts, max }) {
  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i < attempts ? '#5B2D8E' : 'rgba(91,45,142,0.15)',
            transition: 'background 0.3s',
          }}
        />
      ))}
    </div>
  )
}

/* ─── Champ de saisie ──────────────────────────────────────────────────── */
function Field({ label, icon, type, value, onChange, disabled, placeholder, autoComplete, extra }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.7px',
        textTransform: 'uppercase', color: '#7c6ea0',
      }}>
        {label}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 60, borderRadius: 14, padding: '0 16px',
        background: disabled ? '#f3f0fa' : '#fff',
        border: `1.5px solid ${focused ? '#5B2D8E' : '#e0d8f5'}`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: focused ? '0 0 0 3px rgba(91,45,142,0.12)' : 'none',
        color: disabled ? '#b0a0c8' : '#5B2D8E',
      }}>
        {icon}
        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 17, color: '#1a1040',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        {extra}
      </div>
    </div>
  )
}

/* ─── Composant principal ──────────────────────────────────────────────── */
export default function LoginPage() {
  const navigate = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const [attempts, setAttempts] = useState(() =>
    parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10))
  const [lockoutUntil, setLockoutUntil] = useState(() =>
    parseInt(localStorage.getItem(LOCKOUT_KEY)  || '0', 10))
  const [now, setNow] = useState(() => Date.now())

  /* Compte à rebours du verrouillage */
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return
    const iv = setInterval(() => {
      const current = Date.now()
      if (lockoutUntil <= current) {
        setLockoutUntil(0); setAttempts(0)
        localStorage.removeItem(LOCKOUT_KEY)
        localStorage.removeItem(ATTEMPTS_KEY)
        setNow(current)
        clearInterval(iv)
      } else {
        setNow(current)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [lockoutUntil])

  /* Réinitialisation des champs après inactivité (kiosque) */
  const resetIdle = useCallback(() => {
    setEmail(''); setPassword(''); setError(null); setShowPw(false)
  }, [])

  useEffect(() => {
    if (!email && !password) return
    const t = setTimeout(resetIdle, IDLE_RESET_MS)
    return () => clearTimeout(t)
  }, [email, password, resetIdle])

  const isLocked = lockoutUntil > now
  const remaining = isLocked ? Math.ceil((lockoutUntil - now) / 1000) : 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (isLocked) return
    setError(null); setLoading(true)

    try {
      const res  = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, context: 'borne' }),
      })
      const data = await res.json()

      if (res.ok && data.token) {
        localStorage.setItem('borne_token', data.token)
        localStorage.removeItem(ATTEMPTS_KEY)
        localStorage.removeItem(LOCKOUT_KEY)
        navigate('/start', { replace: true })
      } else {
        const n = attempts + 1
        setAttempts(n)
        localStorage.setItem(ATTEMPTS_KEY, String(n))
        if (n >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS
          setLockoutUntil(until)
          localStorage.setItem(LOCKOUT_KEY, String(until))
          setError('Trop de tentatives. Réessayez dans 5 minutes.')
        } else {
          setError(`Identifiants invalides. ${MAX_ATTEMPTS - n} tentative(s) restante(s).`)
        }
      }
    } catch {
      setError('Erreur de connexion. Vérifiez votre réseau.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Styles partagés ─────────────────────────────────────────────────── */
  const S = {
    root: {
      minHeight: '100svh',
      display: 'flex',
      background: '#1a1040',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    /* ── Panneau gauche : branding ──────────────────────────────────── */
    brand: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: '48px 40px',
      width: '38%',
      flexShrink: 0,
      background: 'rgba(255,255,255,0.04)',
      borderRight: '1px solid rgba(255,255,255,0.07)',
    },
    logoBox: {
      width: 84, height: 84, borderRadius: 22,
      background: 'rgba(255,255,255,0.1)',
      border: '1.5px solid rgba(255,255,255,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    logoText: { color: '#fff', fontSize: 16, fontWeight: 600, letterSpacing: 0.5 },
    brandTitle: { color: '#fff', fontSize: 22, fontWeight: 500, margin: 0, textAlign: 'center' },
    brandSub: {
      color: 'rgba(255,255,255,0.38)', fontSize: 14, margin: 0,
      textAlign: 'center', lineHeight: 1.7,
    },
    /* ── Panneau droit : formulaire ─────────────────────────────────── */
    form: {
      flex: 1,
      background: '#f8f7ff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '56px 52px',
      gap: 0,
    },
    formHead: { marginBottom: 32 },
    formTitle: { margin: '0 0 4px', fontSize: 24, fontWeight: 500, color: '#1a1040' },
    formSub: { margin: 0, fontSize: 14, color: '#7c6ea0' },
    /* ── Messages ───────────────────────────────────────────────────── */
    errorBox: {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '14px 16px', borderRadius: 12, marginBottom: 20,
      background: '#fff0f0', border: '1px solid #ffd5d5',
      color: '#c0392b', fontSize: 14, lineHeight: 1.5,
    },
    lockBox: {
      padding: '20px 24px', borderRadius: 14, marginBottom: 20,
      background: '#fff0f0', border: '1px solid #ffd5d5',
      textAlign: 'center',
    },
    /* ── Bouton principal ───────────────────────────────────────────── */
    btn: {
      marginTop: 8,
      width: '100%', height: 62, borderRadius: 16, border: 'none',
      background: loading || isLocked ? '#c4b3e0' : '#5B2D8E',
      color: '#fff', fontSize: 17, fontWeight: 600,
      cursor: loading || isLocked ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      transition: 'background 0.2s, transform 0.1s',
      letterSpacing: 0.2,
    },
    /* ── Pied de formulaire ─────────────────────────────────────────── */
    footer: {
      display: 'flex', alignItems: 'center', gap: 8,
      marginTop: 24, paddingTop: 18,
      borderTop: '1px solid #ede8f9',
      color: '#a08fc0', fontSize: 12,
    },
  }

  return (
    /* Responsive : colonne en portrait tablette / ligne en paysage */
    <div style={S.root}>
      <style>{`
        @media (max-width: 700px) {
          .kiosk-brand  { display: none !important; }
          .kiosk-form   { padding: 40px 28px !important; }
        }
        @media (min-width: 701px) and (max-width: 960px) {
          .kiosk-brand  { width: 44% !important; }
          .kiosk-form   { padding: 48px 36px !important; }
        }
        .kiosk-btn:active { transform: scale(0.98); }
      `}</style>

      {/* ── Panneau branding ── */}
      <div style={S.brand} className="kiosk-brand">
        <div style={S.logoBox}>
          <img src={logo} alt="Logo ila 26" style={{ maxWidth: '64px', maxHeight: '64px', objectFit: 'contain' }} />
        </div>
        <p style={S.brandTitle}>Borne administrateur</p>
        <p style={S.brandSub}>
          Système de gestion<br />des accès kiosque
        </p>
        {/* Indicateur d'étape visuel */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: i === 0 ? 20 : 7, height: 7, borderRadius: 4,
              background: i === 0 ? '#a78bfa' : 'rgba(255,255,255,0.18)',
              transition: 'width 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* ── Panneau formulaire ── */}
      <div style={S.form} className="kiosk-form">
        <div style={S.formHead}>
          <h1 style={S.formTitle}>Connexion</h1>
          <p style={S.formSub}>Accès réservé aux administrateurs</p>
        </div>

        {/* Verrouillage */}
        {isLocked && (
          <div style={S.lockBox} role="alert" aria-live="assertive">
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#c0392b', fontSize: 15 }}>
              Accès temporairement bloqué
            </p>
            <p style={{ margin: 0, color: '#e74c3c', fontSize: 14 }}>
              Réessayez dans{' '}
              <strong>
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </strong>
            </p>
          </div>
        )}

        {/* Erreur */}
        {error && !isLocked && (
          <div style={S.errorBox} role="alert" aria-live="polite">
            <span style={{ flexShrink: 0, marginTop: 1 }}><IconAlert /></span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          noValidate>

          <Field
            label="Adresse e-mail"
            icon={<IconMail />}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={isLocked}
            placeholder="admin@exemple.fr"
            autoComplete="email"
          />

          <Field
            label="Mot de passe"
            icon={<IconLock />}
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={isLocked}
            placeholder="••••••••"
            autoComplete="current-password"
            extra={
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                style={{
                  background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                  color: '#a08fc0', display: 'flex', alignItems: 'center',
                  minWidth: 40, minHeight: 40, justifyContent: 'center',
                }}
              >
                <IconEye off={showPw} />
              </button>
            }
          />

          <button
            type="submit"
            disabled={loading || isLocked}
            style={S.btn}
            className="kiosk-btn"
            aria-busy={loading}
          >
            {loading
              ? <><span style={{ opacity: 0.8 }}>Connexion en cours…</span></>
              : <><span>Se connecter</span><IconArrow /></>
            }
          </button>
        </form>

        {/* Pied : sécurité + dots tentatives */}
        <div style={S.footer}>
          <span style={{ color: '#5B2D8E' }}><IconShield /></span>
          <span>
            {isLocked
              ? 'Compte verrouillé · réinitialisation automatique'
              : `5 tentatives max · verrouillage ${LOCKOUT_MS / 60000} min`}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <AttemptDots attempts={attempts} max={MAX_ATTEMPTS} />
          </div>
        </div>
      </div>
    </div>
  )
}