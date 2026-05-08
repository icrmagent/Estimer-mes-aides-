import { jest } from '@jest/globals'

// ─── Mocks (must be before any imports) ──────────────────────────────────────

const mockPrisma = {
  partageJob: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  enregistrement: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const mockNotifySucces = jest.fn()
const mockNotifyEchec = jest.fn()
const mockPublishEvent = jest.fn().mockResolvedValue(undefined)
jest.unstable_mockModule('../src/services/pusherService.js', () => ({
  notifyPartageSucces: mockNotifySucces,
  notifyPartageEchec: mockNotifyEchec,
  publishEvent: mockPublishEvent,
}))

// Mock global fetch for CRM API calls
global.fetch = jest.fn()

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const { processJob, MAX_TENTATIVES, computeNextRetry } = await import('../src/services/queueWorker.js')

// ─── Test data ────────────────────────────────────────────────────────────────

const mockEnregistrement = {
  id: 'enr-uuid-1',
  borneId: 'borne-uuid-1',
  formulaireId: 'form-uuid-1',
  langueUtilisee: 'fr',
  statutPartage: 'en_attente',
  tentatives: 0,
  borne: { id: 'borne-uuid-1', idBorne: 'BORNE-001' },
  reponses: [
    { questionId: 'q-1', valeur: 'Dupont', question: { libelleQuestion: { fr: 'Nom' }, orderPage: 1 } },
  ],
}

const makeJob = (overrides = {}) => ({
  id: 'job-uuid-1',
  enregistrementId: 'enr-uuid-1',
  statut: 'en_attente',
  tentatives: 0,
  prochainEssai: null,
  erreur: null,
  ...overrides,
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRM_API_URL = 'http://crm-test.example.com'
  process.env.CRM_API_KEY = 'test-crm-key'

  // Default: enregistrement found
  mockPrisma.enregistrement.findUnique.mockResolvedValue(mockEnregistrement)
  mockPrisma.enregistrement.update.mockResolvedValue({ ...mockEnregistrement })
  mockPrisma.partageJob.update.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
  mockNotifySucces.mockResolvedValue(undefined)
  mockNotifyEchec.mockResolvedValue(undefined)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('queueWorker — processJob', () => {

  describe('Succès CRM', () => {
    it('marque le job comme succes et l\'enregistrement comme partage', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'crm-123' }) })

      const job = makeJob()
      await processJob(job)

      // Doit d'abord marquer en_cours
      expect(mockPrisma.partageJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ statut: 'en_cours' }) })
      )

      // Doit appeler $transaction avec succes + partage
      expect(mockPrisma.$transaction).toHaveBeenCalled()
      const txCalls = mockPrisma.$transaction.mock.calls[0][0]
      expect(txCalls).toHaveLength(2)

      // Doit notifier Pusher succès
      expect(mockNotifySucces).toHaveBeenCalledWith('borne-uuid-1', 'enr-uuid-1')
      expect(mockNotifyEchec).not.toHaveBeenCalled()
    })

    it('appelle l\'API CRM avec le bon format', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

      await processJob(makeJob())

      expect(global.fetch).toHaveBeenCalledWith(
        'http://crm-test.example.com/api/submissions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-api-key': 'test-crm-key' }),
        })
      )
    })
  })

  describe('Échec temporaire (tentatives < MAX)', () => {
    it('planifie un retry avec délai exponentiel après 1er échec', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Server Error' })

      const job = makeJob({ tentatives: 0 })
      await processJob(job)

      expect(mockPrisma.partageJob.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statut: 'echec_temporaire',
            tentatives: 1,
            prochainEssai: expect.any(Date),
          }),
        })
      )

      // Vérifier que le délai est ~2 minutes (2^1 = 2min) + jitter (0-60s)
      const updateCall = mockPrisma.partageJob.update.mock.calls.find(
        c => c[0].data?.statut === 'echec_temporaire'
      )
      const prochainEssai = updateCall[0].data.prochainEssai
      const delaiMs = prochainEssai.getTime() - Date.now()
      // 2^1 min = 120s, + jitter 0-60s → range: 120s to 180s
      expect(delaiMs).toBeGreaterThan(2 * 60 * 1000 - 5000)
      expect(delaiMs).toBeLessThan(3 * 60 * 1000 + 5000)

      // Pas de notification Pusher pour un échec temporaire
      expect(mockNotifyEchec).not.toHaveBeenCalled()
    })

    it('utilise le délai de 4 minutes pour la 2ème tentative', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'Unavailable' })

      const job = makeJob({ tentatives: 1 })
      await processJob(job)

      const updateCall = mockPrisma.partageJob.update.mock.calls.find(
        c => c[0].data?.statut === 'echec_temporaire'
      )
      const prochainEssai = updateCall[0].data.prochainEssai
      const delaiMs = prochainEssai.getTime() - Date.now()
      // 2^2 min = 240s, + jitter 0-60s → range: 240s to 300s
      expect(delaiMs).toBeGreaterThan(4 * 60 * 1000 - 5000)
      expect(delaiMs).toBeLessThan(5 * 60 * 1000 + 5000)
    })
  })

  describe('Échec définitif (tentatives >= MAX)', () => {
    it('marque le job comme echec_definitif après MAX tentatives', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' })

      const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
      await processJob(job)

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      const txCalls = mockPrisma.$transaction.mock.calls[0][0]
      // Doit avoir 2 opérations dans la transaction
      expect(txCalls).toHaveLength(2)

      // Doit notifier Pusher échec définitif
      expect(mockNotifyEchec).toHaveBeenCalledWith(
        'borne-uuid-1',
        'enr-uuid-1',
        expect.any(String)
      )
      expect(mockNotifySucces).not.toHaveBeenCalled()
    })

    it('ne planifie pas de retry pour un échec définitif', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' })

      const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
      await processJob(job)

      // Aucun appel avec statut echec_temporaire
      const tempCalls = mockPrisma.partageJob.update.mock.calls.filter(
        c => c[0].data?.statut === 'echec_temporaire'
      )
      expect(tempCalls).toHaveLength(0)
    })
  })

  describe('Erreur réseau (fetch throws)', () => {
    it('traite une erreur réseau comme un échec temporaire', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      const job = makeJob({ tentatives: 0 })
      await processJob(job)

      const updateCall = mockPrisma.partageJob.update.mock.calls.find(
        c => c[0].data?.statut === 'echec_temporaire'
      )
      expect(updateCall).toBeDefined()
      expect(updateCall[0].data.erreur).toContain('Network error')
    })
  })

  describe('Constantes', () => {
    it('MAX_TENTATIVES est 5', () => {
      expect(MAX_TENTATIVES).toBe(5)
    })

    it('computeNextRetry retourne un délai exponentiel croissant', () => {
      const delay1 = computeNextRetry(1).getTime() - Date.now()
      const delay2 = computeNextRetry(2).getTime() - Date.now()
      const delay3 = computeNextRetry(3).getTime() - Date.now()
      // 2^1=2min, 2^2=4min, 2^3=8min (+ jitter)
      expect(delay1).toBeGreaterThan(2 * 60 * 1000 - 1000)
      expect(delay2).toBeGreaterThan(4 * 60 * 1000 - 1000)
      expect(delay3).toBeGreaterThan(8 * 60 * 1000 - 1000)
      expect(delay2).toBeGreaterThan(delay1)
      expect(delay3).toBeGreaterThan(delay2)
    })
  })
})
