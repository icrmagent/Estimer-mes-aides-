/**
 * Tests unitaires — queueWorker.js, destination « entreprise I-CRM de la borne ».
 *
 * Résolution d'un job :
 *   - borne affectée à une entreprise ACTIVE → envoi par clé API avec l'URL / la
 *     clé / le secret de l'entreprise (même émetteur, même payload, mêmes en-têtes
 *     et même classification que le canal icrm_api_key) ;
 *   - borne affectée à une entreprise DÉSACTIVÉE ou supprimée → envoi SUSPENDU :
 *     rien n'est envoyé (ni canal, ni env), job reprogrammé dans 10 min sans
 *     tentative comptée, jamais d'échec définitif ;
 *   - borne sans entreprise → canal (canalTransmission, puis premier actif), sinon
 *     variables d'environnement — inchangé.
 * Au succès par entreprise : crmEntrepriseIcrmId renseigné (traçabilité).
 * Journaux : type de destination, jamais le secret ni les valeurs saisies.
 */

import { jest } from '@jest/globals'

const mockPrisma = {
  partageJob: { findMany: jest.fn(), update: jest.fn() },
  enregistrement: { findUnique: jest.fn(), update: jest.fn() },
  canal: { update: jest.fn() },
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const mockNotifySucces = jest.fn()
const mockNotifyEchec = jest.fn()
jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  notifyPartageSucces: mockNotifySucces,
  notifyPartageEchec: mockNotifyEchec,
  publishEvent: jest.fn().mockResolvedValue(undefined),
}))

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
jest.unstable_mockModule('../../src/lib/logger.js', () => ({ default: mockLogger }))

global.fetch = jest.fn()

const { processJob, buildIcrmEnregistrementPayload, MAX_TENTATIVES } = await import('../../src/services/queueWorker.js')

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLE_ENT = 'emak_EntrepriseCAE01234567890'
const SECRET_ENT = 'EnTrEpRiSe0123456789EnTrEpRiSe0123456789EnTrEpRi'
const CLE_CANAL = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET_CANAL = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const ENR_ID = '9f1c2e0a-6d7b-4c1e-9a55-2b8f0c3d4e5f'
const ENT_ID = '66666666-6666-4666-8666-666666666666'
const URL_ENTREPRISE = 'https://icrm.api.es.ila26.com/api/external/estimer-mes-aides/v1/enregistrements'
const URL_CANAL = 'https://icrm.api.ila26.fr/api/external/estimer-mes-aides/v1/enregistrements'

const ENTREPRISE = {
  id: ENT_ID,
  nom: 'CAE España',
  apiUrl: 'https://icrm.api.es.ila26.com/api/',
  apiKey: CLE_ENT,
  token: SECRET_ENT,
  actif: true,
  deletedAt: null,
}

const CANAL_CLE_API = {
  id: 'canal-cle-api', label: 'icrm-lena-prod', type: 'icrm_api_key',
  apiUrl: 'https://icrm.api.ila26.fr', apiKey: CLE_CANAL, token: SECRET_CANAL, actif: true,
}

const q = (crm, fr, typeOption = 'texte_court') => ({
  id: `q-${crm}`, libelleQuestion: { fr }, orderPage: 1, crmFieldIds: [crm], typeOption, options: null,
})

function makeEnregistrement({ entrepriseIcrm = ENTREPRISE, canaux = [CANAL_CLE_API], canalTransmission = 'icrm-lena-prod' } = {}) {
  return {
    id: ENR_ID,
    borneId: 'borne-uuid-1',
    formulaireId: 'form-uuid-1',
    formulaireVersion: '1.3.0',
    langueUtilisee: 'es',
    deletedAt: null,
    createdAt: new Date('2026-09-27T09:15:00.000Z'),
    formulaire: { id: 'form-uuid-1', label: 'Estimer mes aides', version: '1.3.0' },
    borne: {
      id: 'borne-uuid-1',
      idBorne: 'BORNE-ES-01',
      pays: 'ES',
      adresse: 'CALLE MAYOR 1, MADRID',
      commercant: null,
      regie: null,
      installateur: null,
      adminBorne: null,
      canalTransmission,
      entrepriseIcrm,
      canaux,
    },
    reponses: [
      { questionId: 'q-2087', valeur: 'GARCIA', question: q(2087, 'Nom') },
      { questionId: 'q-2088', valeur: 'LUCIA', question: q(2088, 'Prénom') },
      { questionId: 'q-2016', valeur: 'lucia.garcia@example.es', question: q(2016, 'Adresse Email', 'email') },
    ],
  }
}

const makeJob = (overrides = {}) => ({
  id: 'job-uuid-1', enregistrementId: ENR_ID, statut: 'en_attente', tentatives: 0, prochainEssai: null, ...overrides,
})

function reponseHttp(status, corps) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (corps === undefined ? '' : typeof corps === 'string' ? corps : JSON.stringify(corps)),
  }
}

const CREATED = { status: 'created', projet_id: 4321, projet_ref: 'P-CAE2026004321', warnings: [] }

const appelsUpdateJob = (statut) =>
  mockPrisma.partageJob.update.mock.calls.filter((c) => c[0].data?.statut === statut)
const majPartage = () => mockPrisma.enregistrement.update.mock.calls
  .map((c) => c[0])
  .find((u) => u.data.statutPartage === 'partage')

function tousLesLogs() {
  return JSON.stringify([
    ...mockLogger.info.mock.calls,
    ...mockLogger.warn.mock.calls,
    ...mockLogger.error.mock.calls,
  ])
}

const jwtValide = () => [
  'e30',
  Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'signature',
].join('.')

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRM_API_URL = 'http://crm-legacy.example.com'
  process.env.CRM_API_KEY = 'legacy-crm-key'
  mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement())
  mockPrisma.enregistrement.update.mockResolvedValue({})
  mockPrisma.partageJob.update.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
  mockNotifySucces.mockResolvedValue(undefined)
  mockNotifyEchec.mockResolvedValue(undefined)
  global.fetch.mockResolvedValue(reponseHttp(201, CREATED))
})

// ─── Ordre de résolution ──────────────────────────────────────────────────────

describe('processJob — l’entreprise I-CRM de la borne est prioritaire', () => {
  it('envoie à l’URL de l’entreprise avec SA clé et SON secret, même si un canal clé API est affecté', async () => {
    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(URL_ENTREPRISE)
    expect(options.method).toBe('POST')
    expect(options.redirect).toBe('manual')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': CLE_ENT,
      'X-Api-Secret': SECRET_ENT,
      'Idempotency-Key': ENR_ID,
    })
    expect(options.headers.Authorization).toBeUndefined()
    expect(JSON.stringify(options)).not.toContain(SECRET_CANAL)
  })

  it('corps POST = payload du contrat, identique à celui d’un canal clé API', async () => {
    await processJob(makeJob())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    // L'entreprise et les canaux (données d'acheminement) ne font pas partie du payload
    const attendu = buildIcrmEnregistrementPayload(makeEnregistrement())
    expect(body).toEqual(JSON.parse(JSON.stringify(attendu)))
    expect(body.borne).toMatchObject({ id_borne: 'BORNE-ES-01', pays: 'ES' })
    expect(body.contact).toEqual({ last_name: 'GARCIA', first_name: 'LUCIA', email_adress: 'lucia.garcia@example.es' })
    expect(JSON.stringify(body)).not.toContain(CLE_ENT)
  })

  it('succès : partage + crmProjetId / crmProjetRef + crmEntrepriseIcrmId', async () => {
    await processJob(makeJob())

    expect(appelsUpdateJob('succes')).toHaveLength(1)
    expect(majPartage().data).toEqual({
      statutPartage: 'partage',
      partageAt: expect.any(Date),
      crmProjetId: '4321',
      crmProjetRef: 'P-CAE2026004321',
      crmEntrepriseIcrmId: ENT_ID,
    })
    expect(mockNotifySucces).toHaveBeenCalledWith('borne-uuid-1', ENR_ID)
  })

  it('journalise la destination entreprise_icrm (id), jamais le secret, la clé ni les valeurs saisies', async () => {
    await processJob(makeJob())

    const logSucces = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Job succès/.test(l.message))
    expect(logSucces).toMatchObject({
      destination: 'entreprise_icrm',
      entrepriseIcrmId: ENT_ID,
      canalType: 'icrm_api_key',
      statutIcrm: 'created',
      crmProjetId: '4321',
    })
    const logs = tousLesLogs()
    expect(logs).not.toContain(SECRET_ENT)
    expect(logs).not.toContain(CLE_ENT)
    expect(logs).not.toContain('GARCIA')
    expect(logs).not.toContain('lucia.garcia@example.es')
  })

  it('charge l’entreprise de la borne (URL, clé, secret, actif, deletedAt)', async () => {
    await processJob(makeJob())
    const { include } = mockPrisma.enregistrement.findUnique.mock.calls[0][0]
    expect(include.borne.select.entrepriseIcrm).toEqual({
      select: { id: true, nom: true, apiUrl: true, apiKey: true, token: true, actif: true, deletedAt: true },
    })
  })

  it('aucun canal nécessaire : une borne sans canal envoie à son entreprise', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ canaux: [], canalTransmission: null }))
    await processJob(makeJob())
    expect(global.fetch.mock.calls[0][0]).toBe(URL_ENTREPRISE)
    expect(appelsUpdateJob('succes')).toHaveLength(1)
  })

  it('un canalTransmission incohérent n’est pas signalé quand l’entreprise est la destination', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ canalTransmission: 'inconnu' }))
    await processJob(makeJob())
    const warns = mockLogger.warn.mock.calls.map((c) => c[0].message)
    expect(warns.some((m) => /canalTransmission ne correspond/.test(m))).toBe(false)
  })
})

describe('processJob — entreprise désactivée ou supprimée : envoi SUSPENDU, jamais de repli', () => {
  const DIX_MINUTES = 10 * 60 * 1000
  const jobSuspendu = () => appelsUpdateJob('echec_temporaire')[0]?.[0]
  const majEnregistrement = () => mockPrisma.enregistrement.update.mock.calls.map((c) => c[0])

  it.each([
    ['désactivée', { ...ENTREPRISE, actif: false }, 'Entreprise I-CRM « CAE España » désactivée — envoi suspendu'],
    ['supprimée (encore affectée)', { ...ENTREPRISE, deletedAt: new Date('2026-09-26T00:00:00Z') },
      'Entreprise I-CRM « CAE España » supprimée mais encore affectée à la borne — envoi suspendu'],
  ])('entreprise %s : aucun envoi (ni entreprise, ni canal clé API, ni env), job reprogrammé dans 10 min', async (_cas, entrepriseIcrm, motif) => {
    // La borne a AUSSI un canal clé API actif (autre entreprise) et l'env est renseigné : rien ne doit partir
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm }))
    const avant = Date.now()

    await processJob(makeJob({ tentatives: 2 }))

    expect(global.fetch).not.toHaveBeenCalled()
    const { where, data } = jobSuspendu()
    expect(where).toEqual({ id: 'job-uuid-1' })
    expect(data).toMatchObject({ statut: 'echec_temporaire', tentatives: 2, erreur: motif })
    expect(data.prochainEssai.getTime()).toBeGreaterThanOrEqual(avant + DIX_MINUTES)
    expect(data.prochainEssai.getTime()).toBeLessThanOrEqual(Date.now() + DIX_MINUTES)
    // L'enregistrement reflète le job ; son compteur de tentatives n'est pas touché
    expect(majEnregistrement()).toEqual([{
      where: { id: ENR_ID }, data: { statutPartage: 'echec_temporaire', derniereErreur: motif },
    }])
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(appelsUpdateJob('succes')).toHaveLength(0)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockNotifyEchec).not.toHaveBeenCalled()
    expect(mockNotifySucces).not.toHaveBeenCalled()

    const log = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /Job suspendu/.test(l.message))
    expect(log).toMatchObject({
      status: 'suspendu', destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, borneId: 'borne-uuid-1', tentatives: 2,
    })
    const logs = tousLesLogs()
    expect(logs).not.toContain(SECRET_ENT)
    expect(logs).not.toContain(SECRET_CANAL)
    expect(logs).not.toMatch(/repli|fallback/)
  })

  it('entreprise supprimée encore affectée : avertissement dédié (borne à réaffecter)', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      entrepriseIcrm: { ...ENTREPRISE, actif: false, deletedAt: new Date('2026-09-26T00:00:00Z') },
    }))
    await processJob(makeJob())
    const warn = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /supprimée — envoi suspendu, réaffecter/.test(l.message))
    expect(warn).toMatchObject({ entrepriseIcrmId: ENT_ID, borneId: 'borne-uuid-1', jobId: 'job-uuid-1' })
  })

  it('entreprise désactivée, borne sans canal : pas de repli sur les variables d’environnement', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      entrepriseIcrm: { ...ENTREPRISE, actif: false }, canaux: [], canalTransmission: null,
    }))
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(jobSuspendu().data.erreur).toMatch(/désactivée — envoi suspendu/)
  })

  it('canal azure_ad sur la borne : jamais de refresh Azure ni d’appel customContacts pendant la pause', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      entrepriseIcrm: { ...ENTREPRISE, actif: false },
      canalTransmission: 'azure',
      canaux: [{ id: 'canal-azure', label: 'azure', type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token: 'expire', actif: true }],
    }))
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.canal.update).not.toHaveBeenCalled()
  })

  it('pause à la dernière tentative : jamais d’échec définitif (tentatives inchangées)', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm: { ...ENTREPRISE, actif: false } }))
    await processJob(makeJob({ tentatives: MAX_TENTATIVES - 1, statut: 'echec_temporaire' }))
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(jobSuspendu().data.tentatives).toBe(MAX_TENTATIVES - 1)
  })

  it('pauses répétées : le compteur ne bouge jamais', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm: { ...ENTREPRISE, actif: false } }))
    for (let i = 0; i < MAX_TENTATIVES + 2; i += 1) {
      await processJob(makeJob({ tentatives: 1, statut: 'echec_temporaire' }))
    }
    const pauses = appelsUpdateJob('echec_temporaire')
    expect(pauses).toHaveLength(MAX_TENTATIVES + 2)
    pauses.forEach(([args]) => expect(args.data.tentatives).toBe(1))
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('réactivation : le cycle suivant envoie à l’entreprise (et à elle seule)', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValueOnce(makeEnregistrement({ entrepriseIcrm: { ...ENTREPRISE, actif: false } }))
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()

    // Entreprise réactivée : le job suspendu repasse (mêmes tentatives)
    mockPrisma.enregistrement.findUnique.mockResolvedValueOnce(makeEnregistrement())
    await processJob(makeJob({ statut: 'echec_temporaire', tentatives: 0 }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_ENTREPRISE)
    expect(global.fetch.mock.calls[0][1].headers['X-Api-Key']).toBe(CLE_ENT)
    expect(majPartage().data).toMatchObject({ statutPartage: 'partage', crmEntrepriseIcrmId: ENT_ID })
  })

  it('borne dont l’entreprise est retirée (entrepriseIcrmId null) : logique des canaux inchangée', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm: null }))
    await processJob(makeJob())
    expect(global.fetch.mock.calls[0][0]).toBe(URL_CANAL)
  })

  it('identifiant d’entreprise présent sans l’entreprise chargée (cas impossible avec la FK) : suspendu aussi', async () => {
    const enr = makeEnregistrement({ entrepriseIcrm: null })
    enr.borne.entrepriseIcrmId = ENT_ID
    mockPrisma.enregistrement.findUnique.mockResolvedValue(enr)
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(jobSuspendu().data.statut).toBe('echec_temporaire')
  })
})

describe('processJob — sans entreprise : comportement historique inchangé', () => {
  it('canal azure_ad : Bearer / customContacts, aucune colonne de traçabilité', async () => {
    const token = jwtValide()
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      entrepriseIcrm: null,
      canalTransmission: 'azure',
      canaux: [{ id: 'canal-azure', label: 'azure', type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token, actif: true }],
    }))
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://legacy.example/api/customContacts?lang=fr')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
    expect(options.redirect).toBeUndefined()
    const corps = JSON.parse(options.body)
    expect(corps).toMatchObject({ last_name: 'GARCIA', first_name: 'LUCIA', dtypes: 1, user_type: 'societe' })
    expect(corps).not.toHaveProperty('external_id')
    expect(majPartage().data).toEqual({ statutPartage: 'partage', partageAt: expect.any(Date) })
  })

  it('canal clé API (sans entreprise) : succès sans crmEntrepriseIcrmId', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm: null }))
    await processJob(makeJob())
    expect(global.fetch.mock.calls[0][0]).toBe(URL_CANAL)
    expect(majPartage().data).toEqual({
      statutPartage: 'partage', partageAt: expect.any(Date), crmProjetId: '4321', crmProjetRef: 'P-CAE2026004321',
    })
  })
})

describe('processJob — entreprise : même classification des échecs que le canal clé API', () => {
  it('401 invalid_credentials → échec définitif immédiat, sans repli sur le canal', async () => {
    global.fetch.mockResolvedValue(reponseHttp(401, { error: { code: 'invalid_credentials', message: 'Refusé', request_id: 'req-9' } }))

    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const job = appelsUpdateJob('echec_definitif')[0][0].data
    expect(job.tentatives).toBe(1)
    expect(job.erreur).toContain('invalid_credentials')
    const logErreur = mockLogger.error.mock.calls.map((c) => c[0]).find((l) => /échec définitif/.test(l.message))
    expect(logErreur).toMatchObject({ destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, httpStatus: 401 })
    expect(tousLesLogs()).not.toContain(SECRET_ENT)
  })

  it('503 → échec temporaire avec backoff, destination journalisée', async () => {
    global.fetch.mockResolvedValue(reponseHttp(503, { error: { code: 'internal_error' } }))

    await processJob(makeJob())

    const [appel] = appelsUpdateJob('echec_temporaire')
    expect(appel[0].data).toMatchObject({ tentatives: 1, prochainEssai: expect.any(Date) })
    const logTemp = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /échec temporaire/.test(l.message))
    expect(logTemp).toMatchObject({ destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID })
  })

  it('2xx non conforme (page HTML) → échec définitif, jamais « partagé »', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, '<!doctype html><html></html>'))
    await processJob(makeJob())
    expect(majPartage()).toBeUndefined()
    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toMatch(/non conforme au contrat/)
  })

  it('entreprise incomplète (secret vide) → échec définitif sans appel réseau, message « Entreprise I-CRM »', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ entrepriseIcrm: { ...ENTREPRISE, token: '' } }))

    await processJob(makeJob())

    expect(global.fetch).not.toHaveBeenCalled()
    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toMatch(/Entreprise I-CRM incomplète/)
  })
})
