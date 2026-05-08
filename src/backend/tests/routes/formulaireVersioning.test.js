/**
 * Unit tests for formulaire versioning logic — P13
 *
 * Validates: Requirements 37.3, 37.4, 37.5, 37.6, 37.7
 * Property P13: Version numbers are incremented correctly on formulaire mutations
 *
 * Tests cover:
 *  - incrementVersion() helper: patch, minor, major increments
 *  - PUT /api/formulaires/:id → increments patch version + creates snapshot
 *  - PATCH /api/formulaires/:id/statut (brouillon→publie) → increments major version
 *  - POST /api/formulaires/:id/questions → increments minor version
 *  - DELETE /api/formulaires/:id/questions/:qid → increments minor version
 *  - GET /api/formulaires/:id/versions → returns version history
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
  formulaireVersion: {
    findMany: jest.fn(),
    create: jest.fn(),
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
const { incrementVersion } = await import('../../src/routes/formulaires.js')

// ─── Auth tokens ─────────────────────────────────────────────────────────────

process.env.JWT_SECRET = 'test_jwt_secret_versioning'

const superAdminToken = jwt.sign(
  { sub: 'uuid-super', role: 'SUPER_ADMIN' },
  'test_jwt_secret_versioning',
  { expiresIn: '1h' }
)

const authSA = { Authorization: `Bearer ${superAdminToken}` }

// ─── Mock data ────────────────────────────────────────────────────────────────

const now = new Date()

const mockFormulaire = {
  id: 'uuid-form-1',
  label: 'Test Form',
  version: '1.2.3',
  statut: 'brouillon',
  dureeRetourAccueil: 30,
  annulationInactivite: 120,
  pageDebutConfig: {},
  pageFinConfig: {},
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  questions: [],
}

const mockQuestion = {
  id: 'uuid-q-1',
  formulaireId: 'uuid-form-1',
  libelleQuestion: { fr: 'Question test', es: null, en: null },
  typeOption: 'option_unique',
  options: null,
  orderPage: 1,
  obligatoire: false,
  paragrapheInfo: null,
  createdAt: now,
  updatedAt: now,
}

const mockFormulaireVersion = {
  id: 'uuid-fv-1',
  formulaireId: 'uuid-form-1',
  version: '1.2.4',
  snapshot: mockFormulaire,
  changedBy: 'uuid-super',
  createdAt: now,
}

// ─── Reset mocks before each test ────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── incrementVersion() unit tests ───────────────────────────────────────────

describe('incrementVersion() helper — P13', () => {
  it('increments patch version: 1.2.3 → 1.2.4', () => {
    expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('increments minor version: 1.2.3 → 1.3.0', () => {
    expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
  })

  it('increments major version: 1.2.3 → 2.0.0', () => {
    expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('resets minor and patch on major increment: 3.5.9 → 4.0.0', () => {
    expect(incrementVersion('3.5.9', 'major')).toBe('4.0.0')
  })

  it('resets patch on minor increment: 2.4.7 → 2.5.0', () => {
    expect(incrementVersion('2.4.7', 'minor')).toBe('2.5.0')
  })

  it('handles initial version 1.0.0 patch: 1.0.0 → 1.0.1', () => {
    expect(incrementVersion('1.0.0', 'patch')).toBe('1.0.1')
  })

  it('handles initial version 1.0.0 minor: 1.0.0 → 1.1.0', () => {
    expect(incrementVersion('1.0.0', 'minor')).toBe('1.1.0')
  })

  it('handles initial version 1.0.0 major: 1.0.0 → 2.0.0', () => {
    expect(incrementVersion('1.0.0', 'major')).toBe('2.0.0')
  })

  it('handles null/undefined version gracefully (defaults to 1.0.0)', () => {
    expect(incrementVersion(null, 'patch')).toBe('1.0.1')
    expect(incrementVersion(undefined, 'minor')).toBe('1.1.0')
  })
})

// ─── PUT /api/formulaires/:id — increments patch version ─────────────────────

describe('PUT /api/formulaires/:id — patch version increment (task 37.3)', () => {
  it('increments patch version and creates a FormulaireVersion snapshot', async () => {
    const updatedFormulaire = { ...mockFormulaire, version: '1.2.4', questions: [] }

    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue(mockFormulaire)
    mockPrisma.formulaire.update.mockResolvedValue(updatedFormulaire)
    mockPrisma.formulaireVersion.create.mockResolvedValue(mockFormulaireVersion)

    const res = await request(app)
      .put('/api/formulaires/uuid-form-1')
      .set(authSA)
      .send({ label: 'Updated Form' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify version was incremented to patch
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('1.2.4')

    // Verify snapshot was created
    expect(mockPrisma.formulaireVersion.create).toHaveBeenCalledTimes(1)
    const snapshotCall = mockPrisma.formulaireVersion.create.mock.calls[0][0]
    expect(snapshotCall.data.formulaireId).toBe('uuid-form-1')
    expect(snapshotCall.data.version).toBe('1.2.4')
    expect(snapshotCall.data.changedBy).toBe('uuid-super')
  })

  it('uses caller-provided version if explicitly set (no auto-increment)', async () => {
    const updatedFormulaire = { ...mockFormulaire, version: '2.0.0', questions: [] }

    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue(mockFormulaire)
    mockPrisma.formulaire.update.mockResolvedValue(updatedFormulaire)
    mockPrisma.formulaireVersion.create.mockResolvedValue({ ...mockFormulaireVersion, version: '2.0.0' })

    const res = await request(app)
      .put('/api/formulaires/uuid-form-1')
      .set(authSA)
      .send({ label: 'Updated Form', version: '2.0.0' })

    expect(res.status).toBe(200)
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('2.0.0')
  })

  it('returns 404 when formulaire not found', async () => {
    const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' })
    mockPrisma.formulaire.findUniqueOrThrow.mockRejectedValue(p2025)

    const res = await request(app)
      .put('/api/formulaires/nonexistent')
      .set(authSA)
      .send({ label: 'Updated' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

// ─── PATCH /api/formulaires/:id/statut brouillon→publie — major version ───────

describe('PATCH /api/formulaires/:id/statut brouillon→publie — major version increment (task 37.4)', () => {
  it('increments major version when transitioning from brouillon to publie', async () => {
    const formulaireWithValidQuestions = {
      ...mockFormulaire,
      version: '1.2.3',
      statut: 'brouillon',
      questions: [mockQuestion],
    }
    const updatedFormulaire = {
      ...formulaireWithValidQuestions,
      version: '2.0.0',
      statut: 'publie',
      questions: [mockQuestion],
    }

    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue(formulaireWithValidQuestions)
    mockPrisma.formulaire.update.mockResolvedValue(updatedFormulaire)
    mockPrisma.formulaireVersion.create.mockResolvedValue({
      ...mockFormulaireVersion,
      version: '2.0.0',
    })

    const res = await request(app)
      .patch('/api/formulaires/uuid-form-1/statut')
      .set(authSA)
      .send({ statut: 'publie' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify major version increment
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('2.0.0')
    expect(updateCall.data.statut).toBe('publie')

    // Verify snapshot was created
    expect(mockPrisma.formulaireVersion.create).toHaveBeenCalledTimes(1)
    const snapshotCall = mockPrisma.formulaireVersion.create.mock.calls[0][0]
    expect(snapshotCall.data.version).toBe('2.0.0')
  })

  it('does NOT increment version when transitioning to archive (not brouillon→publie)', async () => {
    const formulairePublie = {
      ...mockFormulaire,
      version: '2.0.0',
      statut: 'publie',
      questions: [mockQuestion],
    }
    const updatedFormulaire = { ...formulairePublie, statut: 'archive' }

    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue(formulairePublie)
    mockPrisma.formulaire.update.mockResolvedValue(updatedFormulaire)

    const res = await request(app)
      .patch('/api/formulaires/uuid-form-1/statut')
      .set(authSA)
      .send({ statut: 'archive' })

    expect(res.status).toBe(200)

    // Version should remain unchanged
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('2.0.0')

    // No snapshot created for non-publication transitions
    expect(mockPrisma.formulaireVersion.create).not.toHaveBeenCalled()
  })

  it('returns 422 when publishing with questions missing FR label', async () => {
    const formulaireWithBadQuestion = {
      ...mockFormulaire,
      statut: 'brouillon',
      questions: [{ ...mockQuestion, libelleQuestion: { fr: '', es: null, en: null } }],
    }

    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue(formulaireWithBadQuestion)

    const res = await request(app)
      .patch('/api/formulaires/uuid-form-1/statut')
      .set(authSA)
      .send({ statut: 'publie' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_PUBLICATION')
    // No version increment or snapshot on validation failure
    expect(mockPrisma.formulaire.update).not.toHaveBeenCalled()
    expect(mockPrisma.formulaireVersion.create).not.toHaveBeenCalled()
  })
})

// ─── POST /api/formulaires/:id/questions — minor version increment ────────────

describe('POST /api/formulaires/:id/questions — minor version increment (task 37.5)', () => {
  it('increments minor version after adding a question', async () => {
    const formulaireAfterMinorIncrement = {
      ...mockFormulaire,
      version: '1.3.0',
      questions: [mockQuestion],
    }

    mockPrisma.formulaire.findUnique
      .mockResolvedValueOnce(mockFormulaire)   // getFormulaireOrFail
      .mockResolvedValueOnce(mockFormulaire)   // incrementMinorVersionAndSnapshot fetch

    mockPrisma.question.create.mockResolvedValue(mockQuestion)
    mockPrisma.formulaire.update.mockResolvedValue(formulaireAfterMinorIncrement)
    mockPrisma.formulaireVersion.create.mockResolvedValue({
      ...mockFormulaireVersion,
      version: '1.3.0',
    })

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/questions')
      .set(authSA)
      .send({
        libelleQuestion: { fr: 'Question test' },
        typeOption: 'option_unique',
        orderPage: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)

    // Verify minor version increment
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('1.3.0')

    // Verify snapshot was created
    expect(mockPrisma.formulaireVersion.create).toHaveBeenCalledTimes(1)
    const snapshotCall = mockPrisma.formulaireVersion.create.mock.calls[0][0]
    expect(snapshotCall.data.version).toBe('1.3.0')
    expect(snapshotCall.data.changedBy).toBe('uuid-super')
  })

  it('returns 400 when libelleQuestion.fr is missing', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(mockFormulaire)

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/questions')
      .set(authSA)
      .send({
        libelleQuestion: { es: 'Pregunta' },
        typeOption: 'option_unique',
        orderPage: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    // No version increment on validation failure
    expect(mockPrisma.formulaire.update).not.toHaveBeenCalled()
    expect(mockPrisma.formulaireVersion.create).not.toHaveBeenCalled()
  })
})

// ─── DELETE /api/formulaires/:id/questions/:qid — minor version increment ─────

describe('DELETE /api/formulaires/:id/questions/:qid — minor version increment (task 37.6)', () => {
  it('increments minor version after deleting a question (with ?force=true on publie)', async () => {
    const formulairePublie = { ...mockFormulaire, statut: 'publie', version: '2.0.0' }
    const formulaireAfterMinorIncrement = {
      ...formulairePublie,
      version: '2.1.0',
      questions: [],
    }

    mockPrisma.formulaire.findUnique
      .mockResolvedValueOnce(formulairePublie)   // getFormulaireOrFail
      .mockResolvedValueOnce(formulairePublie)   // incrementMinorVersionAndSnapshot fetch

    mockPrisma.question.delete.mockResolvedValue(mockQuestion)
    mockPrisma.formulaire.update.mockResolvedValue(formulaireAfterMinorIncrement)
    mockPrisma.formulaireVersion.create.mockResolvedValue({
      ...mockFormulaireVersion,
      version: '2.1.0',
    })

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1/questions/uuid-q-1?force=true')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.deleted).toBe(true)

    // Verify minor version increment
    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('2.1.0')

    // Verify snapshot was created
    expect(mockPrisma.formulaireVersion.create).toHaveBeenCalledTimes(1)
    const snapshotCall = mockPrisma.formulaireVersion.create.mock.calls[0][0]
    expect(snapshotCall.data.version).toBe('2.1.0')
  })

  it('increments minor version after deleting a question on brouillon formulaire', async () => {
    const formulaireBrouillon = { ...mockFormulaire, statut: 'brouillon', version: '1.2.3' }
    const formulaireAfterMinorIncrement = {
      ...formulaireBrouillon,
      version: '1.3.0',
      questions: [],
    }

    mockPrisma.formulaire.findUnique
      .mockResolvedValueOnce(formulaireBrouillon)   // getFormulaireOrFail
      .mockResolvedValueOnce(formulaireBrouillon)   // incrementMinorVersionAndSnapshot fetch

    mockPrisma.question.delete.mockResolvedValue(mockQuestion)
    mockPrisma.formulaire.update.mockResolvedValue(formulaireAfterMinorIncrement)
    mockPrisma.formulaireVersion.create.mockResolvedValue({
      ...mockFormulaireVersion,
      version: '1.3.0',
    })

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1/questions/uuid-q-1')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data.deleted).toBe(true)

    const updateCall = mockPrisma.formulaire.update.mock.calls[0][0]
    expect(updateCall.data.version).toBe('1.3.0')
    expect(mockPrisma.formulaireVersion.create).toHaveBeenCalledTimes(1)
  })

  it('returns 409 when deleting from publie formulaire without ?force=true', async () => {
    const formulairePublie = { ...mockFormulaire, statut: 'publie' }
    mockPrisma.formulaire.findUnique.mockResolvedValue(formulairePublie)

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1/questions/uuid-q-1')
      .set(authSA)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('FORMULAIRE_PUBLIE')
    // No version increment on blocked operation
    expect(mockPrisma.formulaire.update).not.toHaveBeenCalled()
    expect(mockPrisma.formulaireVersion.create).not.toHaveBeenCalled()
  })
})

// ─── GET /api/formulaires/:id/versions — version history ─────────────────────

describe('GET /api/formulaires/:id/versions — version history (tasks 36.4 + 37.7)', () => {
  it('returns version history ordered by createdAt desc', async () => {
    const versions = [
      { ...mockFormulaireVersion, id: 'uuid-fv-2', version: '1.2.4', createdAt: new Date(now.getTime() + 1000) },
      { ...mockFormulaireVersion, id: 'uuid-fv-1', version: '1.2.3', createdAt: now },
    ]

    mockPrisma.formulaire.findUnique.mockResolvedValue({ id: 'uuid-form-1' })
    mockPrisma.formulaireVersion.findMany.mockResolvedValue(versions)

    const res = await request(app)
      .get('/api/formulaires/uuid-form-1/versions')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(2)

    // Verify Prisma was called with correct params
    const findManyCall = mockPrisma.formulaireVersion.findMany.mock.calls[0][0]
    expect(findManyCall.where).toEqual({ formulaireId: 'uuid-form-1' })
    expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('returns empty array when no versions exist', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue({ id: 'uuid-form-1' })
    mockPrisma.formulaireVersion.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/formulaires/uuid-form-1/versions')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('returns 404 when formulaire does not exist', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/formulaires/nonexistent/versions')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('requires SUPER_ADMIN — unauthenticated gets 401', async () => {
    const res = await request(app).get('/api/formulaires/uuid-form-1/versions')
    expect(res.status).toBe(401)
  })
})
