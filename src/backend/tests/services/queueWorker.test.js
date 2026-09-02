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

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/logger.js', () => ({ default: mockLogger }))

global.fetch = jest.fn()

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const {
  processJob,
  processPendingJobs,
  MAX_TENTATIVES,
  computeNextRetry,
  mapReponsesToICRM,
  FIELD_ID_MAP,
} = await import('../../src/services/queueWorker.js')

// Liste canonique des 23 field IDs du formulaire V1 (docs/CONTEXT.md)
const { VALID_CRM_FIELD_IDS } = await import('../../src/lib/crmFieldIds.js')

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

// ─── Mapping I-CRM & visibilité des champs non transmis (B-2) ────────────────

const makeReponse = (crmFieldIds, libelleFr, valeur) => ({
  questionId: `q-${crmFieldIds ?? libelleFr}`,
  valeur,
  question: { crmFieldIds, libelleQuestion: { fr: libelleFr }, orderPage: 1 },
})

describe('queueWorker — mapReponsesToICRM (champs connus)', () => {
  it('mappe les 8 field IDs connus vers les noms de champs I-CRM', () => {
    const { payload, champsNonTransmis } = mapReponsesToICRM([
      makeReponse(2087, 'Nom', 'Dupont'),
      makeReponse(2088, 'Prénom', 'Jean'),
      makeReponse(2089, 'Code postal', '75001'),
      makeReponse(2090, 'Ville', 'Paris'),
      makeReponse(2217, 'ADRESSE', '12 rue de la Paix'),
      makeReponse(2015, 'Num. de Téléphone', '0601020304'),
      makeReponse(2016, 'Adresse Email', 'jean@example.com'),
      makeReponse(2262, 'Civilité', '2262-1-mr'),
    ])

    expect(payload).toMatchObject({
      dtypes: 1,
      type_contact_id: 1,
      user_type: 'societe',
      last_name: 'Dupont',
      first_name: 'Jean',
      code_postale: '75001',
      ville: 'Paris',
      adresse: '12 rue de la Paix',
      phone_number: '0601020304',
      email_adress: 'jean@example.com',
      civility: 'Mr',
    })
    expect(champsNonTransmis).toEqual([])
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('mappe par libellé FR quand crmFieldIds est absent (fallback LABEL_MAP)', () => {
    const { payload, champsNonTransmis } = mapReponsesToICRM([
      makeReponse(null, 'Nom', 'Martin'),
      makeReponse(undefined, 'Prénom', 'Claire'),
    ])

    expect(payload.last_name).toBe('Martin')
    expect(payload.first_name).toBe('Claire')
    expect(champsNonTransmis).toEqual([])
  })

  it('accepte un tableau de crmFieldIds et retient le premier ID connu', () => {
    const { payload } = mapReponsesToICRM([
      makeReponse([2302, 2087], 'Question multi-fields', 'Durand'),
      makeReponse(2088, 'Prénom', 'Luc'),
    ])

    expect(payload.last_name).toBe('Durand')
  })

  it('refuse un payload sans nom ni prénom (obligatoires I-CRM)', () => {
    expect(() => mapReponsesToICRM([makeReponse(2090, 'Ville', 'Lyon')]))
      .toThrow(/Nom et Prénom requis/)
  })

  it('FIELD_ID_MAP ne contient que de vrais field IDs CRM du formulaire V1', () => {
    const ids = Object.keys(FIELD_ID_MAP).map(Number)
    expect(ids).toHaveLength(8)
    ids.forEach((id) => expect(VALID_CRM_FIELD_IDS).toContain(id))
  })
})

describe('queueWorker — journalisation des champs non transmis à I-CRM', () => {
  it('journalise en warn les field IDs absents de FIELD_ID_MAP', () => {
    const { payload, champsNonTransmis } = mapReponsesToICRM(
      [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        makeReponse(2294, 'À combien s’élève le revenu total de votre foyer fiscal', '1- Inférieur à 23734€'),
        makeReponse(2293, 'Dans ce logement vous êtes', 'Propriétaire'),
      ],
      { enregistrementId: 'enr-uuid-1', canalId: 'canal-uuid-1', canalLabel: 'I-CRM Prod' }
    )

    expect(payload.revenu_fiscal).toBeUndefined()
    expect(champsNonTransmis).toEqual([
      expect.objectContaining({ crmFieldIds: [2294] }),
      expect.objectContaining({ crmFieldIds: [2293] }),
    ])

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    const log = mockLogger.warn.mock.calls[0][0]
    expect(log.message).toMatch(/NON transmis/)
    expect(log.enregistrementId).toBe('enr-uuid-1')
    expect(log.canalId).toBe('canal-uuid-1')
    expect(log.canalLabel).toBe('I-CRM Prod')
    expect(log.nbChampsNonTransmis).toBe(2)
    expect(log.nbChampsTransmis).toBe(2)
  })

  it('ne journalise jamais les valeurs saisies (RGPD)', () => {
    mapReponsesToICRM(
      [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        makeReponse(2305, 'Commentaires ou informations complémentaires', 'SECRET-VALEUR-USAGER'),
      ],
      { enregistrementId: 'enr-uuid-1' }
    )

    const log = JSON.stringify(mockLogger.warn.mock.calls[0][0])
    expect(log).toContain('2305')
    expect(log).not.toContain('SECRET-VALEUR-USAGER')
  })

  it('journalise un libellé de référence quand la question n’a pas de libellé FR', () => {
    mapReponsesToICRM(
      [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        { questionId: 'q-x', valeur: 'Maison', question: { crmFieldIds: 2292, libelleQuestion: null } },
      ],
      {}
    )

    const log = mockLogger.warn.mock.calls[0][0]
    expect(log.champsNonTransmis[0]).toEqual({
      crmFieldIds: [2292],
      libelle: 'Votre projet concerne (type de logement)',
    })
  })

  it('journalise TOUS les field IDs du formulaire absents de FIELD_ID_MAP (15 attendus)', () => {
    const idsNonMappes = VALID_CRM_FIELD_IDS.filter((id) => !FIELD_ID_MAP[id])
    expect(idsNonMappes).toHaveLength(15)
    expect(idsNonMappes).toEqual(expect.arrayContaining([2294, 2293]))

    mapReponsesToICRM(
      [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        // libelleQuestion null → aucun secours possible via LABEL_MAP
        ...idsNonMappes.map((id) => ({
          questionId: `q-${id}`,
          valeur: `valeur-${id}`,
          question: { crmFieldIds: id, libelleQuestion: null },
        })),
      ],
      { enregistrementId: 'enr-uuid-1', canalId: 'canal-uuid-1' }
    )

    const log = mockLogger.warn.mock.calls[0][0]
    expect(log.nbChampsNonTransmis).toBe(15)
    expect(log.champsNonTransmis.map((c) => c.crmFieldIds[0])).toEqual(idsNonMappes)
    // Chaque champ perdu est identifiable par un libellé métier (docs/CONTEXT.md)
    log.champsNonTransmis.forEach((c) => expect(typeof c.libelle).toBe('string'))
  })

  it('n’émet aucun warn quand tous les champs sont mappés', () => {
    mapReponsesToICRM([
      makeReponse(2087, 'Nom', 'Dupont'),
      makeReponse(2088, 'Prénom', 'Jean'),
    ])

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('processJob journalise la perte avec jobId, enregistrementId et canal, et n’envoie pas les champs non mappés', async () => {
    mockEnregistrement.findUnique.mockResolvedValue({
      ...mockEnregistrementData,
      borne: {
        id: 'borne-uuid-1',
        idBorne: 'BORNE-001',
        canalTransmission: 'I-CRM Prod',
        canaux: [
          { id: 'canal-uuid-1', label: 'I-CRM Prod', apiUrl: 'https://icrm.example.com', token: 'token-opaque', apiKey: null, actif: true },
        ],
      },
      reponses: [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        makeReponse(2294, 'Revenu fiscal', '1- Inférieur à 23734€'),
      ],
    })
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'crm-1' }) })

    await processJob(makeJob())

    const perteLog = mockLogger.warn.mock.calls
      .map((c) => c[0])
      .find((l) => /NON transmis/.test(l.message))

    expect(perteLog).toBeDefined()
    expect(perteLog.jobId).toBe('job-uuid-1')
    expect(perteLog.enregistrementId).toBe('enr-uuid-1')
    expect(perteLog.borneId).toBe('borne-uuid-1')
    expect(perteLog.canalId).toBe('canal-uuid-1')
    expect(perteLog.canalLabel).toBe('I-CRM Prod')
    expect(perteLog.canalSource).toBe('borne')
    expect(perteLog.champsNonTransmis).toEqual([expect.objectContaining({ crmFieldIds: [2294] })])

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.last_name).toBe('Dupont')
    expect(Object.values(body)).not.toContain('1- Inférieur à 23734€')
  })

  it('processJob indique canalSource=env quand la borne n’a aucun canal configuré', async () => {
    mockEnregistrement.findUnique.mockResolvedValue({
      ...mockEnregistrementData,
      reponses: [
        makeReponse(2087, 'Nom', 'Dupont'),
        makeReponse(2088, 'Prénom', 'Jean'),
        makeReponse(2293, 'Dans ce logement vous êtes', 'Propriétaire'),
      ],
    })
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await processJob(makeJob())

    const perteLog = mockLogger.warn.mock.calls
      .map((c) => c[0])
      .find((l) => /NON transmis/.test(l.message))

    expect(perteLog).toBeDefined()
    expect(perteLog.canalId).toBeNull()
    expect(perteLog.canalSource).toBe('env')
  })
})
