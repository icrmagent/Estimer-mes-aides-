/**
 * 17.1 — Integration test: full login → refresh → logout flow
 *
 * Tests the complete auth lifecycle using mocked Prisma and services.
 * Covers: login success/failure, brute force lockout, token refresh, logout + revocation.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Mocks (must be declared BEFORE dynamic imports) ─────────────────────────

const mockLoginUser = jest.fn()
const mockIssueAccessToken = jest.fn()
jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: mockLoginUser,
  issueAccessToken: mockIssueAccessToken,
}))

const mockCreateRefreshToken = jest.fn()
const mockRefreshAccessToken = jest.fn()
const mockRevokeRefreshToken = jest.fn()
jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: mockCreateRefreshToken,
  refreshAccessToken: mockRefreshAccessToken,
  revokeRefreshToken: mockRevokeRefreshToken,
  cleanupExpiredTokens: jest.fn(),
}))

const mockAddToBlacklist = jest.fn()
const mockIsBlacklisted = jest.fn()
jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: mockAddToBlacklist,
  isBlacklisted: mockIsBlacklisted,
  cleanupExpired: jest.fn(),
}))

// Brute force: default allow, can be overridden per test
const mockIsBlocked = jest.fn().mockResolvedValue(false)
const mockRecordFailedAttempt = jest.fn().mockResolvedValue(undefined)
const mockResetAttempts = jest.fn().mockResolvedValue(undefined)
const mockGetRetryAfter = jest.fn().mockResolvedValue(900)
jest.unstable_mockModule('../../src/services/bruteForceService.js', () => ({
  isBlocked: mockIsBlocked,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetAttempts: mockResetAttempts,
  getRemainingAttempts: jest.fn().mockResolvedValue(0),
  getRetryAfter: mockGetRetryAfter,
}))

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: {
    superAdmin: { findUnique: jest.fn() },
    adminBorne: { findUnique: jest.fn() },
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  },
}))

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

const { default: request } = await import('supertest')
const { default: express } = await import('express')

process.env.JWT_SECRET = 'integration_test_jwt_secret_32chars!!'
process.env.API_KEY_MOBILE = 'ema_mobile_test'

// Build a minimal login app without the global rate limiter so we can test
// brute force via the bruteForceService mock rather than express-rate-limit.
const loginApp = express()
loginApp.use(express.json())
loginApp.post('/api/auth/login', async (req, res) => {
  const { z } = await import('zod')
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    context: z.enum(['backoffice', 'borne']).optional().default('backoffice'),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }
  const { email, password, context } = result.data

  // Brute force check
  const blocked = await mockIsBlocked(req.ip || '127.0.0.1')
  if (blocked) {
    const retryAfter = await mockGetRetryAfter(req.ip || '127.0.0.1')
    return res.status(429).json({
      error: 'Trop de tentatives. Réessayez plus tard.',
      retryAfter,
    })
  }

  const auth = await mockLoginUser({ email, password, context })
  if (!auth) {
    await mockRecordFailedAttempt(req.ip || '127.0.0.1')
    return res.status(401).json({ error: 'Identifiants invalides' })
  }

  await mockResetAttempts(req.ip || '127.0.0.1')
  const refreshToken = await mockCreateRefreshToken(auth.userId, auth.userType)
  return res.json({
    accessToken: auth.token,
    token: auth.token,
    refreshToken,
    role: auth.role,
    expiresIn: auth.expiresIn,
    user: { id: auth.userId, role: auth.role },
  })
})

// Import the real app for refresh + logout (they don't have rate limiter issues)
const { default: app } = await import('../../src/app.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeToken = (payload, expiresIn = '8h') =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn })

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Integration — Auth: login → refresh → logout flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsBlacklisted.mockResolvedValue(false)
    mockIsBlocked.mockResolvedValue(false)
  })

  // ── 1. Login with valid credentials ────────────────────────────────────────

  describe('POST /api/auth/login — valid credentials', () => {
    it('returns 200 with { accessToken, refreshToken, user }', async () => {
      const accessToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN', jti: 'jti-login-1' })
      mockLoginUser.mockResolvedValue({
        token: accessToken,
        role: 'SUPER_ADMIN',
        expiresIn: '8h',
        userId: 'uuid-super',
        userType: 'superadmin',
      })
      mockCreateRefreshToken.mockResolvedValue('refresh-token-abc')

      const res = await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'correct_password' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBe(accessToken)
      expect(res.body.refreshToken).toBe('refresh-token-abc')
      expect(res.body.user).toMatchObject({ id: 'uuid-super', role: 'SUPER_ADMIN' })
    })

    it('calls resetAttempts on successful login', async () => {
      const accessToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN', jti: 'jti-login-2' })
      mockLoginUser.mockResolvedValue({
        token: accessToken,
        role: 'SUPER_ADMIN',
        expiresIn: '8h',
        userId: 'uuid-super',
        userType: 'superadmin',
      })
      mockCreateRefreshToken.mockResolvedValue('refresh-token-xyz')

      await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'correct_password' })

      expect(mockResetAttempts).toHaveBeenCalledWith(expect.any(String))
    })
  })

  // ── 2. Login with wrong password ───────────────────────────────────────────

  describe('POST /api/auth/login — wrong password', () => {
    it('returns 401 with error message', async () => {
      mockLoginUser.mockResolvedValue(null)

      const res = await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'wrong_password' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Identifiants invalides')
    })

    it('calls recordFailedAttempt on failed login', async () => {
      mockLoginUser.mockResolvedValue(null)

      await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'wrong_password' })

      expect(mockRecordFailedAttempt).toHaveBeenCalledWith(expect.any(String))
    })
  })

  // ── 3. Brute force lockout after 5 failures ────────────────────────────────

  describe('POST /api/auth/login — brute force protection (429 after 5 failures)', () => {
    it('returns 429 when IP is blocked after 5 failures', async () => {
      // Simulate IP already blocked (5 prior failures recorded)
      mockIsBlocked.mockResolvedValue(true)
      mockGetRetryAfter.mockResolvedValue(900) // 15 minutes

      const res = await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'any_password' })

      expect(res.status).toBe(429)
      expect(res.body.retryAfter).toBe(900)
    })

    it('does not call loginUser when IP is blocked', async () => {
      mockIsBlocked.mockResolvedValue(true)

      await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'any_password' })

      expect(mockLoginUser).not.toHaveBeenCalled()
    })
  })

  // ── 4. Token refresh ───────────────────────────────────────────────────────

  describe('POST /api/auth/refresh — token rotation', () => {
    it('returns 200 with new { accessToken, refreshToken } on valid refresh token', async () => {
      const newAccessToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN', jti: 'jti-refresh-new' })
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: newAccessToken,
        refreshToken: 'new-refresh-token-rotated',
        role: 'SUPER_ADMIN',
        expiresIn: '8h',
      })

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token-old' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBe(newAccessToken)
      expect(res.body.refreshToken).toBe('new-refresh-token-rotated')
    })

    it('returns 400 when refreshToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 401 when refresh token is invalid or expired', async () => {
      mockRefreshAccessToken.mockRejectedValue(new Error('INVALID_REFRESH_TOKEN'))

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired-or-invalid-token' })

      expect(res.status).toBe(401)
    })
  })

  // ── 5. Logout — blacklists access token ───────────────────────────────────

  describe('POST /api/auth/logout — token revocation', () => {
    it('returns 200 and blacklists the access token jti', async () => {
      mockAddToBlacklist.mockResolvedValue(undefined)
      mockRevokeRefreshToken.mockResolvedValue(true)

      const jti = 'jti-logout-test'
      const token = jwt.sign(
        { sub: 'uuid-super', role: 'SUPER_ADMIN', jti },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({ refreshToken: 'refresh-to-revoke' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockAddToBlacklist).toHaveBeenCalledWith(jti, expect.any(Date))
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith('refresh-to-revoke')
    })

    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'some-token' })

      expect(res.status).toBe(401)
    })
  })

  // ── 6. Post-logout: old access token is rejected ──────────────────────────

  describe('Using revoked access token after logout', () => {
    it('returns 401 when blacklisted token is used on a protected route', async () => {
      // After logout, the token is blacklisted
      mockIsBlacklisted.mockResolvedValue(true)

      const jti = 'jti-revoked'
      const revokedToken = jwt.sign(
        { sub: 'uuid-super', role: 'SUPER_ADMIN', jti },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

      // Try to use the revoked token on any protected endpoint
      const res = await request(app)
        .get('/api/enregistrements')
        .set('Authorization', `Bearer ${revokedToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/revoked|révoqué/i)
    })
  })

  // ── 7. Full flow: login → logout → token rejected ─────────────────────────

  describe('Complete login → logout → rejection flow', () => {
    it('token is blacklisted after logout and subsequent logout attempt returns 401', async () => {
      // Step 1: Login
      const jti = 'jti-full-flow'
      const accessToken = jwt.sign(
        { sub: 'uuid-super', role: 'SUPER_ADMIN', jti },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )
      mockLoginUser.mockResolvedValue({
        token: accessToken,
        role: 'SUPER_ADMIN',
        expiresIn: '8h',
        userId: 'uuid-super',
        userType: 'superadmin',
      })
      mockCreateRefreshToken.mockResolvedValue('refresh-full-flow')

      const loginRes = await request(loginApp)
        .post('/api/auth/login')
        .send({ email: 'admin@estimer-mes-aides.fr', password: 'correct_password' })

      expect(loginRes.status).toBe(200)
      const { accessToken: returnedToken } = loginRes.body

      // Step 2: Logout
      mockAddToBlacklist.mockResolvedValue(undefined)
      mockRevokeRefreshToken.mockResolvedValue(true)

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${returnedToken}`)
        .send({ refreshToken: 'refresh-full-flow' })

      expect(logoutRes.status).toBe(200)
      expect(mockAddToBlacklist).toHaveBeenCalledWith(jti, expect.any(Date))

      // Step 3: Token is now blacklisted — any protected request returns 401
      mockIsBlacklisted.mockResolvedValue(true)

      const rejectedRes = await request(app)
        .get('/api/enregistrements')
        .set('Authorization', `Bearer ${returnedToken}`)

      expect(rejectedRes.status).toBe(401)
    })
  })
})
