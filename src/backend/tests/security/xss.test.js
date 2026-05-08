/**
 * Security Tests — XSS (Task 18.2)
 *
 * Verifies that XSS payloads in form responses are stored and returned safely:
 *  - Payloads are stored as-is (no server-side execution)
 *  - All responses use Content-Type: application/json (not text/html)
 *  - JSON encoding prevents script execution in the browser
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

process.env.JWT_SECRET = 'test_jwt_secret_xss'

const superAdminToken = jwt.sign(
  { sub: 'uuid-super-xss', role: 'SUPER_ADMIN' },
  'test_jwt_secret_xss',
  { expiresIn: '1h' }
)
const authSA = { Authorization: `Bearer ${superAdminToken}` }

const adminBorneToken = jwt.sign(
  { sub: 'uuid-ab-xss', role: 'ADMIN_BORNE' },
  'test_jwt_secret_xss',
  { expiresIn: '1h' }
)
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

// Common XSS payloads
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "javascript:alert('xss')",
  '<svg onload=alert(1)>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('XSS — POST /api/enregistrements with XSS payload in valeur', () => {
  const borneId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const formulaireId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
  const questionId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

  beforeEach(() => {
    jest.clearAllMocks()
    // AdminBorne owns this borne
    mockPrisma.borne.findUnique.mockResolvedValue({
      id: borneId,
      adminBorneId: 'uuid-ab-xss',
    })
  })

  it('XSS payload <script>alert(1)</script> in valeur → stored as-is (201)', async () => {
    const xssPayload = '<script>alert(1)</script>'
    const mockEnregistrement = {
      id: 'uuid-enr-1',
      borneId,
      formulaireId,
      langueUtilisee: 'fr',
      reponses: [{ questionId, valeur: xssPayload }],
      createdAt: new Date().toISOString(),
    }
    mockPrisma.enregistrement.create.mockResolvedValue(mockEnregistrement)
    mockPrisma.partageJob.create.mockResolvedValue({ id: 'uuid-job-1' })

    const res = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        borneId,
        formulaireId,
        langueUtilisee: 'fr',
        reponses: [{ questionId, valeur: xssPayload }],
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    // The payload is stored as-is — no server-side execution
    expect(res.body.data.reponses[0].valeur).toBe(xssPayload)
  })

  it.each(XSS_PAYLOADS)(
    'XSS payload "%s" → stored as plain string, not executed',
    async (payload) => {
      const mockEnregistrement = {
        id: 'uuid-enr-xss',
        borneId,
        formulaireId,
        langueUtilisee: 'fr',
        reponses: [{ questionId, valeur: payload }],
        createdAt: new Date().toISOString(),
      }
      mockPrisma.enregistrement.create.mockResolvedValue(mockEnregistrement)
      mockPrisma.partageJob.create.mockResolvedValue({ id: 'uuid-job-xss' })

      const res = await request(app)
        .post('/api/enregistrements')
        .set(authAB)
        .send({
          borneId,
          formulaireId,
          langueUtilisee: 'fr',
          reponses: [{ questionId, valeur: payload }],
        })

      expect(res.status).toBe(201)
      // Value stored as-is
      expect(res.body.data.reponses[0].valeur).toBe(payload)
    }
  )
})

describe('XSS — GET /api/enregistrements returns stored XSS payload safely', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.borne.findMany.mockResolvedValue([])
  })

  it('GET returns XSS payload as JSON string (not executed)', async () => {
    const xssPayload = '<script>alert(document.cookie)</script>'
    mockPrisma.enregistrement.findMany.mockResolvedValue([
      {
        id: 'uuid-enr-2',
        borneId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        formulaireId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        langueUtilisee: 'fr',
        statutPartage: 'en_attente',
        createdAt: new Date().toISOString(),
        borne: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', idBorne: 'BORNE-01', adresse: 'Test' },
        formulaire: { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', label: xssPayload, version: '1.0.0' },
      },
    ])
    mockPrisma.enregistrement.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/enregistrements')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // The XSS payload is returned as a JSON string — safe in JSON context
    const formulaireLabel = res.body.data[0].formulaire.label
    expect(formulaireLabel).toBe(xssPayload)
    // It's a plain string in JSON — no script execution possible
    expect(typeof formulaireLabel).toBe('string')
  })
})

describe('XSS — Content-Type: application/json on all responses', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(0)
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)
    mockPrisma.borne.count.mockResolvedValue(0)
  })

  it('GET /api/enregistrements → Content-Type: application/json', async () => {
    const res = await request(app)
      .get('/api/enregistrements')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('GET /api/bornes → Content-Type: application/json', async () => {
    const res = await request(app)
      .get('/api/bornes')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('GET /api/formulaires → Content-Type: application/json', async () => {
    const res = await request(app)
      .get('/api/formulaires')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('400 error response → Content-Type: application/json (not text/html)', async () => {
    const res = await request(app)
      .get('/api/enregistrements?borneId=not-a-uuid')
      .set(authSA)

    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('401 error response → Content-Type: application/json', async () => {
    const res = await request(app)
      .get('/api/enregistrements')
    // No auth header

    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('404 unknown route → Content-Type: application/json', async () => {
    const res = await request(app)
      .get('/api/unknown-route-xss-test')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })
})

describe('XSS — XSS payload in formulaire label field', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('XSS in formulaire label → stored as plain string', async () => {
    const xssLabel = '<img src=x onerror=alert(1)>'
    mockPrisma.formulaire.create.mockResolvedValue({
      id: 'uuid-form-xss',
      label: xssLabel,
      statut: 'brouillon',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({ label: xssLabel })

    expect(res.status).toBe(201)
    expect(res.body.data.label).toBe(xssLabel)
    // Stored as-is — JSON encoding prevents execution
    expect(typeof res.body.data.label).toBe('string')
  })
})
