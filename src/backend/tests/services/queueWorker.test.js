/**
 * Tests unitaires — queueWorker.js (services/)
 *
 * Couvre les scénarios supplémentaires par rapport à tests/queueWorker.test.js :
 *   - Timeout AbortController (30s) : le fetch est annulé si l'API CRM ne répond pas
 *   - Concurrence : processPendingJobs traite plusieurs jobs via Promise.allSettled
 *
 * Note : ces tests valident le contrat attendu (task 30 — Phase 6).
 * Les tests de base (succès, échec, retry) sont dans tests/queueWorker.test.js.
 */

import { jest } from '@jest/globals'

// ─── Mocks (must be before any imports) ──────────────────────────────────────

const mockPartageJob = {
  findMany: jest.fn(),
  update: jest.fn(),
}

const mockEnregistrement = {
  findUnique: jest.fn(),
  update: jest.fn(),
}

const mockPrisma = {
  partageJob: mockPartageJob,
  enregistrement: mockEnregistrement,
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const mockNotifySucces = jest.fn()
const mockNotifyEchec = jest.fn()
const mockPublishEvent = jest.fn().mockResolvedValue(undefined)

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  notifyPartageSucces: mockNotifySucces,
  notifyPartageEchec: mockNotifyEchec,
  publishEvent: mockPublishEvent,
}))

global.fetch = jest.fn()

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const {
  processJob,
  processPendingJobs,
  MAX_TENTATIVES,
  computeNextRetry,
} = await import('../../src/services/queueWorker.js')

// ─── Test data ────────────────────────────────────────────────────────────────

const mockEnregistrementData = {
  id: 'enr-uuid-1',
  borneId: 'borne-uuid-1',
  formulaireId: 'form-uuid-1',
  langueUtilisee: 'fr',
  statutPartage: 'en_attente',
  tentatives: 0,
  borne: { id: 'borne-uuid-1', idBorne: 'BORNE-001' },
  reponses: [
    {
      questionId: 'q-1',
      valeur: 'Dupont',
      question: { libelleQuestion: { fr: 'Nom' }, orderPage: 1 },
    },
    {
      questionId: 'q-2',
      valeur: 'Jean',
      question: { libelleQuestion: { fr: 'Prénom' }, orderPage: 1 },
    },
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

  mockEnregistrement.findUnique.mockResolvedValue(mockEnregistrementData)
  mockEnregistrement.update.mockResolvedValue({ ...mockEnregistrementData })
  mockPartageJob.update.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
  mockNotifySucces.mockResolvedValue(undefined)
  mockNotifyEchec.mockResolvedValue(undefined)
})

// ─── Timeout (AbortController 30s) ───────────────────────────────────────────

describe('queueWorker — timeout AbortController (30s)', () => {
  it('traite une erreur AbortError comme un échec temporaire', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    global.fetch.mockRejectedValue(abortError)

    const job = makeJob({ tentatives: 0 })
    await processJob(job)

    const tempCall = mockPartageJob.update.mock.calls.find(
      (c) => c[0].data?.statut === 'echec_temporaire'
    )
    expect(tempCall).toBeDefined()
    expect(tempCall[0].data.tentatives).toBe(1)
    expect(tempCall[0].data.prochainEssai).toBeInstanceOf(Date)
  })

  it('une AbortError sur la dernière tentative déclenche echec_definitif', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    global.fetch.mockRejectedValue(abortError)

    const job = makeJob({ tentatives: MAX_TENTATIVES - 1 })
    await processJob(job)

    expect(mockPrisma.$transaction).toHaveBeenCalled()
    const txCalls = mockPrisma.$transaction.mock.calls[0][0]
    expect(txCalls).toHaveLength(2)
    expect(mockNotifyEchec).toHaveBeenCalled()
  })

  it('le message d\'erreur AbortError est enregistré dans le job', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    global.fetch.mockRejectedValue(abortError)

    const job = makeJob({ tentatives: 0 })
    await processJob(job)

    const tempCall = mockPartageJob.update.mock.calls.find(
      (c) => c[0].data?.statut === 'echec_temporaire'
    )
    expect(tempCall[0].data.erreur).toBeDefined()
    expect(typeof tempCall[0].data.erreur).toBe('string')
  })

  it('un timeout réseau (ETIMEDOUT) est traité comme un échec temporaire', async () => {
    const timeoutError = new Error('connect ETIMEDOUT 1.2.3.4:443')
    timeoutError.code = 'ETIMEDOUT'
    global.fetch.mockRejectedValue(timeoutError)

    const job = makeJob({ tentatives: 0 })
    await processJob(job)

    const tempCall = mockPartageJob.update.mock.calls.find(
      (c) => c[0].data?.statut === 'echec_temporaire'
    )
    expect(tempCall).toBeDefined()
    expect(tempCall[0].data.erreur).toContain('ETIMEDOUT')
  })
})

// ─── Concurrence (processPendingJobs) ────────────────────────────────────────

describe('queueWorker — concurrence (processPendingJobs)', () => {
  it('récupère jusqu\'à 10 jobs en attente par cycle', async () => {
    mockPartageJob.findMany.mockResolvedValue([])

    await processPendingJobs()

    expect(mockPartageJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      })
    )
  })

  it('traite plusieurs jobs dans un seul cycle', async () => {
    const jobs = [
      makeJob({ id: 'job-1', enregistrementId: 'enr-1' }),
      makeJob({ id: 'job-2', enregistrementId: 'enr-2' }),
      makeJob({ id: 'job-3', enregistrementId: 'enr-3' }),
    ]

    mockPartageJob.findMany.mockResolvedValue(jobs)
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await processPendingJobs()

    const enCoursCalls = mockPartageJob.update.mock.calls.filter(
      (c) => c[0].data?.statut === 'en_cours'
    )
    expect(enCoursCalls.length).toBe(3)
  })

  it('un job en échec n\'empêche pas le traitement des autres jobs', async () => {
    const jobs = [
      makeJob({ id: 'job-1', enregistrementId: 'enr-1' }),
      makeJob({ id: 'job-2', enregistrementId: 'enr-2' }),
    ]

    mockPartageJob.findMany.mockResolvedValue(jobs)

    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await processPendingJobs()

    const enCoursCalls = mockPartageJob.update.mock.calls.filter(
      (c) => c[0].data?.statut === 'en_cours'
    )
    expect(enCoursCalls.length).toBe(2)
  })

  it('ne traite pas de jobs si la liste est vide', async () => {
    mockPartageJob.findMany.mockResolvedValue([])

    await processPendingJobs()

    expect(mockPartageJob.update).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('inclut les jobs echec_temporaire dont prochainEssai est passé', async () => {
    mockPartageJob.findMany.mockResolvedValue([])

    await processPendingJobs()

    const findCall = mockPartageJob.findMany.mock.calls[0][0]
    const orConditions = findCall.where.OR
    const retryCondition = orConditions.find((c) => c.statut === 'echec_temporaire')
    expect(retryCondition).toBeDefined()
    expect(retryCondition.prochainEssai).toBeDefined()
  })

  it('ordonne les jobs par createdAt asc (FIFO)', async () => {
    mockPartageJob.findMany.mockResolvedValue([])

    await processPendingJobs()

    const findCall = mockPartageJob.findMany.mock.calls[0][0]
    expect(findCall.orderBy).toEqual({ createdAt: 'asc' })
  })
})

// ─── Constantes exportées ─────────────────────────────────────────────────────

describe('queueWorker — constantes', () => {
  it('MAX_TENTATIVES est défini et positif', () => {
    expect(typeof MAX_TENTATIVES).toBe('number')
    expect(MAX_TENTATIVES).toBeGreaterThan(0)
  })

  it('computeNextRetry est une fonction qui retourne un délai croissant', () => {
    expect(typeof computeNextRetry).toBe('function')
    const delay1 = computeNextRetry(1).getTime() - Date.now()
    const delay2 = computeNextRetry(2).getTime() - Date.now()
    expect(delay2).toBeGreaterThan(delay1)
  })

  it('le premier délai de retry est d\'au moins 2 minutes (2^1)', () => {
    const delay = computeNextRetry(1).getTime() - Date.now()
    expect(delay).toBeGreaterThanOrEqual(2 * 60 * 1000 - 1000)
  })
})
