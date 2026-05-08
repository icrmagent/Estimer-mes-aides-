/**
 * syncService.js
 *
 * Offline sync orchestrator for the Borne frontend.
 *
 * Responsibilities:
 *   - Register online/offline event listeners (window.addEventListener)
 *   - On app load: check connectivity and sync pending submissions if online
 *   - On form submit offline: caller saves to IndexedDB; syncService tracks status
 *   - On connectivity restored: auto-sync all pending submissions
 *   - On sync success: remove from IndexedDB, notify listeners
 *   - On sync failure: keep in IndexedDB, retry on next connectivity event
 *
 * Public API:
 *   initSync(apiSubmitFn)   — register listeners, trigger initial sync
 *   syncPending()           — read IndexedDB, POST each, remove on success
 *   getSyncStatus()         — { pending, syncing, lastSyncedAt }
 *   onStatusChange(cb)      — subscribe to status changes
 *   useSyncStatus()         — React hook returning current status
 */

import { useState, useEffect } from 'react'
import {
  getPendingSubmissions,
  removePendingSubmission,
} from './indexedDBService.js'

// ─── Internal state ───────────────────────────────────────────────────────────

/** @type {((submission: object) => Promise<{ok: boolean, [key: string]: any}>) | null} */
let _apiSubmitFn = null

/** @type {{ pending: number, syncing: boolean, lastSyncedAt: Date|null }} */
let _status = {
  pending: 0,
  syncing: false,
  lastSyncedAt: null,
}

/** @type {Set<(status: typeof _status) => void>} */
const _listeners = new Set()

/** Whether initSync has been called */
let _initialized = false

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Updates the internal status and notifies all registered listeners.
 * @param {Partial<typeof _status>} patch
 */
function _updateStatus(patch) {
  _status = { ..._status, ...patch }
  _listeners.forEach((cb) => {
    try {
      cb({ ..._status })
    } catch {
      // Listener errors must not crash the sync loop
    }
  })
}

/**
 * Refreshes the pending count from IndexedDB without triggering a sync.
 * @returns {Promise<void>}
 */
async function _refreshPendingCount() {
  try {
    const pending = await getPendingSubmissions()
    _updateStatus({ pending: pending.length })
  } catch {
    // Fail silently — IndexedDB may be unavailable
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialises the sync service.
 *
 * - Stores the API submit function for later use by syncPending().
 * - Registers window online/offline event listeners.
 * - Refreshes the pending count from IndexedDB.
 * - If the browser is currently online, triggers an immediate sync.
 *
 * Safe to call multiple times — subsequent calls update the apiSubmitFn
 * but do not re-register event listeners.
 *
 * @param {(submission: object) => Promise<{ok: boolean, [key: string]: any}>} apiSubmitFn
 *   Function that POSTs a single submission to the backend.
 *   Must return { ok: true } on success or { ok: false } on failure.
 * @returns {() => void}  Cleanup function that removes event listeners.
 */
export function initSync(apiSubmitFn) {
  _apiSubmitFn = apiSubmitFn

  if (!_initialized) {
    _initialized = true

    const handleOnline = () => {
      syncPending()
    }

    const handleOffline = () => {
      // Refresh pending count to keep status accurate
      _refreshPendingCount()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    // Refresh pending count on init
    _refreshPendingCount().then(() => {
      // Trigger initial sync if already online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncPending()
      }
    })

    // Return cleanup function
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
      _initialized = false
    }
  }

  // Already initialized — just update the submit function
  return () => {}
}

/**
 * Reads all pending submissions from IndexedDB and attempts to POST each one
 * to the backend via the registered apiSubmitFn.
 *
 * - On success: removes the submission from IndexedDB.
 * - On failure: keeps the submission in IndexedDB for the next retry.
 * - Updates sync status throughout (syncing flag, pending count, lastSyncedAt).
 *
 * If no apiSubmitFn has been registered (initSync not called), this is a no-op.
 * If a sync is already in progress, this call is ignored.
 *
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function syncPending() {
  if (!_apiSubmitFn) return { synced: 0, failed: 0 }
  if (_status.syncing) return { synced: 0, failed: 0 }

  let pending
  try {
    pending = await getPendingSubmissions()
  } catch {
    return { synced: 0, failed: 0 }
  }

  if (pending.length === 0) {
    _updateStatus({ pending: 0 })
    return { synced: 0, failed: 0 }
  }

  _updateStatus({ syncing: true, pending: pending.length })

  let synced = 0
  let failed = 0

  for (const submission of pending) {
    const { id, ...payload } = submission
    try {
      const result = await _apiSubmitFn(payload)
      if (result && result.ok) {
        await removePendingSubmission(id)
        synced++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  const remaining = await getPendingSubmissions().catch(() => [])
  const lastSyncedAt = synced > 0 ? new Date() : _status.lastSyncedAt

  _updateStatus({
    syncing: false,
    pending: remaining.length,
    lastSyncedAt,
  })

  return { synced, failed }
}

/**
 * Returns the current sync status snapshot.
 *
 * @returns {{ pending: number, syncing: boolean, lastSyncedAt: Date|null }}
 */
export function getSyncStatus() {
  return { ..._status }
}

/**
 * Registers a callback that is called whenever the sync status changes.
 * Returns an unsubscribe function.
 *
 * @param {(status: { pending: number, syncing: boolean, lastSyncedAt: Date|null }) => void} callback
 * @returns {() => void}  Call to unsubscribe.
 */
export function onStatusChange(callback) {
  _listeners.add(callback)
  return () => {
    _listeners.delete(callback)
  }
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * React hook that returns the current sync status and re-renders whenever it changes.
 *
 * @returns {{ pending: number, syncing: boolean, lastSyncedAt: Date|null }}
 */
export function useSyncStatus() {
  const [status, setStatus] = useState(() => getSyncStatus())

  useEffect(() => {
    // Sync with latest status on mount (may have changed before hook subscribed)
    setStatus(getSyncStatus())

    const unsubscribe = onStatusChange((newStatus) => {
      setStatus({ ...newStatus })
    })

    return unsubscribe
  }, [])

  return status
}

// ─── Internal helpers (exported for testing) ─────────────────────────────────

/**
 * Sets the API submit function directly without registering event listeners.
 * Used in tests only.
 * @internal
 * @param {Function} fn
 */
export function _setApiSubmitFnForTesting(fn) {
  _apiSubmitFn = fn
}

/**
 * Resets all module-level state. Used in tests only.
 * @internal
 */
export function _resetForTesting() {
  _apiSubmitFn = null
  _status = { pending: 0, syncing: false, lastSyncedAt: null }
  _listeners.clear()
  _initialized = false
}

/**
 * Force-sets the internal status. Used in tests only.
 * @internal
 * @param {Partial<typeof _status>} patch
 */
export function _setStatusForTesting(patch) {
  _status = { ..._status, ...patch }
}
