/**
 * indexedDBService.js
 *
 * Offline storage service for the Borne frontend.
 * Uses idb-keyval to manage two stores:
 *   - "borne-config"        : cached borne configuration with 24h TTL
 *   - "pending-submissions" : form submissions queued while offline
 *
 * Graceful fallback: if IndexedDB is unavailable (private browsing, security
 * restrictions), all functions fail silently and return safe defaults.
 */

import { get, set, del, entries, createStore } from 'idb-keyval'

// ─── Store instances ──────────────────────────────────────────────────────────

/** @type {import('idb-keyval').UseStore | null} */
let borneConfigStore = null

/** @type {import('idb-keyval').UseStore | null} */
let pendingSubmissionsStore = null

/** Whether IndexedDB is available in this browser context (null = not yet checked) */
let _available = null

// ─── Availability check ───────────────────────────────────────────────────────

/**
 * Returns true if IndexedDB is accessible (not private browsing / blocked).
 * Uses a lightweight native API check rather than a full open/write probe,
 * so it does not consume any idb-keyval calls.
 *
 * @returns {boolean}
 */
function checkAvailability() {
  if (_available !== null) return _available

  try {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      _available = false
      return false
    }
    // In some private-browsing environments indexedDB exists but open() throws.
    // We do a synchronous existence check here; actual errors are caught per-call.
    _available = true
  } catch {
    _available = false
  }

  return _available
}

// ─── openDB ───────────────────────────────────────────────────────────────────

/**
 * Opens (or creates) the IndexedDB stores used by this service.
 * Safe to call multiple times — stores are singletons.
 *
 * Stores created:
 *   - "borne-config"        (object store inside "ema-borne-db")
 *   - "pending-submissions" (object store inside "ema-borne-db")
 *
 * @returns {Promise<void>}
 */
export async function openDB() {
  if (!checkAvailability()) return

  try {
    if (!borneConfigStore) {
      borneConfigStore = createStore('ema-borne-db', 'borne-config')
    }
    if (!pendingSubmissionsStore) {
      pendingSubmissionsStore = createStore('ema-borne-db', 'pending-submissions')
    }
  } catch {
    // IndexedDB became unavailable after the check (e.g. storage quota exceeded)
    _available = false
    borneConfigStore = null
    pendingSubmissionsStore = null
  }
}

// ─── Borne config ─────────────────────────────────────────────────────────────

const TTL_24H = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Saves a borne configuration to IndexedDB with a 24-hour TTL.
 *
 * Stored shape: { data: config, savedAt: number, ttl: number }
 *
 * @param {string} borneId
 * @param {object} config
 * @returns {Promise<void>}
 */
export async function saveBorneConfig(borneId, config) {
  if (!checkAvailability()) return
  await openDB()
  if (!borneConfigStore) return

  try {
    await set(
      borneId,
      { data: config, savedAt: Date.now(), ttl: TTL_24H },
      borneConfigStore,
    )
  } catch {
    // Fail silently — caller will fall back to network fetch
  }
}

/**
 * Retrieves a borne configuration from IndexedDB.
 * Returns null if the entry does not exist or has expired (> 24h).
 *
 * @param {string} borneId
 * @returns {Promise<object|null>}
 */
export async function getBorneConfig(borneId) {
  if (!checkAvailability()) return null
  await openDB()
  if (!borneConfigStore) return null

  try {
    const entry = await get(borneId, borneConfigStore)
    if (!entry) return null

    const { data, savedAt, ttl } = entry
    const age = Date.now() - savedAt

    if (age > ttl) {
      // Expired — remove stale entry and return null
      await del(borneId, borneConfigStore).catch(() => {})
      return null
    }

    return data
  } catch {
    return null
  }
}

// ─── Pending submissions ──────────────────────────────────────────────────────

/**
 * Saves a form submission to the pending queue with a UUID key.
 * The UUID is generated via the Web Crypto API (crypto.randomUUID).
 *
 * @param {object} submission  The form submission payload
 * @returns {Promise<string|null>}  The generated UUID key, or null on failure
 */
export async function savePendingSubmission(submission) {
  if (!checkAvailability()) return null
  await openDB()
  if (!pendingSubmissionsStore) return null

  try {
    const id = crypto.randomUUID()
    await set(id, { ...submission }, pendingSubmissionsStore)
    return id
  } catch {
    return null
  }
}

/**
 * Returns all pending submissions as an array of objects.
 * Each item includes the stored `id` key alongside the submission data.
 *
 * @returns {Promise<Array<{ id: string, [key: string]: any }>>}
 */
export async function getPendingSubmissions() {
  if (!checkAvailability()) return []
  await openDB()
  if (!pendingSubmissionsStore) return []

  try {
    const allEntries = await entries(pendingSubmissionsStore)
    return allEntries.map(([id, submission]) => ({ id, ...submission }))
  } catch {
    return []
  }
}

/**
 * Removes a pending submission by its UUID key (called after successful sync).
 *
 * @param {string} id  The UUID key returned by savePendingSubmission
 * @returns {Promise<void>}
 */
export async function removePendingSubmission(id) {
  if (!checkAvailability()) return
  await openDB()
  if (!pendingSubmissionsStore) return

  try {
    await del(id, pendingSubmissionsStore)
  } catch {
    // Fail silently
  }
}

// ─── Internal helpers (exported for testing) ─────────────────────────────────

/**
 * Resets the module-level state. Used in tests to simulate a fresh environment.
 * @internal
 */
export function _resetForTesting() {
  borneConfigStore = null
  pendingSubmissionsStore = null
  _available = null
}

/**
 * Force-sets the availability flag. Used in tests to simulate unavailable IndexedDB.
 * @internal
 * @param {boolean} value
 */
export function _setAvailableForTesting(value) {
  _available = value
}
