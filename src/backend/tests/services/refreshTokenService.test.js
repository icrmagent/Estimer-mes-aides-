import { jest } from '@jest/globals'

// ─── Mock Prisma before any service import ────────────────────────────────────

const mockRefreshToken = {
  create: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  deleteMany: jest.fn(),
}

const mockPrisma = {
  refreshToken: mockRefreshToken,
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Import service after mocks ───────────────────────────────────────────────

const {
  createRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  cleanupExpiredTokens,
} = await import('../../src/services/refreshTokenService.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFutureDate(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function makePastDate(days = 1) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

// ─── createRefreshToken ───────────────────────────────────────────────────────

describe('createRefreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRefreshToken.create.mockResolvedValue({})
  })

  it('returns a non-empty opaque token string', async () => {
    const token = await createRefreshToken('user-123', 'superadmin')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(10)
  })

  it('stores a bcrypt hash (not the raw token) in the DB', async () => {
    const rawToken = await createRefreshToken('user-123', 'superadmin')

    expect(mockRefreshToken.create).toHaveBeenCalledTimes(1)
    const callArg = mockRefreshToken.create.mock.calls[0][0]
    const storedHash = callArg.data.tokenHash

    // The stored value must NOT equal the raw token
    expect(storedHash).not.toBe(rawToken)
    // The stored value must look like a bcrypt hash ($2b$...)
    expect(storedHash).toMatch(/^\$2[ab]\$/)
  })

  it('sets expiresAt ~30 days in the future', async () => {
    await createRefreshToken('user-123', 'superadmin')

    const callArg = mockRefreshToken.create.mock.calls[0][0]
    const expiresAt = callArg.data.expiresAt
    const now = new Date()
    const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24)

    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)
  })

  it('stores the correct userId and userType', async () => {
    await createRefreshToken('user-abc', 'adminborne')

    const callArg = mockRefreshToken.create.mock.calls[0][0]
    expect(callArg.data.userId).toBe('user-abc')
    expect(callArg.data.userType).toBe('adminborne')
  })

  it('generates a UUID v4 as the record id', async () => {
    await createRefreshToken('user-123', 'superadmin')

    const callArg = mockRefreshToken.create.mock.calls[0][0]
    const id = callArg.data.id
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('each call returns a different token', async () => {
    const t1 = await createRefreshToken('user-123', 'superadmin')
    const t2 = await createRefreshToken('user-123', 'superadmin')
    expect(t1).not.toBe(t2)
  })
})

// ─── refreshAccessToken ───────────────────────────────────────────────────────

describe('refreshAccessToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws INVALID_REFRESH_TOKEN when no candidates exist', async () => {
    mockRefreshToken.findMany.mockResolvedValue([])

    await expect(
      refreshAccessToken('bad-token', jest.fn())
    ).rejects.toThrow('INVALID_REFRESH_TOKEN')
  })

  it('throws INVALID_REFRESH_TOKEN when token does not match any hash', async () => {
    // Provide a candidate with a hash that won't match 'bad-token'
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.default.hash('correct-token', 10)

    mockRefreshToken.findMany.mockResolvedValue([
      {
        id: 'rt-1',
        tokenHash: hash,
        userId: 'user-1',
        userType: 'superadmin',
        expiresAt: makeFutureDate(),
        revokedAt: null,
      },
    ])

    await expect(
      refreshAccessToken('wrong-token', jest.fn())
    ).rejects.toThrow('INVALID_REFRESH_TOKEN')
  })

  it('revokes old token and issues new pair on valid token', async () => {
    const bcrypt = await import('bcryptjs')
    const rawToken = 'valid-raw-token-abc'
    const hash = await bcrypt.default.hash(rawToken, 10)

    mockRefreshToken.findMany.mockResolvedValue([
      {
        id: 'rt-1',
        tokenHash: hash,
        userId: 'user-1',
        userType: 'superadmin',
        expiresAt: makeFutureDate(),
        revokedAt: null,
      },
    ])
    mockRefreshToken.update.mockResolvedValue({})
    mockRefreshToken.create.mockResolvedValue({})

    const mockIssueAccessToken = jest.fn().mockResolvedValue({
      token: 'new-access-token',
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
    })

    const result = await refreshAccessToken(rawToken, mockIssueAccessToken)

    // Old token must be revoked
    expect(mockRefreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    })

    // New access token issued
    expect(mockIssueAccessToken).toHaveBeenCalledWith('user-1', 'superadmin')
    expect(result.accessToken).toBe('new-access-token')
    expect(result.role).toBe('SUPER_ADMIN')

    // New refresh token created
    expect(mockRefreshToken.create).toHaveBeenCalledTimes(1)
    expect(typeof result.refreshToken).toBe('string')
    expect(result.refreshToken.length).toBeGreaterThan(10)
  })
})

// ─── revokeRefreshToken ───────────────────────────────────────────────────────

describe('revokeRefreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns false when token is not found', async () => {
    mockRefreshToken.findMany.mockResolvedValue([])

    const result = await revokeRefreshToken('nonexistent-token')
    expect(result).toBe(false)
  })

  it('marks matching token as revoked and returns true', async () => {
    const bcrypt = await import('bcryptjs')
    const rawToken = 'token-to-revoke'
    const hash = await bcrypt.default.hash(rawToken, 10)

    mockRefreshToken.findMany.mockResolvedValue([
      {
        id: 'rt-2',
        tokenHash: hash,
        userId: 'user-2',
        userType: 'adminborne',
        expiresAt: makeFutureDate(),
        revokedAt: null,
      },
    ])
    mockRefreshToken.update.mockResolvedValue({})

    const result = await revokeRefreshToken(rawToken)

    expect(result).toBe(true)
    expect(mockRefreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-2' },
      data: { revokedAt: expect.any(Date) },
    })
  })
})

// ─── cleanupExpiredTokens ─────────────────────────────────────────────────────

describe('cleanupExpiredTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes expired and revoked tokens', async () => {
    mockRefreshToken.deleteMany.mockResolvedValue({ count: 5 })

    const count = await cleanupExpiredTokens()

    expect(count).toBe(5)
    expect(mockRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { revokedAt: { not: null } },
        ],
      },
    })
  })

  it('returns 0 when nothing to clean', async () => {
    mockRefreshToken.deleteMany.mockResolvedValue({ count: 0 })

    const count = await cleanupExpiredTokens()
    expect(count).toBe(0)
  })
})
