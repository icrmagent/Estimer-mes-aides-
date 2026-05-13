/**
 * Unit tests for soft delete behavior — P11
 *
 * Validates: Requirement 13 (Data Integrity and Soft Delete)
 * Property P11: Soft-deleted records are excluded from all default queries
 *
 * Tests cover:
 *  - DELETE /api/formulaires/:id  → sets deletedAt (not hard delete)
 *  - DELETE /api/bornes/:id       → sets deletedAt (not hard delete)
 *  - GET /api/formulaires         → excludes deletedAt IS NOT NULL
 *  - GET /api/bornes              → excludes deletedAt IS NOT NULL
 *  - GET /api/enregistrements     → excludes deletedAt IS NOT NULL
 *  - GET /api/formulaires/deleted → returns only soft-deleted (SuperAdmin only)
 *  - POST /api/formulaires/:id/restore → clears deletedAt
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Mock functions (created before mock module registration) ─────────────────

const mockPrisma = {
  configuration: { findFirst: jest.fn() },
  submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  superAdmin: { findUnique: jest.fn() },
  adminBorne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  borne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  formulaire: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  question: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  enregistrement: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  partageJob: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  enregistrementReponse: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(),
}

// ─── Register mocks BEFORE any app import ────────────────────────────────────

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

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

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

// ─── Auth tokens ─────────────────────────────────────────────────────────────

process.env.JWT_SECRET = 'test_jwt_secret_soft_delete'

const superAdminToken = jwt.sign(
  { sub: 'uuid-super', role: 'SUPER_ADMIN' },
  'test_jwt_secret_soft_delete',
  { expiresIn: '1h' }
)
const adminBorneToken = jwt.sign(
  { sub: 'uuid-admin', role: 'ADMIN_BORNE' },
  'test_jwt_secret_soft_delete',
  { expiresIn: '1h' }
)

const authSA = { Authorization: `Bearer ${superAdminToken}` }
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

// ─── Mock data ────────────────────────────────────────────────────────────────

const now = new Date()

const mockFormulaire = {
  id: 'uuid-form-1',
  label: 'Test Form',
  version: '1.0.0',
  statut: 'brouillon',
  dureeRetourAccueil: 30,
  annulationInactivite: 120,
  pageDebutConfig: {},
  pageFinConfig: {},
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
}

const mockFormulaireDeleted = {
  ...mockFormulaire,
  deletedAt: now,
}

const mockBorne = {
  id: 'uuid-borne-1',
  idBorne: 'BORNE-001',
  langueDefaut: 'fr',
  adresse: '1 rue Test',
  statut: 'actif',
  adminBorneId: 'uuid-admin',
  formulaireId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
}

const mockBorneDeleted = {
  ...mockBorne,
  deletedAt: now,
}

const mockEnregistrement = {
  id: 'uuid-enr-1',
  borneId: 'uuid-borne-1',
  formulaireId: 'uuid-form-1',
  formulaireVersion: '1.0.0',
  langueUtilisee: 'fr',
  statutPartage: 'en_attente',
  tentatives: 0,
  derniereErreur: null,
  partageAt: null,
  submissionId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
}

const p2025Error = Object.assign(new Error('Record not found'), { code: 'P2025' })

// ─── Reset mocks before each test ────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── P11: Soft-deleted records excluded from default GET queries ──────────────

describe('P11 — GET /api/formulaires excludes soft-deleted records', () => {
  it('passes where: { deletedAt: null } to Prisma findMany', async () => {
    mockPrisma.formulaire.findMany.mockResolvedValue([mockFormulaire])
    mockPrisma.formulaire.count.mockResolvedValue(1)

    const res = await request(app).get('/api/formulaires').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify Prisma was called with deletedAt: null filter
    const findManyCall = mockPrisma.formulaire.findMany.mock.calls[0][0]
    expect(findManyCall.where).toMatchObject({ deletedAt: null })
  })

  it('soft-deleted formulaire does not appear in list', async () => {
    // Only return non-deleted records (simulating DB filter)
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)

    const res = await request(app).get('/api/formulaires').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(res.body.meta.total).toBe(0)
  })
})

describe('P11 — GET /api/bornes excludes soft-deleted records', () => {
  it('passes where: { deletedAt: null } to Prisma findMany', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([mockBorne])
    mockPrisma.borne.count.mockResolvedValue(1)

    const res = await request(app).get('/api/bornes').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const findManyCall = mockPrisma.borne.findMany.mock.calls[0][0]
    expect(findManyCall.where).toMatchObject({ deletedAt: null })
  })
})

describe('P11 — GET /api/enregistrements excludes soft-deleted records', () => {
  it('passes where: { deletedAt: null } to Prisma findMany', async () => {
    mockPrisma.enregistrement.findMany.mockResolvedValue([mockEnregistrement])
    mockPrisma.enregistrement.count.mockResolvedValue(1)

    const res = await request(app).get('/api/enregistrements').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const findManyCall = mockPrisma.enregistrement.findMany.mock.calls[0][0]
    expect(findManyCall.where).toMatchObject({ deletedAt: null })
  })
})

// ─── DELETE /api/formulaires/:id — soft delete (not hard delete) ──────────────

describe('DELETE /api/formulaires/:id — soft delete', () => {
  it('sets deletedAt on the formulaire instead of deleting it', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue({ id: 'uuid-form-1', statut: 'brouillon' })
    mockPrisma.formulaire.update.mockResolvedValue(mockFormulaireDeleted)

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify prisma.update was called (not prisma.delete)
    expect(mockPrisma.formulaire.update).toHaveBeenCalledTimes(1)
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data).toHaveProperty('deletedAt')
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date)
  })

  it('returns 404 when formulaire not found (P2025)', async () => {
    mockPrisma.formulaire.update.mockRejectedValue(p2025Error)

    const res = await request(app)
      .delete('/api/formulaires/nonexistent-id')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('requires SUPER_ADMIN — ADMIN_BORNE gets 403', async () => {
    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1')
      .set(authAB)

    expect(res.status).toBe(403)
  })

  it('requires auth — unauthenticated gets 401', async () => {
    const res = await request(app).delete('/api/formulaires/uuid-form-1')
    expect(res.status).toBe(401)
  })
})

// ─── DELETE /api/bornes/:id — soft delete ────────────────────────────────────

describe('DELETE /api/bornes/:id — soft delete', () => {
  it('sets deletedAt on the borne instead of deleting it', async () => {
    mockPrisma.borne.update.mockResolvedValue(mockBorneDeleted)

    const res = await request(app)
      .delete('/api/bornes/uuid-borne-1')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    expect(mockPrisma.borne.update).toHaveBeenCalledTimes(1)
    const updateCall = mockPrisma.borne.update.mock.calls[0][0]
    expect(updateCall.data).toHaveProperty('deletedAt')
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date)
  })

  it('returns 404 when borne not found (P2025)', async () => {
    mockPrisma.borne.update.mockRejectedValue(p2025Error)

    const res = await request(app)
      .delete('/api/bornes/nonexistent-id')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('requires SUPER_ADMIN — ADMIN_BORNE gets 403', async () => {
    const res = await request(app)
      .delete('/api/bornes/uuid-borne-1')
      .set(authAB)

    expect(res.status).toBe(403)
  })
})

// ─── GET /api/formulaires/deleted — SuperAdmin only ──────────────────────────

describe('GET /api/formulaires/deleted', () => {
  it('returns only soft-deleted formulaires', async () => {
    mockPrisma.formulaire.findMany.mockResolvedValue([mockFormulaireDeleted])
    mockPrisma.formulaire.count.mockResolvedValue(1)

    const res = await request(app).get('/api/formulaires/deleted').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta.total).toBe(1)

    // Verify Prisma was called with deletedAt: { not: null }
    const findManyCall = mockPrisma.formulaire.findMany.mock.calls[0][0]
    expect(findManyCall.where).toMatchObject({ deletedAt: { not: null } })
  })

  it('returns empty list when no soft-deleted formulaires', async () => {
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)

    const res = await request(app).get('/api/formulaires/deleted').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(res.body.meta.total).toBe(0)
  })

  it('requires SUPER_ADMIN — ADMIN_BORNE gets 403', async () => {
    const res = await request(app).get('/api/formulaires/deleted').set(authAB)
    expect(res.status).toBe(403)
  })

  it('requires auth — unauthenticated gets 401', async () => {
    const res = await request(app).get('/api/formulaires/deleted')
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/formulaires/:id/restore ───────────────────────────────────────

describe('POST /api/formulaires/:id/restore', () => {
  it('clears deletedAt to restore a soft-deleted formulaire', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(mockFormulaireDeleted)
    mockPrisma.formulaire.update.mockResolvedValue(mockFormulaire)

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/restore')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data).toEqual({ deletedAt: null })
  })

  it('returns 404 when formulaire does not exist', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/formulaires/nonexistent-id/restore')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 409 when formulaire is not soft-deleted', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(mockFormulaire) // deletedAt: null

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/restore')
      .set(authSA)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_DELETED')
  })

  it('requires SUPER_ADMIN — ADMIN_BORNE gets 403', async () => {
    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/restore')
      .set(authAB)

    expect(res.status).toBe(403)
  })

  it('requires auth — unauthenticated gets 401', async () => {
    const res = await request(app).post('/api/formulaires/uuid-form-1/restore')
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/formulaires/:id excludes soft-deleted ──────────────────────────

describe('GET /api/formulaires/:id excludes soft-deleted', () => {
  it('returns 404 for a soft-deleted formulaire', async () => {
    mockPrisma.formulaire.findUniqueOrThrow.mockRejectedValue(p2025Error)

    const res = await request(app)
      .get('/api/formulaires/uuid-form-deleted')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

// ─── GET /api/bornes/:id excludes soft-deleted ───────────────────────────────

describe('GET /api/bornes/:id excludes soft-deleted', () => {
  it('returns 404 for a soft-deleted borne', async () => {
    mockPrisma.borne.findUniqueOrThrow.mockRejectedValue(p2025Error)

    const res = await request(app)
      .get('/api/bornes/uuid-borne-deleted')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
