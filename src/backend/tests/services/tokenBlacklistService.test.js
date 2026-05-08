import { jest } from '@jest/globals'

// ─── Mock Prisma before any service import ────────────────────────────────────

const mockRevokedToken = {
  upsert: jest.fn(),
  findUnique: jest.fn(),
  deleteMany: jest.fn(),
}

const mockPrisma = {
  revokedToken: mockRevokedToken,
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Import service after mocks ───────────────────────────────────────────────

const {
  addToBlacklist,
  isBlacklisted,
  cleanupExpired,
} = await import('../../src/services/tokenBlacklistService.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFutureDate(hours = 8) {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d
}

function makePastDate(hours = 1) {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d
}

// ─── addToBlacklist ───────────────────────────────────────────────────────────

describe('addToBlacklist', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRevokedToken.upsert.mockResolvedValue({})
  })

  it('calls upsert with the correct jti and expiresAt', async () => {
    const jti = 'test-jti-123'
    const expiresAt = makeFutureDate()

    await addToBlacklist(jti, expiresAt)

    expect(mockRevokedToken.upsert).toHaveBeenCalledTimes(1)
    const call = mockRevokedToken.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ jti })
    expect(call.create.jti).toBe(jti)
    expect(call.create.expiresAt).toBe(expiresAt)
  })

  it('uses a UUID v4 as the record id', async () => {
    await addToBlacklist('jti-abc', makeFutureDate())

    const call = mockRevokedToken.upsert.mock.calls[0][0]
    expect(call.create.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('is idempotent — calling twice does not throw', async () => {
    const jti = 'duplicate-jti'
    const expiresAt = makeFutureDate()

    await addToBlacklist(jti, expiresAt)
    await addToBlacklist(jti, expiresAt)

    expect(mockRevokedToken.upsert).toHaveBeenCalledTimes(2)
  })
})

// ─── isBlacklisted ────────────────────────────────────────────────────────────

describe('isBlacklisted', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when jti is found in the DB', async () => {
    mockRevokedToken.findUnique.mockResolvedValue({
      id: 'rec-1',
      jti: 'blacklisted-jti',
      expiresAt: makeFutureDate(),
      revokedAt: new Date(),
    })

    const result = await isBlacklisted('blacklisted-jti')
    expect(result).toBe(true)
    expect(mockRevokedToken.findUnique).toHaveBeenCalledWith({
      where: { jti: 'blacklisted-jti' },
    })
  })

  it('returns false when jti is not found in the DB', async () => {
    mockRevokedToken.findUnique.mockResolvedValue(null)

    const result = await isBlacklisted('unknown-jti')
    expect(result).toBe(false)
  })

  it('returns false when jti is null or undefined', async () => {
    const r1 = await isBlacklisted(null)
    const r2 = await isBlacklisted(undefined)

    expect(r1).toBe(false)
    expect(r2).toBe(false)
    // Should not even query the DB
    expect(mockRevokedToken.findUnique).not.toHaveBeenCalled()
  })

  it('returns false when jti is an empty string', async () => {
    const result = await isBlacklisted('')
    expect(result).toBe(false)
    expect(mockRevokedToken.findUnique).not.toHaveBeenCalled()
  })
})

// ─── cleanupExpired ───────────────────────────────────────────────────────────

describe('cleanupExpired', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes tokens whose expiresAt is in the past', async () => {
    mockRevokedToken.deleteMany.mockResolvedValue({ count: 3 })

    const count = await cleanupExpired()

    expect(count).toBe(3)
    expect(mockRevokedToken.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
      },
    })
  })

  it('returns 0 when nothing to clean', async () => {
    mockRevokedToken.deleteMany.mockResolvedValue({ count: 0 })

    const count = await cleanupExpired()
    expect(count).toBe(0)
  })
})
