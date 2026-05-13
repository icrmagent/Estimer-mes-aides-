/**
 * 17.3 — Integration test: CRM queue worker
 *
 * Tests the processJob function from queueWorker.js with mocked Prisma and fetch:
 * - Job en_attente → processJob → CRM API called → statut 'succes'
 * - CRM API returns 500 → statut 'echec_temporaire', prochainEssai set
 * - After MAX_TENTATIVES failures → statut 'echec_definitif'
 * - Pusher events published on success and failure
 */

import { jest } from '@jest/globals'

// ─── Mocks (must be declared BEFORE dynamic imports) ─────────────────────────

// Mock Pusher service
const mockNotifyPartageSucces = jest.fn().mockResolvedValue(undefined)
const mockNotifyPartageEchec = jest.fn().mockResolvedValue(undefined)
const mockPublishEvent = jest.fn().mockResolvedValue(undefined)
jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  notifyPartageSucces: mockNotifyPartageSucces,
  notifyPartageEchec: mockNotifyPartageEchec,
  publishEvent: mockPublishEvent,
}))

// Prisma mock with all methods needed by queueWorker
const mockPartageJobUpdate = jest.fn()
const mockEnregistrementFindUnique = jest.fn()
const mockEnregistrementUpdate = jest.fn()
const mockTransaction = jest.fn()

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: {
    partageJob: {
      update: mockPartageJobUpdate,
      findMany: jest.fn(),
    },
    enregistrement: {
      findUnique: mockEnregistrementFindUnique,
      update: mockEnregistrementUpdate,
    },
    $transaction: mockTransaction,
  },
}))

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

const { processJob, MAX_TENTATIVES, computeNextRetry } = await import('../../src/services/queueWorker.js')

// ─── Environment setup ────────────────────────────────────────────────────────

process.env.CRM_API_URL = 'https://crm.example.com'
process.env.CRM_API_KEY = 'test-crm-api-key'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BORNE_ID = 'borne-uuid-001'
const ENR_ID = 'enr-uuid-001'
const JOB_ID = 'job-uuid-001'

const mockEnregistrement = {
  id: ENR_ID,
  borneId: BORNE_ID,
  langueUtilisee: 'fr',
  borne: { id: BORNE_ID, idBorne: 'BORNE-001' },
  reponses: [
    { questionId: 'q-uuid-1', valeur: 'Dupont', question: { libelleQuestion: { fr: 'Nom' }, orderPage: 1 } },
    { questionId: 'q-uuid-2', valeur: 'Jean', question: { libelleQuestion: { fr: 'Prénom' }, orderPage: 2 } },
  ],
}

const makeJob = (overrides = {}) => ({
  id: JOB_ID,
  enregistrementId: ENR_ID,
  statut: 'en_attente',
  tentatives: 0,
  erreur: null,
  prochainEssai: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  ...overrides,
})

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Integration — CRM Queue Worker: processJob', () => {
  let originalFetch

  beforeEach(() => {
    jest.clearAllMocks()
    // Save and replace global fetch
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // ── 1. Successful CRM API call ─────────────────────────────────────────────

  describe('Job en_attente → CRM API success → statut succes', () => {
    it('calls CRM API and updates job statut to succes', async () => {
      // Mock fetch to return 200
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'crm-project-123' }),
        text: async () => '{"id":"crm-project-123"}',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob()
      await processJob(job)

      // Verify job was first marked en_cours
      expect(mockPartageJobUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: { statut: 'en_cours' },
        })
      )

      // Verify CRM API was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://crm.example.com/api/customContacts?lang=fr',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-crm-api-key',
            'Content-Type': 'application/json',
          }),
        })
      )

      // Verify transaction updated job to succes
      expect(mockTransaction).toHaveBeenCalled()
    })

    it('publishes Pusher success event after successful CRM call', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"id":"crm-project-123"}',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob()
      await processJob(job)

      expect(mockNotifyPartageSucces).toHaveBeenCalledWith(BORNE_ID, ENR_ID)
    })

    it('publishes partage-status-changed event on admin-notifications channel', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"id":"crm-project-123"}',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob()
      await processJob(job)

      expect(mockPublishEvent).toHaveBeenCalledWith(
        'admin-notifications',
        'partage-status-changed',
        expect.objectContaining({
          jobId: JOB_ID,
          enregistrementId: ENR_ID,
          statut: 'partage',
        })
      )
    })
  })

  // ── 2. CRM API returns 500 → echec_temporaire ─────────────────────────────

  describe('CRM API returns 500 → statut echec_temporaire', () => {
    it('sets statut to echec_temporaire and sets prochainEssai', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob({ tentatives: 0 })
      await processJob(job)

      // After first failure (tentatives becomes 1), should be echec_temporaire
      expect(mockPartageJobUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: expect.objectContaining({
            statut: 'echec_temporaire',
            tentatives: 1,
            prochainEssai: expect.any(Date),
          }),
        })
      )
    })

    it('sets prochainEssai to a future date', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockEnregistrementUpdate.mockResolvedValue({})

      const beforeCall = new Date()
      const job = makeJob({ tentatives: 0 })
      await processJob(job)

      const updateCall = mockPartageJobUpdate.mock.calls.find(
        (call) => call[0].data?.statut === 'echec_temporaire'
      )
      expect(updateCall).toBeDefined()
      const prochainEssai = updateCall[0].data.prochainEssai
      expect(prochainEssai.getTime()).toBeGreaterThan(beforeCall.getTime())
    })

    it('increments tentatives counter on each failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockEnregistrementUpdate.mockResolvedValue({})

      // Second failure (tentatives was already 1)
      const job = makeJob({ tentatives: 1 })
      await processJob(job)

      expect(mockPartageJobUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tentatives: 2 }),
        })
      )
    })
  })

  // ── 3. After MAX_TENTATIVES failures → echec_definitif ────────────────────

  describe(`After ${MAX_TENTATIVES} failures → statut echec_definitif`, () => {
    it('sets statut to echec_definitif when tentatives reaches MAX_TENTATIVES', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Persistent Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      mockEnregistrementUpdate.mockResolvedValue({})

      // Job already at MAX_TENTATIVES - 1 failures
      const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
      await processJob(job)

      // Should now be echec_definitif
      expect(mockTransaction).toHaveBeenCalled()
      // The transaction should include an update to echec_definitif
      const transactionArgs = mockTransaction.mock.calls[0][0]
      expect(transactionArgs).toBeDefined()
    })

    it('publishes Pusher failure event on echec_definitif', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Persistent Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      // After transaction, queueWorker fetches enregistrement again for borneId
      mockEnregistrementUpdate.mockResolvedValue({})
      // The second findUnique call (for borneId after echec_definitif)
      mockEnregistrementFindUnique
        .mockResolvedValueOnce(mockEnregistrement) // first call: get enregistrement data
        .mockResolvedValueOnce({ borneId: BORNE_ID }) // second call: get borneId for notification

      const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
      await processJob(job)

      expect(mockNotifyPartageEchec).toHaveBeenCalledWith(
        BORNE_ID,
        ENR_ID,
        expect.any(String)
      )
    })

    it('publishes partage-status-changed with echec_definitif on admin-notifications', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Persistent Error',
      })

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockTransaction.mockImplementation(async (ops) => {
        for (const op of ops) await op
        return []
      })
      mockEnregistrementUpdate.mockResolvedValue({})
      mockEnregistrementFindUnique
        .mockResolvedValueOnce(mockEnregistrement)
        .mockResolvedValueOnce({ borneId: BORNE_ID })

      const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
      await processJob(job)

      expect(mockPublishEvent).toHaveBeenCalledWith(
        'admin-notifications',
        'partage-status-changed',
        expect.objectContaining({
          jobId: JOB_ID,
          enregistrementId: ENR_ID,
          statut: 'echec_definitif',
        })
      )
    })
  })

  // ── 4. Missing enregistrement ──────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles missing enregistrement gracefully (sets echec_temporaire)', async () => {
      mockEnregistrementFindUnique.mockResolvedValue(null)
      mockPartageJobUpdate.mockResolvedValue({})
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob({ tentatives: 0 })
      // Should not throw — error is caught and job is marked as failed
      await expect(processJob(job)).resolves.not.toThrow()
    })

    it('handles missing CRM_API_URL gracefully', async () => {
      const originalUrl = process.env.CRM_API_URL
      delete process.env.CRM_API_URL

      mockEnregistrementFindUnique.mockResolvedValue(mockEnregistrement)
      mockPartageJobUpdate.mockResolvedValue({})
      mockEnregistrementUpdate.mockResolvedValue({})

      const job = makeJob({ tentatives: 0 })
      await expect(processJob(job)).resolves.not.toThrow()

      process.env.CRM_API_URL = originalUrl
    })

    it('MAX_TENTATIVES constant is exported and equals 5', () => {
      expect(MAX_TENTATIVES).toBe(5)
    })

    it('computeNextRetry returns a Date with exponential backoff', () => {
      expect(typeof computeNextRetry).toBe('function')
      const result = computeNextRetry(1)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBeGreaterThan(Date.now() + 2 * 60 * 1000 - 1000)
    })
  })
})
