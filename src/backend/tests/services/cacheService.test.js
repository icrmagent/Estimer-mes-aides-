/**
 * Unit tests for cacheService.js
 *
 * Tests:
 *  - Redis hit: get() returns cached value
 *  - Redis miss: get() returns null
 *  - Redis unavailable: get() returns null (DB fallback signal)
 *  - set() stores value with TTL
 *  - set() is no-op when Redis unavailable
 *  - delete() removes key
 *  - delete() is no-op when Redis unavailable
 *  - deletePattern() removes matching keys via SCAN
 *  - deletePattern() is no-op when Redis unavailable
 */

import { jest } from '@jest/globals'

// ── Mock ioredis ──────────────────────────────────────────────────────────────

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  status: 'ready',
  on: jest.fn(),
}

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn(() => mockRedis),
}))

// ── Mock cache.js to control isRedisAvailable ─────────────────────────────────

let _redisAvailable = true

jest.unstable_mockModule('../../src/lib/cache.js', () => ({
  getRedisClient: jest.fn(() => mockRedis),
  isRedisAvailable: jest.fn(() => _redisAvailable),
}))

const { cacheService } = await import('../../src/services/cacheService.js')

// ─────────────────────────────────────────────────────────────────────────────

describe('cacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _redisAvailable = true
    mockRedis.status = 'ready'
  })

  // ── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns parsed value on Redis hit', async () => {
      const value = { id: '123', name: 'Test Borne' }
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(value))

      const result = await cacheService.get('borne-config:123')

      expect(result).toEqual(value)
      expect(mockRedis.get).toHaveBeenCalledWith('borne-config:123')
    })

    it('returns null on Redis miss (key not found)', async () => {
      mockRedis.get.mockResolvedValueOnce(null)

      const result = await cacheService.get('borne-config:missing')

      expect(result).toBeNull()
    })

    it('returns null when Redis is unavailable (DB fallback signal)', async () => {
      _redisAvailable = false

      const result = await cacheService.get('borne-config:123')

      expect(result).toBeNull()
      expect(mockRedis.get).not.toHaveBeenCalled()
    })

    it('returns null and logs warning on Redis error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockRedis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await cacheService.get('borne-config:123')

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis get error'),
        expect.any(String),
      )
      warnSpy.mockRestore()
    })
  })

  // ── set() ──────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('stores value with TTL when Redis is available', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')

      const result = await cacheService.set('borne-config:123', { id: '123' }, 3600)

      expect(result).toBe(true)
      expect(mockRedis.set).toHaveBeenCalledWith(
        'borne-config:123',
        JSON.stringify({ id: '123' }),
        'EX',
        3600,
      )
    })

    it('stores value without TTL when ttlSeconds is 0', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')

      await cacheService.set('some-key', { data: true }, 0)

      expect(mockRedis.set).toHaveBeenCalledWith('some-key', JSON.stringify({ data: true }))
    })

    it('returns false (no-op) when Redis is unavailable', async () => {
      _redisAvailable = false

      const result = await cacheService.set('borne-config:123', { id: '123' }, 3600)

      expect(result).toBe(false)
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns false and logs warning on Redis error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockRedis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await cacheService.set('borne-config:123', { id: '123' }, 3600)

      expect(result).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis set error'),
        expect.any(String),
      )
      warnSpy.mockRestore()
    })
  })

  // ── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes key when Redis is available', async () => {
      mockRedis.del.mockResolvedValueOnce(1)

      const result = await cacheService.delete('borne-config:123')

      expect(result).toBe(true)
      expect(mockRedis.del).toHaveBeenCalledWith('borne-config:123')
    })

    it('returns false (no-op) when Redis is unavailable', async () => {
      _redisAvailable = false

      const result = await cacheService.delete('borne-config:123')

      expect(result).toBe(false)
      expect(mockRedis.del).not.toHaveBeenCalled()
    })

    it('returns false and logs warning on Redis error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockRedis.del.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await cacheService.delete('borne-config:123')

      expect(result).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis delete error'),
        expect.any(String),
      )
      warnSpy.mockRestore()
    })
  })

  // ── deletePattern() ────────────────────────────────────────────────────────

  describe('deletePattern()', () => {
    it('deletes all keys matching pattern via SCAN', async () => {
      // SCAN returns cursor '0' (done) with 2 keys
      mockRedis.scan.mockResolvedValueOnce(['0', ['borne-config:1', 'borne-config:2']])
      mockRedis.del.mockResolvedValueOnce(2)

      const count = await cacheService.deletePattern('borne-config:*')

      expect(count).toBe(2)
      expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'borne-config:*', 'COUNT', 100)
      expect(mockRedis.del).toHaveBeenCalledWith('borne-config:1', 'borne-config:2')
    })

    it('handles multiple SCAN pages', async () => {
      // First page: cursor '42', 1 key
      mockRedis.scan.mockResolvedValueOnce(['42', ['borne-config:1']])
      mockRedis.del.mockResolvedValueOnce(1)
      // Second page: cursor '0', 1 key
      mockRedis.scan.mockResolvedValueOnce(['0', ['borne-config:2']])
      mockRedis.del.mockResolvedValueOnce(1)

      const count = await cacheService.deletePattern('borne-config:*')

      expect(count).toBe(2)
      expect(mockRedis.scan).toHaveBeenCalledTimes(2)
    })

    it('returns 0 when no keys match', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []])

      const count = await cacheService.deletePattern('borne-config:*')

      expect(count).toBe(0)
      expect(mockRedis.del).not.toHaveBeenCalled()
    })

    it('returns 0 (no-op) when Redis is unavailable', async () => {
      _redisAvailable = false

      const count = await cacheService.deletePattern('borne-config:*')

      expect(count).toBe(0)
      expect(mockRedis.scan).not.toHaveBeenCalled()
    })

    it('returns 0 and logs warning on Redis error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockRedis.scan.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const count = await cacheService.deletePattern('borne-config:*')

      expect(count).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis deletePattern error'),
        expect.any(String),
      )
      warnSpy.mockRestore()
    })
  })

  // ── Warning message format ─────────────────────────────────────────────────

  describe('Redis unavailable warning', () => {
    it('logs "Redis unavailable — using DB fallback" when Redis is down', async () => {
      _redisAvailable = false
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await cacheService.get('some-key')

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis unavailable — using DB fallback'),
      )
      warnSpy.mockRestore()
    })
  })
})
