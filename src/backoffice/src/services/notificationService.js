/**
 * notificationService.js — Admin-notifications channel subscription
 *
 * Subscribes to the "admin-notifications" Pusher channel and binds all
 * relevant events. Implements fallback polling every 30 s when Pusher
 * connection is "failed" or "unavailable".
 *
 * For AdminBorne users, events are filtered to their assigned bornes only.
 */
import {
  subscribe,
  unsubscribe,
  bindEvent,
  getConnectionState,
} from './pusherService.js'
import api from './api.js'

const ADMIN_NOTIFICATIONS_CHANNEL = 'admin-notifications'
const POLLING_INTERVAL_MS = 30_000

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _pollingTimer = null
let _pollingCallbacks = null
let _pollingAssignedBorneIds = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the event should be forwarded to this user.
 *
 * For SUPER_ADMIN (assignedBorneIds === null) → always forward.
 * For ADMIN_BORNE (assignedBorneIds is an array) → forward only when
 *   data.borneId is in the assigned list, or when the event has no borneId
 *   (global events like formulaire.updated / formulaire.archived).
 *
 * @param {object} data - Event payload from Pusher
 * @param {string[]|null} assignedBorneIds - null means SuperAdmin (no filter)
 * @returns {boolean}
 */
function shouldForward(data, assignedBorneIds) {
  if (!assignedBorneIds) return true
  if (!data.borneId) return true // global event — always forward
  return assignedBorneIds.includes(data.borneId)
}

// ---------------------------------------------------------------------------
// Fallback polling
// ---------------------------------------------------------------------------

function startPolling(callbacks, assignedBorneIds) {
  if (_pollingTimer) return // already running
  _pollingCallbacks = callbacks
  _pollingAssignedBorneIds = assignedBorneIds

  _pollingTimer = setInterval(async () => {
    try {
      // Only poll when Pusher is still unavailable
      const state = getConnectionState()
      if (state === 'connected') {
        stopPolling()
        return
      }

      // Fetch recent enregistrements as a proxy for "new-enregistrement" events
      const { data } = await api.get('/api/dashboard/superadmin')
      if (callbacks.onPollData) {
        callbacks.onPollData(data)
      }
    } catch {
      // Silently ignore polling errors — network may still be down
    }
  }, POLLING_INTERVAL_MS)
}

function stopPolling() {
  if (_pollingTimer) {
    clearInterval(_pollingTimer)
    _pollingTimer = null
    _pollingCallbacks = null
    _pollingAssignedBorneIds = null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to the "admin-notifications" channel and bind all events.
 *
 * @param {object} callbacks
 * @param {Function} [callbacks.onNewEnregistrement]      - "new-enregistrement" event
 * @param {Function} [callbacks.onPartageStatusChanged]   - "partage-status-changed" event
 * @param {Function} [callbacks.onFormulaireUpdated]      - "formulaire.updated" event
 * @param {Function} [callbacks.onFormulaireArchived]     - "formulaire.archived" event
 * @param {Function} [callbacks.onPollData]               - called on each fallback poll tick
 * @param {string[]|null} [assignedBorneIds=null]         - null = SuperAdmin (no filter)
 *
 * @returns {Function} cleanup — call to unsubscribe and stop polling
 */
export function subscribeToAdminNotifications(callbacks = {}, assignedBorneIds = null) {
  const channel = subscribe(ADMIN_NOTIFICATIONS_CHANNEL)

  // --- new-enregistrement (task 13.5) ---
  if (callbacks.onNewEnregistrement) {
    bindEvent(channel, 'new-enregistrement', (data) => {
      if (shouldForward(data, assignedBorneIds)) {
        callbacks.onNewEnregistrement(data)
      }
    })
  }

  // --- partage-status-changed (task 13.6) ---
  if (callbacks.onPartageStatusChanged) {
    bindEvent(channel, 'partage-status-changed', (data) => {
      if (shouldForward(data, assignedBorneIds)) {
        callbacks.onPartageStatusChanged(data)
      }
    })
  }

  // --- formulaire.updated (task 13.7 — ADR-5) ---
  if (callbacks.onFormulaireUpdated) {
    bindEvent(channel, 'formulaire.updated', (data) => {
      // Global event — no borne filter
      callbacks.onFormulaireUpdated(data)
    })
  }

  // --- formulaire.archived (task 13.8 — ADR-5) ---
  if (callbacks.onFormulaireArchived) {
    bindEvent(channel, 'formulaire.archived', (data) => {
      // Global event — no borne filter
      callbacks.onFormulaireArchived(data)
    })
  }

  // --- Fallback polling (task 13.9) ---
  // Start polling immediately if Pusher is already in a failed state.
  // Also watch for connection state changes.
  const connectionStateHandler = (states) => {
    if (states.current === 'failed' || states.current === 'unavailable') {
      startPolling(callbacks, assignedBorneIds)
    } else if (states.current === 'connected') {
      stopPolling()
    }
  }

  // Check current state right now
  const currentState = getConnectionState()
  if (currentState === 'failed' || currentState === 'unavailable') {
    startPolling(callbacks, assignedBorneIds)
  }

  // Bind to connection state changes
  try {
    channel.pusher.connection.bind('state_change', connectionStateHandler)
  } catch {
    // pusher-js may not expose this in all environments (e.g. mocks)
  }

  // Return cleanup function
  return function cleanup() {
    try {
      channel.pusher.connection.unbind('state_change', connectionStateHandler)
    } catch {
      // ignore
    }
    stopPolling()
    unsubscribe(ADMIN_NOTIFICATIONS_CHANNEL)
  }
}

/**
 * Stop fallback polling manually (e.g. on logout).
 */
export { stopPolling }
