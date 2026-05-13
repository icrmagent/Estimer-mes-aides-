import { useEffect } from 'react'

export const PRIMARY = '#5B2D8E'
export const SECONDARY = '#1A56A0'

// ─── Icons ────────────────────────────────────────────────────────────────────

export const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/>
  </svg>
)

export const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,7 6,11 12,3"/>
  </svg>
)

export const IcoPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
  </svg>
)

export const IcoPencil = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2l2 2-7 7H3v-2L10 2z"/>
  </svg>
)

export const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2 4h10M5 4V2h4v2M4 4l.75 8h4.5L10 4"/>
  </svg>
)

export const IcoChevron = ({ open }) => (
  <svg
    width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <polyline points="4,6 8,10 12,6"/>
  </svg>
)

export const IcoRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 7.5a6 6 0 1 0 1.3-3.8"/><polyline points="1.5,2 1.5,5.5 5,5.5"/>
  </svg>
)

export const IcoMore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
  </svg>
)

export const IcoDownload = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 1v8M4 6l3 3 3-3"/><path d="M1 11v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1"/>
  </svg>
)

export const IcoWarn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

// ─── Toast notification ────────────────────────────────────────────────────────

export function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-none
        ${type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-red-50 border border-red-200 text-red-700'
        }`}
    >
      {type === 'success' ? <IcoCheck /> : <IcoX />}
      {message}
    </div>
  )
}

// ─── Error banner ──────────────────────────────────────────────────────────────

export function ErrorBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors">
          <IcoX />
        </button>
      )}
    </div>
  )
}

// ─── Confirm modal ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  title = 'Confirmer',
  message,
  confirmLabel = 'Confirmer',
  onConfirm,
  onCancel,
  saving = false,
  danger = false,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              danger ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {danger ? <IcoTrash /> : <IcoWarn />}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
            style={{ minHeight: '40px' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-60 transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'
            }`}
            style={{ minHeight: '40px' }}
          >
            {saving ? 'En cours…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-4">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  )
}

// ─── Skeleton loaders ──────────────────────────────────────────────────────────

export function SkeletonTableRows({ cols = 5, rows = 4 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} className="border-b border-gray-50">
      {Array.from({ length: cols }, (_, j) => (
        <td key={j} className="px-4 py-3">
          <div
            className="h-4 bg-gray-100 rounded animate-pulse"
            style={{ width: j === 0 ? '130px' : j === cols - 1 ? '32px' : '80px' }}
          />
        </td>
      ))}
    </tr>
  ))
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
        <div className="h-5 bg-gray-200 rounded animate-pulse flex-1" style={{ maxWidth: '160px' }} />
      </div>
      {Array.from({ length: lines - 1 }, (_, i) => (
        <div key={i} className="h-3 bg-gray-100 rounded animate-pulse mt-2" style={{ width: i === 0 ? '45%' : '30%' }} />
      ))}
    </div>
  )
}

// ─── Status badges ─────────────────────────────────────────────────────────────

export function BadgeActif({ actif }) {
  return actif
    ? <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">Actif</span>
    : <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">Inactif</span>
}

export function BadgeBorneStatut({ statut }) {
  return statut === 'actif'
    ? <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">Actif</span>
    : <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500">Inactif</span>
}

export function BadgeFormulaire({ statut, deletedAt }) {
  if (deletedAt) return (
    <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700">Supprimé</span>
  )
  const map = {
    publie:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'Publié'    },
    brouillon: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', label: 'Brouillon' },
    archive:   { bg: 'bg-gray-100',  border: 'border-gray-200',   text: 'text-gray-500',   label: 'Archivé'   },
  }
  const s = map[statut] || { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-500', label: statut }
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  )
}

export function BadgeEnreg({ statut }) {
  const map = {
    en_attente:       { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', label: 'En attente'       },
    en_cours:         { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'En cours'         },
    partage:          { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  label: 'Partagé'          },
    echec_temporaire: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', label: 'Échec temporaire' },
    echec_definitif:  { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    label: 'Échec définitif'  },
  }
  const s = map[statut] || { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-500', label: statut?.replace(/_/g, ' ') || '—' }
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  )
}
