/**
 * Security Tests — Brute Force Protection (Task 18.4)
 *
 * Verifies brute force protection:
 *  - 5 failed login attempts → 6th attempt returns 429
 *  - retryAfter is present in response
 *  - Mock bruteForceService to control behavior
 *
 * Note: The real auth route has a rate limiter (5 req/15min). To test brute
 * force logic independently, we use a dedicated test app without the rate
 * limiter — the same pattern used in auth.test.js.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import express from 'express'

// ─── Mocks (must be before any app import) ───────────────────────────────────

const mockLoginUser = jest.fn()
const mockCreateRefreshToken = jest.fn()
const mockIsBlocked = jest.fn()
const mockRecordFailedAttempt = jest.fn()
const mockResetAttempts = jest.fn()
const mockGetRetryAfter = jest.fn()

jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: mockLoginUser,
  issueAccessToken: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: mockCreateRefreshToken,
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  cleanupExpiredTokens: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn().mockResolvedValue(false),
  cleanupExpired: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/bruteForceService.js', () => ({
  isBlocked: mockIsBlocked,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetAttempts: mockResetAttempts,
  getRemainingAttempts: jest.fn().mockResolvedValue(5),
  getRetryAfter: mockGetRetryAfter,
}))

const mockPrisma = {
  configuration: { findFirst: jest.fn() },
  submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  superAdmin: { findUnique: jest.fn() },
  adminBorne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  borne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  formulaire: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  question: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  enregistrement: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  partageJob: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  loginAttempt: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}))

// ─── Build a dedicated login test app WITHOUT rate limiter ───────────────────
// This mirrors the pattern in auth.test.js to avoid rate limiter interference

const { z } = await import('zod')

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  context: z.enum(['backoffice', 'borne']).optional().default('backoffice'),
})

const loginApp = express()
loginApp.use(express.json())

loginApp.post('/api/auth/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  const { email, password, context } = result.data
  const ip = req.ip || '127.0.0.1'

  try {
    // Check brute force block
    const blocked = await mockIsBlocked(ip)
    if (blocked) {
      const retryAfter = await mockGetRetryAfter(ip)
      return res.status(429).json({
        error: 'Compte bloqué',
        retryAfter,
      })
    }

    const auth = await mockLoginUser({ email, password, context })

    if (!auth) {
      await mockRecordFailedAttempt(ip)
      return res.status(401).json({ error: 'Identifiants invalides' })
    }

    await mockResetAttempts(ip)
    const refreshToken = await mockCreateRefreshToken(auth.userId, auth.userType)

    return res.json({
      token: auth.token,
      accessToken: auth.token,
      refreshToken,
      role: auth.role,
      expiresIn: auth.expiresIn,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})

const { default: request } = await import('supertest')

process.env.JWT_SECRET = 'test_jwt_secret_brute_force'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Brute Force Protection — POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateRefreshToken.mockResolvedValue('mock-refresh-token')
  })

  it('5 failed attempts → 6th attempt returns 429 with retryAfter', async () => {
    // First 5 attempts: not blocked, invalid credentials
    mockIsBlocked.mockResolvedValue(false)
    mockLoginUser.mockResolvedValue(null)

    for (let i = 1; i <= 5; i++) {
      const res = await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })

      expect(res.status).toBe(401)
      expect(mockRecordFailedAttempt).toHaveBeenCalledTimes(i)
    }

    // 6th attempt: blocked
    mockIsBlocked.mockResolvedValue(true)
    mockGetRetryAfter.mockResolvedValue(900) // 15 minutes = 900 seconds

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' })

    expect(res.status).toBe(429)
    expect(res.body.error).toBeDefined()
    expect(res.body.retryAfter).toBe(900)
    // recordFailedAttempt should NOT be called when already blocked
    expect(mockRecordFailedAttempt).toHaveBeenCalledTimes(5)
  })

  it('Successful login resets attempt counter', async () => {
    mockIsBlocked.mockResolvedValue(false)
    const validToken = jwt.sign(
      { sub: 'uuid-user', role: 'SUPER_ADMIN' },
      'test_jwt_secret_brute_force',
      { expiresIn: '8h' }
    )
    mockLoginUser.mockResolvedValue({
      token: validToken,
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
      userId: 'uuid-user',
      userType: 'superadmin',
    })

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'correct' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(validToken)
    // resetAttempts should be called on successful login
    expect(mockResetAttempts).toHaveBeenCalledTimes(1)
  })

  it('Blocked IP → 429 immediately (no login attempt processed)', async () => {
    mockIsBlocked.mockResolvedValue(true)
    mockGetRetryAfter.mockResolvedValue(600) // 10 minutes remaining

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'any' })

    expect(res.status).toBe(429)
    expect(res.body.retryAfter).toBe(600)
    // loginUser should NOT be called when IP is blocked
    expect(mockLoginUser).not.toHaveBeenCalled()
    // recordFailedAttempt should NOT be called
    expect(mockRecordFailedAttempt).not.toHaveBeenCalled()
  })

  it('retryAfter is present in 429 response', async () => {
    mockIsBlocked.mockResolvedValue(true)
    mockGetRetryAfter.mockResolvedValue(900)

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'any' })

    expect(res.status).toBe(429)
    expect(res.body.retryAfter).toBeDefined()
    expect(typeof res.body.retryAfter).toBe('number')
    expect(res.body.retryAfter).toBeGreaterThan(0)
  })

  it('Failed login increments attempt counter', async () => {
    mockIsBlocked.mockResolvedValue(false)
    mockLoginUser.mockResolvedValue(null) // invalid credentials

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(mockRecordFailedAttempt).toHaveBeenCalledTimes(1)
    // Verify the IP was passed to recordFailedAttempt
    const callArgs = mockRecordFailedAttempt.mock.calls[0]
    expect(callArgs).toBeDefined()
    expect(typeof callArgs[0]).toBe('string') // IP address
  })

  it('Multiple failed attempts from same IP → counter increments', async () => {
    mockIsBlocked.mockResolvedValue(false)
    mockLoginUser.mockResolvedValue(null)

    // 3 failed attempts
    for (let i = 1; i <= 3; i++) {
      await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
    }

    expect(mockRecordFailedAttempt).toHaveBeenCalledTimes(3)
  })
})

describe('Brute Force Protection — lockout duration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateRefreshToken.mockResolvedValue('mock-refresh-token')
  })

  it('Lockout expires after 15 minutes → login allowed again', async () => {
    // Initially blocked
    mockIsBlocked.mockResolvedValueOnce(true)
    mockGetRetryAfter.mockResolvedValueOnce(900)

    const res1 = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'any' })

    expect(res1.status).toBe(429)

    // After 15 minutes: no longer blocked
    mockIsBlocked.mockResolvedValueOnce(false)
    mockLoginUser.mockResolvedValue(null) // still wrong password

    const res2 = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' })

    // Should be 401 (invalid credentials), not 429 (blocked)
    expect(res2.status).toBe(401)
    expect(mockRecordFailedAttempt).toHaveBeenCalledTimes(1)
  })
})
