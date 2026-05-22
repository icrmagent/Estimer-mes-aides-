import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { enterKiosk, exitKiosk, validateExitPassword, isAndroidWebView } from '../services/kioskService'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Milliseconds the user must hold the hidden corner to reveal the exit button */
const HOLD_DURATION_MS = 5_000

/** Maximum wrong password attempts before lockout */
const MAX_ATTEMPTS = 3

/** Lockout duration in milliseconds (5 minutes) */
const LOCKOUT_DURATION_MS = 5 * 60 * 1_000

// ─── KioskShell ───────────────────────────────────────────────────────────────

/**
 * KioskShell — wraps the borne SPA in kiosk mode.
 *
 * Responsibilities (ADR-6):
 *  - Calls kioskService.enterKiosk() on mount
 *  - Prevents F11 and Escape in browser (no-op in Android WebView)
 *  - Hidden 40×40 px corner element: 5-second press-and-hold reveals exit button
 *  - Exit button opens ExitModal (custom — never window.alert/confirm)
 *  - Correct password → exitKiosk() + navigate to /login
 *  - Wrong password → counter; lock for 5 min after 3 attempts
 *  - Cleanup on unmount
 */
export default function KioskShell({ children }) {
  const navigate = useNavigate()

  // ── Gesture state ──────────────────────────────────────────────────────────
  const holdTimerRef = useRef(null)
  const [showExitButton, setShowExitButton] = useState(false)

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── Lockout state ──────────────────────────────────────────────────────────
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null) // Date timestamp (ms)
  const [lockCountdown, setLockCountdown] = useState(0)
  const lockTimerRef = useRef(null)

  // ── Enter kiosk on mount ───────────────────────────────────────────────────
  useEffect(() => {
    enterKiosk()

    // Prevent F11 and Escape in browser only (Android WebView handles natively)
    if (!isAndroidWebView()) {
      const handleKeyDown = (e) => {
        if (e.key === 'F11' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
        }
      }
      document.addEventListener('keydown', handleKeyDown, true)

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true)
        clearTimeout(holdTimerRef.current)
        clearInterval(lockTimerRef.current)
      }
    }

    return () => {
      clearTimeout(holdTimerRef.current)
      clearInterval(lockTimerRef.current)
    }
  }, [])

  // ── Lockout countdown ticker ───────────────────────────────────────────────
  useEffect(() => {
    if (!lockedUntil) return

    const tick = () => {
      const remaining = Math.max(0, lockedUntil - Date.now())
      setLockCountdown(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        setLockedUntil(null)
        setAttempts(0)
        clearInterval(lockTimerRef.current)
      }
    }

    tick()
    lockTimerRef.current = setInterval(tick, 1000)
    return () => clearInterval(lockTimerRef.current)
  }, [lockedUntil])

  // ── Press-and-hold gesture handlers ───────────────────────────────────────

  const handleHoldStart = useCallback(() => {
    holdTimerRef.current = setTimeout(() => {
      setShowExitButton(true)
    }, HOLD_DURATION_MS)
  }, [])

  const handleHoldEnd = useCallback(() => {
    clearTimeout(holdTimerRef.current)
  }, [])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openModal = useCallback(() => {
    setShowModal(true)
    setPassword('')
    setError(null)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
    setPassword('')
    setError(null)
  }, [])

  // ── Password submission ────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()

    // Guard: locked out
    if (lockedUntil && Date.now() < lockedUntil) return

    setLoading(true)
    setError(null)

    try {
      const valid = await validateExitPassword(password)

      if (valid) {
        closeModal()
        setShowExitButton(false)
        await exitKiosk()
        navigate('/login', { replace: true })
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_DURATION_MS
          setLockedUntil(until)
          setError(`Trop de tentatives. Réessayez dans 5 minutes.`)
        } else {
          setError(
            `Mot de passe incorrect. ${MAX_ATTEMPTS - newAttempts} tentative(s) restante(s).`
          )
        }
      }
    } catch {
      setError('Erreur de connexion. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }, [password, attempts, lockedUntil, closeModal, navigate])

  // ── Derived: is currently locked ──────────────────────────────────────────
  const isLocked = lockedUntil !== null && Date.now() < lockedUntil

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      {/* Main content */}
      {children}

      {/* Hidden 48×48 px corner trigger (bottom-right, transparent) — règle CLAUDE.md n°1 */}
      <div
        data-testid="kiosk-hold-zone"
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onTouchCancel={handleHoldEnd}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 48,
          height: 48,
          background: 'transparent',
          zIndex: 9998,
          cursor: 'default',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        aria-hidden="true"
      />

      {/* Exit button — revealed after 5-second hold */}
      {showExitButton && (
        <button
          data-testid="kiosk-exit-button"
          onClick={openModal}
          style={{
            position: 'fixed',
            bottom: 48,
            right: 16,
            zIndex: 9999,
            minHeight: 48,
            minWidth: 48,
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
          }}
          aria-label="Quitter le mode kiosque"
        >
          Quitter
        </button>
      )}

      {/* Exit modal — custom, never window.alert/confirm (task 14.10) */}
      {showModal && (
        <ExitModal
          password={password}
          onPasswordChange={setPassword}
          onSubmit={handleSubmit}
          onClose={closeModal}
          error={error}
          loading={loading}
          isLocked={isLocked}
          lockCountdown={lockCountdown}
        />
      )}
    </div>
  )
}

// ─── ExitModal ────────────────────────────────────────────────────────────────

/**
 * ExitModal — custom password modal for kiosk exit.
 * No window.alert() or window.confirm() used anywhere.
 */
function ExitModal({
  password,
  onPasswordChange,
  onSubmit,
  onClose,
  error,
  loading,
  isLocked,
  lockCountdown,
}) {
  return (
    <div
      data-testid="kiosk-exit-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.75)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 24,
          padding: 32,
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="exit-modal-title"
          style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#111' }}
        >
          Accès administrateur
        </h2>

        {/* Error / lockout message */}
        {error && (
          <div
            data-testid="exit-modal-error"
            role="alert"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12,
              color: '#b91c1c',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Lockout countdown */}
        {isLocked && (
          <div
            data-testid="exit-modal-countdown"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 12,
              color: '#c2410c',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            Déverrouillage dans {lockCountdown}s
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="kiosk-exit-password"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#374151' }}
            >
              Mot de passe AdminBorne
            </label>
            <input
              id="kiosk-exit-password"
              data-testid="exit-modal-password-input"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              disabled={isLocked}
              autoFocus
              placeholder="••••••••"
              style={{
                width: '100%',
                border: '1px solid #d1d5db',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 16, // ≥ 16px (mobile-first rule)
                minHeight: 52, // touch target ≥ 48px
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                border: '1px solid #d1d5db',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 16,
                minHeight: 52,
                background: '#fff',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              data-testid="exit-modal-submit"
              disabled={loading || isLocked}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 16,
                minHeight: 52,
                background: '#5B2D8E',
                color: '#fff',
                cursor: loading || isLocked ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: loading || isLocked ? 0.5 : 1,
              }}
            >
              {loading ? '...' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
