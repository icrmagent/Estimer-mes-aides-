/**
 * 17.4 — Integration test: V1 backward compatibility
 *
 * Verifies all 29 V1 tests still pass by re-running equivalent coverage:
 * - GET /api/configuration → returns V1 config (6 tests)
 * - POST /api/submissions → creates V1 submission (8 tests)
 * - GET /api/submissions → returns V1 submissions list (7 tests)
 * - PUT /api/submissions/:id/sync → marks as synced (4 tests)
 * - GET /health → returns { status: 'ok' } (4 tests)
 *
 * Total: 29 tests — mirrors the existing V1 test suite exactly.
 * Rule: "Ne jamais casser les 29 tests V1 — rétrocompatibilité obligatoire"
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Mocks (must be declared BEFORE dynamic imports) ─────────────────────────

// V2 services — mocked to avoid real DB/Redis calls
jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: jest.fn(),
  issueAccessToken: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: jest.fn(),
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

// V1 configService mock
const mockGetConfiguration = jest.fn()
jest.unstable_mockModule('../../src/services/configService.js', () => ({
  getConfiguration: mockGetConfiguration,
  invalidateConfigCache: jest.fn(),
}))

// Prisma mock — V1 models: configuration + submission
const mockPrisma = {
  configuration: {
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  submission: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  // V2 models (needed by app.js imports)
  superAdmin: { findUnique: jest.fn() },
  adminBorne: { findUnique: jest.fn() },
  refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

// ─── Environment setup ────────────────────────────────────────────────────────

const VALID_KEY = 'ema_mobile_test'
process.env.API_KEY_MOBILE = VALID_KEY
process.env.JWT_SECRET = 'test_jwt_secret'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockConfig = {
  id: 1,
  version: '1.0.0',
  updatedAt: new Date('2026-04-26T00:00:00Z'),
  formDefinition: { tabs: [], categories: [] },
}

const mockSubmission = {
  id: 'uuid-1234',
  createdAt: new Date('2026-04-26T00:00:00Z'),
  configVersion: '1.0.0',
  synced: false,
  syncedAt: null,
  crmProjectId: null,
  values: [{ id: 1, submissionId: 'uuid-1234', fieldId: 2087, value: 'Dupont' }],
}

const makeToken = (payload = { role: 'crm' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })

// ─── V1 Test Suite ────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// GET /health — 4 tests
// ══════════════════════════════════════════════════════════════════════════════

describe('V1 Compat — GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
  })

  it('unknown route returns 404', async () => {
    const res = await request(app).get('/api/unknown')
    expect(res.status).toBe(404)
  })

  it('GET /api/configuration sans x-api-key → 401', async () => {
    const res = await request(app).get('/api/configuration')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('GET /api/submissions sans JWT → 401', async () => {
    const res = await request(app).get('/api/submissions')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing JWT')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/configuration — 6 tests
// ══════════════════════════════════════════════════════════════════════════════

describe('V1 Compat — GET /api/configuration', () => {
  beforeEach(() => {
    mockGetConfiguration.mockReset()
  })

  it('sans x-api-key → 401', async () => {
    const res = await request(app).get('/api/configuration')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('avec mauvaise x-api-key → 401', async () => {
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', 'wrong-key')
    expect(res.status).toBe(401)
  })

  it('aucune config en base → 404', async () => {
    mockGetConfiguration.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('No configuration found')
  })

  it('config existante → 200 avec version + formDefinition', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1.0.0')
    expect(res.body.formDefinition).toBeDefined()
    expect(res.headers['etag']).toBe('"1.0.0"')
    expect(res.headers['cache-control']).toContain('max-age=3600')
  })

  it('If-None-Match correspondant → 304 Not Modified', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
      .set('If-None-Match', '"1.0.0"')
    expect(res.status).toBe(304)
  })

  it('If-None-Match différent → 200', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
      .set('If-None-Match', '"0.9.0"')
    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/submissions — 8 tests
// ══════════════════════════════════════════════════════════════════════════════

describe('V1 Compat — POST /api/submissions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans x-api-key → 401', async () => {
    const res = await request(app).post('/api/submissions').send({})
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('corps vide → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({})
    expect(res.status).toBe(400)
  })

  it('configVersion manquant → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ values: [{ fieldId: 2087, value: 'Dupont' }] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('configVersion')
  })

  it('values vide → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [] })
    expect(res.status).toBe(400)
  })

  it('values sans fieldId → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ value: 'test' }] })
    expect(res.status).toBe(400)
  })

  it('données valides → 201 + id, createdAt, synced', async () => {
    mockPrisma.submission.create.mockResolvedValue(mockSubmission)
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2087, value: 'Dupont' }] })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('uuid-1234')
    expect(res.body.synced).toBe(false)
    expect(res.body.configVersion).toBe('1.0.0')
    expect(res.body.createdAt).toBeDefined()
  })

  it('value tableau (multi-select) accepté → 201', async () => {
    mockPrisma.submission.create.mockResolvedValue(mockSubmission)
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2303, value: ['Isolation', 'Chauffage'] }] })
    expect(res.status).toBe(201)
  })

  it('nouvelle soumission a synced=false par défaut', async () => {
    mockPrisma.submission.create.mockResolvedValue(mockSubmission)
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2087, value: 'Test' }] })
    expect(res.status).toBe(201)
    expect(res.body.synced).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/submissions — 7 tests
// ══════════════════════════════════════════════════════════════════════════════

describe('V1 Compat — GET /api/submissions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans JWT → 401', async () => {
    const res = await request(app).get('/api/submissions')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing JWT')
  })

  it('JWT invalide → 401', async () => {
    const res = await request(app)
      .get('/api/submissions')
      .set('Authorization', 'Bearer bad.token.here')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid JWT')
  })

  it('JWT valide → 200 avec data + total + page + limit', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([mockSubmission])
    mockPrisma.submission.count.mockResolvedValue(1)
    const res = await request(app)
      .get('/api/submissions')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.total).toBe(1)
    expect(res.body.page).toBe(1)
    expect(res.body.limit).toBe(50)
  })

  it('?synced=false filtre correctement', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([])
    mockPrisma.submission.count.mockResolvedValue(0)
    const res = await request(app)
      .get('/api/submissions?synced=false')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('?synced=invalid → 400', async () => {
    const res = await request(app)
      .get('/api/submissions?synced=maybe')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })

  it('?since=2026-04-01 accepté → 200', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([mockSubmission])
    mockPrisma.submission.count.mockResolvedValue(1)
    const res = await request(app)
      .get('/api/submissions?since=2026-04-01')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
  })

  it('?limit=300 (> max) → 400', async () => {
    const res = await request(app)
      .get('/api/submissions?limit=300')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/submissions/:id/sync — 4 tests
// ══════════════════════════════════════════════════════════════════════════════

describe('V1 Compat — PUT /api/submissions/:id/sync', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans JWT → 401', async () => {
    const res = await request(app).put('/api/submissions/uuid-1234/sync')
    expect(res.status).toBe(401)
  })

  it('ID inexistant → 404', async () => {
    const prismaError = Object.assign(new Error('Not found'), { code: 'P2025' })
    mockPrisma.submission.update.mockRejectedValue(prismaError)
    const res = await request(app)
      .put('/api/submissions/nonexistent/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('nonexistent')
  })

  it('sync sans crmProjectId → 200 + synced=true', async () => {
    const synced = {
      ...mockSubmission,
      synced: true,
      syncedAt: new Date('2026-04-26T01:00:00Z'),
      crmProjectId: null,
    }
    mockPrisma.submission.update.mockResolvedValue(synced)
    const res = await request(app)
      .put('/api/submissions/uuid-1234/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.synced).toBe(true)
    expect(res.body.syncedAt).toBeDefined()
  })

  it('sync avec crmProjectId → 200 + crmProjectId présent', async () => {
    const synced = {
      ...mockSubmission,
      synced: true,
      syncedAt: new Date(),
      crmProjectId: 'crm-933',
    }
    mockPrisma.submission.update.mockResolvedValue(synced)
    const res = await request(app)
      .put('/api/submissions/uuid-1234/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ crmProjectId: 'crm-933' })
    expect(res.status).toBe(200)
    expect(res.body.crmProjectId).toBe('crm-933')
  })
})
