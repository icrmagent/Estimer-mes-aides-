/**
 * syncService.test.js
 *
 * Unit tests for syncService.js
 *
 * indexedDBService is mocked so tests run without a real browser IndexedDB.
 * window.addEventListener / navigator.onLine are controlled via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock indexedDBService ────────────────────────────────────────────────────

vi.mock('./indexedDBService.js', () => {
  const mockGetPendingSubmissions = vi.fn(async () => [])
  const mockRemovePendingSubmission = vi.fn(async () => {})

  return {
    getPendingSubmissions: mockGetPendingSubmissions,
    removePendingSubmission: mockRemovePendingSubmission,
    __mocks: { mockGetPendingSubmissions, mockRemovePendingSubmission },
  }
})

import * as indexedDBService from './indexedDBService.js'
import {
  initSync,
  syncPending,
  getSyncStatus,
  onStatusChange,
  _resetForTesting,
  _setStatusForTesting,
  _setApiSubmitFnForTesting,
} from './syncService.js'

const getMocks = () => indexedDBService.__mocks

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a mock API submit function that always succeeds */
const makeSuccessApi = () => vi.fn(async () => ({ ok: true }))

/** Creates a mock API submit function that always fails */
const makeFailApi = () => vi.fn(async () => ({ ok: false, error: 'Network error' }))

/** Creates a mock API submit function that throws */
const makeThrowApi = () => vi.fn(async () => { throw new Error('Network error') })

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('syncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetForTesting()

    // Default: no pending submissions
    getMocks().mockGetPendingSubmissions.mockResolvedValue([])
    getMocks().mockRemovePendingSubmission.mockResolvedValue(undefined)

    // Default: online
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── getSyncStatus ────────────────────────────────────────────────────────────

  describe('getSyncStatus()', () => {
    it('returns initial status with pending=0, syncing=false, lastSyncedAt=null', () => {
      const status = getSyncStatus()
      expect(status).toEqual({ pending: 0, syncing: false, lastSyncedAt: null })
    })

    it('returns a snapshot (not a reference)', () => {
      const s1 = getSyncStatus()
      const s2 = getSyncStatus()
      expect(s1).not.toBe(s2)
      expect(s1).toEqual(s2)
    })
  })

  // ── onStatusChange ───────────────────────────────────────────────────────────

  describe('onStatusChange()', () => {
    it('registers a callback and calls it when syncPending runs', async () => {
      const cb = vi.fn()
      onStatusChange(cb)

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await syncPending()

      expect(cb).toHaveBeenCalled()
    })

    it('returns an unsubscribe function that stops future calls', async () => {
      const cb = vi.fn()
      const unsubscribe = onStatusChange(cb)
      unsubscribe()

      // Trigger a status change — callback should NOT fire
      _setStatusForTesting({ pending: 5 })
      expect(cb).not.toHaveBeenCalled()
    })

    it('multiple listeners all receive status updates', async () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      onStatusChange(cb1)
      onStatusChange(cb2)

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await syncPending()

      expect(cb1).toHaveBeenCalled()
      expect(cb2).toHaveBeenCalled()
    })

    it('a listener that throws does not crash the sync loop', async () => {
      onStatusChange(() => { throw new Error('Listener error') })

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await expect(syncPending()).resolves.not.toThrow()
    })
  })

  // ── initSync ─────────────────────────────────────────────────────────────────

  describe('initSync()', () => {
    it('registers online and offline event listeners', () => {
      const addEventListenerSpy = vi.fn()
      vi.stubGlobal('window', { addEventListener: addEventListenerSpy, removeEventListener: vi.fn() })
      vi.stubGlobal('navigator', { onLine: false }) // offline so no async sync

      initSync(makeSuccessApi())

      const events = addEventListenerSpy.mock.calls.map(([event]) => event)
      expect(events).toContain('online')
      expect(events).toContain('offline')
    })

    it('returns a cleanup function that removes event listeners', () => {
      const removeEventListenerSpy = vi.fn()
      vi.stubGlobal('window', {
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerSpy,
      })
      vi.stubGlobal('navigator', { onLine: false })

      const cleanup = initSync(makeSuccessApi())
      cleanup()

      const events = removeEventListenerSpy.mock.calls.map(([event]) => event)
      expect(events).toContain('online')
      expect(events).toContain('offline')
    })

    it('triggers syncPending on init when online and there are pending submissions', async () => {
      vi.stubGlobal('navigator', { onLine: true })

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } }]) // init count
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } }]) // syncPending read
        .mockResolvedValueOnce([]) // after sync

      const apiSubmit = makeSuccessApi()
      initSync(apiSubmit)

      // Wait for async init to complete
      await new Promise((r) => setTimeout(r, 30))

      expect(apiSubmit).toHaveBeenCalledOnce()
    })

    it('does NOT trigger syncPending on init when offline', async () => {
      vi.stubGlobal('navigator', { onLine: false })

      getMocks().mockGetPendingSubmissions.mockResolvedValue([
        { id: 'uuid-1', configVersion: '1.0.0', values: {} },
      ])

      const apiSubmit = makeSuccessApi()
      initSync(apiSubmit)

      await new Promise((r) => setTimeout(r, 30))

      expect(apiSubmit).not.toHaveBeenCalled()
    })

    it('does not re-register listeners on second call', () => {
      const addEventListenerSpy = vi.fn()
      vi.stubGlobal('window', { addEventListener: addEventListenerSpy, removeEventListener: vi.fn() })
      vi.stubGlobal('navigator', { onLine: false })

      initSync(makeSuccessApi())
      initSync(makeSuccessApi())

      // Should only register once (2 events: online + offline)
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2)
    })

    it('triggers syncPending when online event fires', async () => {
      let onlineHandler
      vi.stubGlobal('window', {
        addEventListener: vi.fn((event, handler) => {
          if (event === 'online') onlineHandler = handler
        }),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('navigator', { onLine: false })

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([]) // init count (offline, no sync)
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }]) // online event sync read
        .mockResolvedValueOnce([]) // after sync

      const apiSubmit = makeSuccessApi()
      initSync(apiSubmit)

      // Wait for init
      await new Promise((r) => setTimeout(r, 10))

      // Simulate coming back online
      onlineHandler()
      await new Promise((r) => setTimeout(r, 20))

      expect(apiSubmit).toHaveBeenCalled()
    })
  })

  // ── syncPending ──────────────────────────────────────────────────────────────

  describe('syncPending()', () => {
    it('returns { synced: 0, failed: 0 } when no apiSubmitFn is registered', async () => {
      const result = await syncPending()
      expect(result).toEqual({ synced: 0, failed: 0 })
    })

    it('returns { synced: 0, failed: 0 } when no pending submissions', async () => {
      getMocks().mockGetPendingSubmissions.mockResolvedValue([])
      _setApiSubmitFnForTesting(makeSuccessApi())

      const result = await syncPending()
      expect(result).toEqual({ synced: 0, failed: 0 })
    })

    it('syncs all pending submissions successfully', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } },
        { id: 'uuid-2', configVersion: '1.0.0', values: { nom: 'Bob' } },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)  // initial read
        .mockResolvedValueOnce([])           // after sync (remaining)

      const apiSubmit = makeSuccessApi()
      _setApiSubmitFnForTesting(apiSubmit)

      const result = await syncPending()

      expect(result).toEqual({ synced: 2, failed: 0 })
      expect(apiSubmit).toHaveBeenCalledTimes(2)
      expect(getMocks().mockRemovePendingSubmission).toHaveBeenCalledWith('uuid-1')
      expect(getMocks().mockRemovePendingSubmission).toHaveBeenCalledWith('uuid-2')
    })

    it('keeps failed submissions in IndexedDB', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce(submissions) // still there after failure

      _setApiSubmitFnForTesting(makeFailApi())

      const result = await syncPending()

      expect(result).toEqual({ synced: 0, failed: 1 })
      expect(getMocks().mockRemovePendingSubmission).not.toHaveBeenCalled()
    })

    it('handles partial success — syncs some, keeps others', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } },
        { id: 'uuid-2', configVersion: '1.0.0', values: { nom: 'Bob' } },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([submissions[1]]) // uuid-2 still pending

      const apiSubmit = vi.fn()
        .mockResolvedValueOnce({ ok: true })   // uuid-1 succeeds
        .mockResolvedValueOnce({ ok: false })  // uuid-2 fails

      _setApiSubmitFnForTesting(apiSubmit)

      const result = await syncPending()

      expect(result).toEqual({ synced: 1, failed: 1 })
      expect(getMocks().mockRemovePendingSubmission).toHaveBeenCalledWith('uuid-1')
      expect(getMocks().mockRemovePendingSubmission).not.toHaveBeenCalledWith('uuid-2')
    })

    it('handles API function that throws — keeps submission in IndexedDB', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: {} },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce(submissions)

      _setApiSubmitFnForTesting(makeThrowApi())

      const result = await syncPending()

      expect(result).toEqual({ synced: 0, failed: 1 })
      expect(getMocks().mockRemovePendingSubmission).not.toHaveBeenCalled()
    })

    it('does not call apiSubmitFn with the id field', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([])

      const apiSubmit = makeSuccessApi()
      _setApiSubmitFnForTesting(apiSubmit)

      await syncPending()

      const callArg = apiSubmit.mock.calls[0][0]
      expect(callArg).not.toHaveProperty('id')
      expect(callArg).toHaveProperty('configVersion', '1.0.0')
      expect(callArg).toHaveProperty('values')
    })

    it('ignores concurrent syncPending calls (no double-sync)', async () => {
      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: {} },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([])

      // Slow API to ensure first sync is still in progress when second is called
      const apiSubmit = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return { ok: true }
      })
      _setApiSubmitFnForTesting(apiSubmit)

      // Start two syncs concurrently
      const [r1, r2] = await Promise.all([syncPending(), syncPending()])

      // One should have run, the other should have been a no-op
      expect(apiSubmit).toHaveBeenCalledTimes(1)
      expect(r2).toEqual({ synced: 0, failed: 0 })
    })

    it('updates status to syncing=true during sync, then false after', async () => {
      const statusHistory = []
      onStatusChange((s) => statusHistory.push({ ...s }))

      const submissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: {} },
      ]
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await syncPending()

      const syncingStates = statusHistory.map((s) => s.syncing)
      expect(syncingStates).toContain(true)
      // Final state should be not syncing
      expect(statusHistory[statusHistory.length - 1].syncing).toBe(false)
    })

    it('updates lastSyncedAt after a successful sync', async () => {
      const before = new Date()

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await syncPending()

      const { lastSyncedAt } = getSyncStatus()
      expect(lastSyncedAt).toBeInstanceOf(Date)
      expect(lastSyncedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })

    it('does NOT update lastSyncedAt when all submissions fail', async () => {
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])

      _setApiSubmitFnForTesting(makeFailApi())
      await syncPending()

      const { lastSyncedAt } = getSyncStatus()
      expect(lastSyncedAt).toBeNull()
    })

    it('updates pending count to 0 when all submissions synced', async () => {
      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce([{ id: 'uuid-1', configVersion: '1.0.0', values: {} }])
        .mockResolvedValueOnce([])

      _setApiSubmitFnForTesting(makeSuccessApi())
      await syncPending()

      expect(getSyncStatus().pending).toBe(0)
    })

    it('handles getPendingSubmissions throwing gracefully', async () => {
      getMocks().mockGetPendingSubmissions.mockRejectedValueOnce(new Error('IDB error'))

      _setApiSubmitFnForTesting(makeSuccessApi())

      const result = await syncPending()
      expect(result).toEqual({ synced: 0, failed: 0 })
    })
  })

  // ── Status transitions ───────────────────────────────────────────────────────

  describe('status transitions', () => {
    it('pending count reflects number of items in IndexedDB after init (offline)', async () => {
      vi.stubGlobal('navigator', { onLine: false })

      getMocks().mockGetPendingSubmissions.mockResolvedValue([
        { id: 'uuid-1', values: {} },
        { id: 'uuid-2', values: {} },
      ])

      initSync(makeSuccessApi())
      await new Promise((r) => setTimeout(r, 20))

      expect(getSyncStatus().pending).toBe(2)
    })
  })

  // ── Full lifecycle ───────────────────────────────────────────────────────────

  describe('full offline → online sync lifecycle', () => {
    it('saves offline, syncs on reconnect, clears pending', async () => {
      // Start offline
      vi.stubGlobal('navigator', { onLine: false })

      let onlineHandler
      vi.stubGlobal('window', {
        addEventListener: vi.fn((event, handler) => {
          if (event === 'online') onlineHandler = handler
        }),
        removeEventListener: vi.fn(),
      })

      const pendingSubmissions = [
        { id: 'uuid-1', configVersion: '1.0.0', values: { nom: 'Alice' } },
      ]

      getMocks().mockGetPendingSubmissions
        .mockResolvedValueOnce(pendingSubmissions) // init count (offline)
        .mockResolvedValueOnce(pendingSubmissions) // syncPending read (online event)
        .mockResolvedValueOnce([])                 // after sync (remaining)

      const apiSubmit = makeSuccessApi()
      initSync(apiSubmit)

      // Wait for init
      await new Promise((r) => setTimeout(r, 20))

      // Should not have synced yet (offline)
      expect(apiSubmit).not.toHaveBeenCalled()
      expect(getSyncStatus().pending).toBe(1)

      // Simulate coming back online
      onlineHandler()
      await new Promise((r) => setTimeout(r, 30))

      expect(apiSubmit).toHaveBeenCalledOnce()
      expect(getMocks().mockRemovePendingSubmission).toHaveBeenCalledWith('uuid-1')
      expect(getSyncStatus().pending).toBe(0)
      expect(getSyncStatus().lastSyncedAt).toBeInstanceOf(Date)
    })
  })
})
