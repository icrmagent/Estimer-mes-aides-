/**
 * SyncStatusIndicator.jsx
 *
 * Displays the current offline-sync status in the UI.
 *
 * States:
 *   - pending > 0, not syncing  → amber badge with pending count
 *   - syncing                   → spinning icon (blue)
 *   - pending === 0, not syncing → green checkmark (synced)
 *
 * Rules:
 *   - Touch target ≥ 48px (min-h-12 min-w-12)
 *   - No window.alert() or window.confirm()
 *   - Uses Tailwind CSS
 *   - Accessible: role="status", aria-live="polite"
 */

import { useSyncStatus } from '../services/syncService.js'

/**
 * Spinning SVG icon for the "syncing" state.
 */
function SpinnerIcon() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

/**
 * Checkmark SVG icon for the "synced" state.
 */
function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 text-green-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

/**
 * Cloud-upload SVG icon for the "pending" state.
 */
function PendingIcon() {
  return (
    <svg
      className="h-5 w-5 text-amber-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  )
}

/**
 * SyncStatusIndicator
 *
 * Renders a compact status badge driven by useSyncStatus().
 * Minimum touch target: 48×48px (min-h-12 min-w-12).
 *
 * @param {{ className?: string }} props
 */
export function SyncStatusIndicator({ className = '' }) {
  const { pending, syncing } = useSyncStatus()

  let label
  let content

  if (syncing) {
    label = 'Synchronisation en cours…'
    content = (
      <>
        <SpinnerIcon />
        <span className="ml-1.5 text-xs font-medium text-blue-600 hidden sm:inline">
          Sync…
        </span>
      </>
    )
  } else if (pending > 0) {
    label = `${pending} soumission${pending > 1 ? 's' : ''} en attente de synchronisation`
    content = (
      <>
        <PendingIcon />
        <span
          className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"
          aria-hidden="true"
        >
          {pending}
        </span>
      </>
    )
  } else {
    label = 'Toutes les soumissions sont synchronisées'
    content = (
      <>
        <CheckIcon />
        <span className="ml-1.5 text-xs font-medium text-green-600 hidden sm:inline">
          Synchronisé
        </span>
      </>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center',
        'min-h-12 min-w-12 px-3',
        'rounded-lg',
        syncing
          ? 'bg-blue-50'
          : pending > 0
            ? 'bg-amber-50'
            : 'bg-green-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {content}
    </div>
  )
}

export default SyncStatusIndicator
