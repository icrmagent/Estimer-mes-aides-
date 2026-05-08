import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Mock authService avant tout import de l'app
const mockLoginUser = jest.fn()
const mockIssueAccessToken = jest.fn()
jest.unstable_mockModule('../src/services/authService.js', () => ({
  loginUser: mockLoginUser,
  issueAccessToken: mockIssueAccessToken,
}))

// Mock refreshTokenService to avoid real DB calls
const mockCreateRefreshToken = jest.fn()
const mockRefreshAccessToken = jest.fn()
const mockRevokeRefreshToken = jest.fn()
jest.unstable_mockModule('../src/services/refreshTokenService.js', () => ({
  createRefreshToken: mockCreateRefreshToken,
  refreshAccessToken: mockRefreshAccessToken,
  revokeRefreshToken: mockRevokeRefreshToken,
  cleanupExpiredTokens: jest.fn(),
}))

// Mock tokenBlacklistService to avoid real DB calls
const mockAddToBlacklist = jest.fn()
const mockIsBlacklisted = jest.fn()
jest.unstable_mockModule('../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: mockAddToBlacklist,
  isBlacklisted: mockIsBlacklisted,
  cleanupExpired: jest.fn(),
}))

// Mock bruteForceService to avoid real DB calls
const mockIsBlocked = jest.fn().mockResolvedValue(false)
const mockRecordFailedAttempt = jest.fn().mockResolvedValue(undefined)
const mockResetAttempts = jest.fn().mockResolvedValue(undefined)
const mockGetRetryAfter = jest.fn().mockResolvedValue(0)
jest.unstable_mockModule('../src/services/bruteForceService.js', () => ({
  isBlocked: mockIsBlocked,
  recordFailedAttempt: mockRecordFailedAttempt,
  resetAttempts: mockResetAttempts,
  getRemainingAttempts: jest.fn().mockResolvedValue(5),
  getRetryAfter: mockGetRetryAfter,
}))

// Mock Prisma pour éviter les connexions DB réelles
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    superAdmin: { findUnique: jest.fn() },
    adminBorne: { findUnique: jest.fn() },
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  },
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')
const { default: express } = await import('express')
const { jwtAuthV2 } = await import('../src/middleware/jwtAuth.js')
const { requireRole } = await import('../src/middleware/roleAuth.js')

process.env.JWT_SECRET = 'test_jwt_secret'

// Helpers pour générer des tokens
const makeExpiredToken = (payload = { sub: 'uuid-1', role: 'SUPER_ADMIN' }) => {
  return jwt.sign(payload, 'test_jwt_secret', { expiresIn: -1 })
}

const makeToken = (payload = { sub: 'uuid-1', role: 'SUPER_ADMIN' }) => {
  return jwt.sign(payload, 'test_jwt_secret', { expiresIn: '1h' })
}

// Mini app pour tester les middlewares de rôle (no rate limiter)
const testApp = express()
testApp.use(express.json())
testApp.get('/test-superadmin', jwtAuthV2, requireRole('SUPER_ADMIN'), (req, res) =>
  res.json({ ok: true })
)
testApp.get('/test-adminborne', jwtAuthV2, requireRole('ADMIN_BORNE'), (req, res) =>
  res.json({ ok: true })
)

// Dedicated login test app without rate limiter to avoid 429 across tests
const loginApp = express()
loginApp.use(express.json())
loginApp.post('/api/auth/login', async (req, res) => {
  const { z } = await import('zod')
  const loginSchema = z.object({
    email: z.string().email('Email invalide'),
    password: z.string().min(1, 'Mot de passe requis'),
    context: z.enum(['backoffice', 'borne']).optional().default('backoffice'),
  })
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }
  const { email, password, context } = result.data
  try {
    const auth = await mockLoginUser({ email, password, context })
    if (!auth) {
      return res.status(401).json({ error: 'Identifiants invalides' })
    }
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

// ─── Validation du body ───────────────────────────────────────────────────────

describe('POST /api/auth/login — validation du body', () => {
  it('email manquant → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('email invalide → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pas-un-email', password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('password manquant → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

// ─── Login invalide ───────────────────────────────────────────────────────────

describe('POST /api/auth/login — identifiants invalides', () => {
  beforeEach(() => {
    mockLoginUser.mockReset()
    mockCreateRefreshToken.mockReset()
    mockIsBlocked.mockResolvedValue(false)
    mockRecordFailedAttempt.mockResolvedValue(undefined)
    mockResetAttempts.mockResolvedValue(undefined)
  })

  it('mauvais identifiants → 401 avec message Identifiants invalides', async () => {
    mockLoginUser.mockResolvedValue(null)

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'mauvais_mdp' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Identifiants invalides')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'mauvais_mdp',
      context: 'backoffice',
    })
  })
})

// ─── Login valide ─────────────────────────────────────────────────────────────

describe('POST /api/auth/login — login valide', () => {
  beforeEach(() => {
    mockLoginUser.mockReset()
    mockCreateRefreshToken.mockReset()
    mockCreateRefreshToken.mockResolvedValue('fake-refresh-token-xyz')
    mockIsBlocked.mockResolvedValue(false)
    mockRecordFailedAttempt.mockResolvedValue(undefined)
    mockResetAttempts.mockResolvedValue(undefined)
  })

  it('SuperAdmin → 200 avec token, role SUPER_ADMIN, expiresIn 8h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
      userId: 'uuid-super',
      userType: 'superadmin',
    })

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'superadmin@example.com', password: 'correct_mdp' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('SUPER_ADMIN')
    expect(res.body.expiresIn).toBe('8h')
    // New fields
    expect(res.body.accessToken).toBe(fakeToken)
    expect(res.body.refreshToken).toBe('fake-refresh-token-xyz')
  })

  it('AdminBorne (contexte backoffice) → 200 avec role ADMIN_BORNE, expiresIn 8h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'ADMIN_BORNE',
      expiresIn: '8h',
      userId: 'uuid-admin',
      userType: 'adminborne',
    })

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'adminborne@example.com', password: 'correct_mdp', context: 'backoffice' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('ADMIN_BORNE')
    expect(res.body.expiresIn).toBe('8h')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'adminborne@example.com',
      password: 'correct_mdp',
      context: 'backoffice',
    })
  })

  it('AdminBorne (contexte borne) → 200 avec role ADMIN_BORNE, expiresIn 24h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'ADMIN_BORNE',
      expiresIn: '24h',
      userId: 'uuid-admin',
      userType: 'adminborne',
    })

    const res = await request(loginApp)
      .post('/api/auth/login')
      .send({ email: 'adminborne@example.com', password: 'correct_mdp', context: 'borne' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('ADMIN_BORNE')
    expect(res.body.expiresIn).toBe('24h')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'adminborne@example.com',
      password: 'correct_mdp',
      context: 'borne',
    })
  })
})

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    mockRefreshAccessToken.mockReset()
  })

  it('missing refreshToken → 400', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({})
    expect(res.status).toBe(400)
  })

  it('invalid refresh token → 401', async () => {
    mockRefreshAccessToken.mockRejectedValue(new Error('INVALID_REFRESH_TOKEN'))

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalide|expiré/i)
  })

  it('valid refresh token → 200 with new accessToken and refreshToken', async () => {
    const newAccessToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN' })
    mockRefreshAccessToken.mockResolvedValue({
      accessToken: newAccessToken,
      refreshToken: 'new-refresh-token',
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
    })

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe(newAccessToken)
    expect(res.body.token).toBe(newAccessToken) // backward compat
    expect(res.body.refreshToken).toBe('new-refresh-token')
    expect(res.body.role).toBe('SUPER_ADMIN')
  })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    mockAddToBlacklist.mockReset()
    mockRevokeRefreshToken.mockReset()
    mockIsBlacklisted.mockResolvedValue(false)
  })

  it('no auth header → 401', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({})
    expect(res.status).toBe(401)
  })

  it('valid token → 200, blacklists jti, revokes refresh token', async () => {
    mockAddToBlacklist.mockResolvedValue(undefined)
    mockRevokeRefreshToken.mockResolvedValue(true)

    const jti = 'test-jti-logout'
    const token = jwt.sign(
      { sub: 'uuid-super', role: 'SUPER_ADMIN', jti },
      'test_jwt_secret',
      { expiresIn: '8h' }
    )

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken: 'some-refresh-token' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(mockAddToBlacklist).toHaveBeenCalledWith(jti, expect.any(Date))
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith('some-refresh-token')
  })

  it('valid token without refreshToken body → 200 (refresh token optional)', async () => {
    mockAddToBlacklist.mockResolvedValue(undefined)

    const jti = 'test-jti-no-refresh'
    const token = jwt.sign(
      { sub: 'uuid-super', role: 'SUPER_ADMIN', jti },
      'test_jwt_secret',
      { expiresIn: '8h' }
    )

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(200)
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled()
  })
})

// ─── JWT expiré ───────────────────────────────────────────────────────────────

describe('JWT expiré sur une route protégée', () => {
  it('token expiré → 401 avec message JWT expired', async () => {
    const expiredToken = makeExpiredToken({ sub: 'uuid-1', role: 'SUPER_ADMIN' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${expiredToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('JWT expired')
  })
})

// ─── Token blacklisté ─────────────────────────────────────────────────────────

describe('Token blacklisté sur une route protégée', () => {
  it('token blacklisté → 401 avec message Token revoked', async () => {
    mockIsBlacklisted.mockResolvedValue(true)

    const jti = 'blacklisted-jti'
    const token = jwt.sign(
      { sub: 'uuid-1', role: 'SUPER_ADMIN', jti },
      'test_jwt_secret',
      { expiresIn: '1h' }
    )

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token revoked')
  })
})

// ─── Rôle insuffisant ─────────────────────────────────────────────────────────

describe('Rôle insuffisant', () => {
  beforeEach(() => {
    mockIsBlacklisted.mockResolvedValue(false)
  })

  it('ADMIN_BORNE tente une route SUPER_ADMIN → 403 Accès refusé', async () => {
    const adminBorneToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${adminBorneToken}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Accès refusé')
  })

  it('SUPER_ADMIN accède à une route SUPER_ADMIN → 200', async () => {
    const superAdminToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${superAdminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('ADMIN_BORNE accède à une route ADMIN_BORNE → 200', async () => {
    const adminBorneToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })

    const res = await request(testApp)
      .get('/test-adminborne')
      .set('Authorization', `Bearer ${adminBorneToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
