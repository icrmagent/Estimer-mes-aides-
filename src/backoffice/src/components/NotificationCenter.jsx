/**
 * NotificationCenter.jsx — Real-time toast notification display
 *
 * Subscribes to admin-notifications via notificationService and renders
 * toast notifications for each event. Toasts auto-dismiss after 5 s.
 *
 * Special banners:
 *  - "formulaire.updated"  → "Nouvelle version disponible" banner (ADR-5)
 *  - "formulaire.archived" → maintenance flag (ADR-5)
 *
 * No window.alert() or window.confirm() — custom UI only.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { subscribeToAdminNotifications } from '../services/notificationService.js'

// ---------------------------------------------------------------------------
// Toast types
// ---------------------------------------------------------------------------

const TOAST_TYPES = {
  NEW_ENREGISTREMENT: 'new-enregistrement',
  PARTAGE_STATUS: 'partage-status',
  FORMULAIRE_UPDATED: 'formulaire-updated',
  FORMULAIRE_ARCHIVED: 'formulaire-archived',
  POLL: 'poll',
}

const AUTO_DISMISS_MS = 5000
const MAX_TOASTS = 5

// ---------------------------------------------------------------------------
// Toast item component
// ---------------------------------------------------------------------------

function Toast({ toast, onDismiss }) {
  const { id, type, message, timestamp } = toast

  const colorMap = {
    [TOAST_TYPES.NEW_ENREGISTREMENT]: 'bg-green-50 border-green-400 text-green-800',
    [TOAST_TYPES.PARTAGE_STATUS]: 'bg-blue-50 border-blue-400 text-blue-800',
    [TOAST_TYPES.FORMULAIRE_UPDATED]: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    [TOAST_TYPES.FORMULAIRE_ARCHIVED]: 'bg-red-50 border-red-400 text-red-800',
    [TOAST_TYPES.POLL]: 'bg-gray-50 border-gray-400 text-gray-700',
  }

  const iconMap = {
    [TOAST_TYPES.NEW_ENREGISTREMENT]: '📋',
    [TOAST_TYPES.PARTAGE_STATUS]: '🔄',
    [TOAST_TYPES.FORMULAIRE_UPDATED]: '🆕',
    [TOAST_TYPES.FORMULAIRE_ARCHIVED]: '🔒',
    [TOAST_TYPES.POLL]: 'ℹ️',
  }

  const colorClass = colorMap[type] || 'bg-white border-gray-300 text-gray-700'
  const icon = iconMap[type] || 'ℹ️'

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-md max-w-sm w-full transition-all duration-300 ${colorClass}`}
    >
      <span className="text-xl flex-shrink-0" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{message}</p>
        <p className="text-xs opacity-60 mt-1">
          {new Date(timestamp).toLocaleTimeString('fr-FR')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-current rounded"
        aria-label="Fermer la notification"
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Nouvelle version disponible" persistent banner (ADR-5)
// ---------------------------------------------------------------------------

function FormulaireUpdatedBanner({ data, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 px-4 py-3 flex items-center justify-between shadow-md"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🆕</span>
        <span className="font-semibold text-sm">
          Nouvelle version disponible
          {data?.version ? ` (v${data.version})` : ''}
          {' '}— sera chargée après la session en cours.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 text-yellow-900 opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow-900 rounded px-2 py-1 text-sm"
        aria-label="Fermer la bannière"
      >
        Fermer
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Maintenance flag banner (ADR-5)
// ---------------------------------------------------------------------------

function FormulaireArchivedBanner({ data, onDismiss }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center justify-between shadow-md"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🔒</span>
        <span className="font-semibold text-sm">
          Ce formulaire a été archivé. La borne passera en maintenance après la session en cours.
          {data?.formulaireId ? ` (ID: ${data.formulaireId})` : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 text-white opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-white rounded px-2 py-1 text-sm"
        aria-label="Fermer la bannière"
      >
        Fermer
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main NotificationCenter component
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {string[]|null} [props.assignedBorneIds] - null = SuperAdmin, array = AdminBorne filter
 * @param {Function} [props.onNewEnregistrement]   - optional callback for parent state updates
 * @param {Function} [props.onPartageStatusChanged]
 */
export default function NotificationCenter({
  assignedBorneIds = null,
  onNewEnregistrement,
  onPartageStatusChanged,
}) {
  const { user } = useAuth()
  const [toasts, setToasts] = useState([])
  const [formulaireUpdatedData, setFormulaireUpdatedData] = useState(null)
  const [formulaireArchivedData, setFormulaireArchivedData] = useState(null)
  const timerRefs = useRef({})
  const toastIdCounter = useRef(0)

  // Derive assignedBorneIds from user if not explicitly passed
  const effectiveBorneIds =
    assignedBorneIds !== undefined
      ? assignedBorneIds
      : user?.role === 'ADMIN_BORNE'
      ? user?.borneIds ?? null
      : null

  const addToast = useCallback((type, message) => {
    const id = ++toastIdCounter.current
    const toast = { id, type, message, timestamp: Date.now() }

    setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS))

    // Auto-dismiss after 5 s
    timerRefs.current[id] = setTimeout(() => {
      dismissToast(id)
    }, AUTO_DISMISS_MS)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = useCallback((id) => {
    clearTimeout(timerRefs.current[id])
    delete timerRefs.current[id]
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const cleanup = subscribeToAdminNotifications(
      {
        onNewEnregistrement: (data) => {
          addToast(
            TOAST_TYPES.NEW_ENREGISTREMENT,
            `Nouvel enregistrement reçu${data?.borneId ? ` (borne ${data.borneId})` : ''}.`
          )
          onNewEnregistrement?.(data)
        },

        onPartageStatusChanged: (data) => {
          const status = data?.status === 'partage' ? 'synchronisé ✓' : 'échec de synchronisation ✗'
          addToast(
            TOAST_TYPES.PARTAGE_STATUS,
            `Partage CRM ${status}${data?.borneId ? ` (borne ${data.borneId})` : ''}.`
          )
          onPartageStatusChanged?.(data)
        },

        onFormulaireUpdated: (data) => {
          // Show persistent banner (ADR-5)
          setFormulaireUpdatedData(data)
          addToast(
            TOAST_TYPES.FORMULAIRE_UPDATED,
            `Formulaire mis à jour${data?.version ? ` → v${data.version}` : ''}.`
          )
        },

        onFormulaireArchived: (data) => {
          // Show persistent maintenance banner (ADR-5)
          setFormulaireArchivedData(data)
          addToast(
            TOAST_TYPES.FORMULAIRE_ARCHIVED,
            `Formulaire archivé — maintenance après la session en cours.`
          )
        },
      },
      effectiveBorneIds
    )

    return () => {
      cleanup()
      // Clear all pending timers
      Object.values(timerRefs.current).forEach(clearTimeout)
      timerRefs.current = {}
    }
  }, [effectiveBorneIds]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Persistent banners */}
      {formulaireUpdatedData && (
        <FormulaireUpdatedBanner
          data={formulaireUpdatedData}
          onDismiss={() => setFormulaireUpdatedData(null)}
        />
      )}
      {formulaireArchivedData && (
        <FormulaireArchivedBanner
          data={formulaireArchivedData}
          onDismiss={() => setFormulaireArchivedData(null)}
        />
      )}

      {/* Toast stack — bottom-right */}
      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </>
  )
}
