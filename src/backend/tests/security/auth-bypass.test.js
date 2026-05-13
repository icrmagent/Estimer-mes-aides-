/**
 * Security Tests — Auth Bypass (Task 18.5)
 *
 * Verifies role-based access control:
 *  - AdminBorne token → GET /api/bornes (SuperAdmin only) → 403
 *  - AdminBorne token → GET /api/admin-bornes → 403
 *  - AdminBorne token → GET /api/formulaires → 403
 *  - SuperAdmin token → GET /api/enregistrements → 200
 *  - No token → any protected route → 401
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Mocks (must be before any app import) ───────────────────────────────────

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

jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: jest.fn(),
  issueAccessToken: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
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
  isBlocked: jest.fn().mockResolvedValue(false),
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
  getRemainingAttempts: jest.fn().mockResolvedValue(5),
  getRetryAfter: jest.fn().mockResolvedValue(0),
}))

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}))

// ─── App import (after mocks) ────────────────────────────────────────────────

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

process.env.JWT_SECRET = 'test_jwt_secret_auth_bypass'

// Token helpers
const makeSuperAdminToken = () =>
  jwt.sign(
    { sub: 'uuid-super-bypass', role: 'SUPER_ADMIN' },
    'test_jwt_secret_auth_bypass',
    { expiresIn: '1h' }
  )

const makeAdminBorneToken = () =>
  jwt.sign(
    { sub: 'uuid-ab-bypass', role: 'ADMIN_BORNE' },
    'test_jwt_secret_auth_bypass',
    { expiresIn: '1h' }
  )

const makeInvalidToken = () => 'Bearer invalid.token.here'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Auth Bypass — AdminBorne cannot access SuperAdmin-only routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.borne.count.mockResolvedValue(0)
    mockPrisma.adminBorne.findMany.mockResolvedValue([])
    mockPrisma.adminBorne.count.mockResolvedValue(0)
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(0)
  })

  it('AdminBorne token → GET /api/bornes → 200 (filtré sur ses bornes)', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.borne.count.mockResolvedValue(0)

    const res = await request(app)
      .get('/api/bornes')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('AdminBorne token → GET /api/admin-bornes (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .get('/api/admin-bornes')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })

  it('AdminBorne token → GET /api/formulaires (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .get('/api/formulaires')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })

  it('AdminBorne token → POST /api/bornes (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .post('/api/bornes')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)
      .send({ idBorne: 'BORNE-TEST', langueDefaut: 'fr', adresse: 'Test' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })

  it('AdminBorne token → POST /api/formulaires (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .post('/api/formulaires')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)
      .send({ label: 'Test' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })

  it('AdminBorne token → GET /api/partage/jobs (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .get('/api/partage/jobs')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })

  it('AdminBorne token → GET /api/dashboard/superadmin (SuperAdmin only) → 403', async () => {
    const res = await request(app)
      .get('/api/dashboard/superadmin')
      .set('Authorization', `Bearer ${makeAdminBorneToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBeDefined()
  })
})

describe('Auth Bypass — SuperAdmin can access all routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(0)
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.borne.count.mockResolvedValue(0)
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)
    mockPrisma.adminBorne.findMany.mockResolvedValue([])
    mockPrisma.adminBorne.count.mockResolvedValue(0)
  })

  it('SuperAdmin token → GET /api/enregistrements → 200', async () => {
    const res = await request(app)
      .get('/api/enregistrements')
      .set('Authorization', `Bearer ${makeSuperAdminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('SuperAdmin token → GET /api/bornes → 200', async () => {
    const res = await request(app)
      .get('/api/bornes')
      .set('Authorization', `Bearer ${makeSuperAdminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('SuperAdmin token → GET /api/formulaires → 200', async () => {
    const res = await request(app)
      .get('/api/formulaires')
      .set('Authorization', `Bearer ${makeSuperAdminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('SuperAdmin token → GET /api/admin-bornes → 200', async () => {
    const res = await request(app)
      .get('/api/admin-bornes')
      .set('Authorization', `Bearer ${makeSuperAdminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('Auth Bypass — No token → 401 on all protected routes', () => {
  it('No token → GET /api/enregistrements → 401', async () => {
    const res = await request(app).get('/api/enregistrements')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('No token → GET /api/bornes → 401', async () => {
    const res = await request(app).get('/api/bornes')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('No token → GET /api/formulaires → 401', async () => {
    const res = await request(app).get('/api/formulaires')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('No token → GET /api/admin-bornes → 401', async () => {
    const res = await request(app).get('/api/admin-bornes')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('No token → GET /api/dashboard/superadmin → 401', async () => {
    const res = await request(app).get('/api/dashboard/superadmin')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('No token → GET /api/dashboard/adminborne → 401', async () => {
    const res = await request(app).get('/api/dashboard/adminborne')

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('Invalid token → GET /api/enregistrements → 401', async () => {
    const res = await request(app)
      .get('/api/enregistrements')
      .set('Authorization', makeInvalidToken())

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('Expired token → GET /api/bornes → 401', async () => {
    const expiredToken = jwt.sign(
      { sub: 'uuid-super', role: 'SUPER_ADMIN' },
      'test_jwt_secret_auth_bypass',
      { expiresIn: -1 }
    )

    const res = await request(app)
      .get('/api/bornes')
      .set('Authorization', `Bearer ${expiredToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })
})

describe('Auth Bypass — Token with wrong secret → 401', () => {
  it('Token signed with wrong secret → 401', async () => {
    const wrongSecretToken = jwt.sign(
      { sub: 'uuid-super', role: 'SUPER_ADMIN' },
      'wrong_secret_key',
      { expiresIn: '1h' }
    )

    const res = await request(app)
      .get('/api/enregistrements')
      .set('Authorization', `Bearer ${wrongSecretToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })
})

describe('Auth Bypass — Role escalation attempt', () => {
  it('Token with forged SUPER_ADMIN role but wrong secret → 401', async () => {
    // Attacker tries to forge a SuperAdmin token with wrong secret
    const forgedToken = jwt.sign(
      { sub: 'uuid-attacker', role: 'SUPER_ADMIN' },
      'attacker_secret',
      { expiresIn: '1h' }
    )

    const res = await request(app)
      .get('/api/bornes')
      .set('Authorization', `Bearer ${forgedToken}`)

    expect(res.status).toBe(401)
  })

  it('AdminBorne cannot access SuperAdmin routes even with valid token', async () => {
    // Valid AdminBorne token — but route requires SUPER_ADMIN
    const adminBorneToken = makeAdminBorneToken()

    const res = await request(app)
      .delete('/api/formulaires/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/questions/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
      .set('Authorization', `Bearer ${adminBorneToken}`)

    expect(res.status).toBe(403)
  })
})
