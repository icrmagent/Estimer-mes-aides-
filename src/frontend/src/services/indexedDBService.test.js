/**
 * indexedDBService.test.js
 *
 * Unit tests for indexedDBService.
 * idb-keyval is mocked so tests run without a real browser IndexedDB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock idb-keyval ──────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file by Vitest.
// All variables used inside the factory must be defined inside it.

vi.mock('idb-keyval', () => {
  const store = new Map()

  const mockGet = vi.fn(async (key) => store.get(key))
  const mockSet = vi.fn(async (key, value) => { store.set(key, value) })
  const mockDel = vi.fn(async (key) => { store.delete(key) })
  const mockEntries = vi.fn(async () => [...store.entries()])
  const mockCreateStore = vi.fn(() => Symbol('store'))

  return {
    get: mockGet,
    set: mockSet,
    del: mockDel,
    entries: mockEntries,
    createStore: mockCreateStore,
    // Exposed for test access
    __store: store,
    __mocks: { mockGet, mockSet, mockDel, mockEntries, mockCreateStore },
  }
})

import * as idbKeyval from 'idb-keyval'
import {
  openDB,
  saveBorneConfig,
  getBorneConfig,
  savePendingSubmission,
  getPendingSubmissions,
  removePendingSubmission,
  _resetForTesting,
  _setAvailableForTesting,
} from './indexedDBService.js'

const getStore = () => idbKeyval.__store
const getMocks = () => idbKeyval.__mocks

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('indexedDBService', () => {
  beforeEach(() => {
    getStore().clear()
    vi.clearAllMocks()
    _resetForTesting()
    // Make IndexedDB appear available by default (jsdom has no real indexedDB)
    _setAvailableForTesting(true)
  })

  // ── openDB ──────────────────────────────────────────────────────────────────

  describe('openDB()', () => {
    it('creates both stores on first call', async () => {
      await openDB()
      const { mockCreateStore } = getMocks()
      expect(mockCreateStore).toHaveBeenCalledTimes(2)
      expect(mockCreateStore).toHaveBeenCalledWith('ema-borne-db', 'borne-config')
      expect(mockCreateStore).toHaveBeenCalledWith('ema-borne-db', 'pending-submissions')
    })

    it('is idempotent — does not recreate stores on subsequent calls', async () => {
      await openDB()
      await openDB()
      const { mockCreateStore } = getMocks()
      // createStore should still only have been called twice total (once per store)
      expect(mockCreateStore).toHaveBeenCalledTimes(2)
    })
  })

  // ── saveBorneConfig / getBorneConfig ─────────────────────────────────────────

  describe('saveBorneConfig()', () => {
    it('stores config with savedAt and ttl metadata', async () => {
      const config = { formulaireId: 'abc', couleurPrimaire: '#5B2D8E' }
      const before = Date.now()
      await saveBorneConfig('borne-1', config)
      const after = Date.now()

      const { mockSet } = getMocks()
      expect(mockSet).toHaveBeenCalledOnce()
      const [key, value] = mockSet.mock.calls[0]
      expect(key).toBe('borne-1')
      expect(value.data).toEqual(config)
      expect(value.ttl).toBe(24 * 60 * 60 * 1000)
      expect(value.savedAt).toBeGreaterThanOrEqual(before)
      expect(value.savedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('getBorneConfig()', () => {
    it('returns config data when entry is fresh', async () => {
      const config = { formulaireId: 'abc' }
      getStore().set('borne-1', {
        data: config,
        savedAt: Date.now(),
        ttl: 24 * 60 * 60 * 1000,
      })

      const result = await getBorneConfig('borne-1')
      expect(result).toEqual(config)
    })

    it('returns null when entry does not exist', async () => {
      const result = await getBorneConfig('nonexistent')
      expect(result).toBeNull()
    })

    it('returns null and removes entry when TTL has expired', async () => {
      const config = { formulaireId: 'old' }
      const expiredSavedAt = Date.now() - (25 * 60 * 60 * 1000) // 25h ago
      getStore().set('borne-expired', {
        data: config,
        savedAt: expiredSavedAt,
        ttl: 24 * 60 * 60 * 1000,
      })

      const result = await getBorneConfig('borne-expired')
      expect(result).toBeNull()
      const { mockDel } = getMocks()
      expect(mockDel).toHaveBeenCalledWith('borne-expired', expect.anything())
    })

    it('returns config when entry is exactly at TTL boundary (not expired)', async () => {
      const config = { formulaireId: 'boundary' }
      // savedAt = exactly 24h ago minus 1ms → still valid
      const savedAt = Date.now() - (24 * 60 * 60 * 1000) + 1
      getStore().set('borne-boundary', {
        data: config,
        savedAt,
        ttl: 24 * 60 * 60 * 1000,
      })

      const result = await getBorneConfig('borne-boundary')
      expect(result).toEqual(config)
    })
  })

  // ── savePendingSubmission ────────────────────────────────────────────────────

  describe('savePendingSubmission()', () => {
    it('saves submission and returns a UUID key', async () => {
      const submission = { configVersion: '1.0.0', values: { nom: 'Dupont' } }
      const id = await savePendingSubmission(submission)

      expect(typeof id).toBe('string')
      // UUID v4 format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      const { mockSet } = getMocks()
      expect(mockSet).toHaveBeenCalledOnce()
      const [key, value] = mockSet.mock.calls[0]
      expect(key).toBe(id)
      expect(value).toEqual(submission)
    })

    it('generates unique keys for each submission', async () => {
      const id1 = await savePendingSubmission({ values: { nom: 'A' } })
      _resetForTesting()
      _setAvailableForTesting(true)
      const id2 = await savePendingSubmission({ values: { nom: 'B' } })
      expect(id1).not.toBe(id2)
    })
  })

  // ── getPendingSubmissions ────────────────────────────────────────────────────

  describe('getPendingSubmissions()', () => {
    it('returns empty array when no submissions are pending', async () => {
      const result = await getPendingSubmissions()
      expect(result).toEqual([])
    })

    it('returns all pending submissions with their id included', async () => {
      getStore().set('uuid-1', { configVersion: '1.0.0', values: { nom: 'Alice' } })
      getStore().set('uuid-2', { configVersion: '1.0.0', values: { nom: 'Bob' } })

      const result = await getPendingSubmissions()
      expect(result).toHaveLength(2)

      const ids = result.map((r) => r.id)
      expect(ids).toContain('uuid-1')
      expect(ids).toContain('uuid-2')

      const alice = result.find((r) => r.id === 'uuid-1')
      expect(alice.values.nom).toBe('Alice')
    })
  })

  // ── removePendingSubmission ──────────────────────────────────────────────────

  describe('removePendingSubmission()', () => {
    it('deletes the submission by id', async () => {
      getStore().set('uuid-to-delete', { values: { nom: 'Charlie' } })

      await removePendingSubmission('uuid-to-delete')

      const { mockDel } = getMocks()
      expect(mockDel).toHaveBeenCalledWith('uuid-to-delete', expect.anything())
    })

    it('does not throw when id does not exist', async () => {
      await expect(removePendingSubmission('nonexistent-id')).resolves.not.toThrow()
    })
  })

  // ── Full lifecycle ───────────────────────────────────────────────────────────

  describe('full save → get → remove lifecycle', () => {
    it('saves, retrieves, and removes a pending submission', async () => {
      const submission = { configVersion: '1.0.0', values: { nom: 'Durand' } }

      // Save
      const id = await savePendingSubmission(submission)
      expect(id).toBeTruthy()

      // Retrieve
      const pending = await getPendingSubmissions()
      expect(pending.some((p) => p.id === id)).toBe(true)

      // Remove
      await removePendingSubmission(id)
      const { mockDel } = getMocks()
      expect(mockDel).toHaveBeenCalledWith(id, expect.anything())
    })
  })

  // ── Graceful fallback when IndexedDB is unavailable ──────────────────────────

  describe('graceful fallback (IndexedDB unavailable)', () => {
    beforeEach(() => {
      // Simulate IndexedDB unavailable
      _setAvailableForTesting(false)
    })

    it('saveBorneConfig does not throw', async () => {
      await expect(saveBorneConfig('borne-1', { test: true })).resolves.not.toThrow()
    })

    it('getBorneConfig returns null', async () => {
      const result = await getBorneConfig('borne-1')
      expect(result).toBeNull()
    })

    it('savePendingSubmission returns null', async () => {
      const result = await savePendingSubmission({ values: {} })
      expect(result).toBeNull()
    })

    it('getPendingSubmissions returns empty array', async () => {
      const result = await getPendingSubmissions()
      expect(result).toEqual([])
    })

    it('removePendingSubmission does not throw', async () => {
      await expect(removePendingSubmission('some-id')).resolves.not.toThrow()
    })

    it('no idb-keyval calls are made when unavailable', async () => {
      await saveBorneConfig('borne-1', {})
      await getBorneConfig('borne-1')
      await savePendingSubmission({})
      await getPendingSubmissions()
      await removePendingSubmission('id')

      const { mockGet, mockSet, mockDel, mockEntries, mockCreateStore } = getMocks()
      expect(mockGet).not.toHaveBeenCalled()
      expect(mockSet).not.toHaveBeenCalled()
      expect(mockDel).not.toHaveBeenCalled()
      expect(mockEntries).not.toHaveBeenCalled()
      expect(mockCreateStore).not.toHaveBeenCalled()
    })
  })

  // ── Graceful fallback when createStore throws ────────────────────────────────

  describe('graceful fallback when createStore throws at runtime', () => {
    it('saveBorneConfig does not throw when createStore fails', async () => {
      const { mockCreateStore } = getMocks()
      mockCreateStore.mockImplementationOnce(() => {
        throw new Error('SecurityError: The operation is insecure.')
      })
      await expect(saveBorneConfig('borne-1', { test: true })).resolves.not.toThrow()
    })

    it('getBorneConfig returns null when createStore fails', async () => {
      const { mockCreateStore } = getMocks()
      mockCreateStore.mockImplementationOnce(() => {
        throw new Error('SecurityError')
      })
      const result = await getBorneConfig('borne-1')
      expect(result).toBeNull()
    })
  })

  // ── Graceful fallback when idb-keyval operations throw at runtime ─────────────

  describe('graceful fallback when idb operations throw at runtime', () => {
    it('getBorneConfig returns null on get() error', async () => {
      const { mockGet } = getMocks()
      mockGet.mockRejectedValueOnce(new Error('QuotaExceededError'))
      const result = await getBorneConfig('borne-1')
      expect(result).toBeNull()
    })

    it('saveBorneConfig does not throw on set() error', async () => {
      const { mockSet } = getMocks()
      mockSet.mockRejectedValueOnce(new Error('QuotaExceededError'))
      await expect(saveBorneConfig('borne-1', {})).resolves.not.toThrow()
    })

    it('savePendingSubmission returns null on set() error', async () => {
      const { mockSet } = getMocks()
      mockSet.mockRejectedValueOnce(new Error('QuotaExceededError'))
      const result = await savePendingSubmission({ values: {} })
      expect(result).toBeNull()
    })

    it('getPendingSubmissions returns empty array on entries() error', async () => {
      const { mockEntries } = getMocks()
      mockEntries.mockRejectedValueOnce(new Error('UnknownError'))
      const result = await getPendingSubmissions()
      expect(result).toEqual([])
    })

    it('removePendingSubmission does not throw on del() error', async () => {
      const { mockDel } = getMocks()
      mockDel.mockRejectedValueOnce(new Error('UnknownError'))
      await expect(removePendingSubmission('some-id')).resolves.not.toThrow()
    })
  })
})
