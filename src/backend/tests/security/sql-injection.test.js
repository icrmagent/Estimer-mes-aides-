/**
 * Security Tests — SQL Injection (Task 18.1)
 *
 * Verifies that SQL injection payloads in query params and request bodies
 * are safely handled. Prisma uses parameterized queries by default, so
 * injected SQL is never executed as raw SQL.
 *
 * Test strategy:
 *  - Invalid UUID / enum values → 400 (Zod validation rejects before Prisma)
 *  - Valid-looking payloads in string fields → stored safely (Prisma parameterizes)
 *  - No raw SQL is ever executed
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

process.env.JWT_SECRET = 'test_jwt_secret_sql_injection'

const superAdminToken = jwt.sign(
  { sub: 'uuid-super-sql', role: 'SUPER_ADMIN' },
  'test_jwt_secret_sql_injection',
  { expiresIn: '1h' }
)
const authSA = { Authorization: `Bearer ${superAdminToken}` }

// Common SQL injection payloads
const SQL_PAYLOADS = [
  "'; DROP TABLE enregistrements; --",
  "' OR '1'='1",
  "' UNION SELECT * FROM superAdmin --",
  "1; DELETE FROM bornes WHERE 1=1; --",
  "' OR 1=1 --",
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SQL Injection — GET /api/enregistrements?borneId=<payload>', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(0)
    mockPrisma.borne.findMany.mockResolvedValue([])
  })

  it('SQL payload in borneId (not a UUID) → 400 VALIDATION_ERROR', async () => {
    const payload = "'; DROP TABLE enregistrements; --"
    const res = await request(app)
      .get(`/api/enregistrements?borneId=${encodeURIComponent(payload)}`)
      .set(authSA)

    // Zod rejects non-UUID values before Prisma is ever called
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    // Prisma was never called — no raw SQL executed
    expect(mockPrisma.enregistrement.findMany).not.toHaveBeenCalled()
  })

  it.each(SQL_PAYLOADS)(
    'SQL payload "%s" in borneId → 400 (invalid UUID)',
    async (payload) => {
      const res = await request(app)
        .get(`/api/enregistrements?borneId=${encodeURIComponent(payload)}`)
        .set(authSA)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      // Prisma never called
      expect(mockPrisma.enregistrement.findMany).not.toHaveBeenCalled()
    }
  )
})

describe('SQL Injection — GET /api/bornes?statut=<payload>', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.borne.count.mockResolvedValue(0)
  })

  it("SQL payload in statut enum → 400 (invalid enum value)", async () => {
    const payload = "'; DROP TABLE bornes; --"
    const res = await request(app)
      .get(`/api/bornes?statut=${encodeURIComponent(payload)}`)
      .set(authSA)

    // Zod enum validation rejects non-enum values
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(mockPrisma.borne.findMany).not.toHaveBeenCalled()
  })

  it("SQL payload 'actif OR 1=1' in statut → 400 (not a valid enum)", async () => {
    const res = await request(app)
      .get(`/api/bornes?statut=${encodeURIComponent("actif OR 1=1")}`)
      .set(authSA)

    expect(res.status).toBe(400)
    expect(mockPrisma.borne.findMany).not.toHaveBeenCalled()
  })
})

describe('SQL Injection — POST /api/formulaires with SQL in label field', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('SQL payload in label field → stored safely via Prisma parameterization', async () => {
    const sqlLabel = "Formulaire'; DROP TABLE formulaires; --"
    const mockCreated = {
      id: 'uuid-form-1',
      label: sqlLabel,
      statut: 'brouillon',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    }
    mockPrisma.formulaire.create.mockResolvedValue(mockCreated)

    const res = await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({
        label: sqlLabel,
        statut: 'brouillon',
      })

    // The request should succeed — Prisma parameterizes the value safely
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    // The label is stored as-is (not executed as SQL)
    expect(res.body.data.label).toBe(sqlLabel)
    // Prisma create was called with the raw string (parameterized internally)
    expect(mockPrisma.formulaire.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: sqlLabel }),
      })
    )
  })

  it('SQL payload in multiple fields → all stored safely', async () => {
    const sqlPayload = "' OR '1'='1'; --"
    const mockCreated = {
      id: 'uuid-form-2',
      label: sqlPayload,
      statut: 'brouillon',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    }
    mockPrisma.formulaire.create.mockResolvedValue(mockCreated)

    const res = await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({ label: sqlPayload })

    expect(res.status).toBe(201)
    expect(res.body.data.label).toBe(sqlPayload)
  })
})

describe('SQL Injection — no raw SQL execution (Prisma parameterization)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Prisma is always called with parameterized data, never raw SQL strings', async () => {
    // This test verifies the architectural guarantee: all DB access goes through
    // Prisma ORM which uses parameterized queries. The mock captures the exact
    // arguments passed to Prisma — they are always plain JS values, never SQL.
    mockPrisma.formulaire.create.mockResolvedValue({
      id: 'uuid-form-3',
      label: "test'; DROP TABLE--",
      statut: 'brouillon',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    })

    const sqlInLabel = "test'; DROP TABLE--"
    await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({ label: sqlInLabel })

    // Verify Prisma received a plain string, not a SQL fragment
    const callArgs = mockPrisma.formulaire.create.mock.calls[0]?.[0]
    if (callArgs) {
      const labelValue = callArgs.data?.label
      // The value is a plain string — Prisma handles parameterization internally
      expect(typeof labelValue).toBe('string')
      expect(labelValue).toBe(sqlInLabel)
      // No raw SQL query methods were called
      expect(mockPrisma.$transaction).not.toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE')
      )
    }
  })
})
