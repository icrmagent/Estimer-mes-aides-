/**
 * 17.2 — Integration test: offline submission and sync on reconnect
 *
 * Tests the backend enregistrements endpoint:
 * - POST /api/enregistrements with valid payload → creates enregistrement + PartageJob
 * - POST /api/enregistrements with invalid borneId → returns 403
 * - GET /api/enregistrements → returns list with deletedAt: null filter
 * - PartageJob is created with statut: 'en_attente' after submission
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Mocks (must be declared BEFORE dynamic imports) ─────────────────────────

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

const mockIsBlacklisted = jest.fn().mockResolvedValue(false)
jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: jest.fn(),
  isBlacklisted: mockIsBlacklisted,
  cleanupExpired: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/bruteForceService.js', () => ({
  isBlocked: jest.fn().mockResolvedValue(false),
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
  getRemainingAttempts: jest.fn().mockResolvedValue(5),
  getRetryAfter: jest.fn().mockResolvedValue(0),
}))

// Mock Pusher to avoid real network calls
jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  notifyPartageSucces: jest.fn().mockResolvedValue(undefined),
  notifyPartageEchec: jest.fn().mockResolvedValue(undefined),
}))

// Prisma mock — all methods are jest.fn() so we can control return values per test
const mockBorne = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
}
const mockEnregistrement = {
  create: jest.fn(),
  findMany: jest.fn(),
  findUniqueOrThrow: jest.fn(),
  count: jest.fn(),
}
const mockPartageJob = {
  create: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: {
    superAdmin: { findUnique: jest.fn() },
    adminBorne: { findUnique: jest.fn() },
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
    borne: mockBorne,
    enregistrement: mockEnregistrement,
    partageJob: mockPartageJob,
    formulaire: { findUnique: jest.fn().mockResolvedValue({ version: '1.0.0' }) },
    enregistrementReponse: { findMany: jest.fn().mockResolvedValue([]) },
  },
}))

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

process.env.JWT_SECRET = 'integration_test_jwt_secret_32chars!!'
process.env.API_KEY_MOBILE = 'ema_mobile_test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeAdminBorneToken = (sub = 'uuid-admin', jti = 'jti-ab-1') =>
  jwt.sign({ sub, role: 'ADMIN_BORNE', jti }, process.env.JWT_SECRET, { expiresIn: '8h' })

const makeSuperAdminToken = (jti = 'jti-sa-1') =>
  jwt.sign({ sub: 'uuid-super', role: 'SUPER_ADMIN', jti }, process.env.JWT_SECRET, { expiresIn: '8h' })

const VALID_BORNE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const VALID_FORMULAIRE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'
const VALID_QUESTION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012'
const ADMIN_BORNE_ID = 'uuid-admin'

const validPayload = {
  borneId: VALID_BORNE_ID,
  formulaireId: VALID_FORMULAIRE_ID,
  langueUtilisee: 'fr',
  reponses: [
    { questionId: VALID_QUESTION_ID, valeur: 'Dupont' },
  ],
}

const mockEnregistrementRecord = {
  id: 'enr-uuid-001',
  borneId: VALID_BORNE_ID,
  formulaireId: VALID_FORMULAIRE_ID,
  langueUtilisee: 'fr',
  statutPartage: 'en_attente',
  deletedAt: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  reponses: [{ id: 'rep-1', questionId: VALID_QUESTION_ID, valeur: 'Dupont' }],
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Integration — Offline Sync: enregistrements endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsBlacklisted.mockResolvedValue(false)
  })

  // ── 1. POST with valid payload ─────────────────────────────────────────────

  describe('POST /api/enregistrements — valid payload', () => {
    it('creates enregistrement and returns 201 with data', async () => {
      // Borne belongs to this AdminBorne
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: ADMIN_BORNE_ID,
      })
      mockEnregistrement.create.mockResolvedValue(mockEnregistrementRecord)
      mockPartageJob.create.mockResolvedValue({
        id: 'job-uuid-001',
        enregistrementId: 'enr-uuid-001',
        statut: 'en_attente',
      })

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      const res = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('enr-uuid-001')
      expect(res.body.data.borneId).toBe(VALID_BORNE_ID)
    })

    it('creates a PartageJob with statut en_attente after submission', async () => {
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: ADMIN_BORNE_ID,
      })
      mockEnregistrement.create.mockResolvedValue(mockEnregistrementRecord)
      mockPartageJob.create.mockResolvedValue({
        id: 'job-uuid-002',
        enregistrementId: 'enr-uuid-001',
        statut: 'en_attente',
      })

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      // Verify PartageJob was created with the enregistrement ID
      expect(mockPartageJob.create).toHaveBeenCalledWith({
        data: { enregistrementId: 'enr-uuid-001' },
      })
    })

    it('publishes a Pusher new-enregistrement event after creation', async () => {
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: ADMIN_BORNE_ID,
      })
      mockEnregistrement.create.mockResolvedValue(mockEnregistrementRecord)
      mockPartageJob.create.mockResolvedValue({ id: 'job-uuid-003', statut: 'en_attente' })

      const { publishEvent } = await import('../../src/services/pusherService.js')

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(publishEvent).toHaveBeenCalledWith(
        'admin-notifications',
        'new-enregistrement',
        expect.objectContaining({ enregistrementId: 'enr-uuid-001' })
      )
    })
  })

  // ── 2. POST with invalid borneId (borne not owned by AdminBorne) ───────────

  describe('POST /api/enregistrements — invalid borneId (403)', () => {
    it('returns 403 when borne does not belong to the AdminBorne', async () => {
      // Borne belongs to a DIFFERENT AdminBorne
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: 'uuid-other-admin',
      })

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      const res = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 403 when borne does not exist', async () => {
      mockBorne.findUnique.mockResolvedValue(null)

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      const res = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(res.status).toBe(403)
    })

    it('does not create PartageJob when borne ownership check fails', async () => {
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: 'uuid-other-admin',
      })

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(mockPartageJob.create).not.toHaveBeenCalled()
    })
  })

  // ── 3. POST validation errors ──────────────────────────────────────────────

  describe('POST /api/enregistrements — validation', () => {
    it('returns 400 when borneId is not a valid UUID', async () => {
      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      const res = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validPayload, borneId: 'not-a-uuid' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 401 when no Authorization header', async () => {
      const res = await request(app)
        .post('/api/enregistrements')
        .send(validPayload)

      expect(res.status).toBe(401)
    })

    it('returns 403 when role is SUPER_ADMIN (only ADMIN_BORNE can submit)', async () => {
      const token = makeSuperAdminToken()
      const res = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(res.status).toBe(403)
    })
  })

  // ── 4. GET /api/enregistrements — list with deletedAt: null filter ─────────

  describe('GET /api/enregistrements — list', () => {
    it('returns 200 with list of enregistrements', async () => {
      const records = [
        { ...mockEnregistrementRecord, deletedAt: null },
        { ...mockEnregistrementRecord, id: 'enr-uuid-002', deletedAt: null },
      ]
      mockEnregistrement.findMany.mockResolvedValue(records)
      mockEnregistrement.count.mockResolvedValue(2)

      const token = makeSuperAdminToken()
      const res = await request(app)
        .get('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.meta.total).toBe(2)
    })

    it('passes deletedAt: null in the where clause', async () => {
      mockEnregistrement.findMany.mockResolvedValue([])
      mockEnregistrement.count.mockResolvedValue(0)

      const token = makeSuperAdminToken()
      await request(app)
        .get('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)

      // Verify the findMany was called with deletedAt: null in where
      expect(mockEnregistrement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      )
    })

    it('returns 401 when no Authorization header', async () => {
      const res = await request(app).get('/api/enregistrements')
      expect(res.status).toBe(401)
    })

    it('AdminBorne only sees enregistrements for their bornes', async () => {
      // AdminBorne has one borne
      mockBorne.findMany.mockResolvedValue([{ id: VALID_BORNE_ID }])
      mockEnregistrement.findMany.mockResolvedValue([mockEnregistrementRecord])
      mockEnregistrement.count.mockResolvedValue(1)

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)
      const res = await request(app)
        .get('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)

      // Verify the where clause restricts to the admin's bornes
      expect(mockEnregistrement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            borneId: { in: [VALID_BORNE_ID] },
          }),
        })
      )
    })
  })

  // ── 5. Offline sync scenario: submit while offline, sync on reconnect ──────

  describe('Offline sync scenario', () => {
    it('accepts submission when connectivity is restored (simulated by sequential requests)', async () => {
      // Simulate: form was filled offline, now syncing on reconnect
      // The backend simply receives the POST — it does not know about offline state
      mockBorne.findUnique.mockResolvedValue({
        id: VALID_BORNE_ID,
        adminBorneId: ADMIN_BORNE_ID,
      })
      mockEnregistrement.create.mockResolvedValue(mockEnregistrementRecord)
      mockPartageJob.create.mockResolvedValue({
        id: 'job-sync-001',
        enregistrementId: 'enr-uuid-001',
        statut: 'en_attente',
      })

      const token = makeAdminBorneToken(ADMIN_BORNE_ID)

      // First submission (was pending offline)
      const res1 = await request(app)
        .post('/api/enregistrements')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload)

      expect(res1.status).toBe(201)
      expect(res1.body.data.id).toBe('enr-uuid-001')

      // PartageJob created with en_attente — CRM sync will happen asynchronously
      expect(mockPartageJob.create).toHaveBeenCalledWith({
        data: { enregistrementId: 'enr-uuid-001' },
      })
    })
  })
})
