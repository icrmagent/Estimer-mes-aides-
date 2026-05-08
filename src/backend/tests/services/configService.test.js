/**
 * Tests unitaires — configService.js
 *
 * Couvre :
 *   - Cache miss : interroge la DB et met en cache le résultat
 *   - Cache hit : retourne la valeur en cache sans requête DB
 *   - Cache expiry : après invalidation du TTL, interroge à nouveau la DB
 *   - invalidateConfigCache : vide le cache manuellement
 */

import { jest } from '@jest/globals'

// ─── Mock Prisma before any service import ────────────────────────────────────

const mockConfiguration = {
  findFirst: jest.fn(),
}

const mockPrisma = {
  configuration: mockConfiguration,
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Import service after mocks ───────────────────────────────────────────────

const {
  getConfiguration,
  invalidateConfigCache,
} = await import('../../src/services/configService.js')

// ─── Test data ────────────────────────────────────────────────────────────────

const mockConfig = {
  id: 1,
  primaryColor: '#5B2D8E',
  logoUrl: 'https://example.com/logo.png',
  createdAt: new Date('2024-01-01'),
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // Always invalidate cache between tests to ensure clean state
  invalidateConfigCache()
})

// ─── Cache miss ───────────────────────────────────────────────────────────────

describe('getConfiguration — cache miss', () => {
  it('interroge la DB quand le cache est vide', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    const result = await getConfiguration()

    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(1)
    expect(result).toEqual(mockConfig)
  })

  it('interroge la DB avec orderBy id desc', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    await getConfiguration()

    expect(mockConfiguration.findFirst).toHaveBeenCalledWith({
      orderBy: { id: 'desc' },
    })
  })

  it('retourne null si aucune configuration n\'existe en DB', async () => {
    mockConfiguration.findFirst.mockResolvedValue(null)

    const result = await getConfiguration()

    expect(result).toBeNull()
  })
})

// ─── Cache hit ────────────────────────────────────────────────────────────────

describe('getConfiguration — cache hit', () => {
  it('retourne la valeur en cache sans interroger la DB une seconde fois', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    // First call — populates cache
    const first = await getConfiguration()
    // Second call — should use cache
    const second = await getConfiguration()

    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(1)
    expect(first).toEqual(mockConfig)
    expect(second).toEqual(mockConfig)
  })

  it('retourne exactement le même objet depuis le cache', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    const first = await getConfiguration()
    const second = await getConfiguration()

    expect(second).toBe(first) // same reference
  })

  it('n\'interroge pas la DB pour 10 appels consécutifs après le premier', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    for (let i = 0; i < 10; i++) {
      await getConfiguration()
    }

    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(1)
  })
})

// ─── Cache expiry ─────────────────────────────────────────────────────────────

describe('getConfiguration — cache expiry', () => {
  it('interroge à nouveau la DB après invalidation du cache', async () => {
    const updatedConfig = { ...mockConfig, primaryColor: '#FF0000' }

    mockConfiguration.findFirst
      .mockResolvedValueOnce(mockConfig)
      .mockResolvedValueOnce(updatedConfig)

    // First call — populates cache
    const first = await getConfiguration()
    expect(first).toEqual(mockConfig)

    // Simulate cache expiry by invalidating manually
    invalidateConfigCache()

    // Second call — cache is expired, should hit DB again
    const second = await getConfiguration()
    expect(second).toEqual(updatedConfig)

    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(2)
  })

  it('après invalidation, le prochain appel retourne les nouvelles données DB', async () => {
    const newConfig = { id: 2, primaryColor: '#000000' }

    mockConfiguration.findFirst
      .mockResolvedValueOnce(mockConfig)
      .mockResolvedValueOnce(newConfig)

    await getConfiguration() // populate cache
    invalidateConfigCache()  // expire cache
    const result = await getConfiguration() // re-fetch

    expect(result).toEqual(newConfig)
  })
})

// ─── invalidateConfigCache ────────────────────────────────────────────────────

describe('invalidateConfigCache', () => {
  it('force un rechargement depuis la DB après invalidation', async () => {
    mockConfiguration.findFirst.mockResolvedValue(mockConfig)

    await getConfiguration() // populate cache
    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(1)

    invalidateConfigCache()

    await getConfiguration() // should re-query DB
    expect(mockConfiguration.findFirst).toHaveBeenCalledTimes(2)
  })

  it('peut être appelé plusieurs fois sans erreur', () => {
    expect(() => {
      invalidateConfigCache()
      invalidateConfigCache()
      invalidateConfigCache()
    }).not.toThrow()
  })

  it('peut être appelé avant tout appel à getConfiguration sans erreur', () => {
    expect(() => invalidateConfigCache()).not.toThrow()
  })
})
