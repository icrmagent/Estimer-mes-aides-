/**
 * Tests unitaires — queueWorker.js, destination = CIBLE FIGÉE DU JOB.
 *
 * - job.entrepriseIcrmId (figé à la création du job) = la seule destination :
 *     entreprise utilisable → envoi par clé API avec SON URL / SA clé / SON secret
 *     (même émetteur, payload, en-têtes et classification que le canal icrm_api_key),
 *     crmEntrepriseIcrmId + instantané crmDestination (sans secret) au succès ;
 *     entreprise désactivée / supprimée / à retester / absente → statut `suspendu`
 *     (hors file, aucune tentative, aucune notification), jamais de canal ni d'env ;
 * - job.entrepriseIcrmId NULL → chemin des canaux inchangé (clé API, azure_ad, env) ;
 * - la destination COURANTE de la borne n'est jamais lue ;
 * - équité : des centaines de jobs suspendus n'occupent aucune place d'un cycle ;
 * - prise atomique du job + relecture de sa cible COURANTE après la prise ;
 * - balayage de début de cycle : suspendus d'une entreprise redevenue envoyable → en file ;
 * - hôte de l'URL revérifié au moment de l'envoi (liste ICRM_API_HOSTS_AUTORISES).
 */

import { jest } from '@jest/globals'

const mockPrisma = {
  partageJob: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  enregistrement: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  entrepriseIcrm: { findUnique: jest.fn(), findMany: jest.fn() },
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

const {
  processJob: processJobReel,
  processPendingJobs,
  buildIcrmEnregistrementPayload,
  MAX_TENTATIVES,
} = await import('../../src/services/queueWorker.js')
const { installerPriseJob, prisesDeJob } = await import('../helpers/priseJob.js')
let processJob = processJobReel

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLE_ENT = 'emak_EntrepriseCAE01234567890'
const SECRET_ENT = 'EnTrEpRiSe0123456789EnTrEpRiSe0123456789EnTrEpRi'
const CLE_CANAL = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET_CANAL = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const ENR_ID = '9f1c2e0a-6d7b-4c1e-9a55-2b8f0c3d4e5f'
const ENT_ID = '66666666-6666-4666-8666-666666666666'
const LENA_ID = '77777777-7777-4777-8777-777777777777'
const URL_ENTREPRISE = 'https://icrm.api.es.ila26.com/api/external/estimer-mes-aides/v1/enregistrements'
const URL_LENA = 'https://icrm.api.ila26.fr/api/external/estimer-mes-aides/v1/enregistrements'
const URL_CANAL = 'https://icrm-canal.azurewebsites.net/api/external/estimer-mes-aides/v1/enregistrements'

const ENTREPRISE = {
  id: ENT_ID,
  nom: 'CAE España',
  nomIcrm: 'CAE España',
  sousTypeIcrm: 'BORNE TACTILE',
  apiUrl: 'https://icrm.api.es.ila26.com/api/',
  apiKey: CLE_ENT,
  token: SECRET_ENT,
  actif: true,
  deletedAt: null,
  verificationRequise: false,
}
const LENA = {
  ...ENTREPRISE, id: LENA_ID, nom: 'LENA (France)', nomIcrm: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', apiKey: 'emak_LenaLenaLenaLenaLenaLena', token: 'L'.repeat(48),
}

const CANAL_CLE_API = {
  id: 'canal-cle-api', label: 'icrm-canal', type: 'icrm_api_key',
  apiUrl: 'https://icrm-canal.azurewebsites.net', apiKey: CLE_CANAL, token: SECRET_CANAL, actif: true,
}

const q = (crm, fr, typeOption = 'texte_court') => ({
  id: `q-${crm}`, libelleQuestion: { fr }, orderPage: 1, crmFieldIds: [crm], typeOption, options: null,
})

function makeEnregistrement({ id = ENR_ID, canaux = [CANAL_CLE_API], canalTransmission = 'icrm-canal' } = {}) {
  return {
    id,
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
  id: 'job-uuid-1', enregistrementId: ENR_ID, statut: 'en_attente', tentatives: 0, prochainEssai: null,
  entrepriseIcrmId: ENT_ID, ...overrides,
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
  mockPrisma.entrepriseIcrm.findUnique.mockImplementation(async ({ where }) => (
    where.id === ENT_ID ? { ...ENTREPRISE } : where.id === LENA_ID ? { ...LENA } : null
  ))
  mockPrisma.partageJob.update.mockResolvedValue({})
  mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
  processJob = installerPriseJob(mockPrisma.partageJob)(processJobReel)
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
  mockNotifySucces.mockResolvedValue(undefined)
  mockNotifyEchec.mockResolvedValue(undefined)
  global.fetch.mockResolvedValue(reponseHttp(201, CREATED))
  delete process.env.ICRM_API_HOSTS_AUTORISES
})

// ─── Cible entreprise utilisable ──────────────────────────────────────────────

describe('processJob — cible du job = entreprise I-CRM utilisable', () => {
  it('envoie à l’URL de l’entreprise CIBLE avec sa clé et son secret, même si la borne a un canal clé API', async () => {
    await processJob(makeJob())

    expect(mockPrisma.entrepriseIcrm.findUnique).toHaveBeenCalledWith({
      where: { id: ENT_ID },
      select: expect.objectContaining({ apiUrl: true, apiKey: true, token: true, actif: true, deletedAt: true, verificationRequise: true }),
    })
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
    expect(JSON.stringify(options)).not.toContain(SECRET_CANAL)
  })

  it('corps POST = payload du contrat, identique à celui d’un canal clé API', async () => {
    await processJob(makeJob())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body).toEqual(JSON.parse(JSON.stringify(buildIcrmEnregistrementPayload(makeEnregistrement()))))
    expect(body.contact).toEqual({ last_name: 'GARCIA', first_name: 'LUCIA', email_adress: 'lucia.garcia@example.es' })
    expect(JSON.stringify(body)).not.toContain(CLE_ENT)
  })

  it('succès : crmProjetId / crmProjetRef, crmEntrepriseIcrmId et instantané crmDestination (jamais le secret)', async () => {
    await processJob(makeJob())

    expect(appelsUpdateJob('succes')).toHaveLength(1)
    expect(majPartage().data).toEqual({
      statutPartage: 'partage',
      partageAt: expect.any(Date),
      crmProjetId: '4321',
      crmProjetRef: 'P-CAE2026004321',
      crmEntrepriseIcrmId: ENT_ID,
      crmDestination: {
        entrepriseIcrmId: ENT_ID,
        nom: 'CAE España',
        nomIcrm: 'CAE España',
        sousTypeIcrm: 'BORNE TACTILE',
        apiHost: 'icrm.api.es.ila26.com',
        apiKeyId: CLE_ENT, // identifiant de clé, public par construction
      },
    })
    expect(JSON.stringify(majPartage().data)).not.toContain(SECRET_ENT)
    expect(mockNotifySucces).toHaveBeenCalledWith('borne-uuid-1', ENR_ID)
  })

  it('instantané : identifiant de clé exposé seulement s’il a le format « emak_… »', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue({ ...LENA, apiKey: 'cle-historique-non-conforme' })
    await processJob(makeJob({ entrepriseIcrmId: LENA_ID }))
    expect(global.fetch.mock.calls[0][0]).toBe(URL_LENA)
    expect(majPartage().data.crmDestination).toMatchObject({ entrepriseIcrmId: LENA_ID, apiHost: 'icrm.api.ila26.fr', apiKeyId: null })
    expect(JSON.stringify(majPartage().data)).not.toContain('cle-historique-non-conforme')
  })

  it('ne lit JAMAIS la destination courante de la borne (seulement la cible du job)', async () => {
    await processJob(makeJob())
    const { include } = mockPrisma.enregistrement.findUnique.mock.calls[0][0]
    expect(include.borne.select).not.toHaveProperty('entrepriseIcrm')
    expect(include.borne.select).not.toHaveProperty('entrepriseIcrmId')
  })

  it('journalise la destination entreprise_icrm (id), jamais le secret, la clé ni les valeurs saisies', async () => {
    await processJob(makeJob())
    const logSucces = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Job succès/.test(l.message))
    expect(logSucces).toMatchObject({ destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, statutIcrm: 'created' })
    const logs = tousLesLogs()
    expect(logs).not.toContain(SECRET_ENT)
    expect(logs).not.toContain(CLE_ENT)
    expect(logs).not.toContain('GARCIA')
    expect(logs).not.toContain('lucia.garcia@example.es')
  })

  it('un canalTransmission incohérent n’est pas signalé quand la cible est une entreprise', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ canalTransmission: 'inconnu' }))
    await processJob(makeJob())
    expect(mockLogger.warn.mock.calls.some((c) => /canalTransmission ne correspond/.test(c[0].message))).toBe(false)
  })
})

// ─── Cible entreprise inutilisable : SUSPENDU ─────────────────────────────────

describe('processJob — cible inutilisable : statut `suspendu`, jamais de repli', () => {
  const jobSuspendu = () => appelsUpdateJob('suspendu')[0]?.[0]
  const majEnregistrement = () => mockPrisma.enregistrement.update.mock.calls.map((c) => c[0])

  it.each([
    ['désactivée', { ...ENTREPRISE, actif: false }, 'Entreprise I-CRM « CAE España » désactivée — envoi suspendu'],
    ['supprimée', { ...ENTREPRISE, actif: false, deletedAt: new Date('2026-09-26T00:00:00Z') }, 'Entreprise I-CRM « CAE España » supprimée — envoi suspendu'],
    ['à tester (nouvelle, URL ou clé modifiée)', { ...ENTREPRISE, verificationRequise: true, nomIcrm: null },
      "Entreprise I-CRM « CAE España » : identifiants non vérifiés (nouvelle entreprise, URL ou clé modifiée), testez l'entreprise pour reprendre les envois — envoi suspendu"],
    ['hôte d’URL hors liste autorisée', { ...ENTREPRISE, apiUrl: 'https://icrm.autre-hebergeur.example' },
      "Entreprise I-CRM « CAE España » : hôte de l'URL API non autorisé (ICRM_API_HOSTS_AUTORISES) — envoi suspendu"],
  ])('entreprise %s : aucun envoi (ni entreprise, ni canal, ni env), job suspendu hors file', async (_cas, etat, motif) => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue(etat)

    await processJob(makeJob({ tentatives: 2 }))

    expect(global.fetch).not.toHaveBeenCalled()
    const { where, data } = jobSuspendu()
    expect(where).toEqual({ id: 'job-uuid-1' })
    expect(data).toEqual({ statut: 'suspendu', erreur: motif, prochainEssai: null, updatedAt: expect.any(Date) })
    expect(data).not.toHaveProperty('tentatives')
    expect(majEnregistrement()).toEqual([{
      where: { id: ENR_ID }, data: { statutPartage: 'suspendu', derniereErreur: motif },
    }])
    expect(appelsUpdateJob('echec_temporaire')).toHaveLength(0)
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockNotifyEchec).not.toHaveBeenCalled()
    expect(mockNotifySucces).not.toHaveBeenCalled()

    const log = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /Job suspendu/.test(l.message))
    expect(log).toMatchObject({ status: 'suspendu', destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, tentatives: 2 })
    expect(tousLesLogs()).not.toContain(SECRET_ENT)
  })

  it('ligne d’entreprise introuvable : suspendu (« supprimée ») avec avertissement, jamais de canal', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue(null)
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(jobSuspendu().data.erreur).toMatch(/supprimée — envoi suspendu/)
    expect(mockLogger.warn.mock.calls.some((c) => /entreprise I-CRM supprimée — envoi suspendu/.test(c[0].message))).toBe(true)
  })

  it('borne avec canal azure_ad : ni refresh Azure ni customContacts pendant la suspension', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue({ ...ENTREPRISE, actif: false })
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      canalTransmission: 'azure',
      canaux: [{ id: 'canal-azure', label: 'azure', type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token: 'expire', actif: true }],
    }))
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.canal.update).not.toHaveBeenCalled()
  })

  it('suspension à la dernière tentative : jamais d’échec définitif, compteur inchangé', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue({ ...ENTREPRISE, actif: false })
    await processJob(makeJob({ tentatives: MAX_TENTATIVES - 1, statut: 'echec_temporaire' }))
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(jobSuspendu().data).not.toHaveProperty('tentatives')
  })

  it('reprise : une fois l’entreprise réactivée, le job repassé en file est envoyé à SA cible', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValueOnce({ ...ENTREPRISE, actif: false })
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()

    await processJob(makeJob({ statut: 'en_attente' }))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_ENTREPRISE)
    expect(majPartage().data).toMatchObject({ statutPartage: 'partage', crmEntrepriseIcrmId: ENT_ID })
  })
})

// ─── Cible NULL : chemin des canaux inchangé ──────────────────────────────────

describe('processJob — cible NULL (job « canal ») : comportement historique inchangé', () => {
  it('canal clé API : envoi au canal, sans crmEntrepriseIcrmId ni crmDestination, sans lire d’entreprise', async () => {
    await processJob(makeJob({ entrepriseIcrmId: null }))
    expect(mockPrisma.entrepriseIcrm.findUnique).not.toHaveBeenCalled()
    expect(global.fetch.mock.calls[0][0]).toBe(URL_CANAL)
    expect(global.fetch.mock.calls[0][1].headers['X-Api-Key']).toBe(CLE_CANAL)
    expect(majPartage().data).toEqual({
      statutPartage: 'partage', partageAt: expect.any(Date), crmProjetId: '4321', crmProjetRef: 'P-CAE2026004321',
    })
  })

  it('job sans champ entrepriseIcrmId (antérieur à la colonne) : chemin des canaux', async () => {
    const { entrepriseIcrmId: _e, ...ancienJob } = makeJob()
    await processJob(ancienJob)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_CANAL)
  })

  it('canal azure_ad : Bearer / customContacts, aucune colonne de traçabilité', async () => {
    const token = jwtValide()
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      canalTransmission: 'azure',
      canaux: [{ id: 'canal-azure', label: 'azure', type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token, actif: true }],
    }))
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await processJob(makeJob({ entrepriseIcrmId: null }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://legacy.example/api/customContacts?lang=fr')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
    expect(options.redirect).toBeUndefined()
    expect(JSON.parse(options.body)).toMatchObject({ last_name: 'GARCIA', first_name: 'LUCIA', dtypes: 1, user_type: 'societe' })
    expect(majPartage().data).toEqual({ statutPartage: 'partage', partageAt: expect.any(Date) })
  })

  it('ni canal ni cible : variables d’environnement', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ canaux: [], canalTransmission: null }))
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await processJob(makeJob({ entrepriseIcrmId: null }))
    expect(global.fetch.mock.calls[0][0]).toBe('http://crm-legacy.example.com/api/customContacts?lang=fr')
    const logSucces = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Job succès/.test(l.message))
    expect(logSucces).toMatchObject({ destination: 'env' })
  })
})

// ─── Classification des échecs (cible entreprise) ─────────────────────────────

describe('processJob — cible entreprise : même classification des échecs que le canal clé API', () => {
  it('401 invalid_credentials → échec définitif immédiat, sans repli sur le canal', async () => {
    global.fetch.mockResolvedValue(reponseHttp(401, { error: { code: 'invalid_credentials', message: 'Refusé', request_id: 'req-9' } }))
    await processJob(makeJob())
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const job = appelsUpdateJob('echec_definitif')[0][0].data
    expect(job.tentatives).toBe(1)
    expect(job.erreur).toContain('invalid_credentials')
    const logErreur = mockLogger.error.mock.calls.map((c) => c[0]).find((l) => /échec définitif/.test(l.message))
    expect(logErreur).toMatchObject({ destination: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, httpStatus: 401 })
  })

  it('503 → échec temporaire avec backoff', async () => {
    global.fetch.mockResolvedValue(reponseHttp(503, { error: { code: 'internal_error' } }))
    await processJob(makeJob())
    expect(appelsUpdateJob('echec_temporaire')[0][0].data).toMatchObject({ tentatives: 1, prochainEssai: expect.any(Date) })
  })

  it('2xx non conforme (page HTML) → échec définitif, jamais « partagé »', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, '<!doctype html><html></html>'))
    await processJob(makeJob())
    expect(majPartage()).toBeUndefined()
    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toMatch(/non conforme au contrat/)
  })

  it('entreprise incomplète (secret vide) → échec définitif sans appel réseau', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue({ ...ENTREPRISE, token: '' })
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toMatch(/Entreprise I-CRM incomplète/)
  })
})

// ─── Équité de la file (processPendingJobs) ───────────────────────────────────

describe('processPendingJobs — équité : les jobs suspendus n’occupent aucune place', () => {
  /** Fausse table partage_jobs qui applique la requête du worker (where / orderBy / take). */
  function fileEnMemoire(jobs) {
    const table = jobs.map((j) => ({ ...j }))
    mockPrisma.partageJob.findMany.mockImplementation(async ({ where, orderBy, take }) => {
      const maintenant = Date.now()
      const retenus = table.filter((j) => where.OR.some((cond) => {
        if (cond.statut !== j.statut) return false
        if (cond.prochainEssai?.lte) return j.prochainEssai && j.prochainEssai.getTime() <= new Date(cond.prochainEssai.lte).getTime()
        return true
      }) && j.statut !== undefined && maintenant > 0)
      retenus.sort((a, b) => (orderBy?.createdAt === 'asc' ? a.createdAt - b.createdAt : 0))
      return retenus.slice(0, take).map((j) => ({ ...j }))
    })
    mockPrisma.partageJob.update.mockImplementation(async ({ where, data }) => {
      const ligne = table.find((j) => j.id === where.id)
      if (ligne) Object.assign(ligne, data)
      return ligne
    })
    // Prise atomique : seulement si le statut est encore dans where.statut.in
    mockPrisma.partageJob.updateMany.mockImplementation(async ({ where, data }) => {
      const ligne = table.find((j) => j.id === where.id && (!where.statut?.in || where.statut.in.includes(j.statut)))
      if (ligne) Object.assign(ligne, data)
      return { count: ligne ? 1 : 0 }
    })
    mockPrisma.partageJob.findUnique.mockImplementation(async ({ where }) => {
      const ligne = table.find((j) => j.id === where.id)
      return ligne ? { enregistrementId: ligne.enregistrementId, entrepriseIcrmId: ligne.entrepriseIcrmId ?? null, tentatives: ligne.tentatives } : null
    })
    mockPrisma.enregistrement.findUnique.mockImplementation(async ({ where }) => makeEnregistrement({ id: where.id }))
    return table
  }

  const vieux = (i) => new Date(Date.UTC(2026, 8, 1) + i * 1000)

  it('300 jobs SUSPENDUS (plus anciens) + 1 job sain d’une autre entreprise : le sain part au 1er cycle', async () => {
    const table = fileEnMemoire([
      ...Array.from({ length: 300 }, (_, i) => ({
        id: `S${i}`, enregistrementId: `enr-S${i}`, statut: 'suspendu', tentatives: 0, prochainEssai: null,
        entrepriseIcrmId: ENT_ID, createdAt: vieux(i),
      })),
      { id: 'SAIN', enregistrementId: 'enr-SAIN', statut: 'en_attente', tentatives: 0, prochainEssai: null, entrepriseIcrmId: LENA_ID, createdAt: vieux(1000) },
    ])

    await processPendingJobs()

    const requete = mockPrisma.partageJob.findMany.mock.calls[0][0]
    expect(JSON.stringify(requete.where)).not.toContain('suspendu')
    expect(requete.take).toBe(10)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_LENA)
    expect(table.find((j) => j.id === 'SAIN').statut).toBe('succes')
    expect(table.filter((j) => j.statut === 'suspendu')).toHaveLength(300)
    expect(mockPrisma.entrepriseIcrm.findUnique).toHaveBeenCalledTimes(1)
  })

  it('300 jobs encore en file pour une entreprise désactivée : chacun visité UNE fois (suspendu), le sain part sans attendre indéfiniment', async () => {
    mockPrisma.entrepriseIcrm.findUnique.mockImplementation(async ({ where }) => (
      where.id === ENT_ID ? { ...ENTREPRISE, actif: false } : { ...LENA }
    ))
    const table = fileEnMemoire([
      ...Array.from({ length: 300 }, (_, i) => ({
        id: `D${i}`, enregistrementId: `enr-D${i}`, statut: 'en_attente', tentatives: 0, prochainEssai: null,
        entrepriseIcrmId: ENT_ID, createdAt: vieux(i),
      })),
      { id: 'SAIN', enregistrementId: 'enr-SAIN', statut: 'en_attente', tentatives: 0, prochainEssai: null, entrepriseIcrmId: LENA_ID, createdAt: vieux(1000) },
    ])

    let cycles = 0
    while (table.find((j) => j.id === 'SAIN').statut !== 'succes' && cycles < 100) {
      await processPendingJobs()
      cycles += 1
    }

    expect(cycles).toBe(31) // ⌈301 / 10⌉ : borné, puis plus jamais repris
    expect(table.filter((j) => j.statut === 'suspendu')).toHaveLength(300)
    const visites = prisesDeJob(mockPrisma.partageJob).map((arg) => arg.where.id)
    expect(new Set(visites).size).toBe(visites.length) // aucun job visité deux fois
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Cycle suivant : plus rien à lire, aucune place occupée
    mockPrisma.partageJob.findMany.mockClear()
    await processPendingJobs()
    expect(await mockPrisma.partageJob.findMany.mock.results[0].value).toEqual([])
  })
})

// ─── Prise atomique et relecture de la cible ──────────────────────────────────

describe('processJob — prise atomique, cible COURANTE relue après la prise', () => {
  it('prise refusée (job déjà pris, relancé, suspendu ou redirigé) : rien n’est lu, rien n’est envoyé', async () => {
    mockPrisma.partageJob.updateMany.mockResolvedValue({ count: 0 })

    await processJob(makeJob())

    expect(mockPrisma.partageJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-uuid-1', statut: { in: ['en_attente', 'echec_temporaire'] } },
      data: { statut: 'en_cours', updatedAt: expect.any(Date) },
    })
    expect(mockPrisma.partageJob.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.enregistrement.findUnique).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.partageJob.update).not.toHaveBeenCalled()
    expect(mockLogger.info.mock.calls.some((c) => /Job ignoré — déjà pris ou modifié/.test(c[0].message))).toBe(true)
  })

  it('job supprimé entre la prise et la relecture : ignoré', async () => {
    mockPrisma.partageJob.findUnique.mockResolvedValue(null)
    await processJobReel(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.enregistrement.findUnique).not.toHaveBeenCalled()
  })

  it('redirection arrivée juste avant la prise (cible lue CAE, cible courante LENA) : envoi à LENA seulement', async () => {
    mockPrisma.partageJob.findUnique.mockResolvedValue({ enregistrementId: ENR_ID, entrepriseIcrmId: LENA_ID, tentatives: 0 })

    await processJobReel(makeJob({ entrepriseIcrmId: ENT_ID }))

    expect(mockPrisma.entrepriseIcrm.findUnique).toHaveBeenCalledTimes(1)
    expect(mockPrisma.entrepriseIcrm.findUnique.mock.calls[0][0].where).toEqual({ id: LENA_ID })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_LENA)
    expect(majPartage().data).toMatchObject({ crmEntrepriseIcrmId: LENA_ID, crmDestination: expect.objectContaining({ nom: 'LENA (France)' }) })
  })

  it('redirigé vers les canaux juste avant la prise (cible courante NULL) : chemin des canaux, aucune entreprise lue', async () => {
    mockPrisma.partageJob.findUnique.mockResolvedValue({ enregistrementId: ENR_ID, entrepriseIcrmId: null, tentatives: 0 })
    await processJobReel(makeJob({ entrepriseIcrmId: ENT_ID }))
    expect(mockPrisma.entrepriseIcrm.findUnique).not.toHaveBeenCalled()
    expect(global.fetch.mock.calls[0][0]).toBe(URL_CANAL)
  })

  it('tentatives relues : un job relancé (0) entre la lecture (4) et la prise ne passe pas en échec définitif', async () => {
    mockPrisma.partageJob.findUnique.mockResolvedValue({ enregistrementId: ENR_ID, entrepriseIcrmId: ENT_ID, tentatives: 0 })
    global.fetch.mockResolvedValue(reponseHttp(503, { error: { code: 'internal_error' } }))
    await processJobReel(makeJob({ tentatives: MAX_TENTATIVES - 1 }))
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(appelsUpdateJob('echec_temporaire')[0][0].data.tentatives).toBe(1)
  })
})

// ─── Balayage des suspendus en début de cycle ─────────────────────────────────

describe('processPendingJobs — balayage : suspendus d’une entreprise redevenue envoyable → en file', () => {
  it('reprend les suspendus des entreprises utilisables à l’hôte autorisé, pas les autres', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([
      { id: ENT_ID, apiUrl: 'https://icrm.api.es.ila26.com' },
      { id: LENA_ID, apiUrl: 'https://icrm.autre-hebergeur.example' },
    ])
    mockPrisma.partageJob.findMany.mockImplementation(async ({ where }) => (
      where.statut === 'suspendu' && where.entrepriseIcrmId === ENT_ID
        ? [{ id: 'S1', enregistrementId: 'enr-S1' }, { id: 'S2', enregistrementId: 'enr-S2' }]
        : []
    ))

    await processPendingJobs()

    expect(mockPrisma.entrepriseIcrm.findMany).toHaveBeenCalledWith({
      where: { actif: true, deletedAt: null, verificationRequise: false, partageJobs: { some: { statut: 'suspendu' } } },
      select: { id: true, apiUrl: true },
    })
    // Seule l'entreprise à l'hôte autorisé est lue puis reprise
    const lecturesSuspendus = mockPrisma.partageJob.findMany.mock.calls.map((c) => c[0].where).filter((w) => w.statut === 'suspendu')
    expect(lecturesSuspendus).toEqual([{ entrepriseIcrmId: ENT_ID, statut: 'suspendu' }])
    expect(mockPrisma.partageJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['S1', 'S2'] }, statut: 'suspendu' },
      data: { statut: 'en_attente', erreur: null, prochainEssai: null },
    })
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['enr-S1', 'enr-S2'] }, statutPartage: 'suspendu' },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    })
    const log = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Envois suspendus repris/.test(l.message))
    expect(log).toMatchObject({ total: 2, reprises: [{ entrepriseIcrmId: ENT_ID, jobs: 2 }] })
  })

  it('aucune entreprise concernée : aucune écriture', async () => {
    mockPrisma.partageJob.findMany.mockResolvedValue([])
    await processPendingJobs()
    expect(mockPrisma.partageJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('une erreur du balayage n’empêche jamais le cycle', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockRejectedValue(new Error('base indisponible'))
    mockPrisma.partageJob.findMany.mockResolvedValue([makeJob()])
    await processPendingJobs()
    expect(mockLogger.warn.mock.calls.some((c) => /Balayage des envois suspendus impossible/.test(c[0].message))).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('en mémoire : suspendu d’une entreprise réactivée repris puis envoyé DANS le même cycle', async () => {
    const table = [
      { id: 'S1', enregistrementId: 'enr-S1', statut: 'suspendu', tentatives: 2, prochainEssai: null, entrepriseIcrmId: ENT_ID, createdAt: new Date('2026-09-01') },
    ]
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([{ id: ENT_ID, apiUrl: ENTREPRISE.apiUrl }])
    mockPrisma.partageJob.findMany.mockImplementation(async ({ where }) => {
      if (where.statut === 'suspendu') return table.filter((j) => j.statut === 'suspendu' && j.entrepriseIcrmId === where.entrepriseIcrmId)
      return table.filter((j) => j.statut === 'en_attente').map((j) => ({ ...j }))
    })
    mockPrisma.partageJob.updateMany.mockImplementation(async ({ where, data }) => {
      const ids = typeof where.id === 'string' ? [where.id] : where.id.in
      const statutOk = (s) => (typeof where.statut === 'string' ? where.statut === s : where.statut.in.includes(s))
      const lignes = table.filter((j) => ids.includes(j.id) && statutOk(j.statut))
      lignes.forEach((l) => Object.assign(l, data))
      return { count: lignes.length }
    })
    mockPrisma.partageJob.findUnique.mockImplementation(async ({ where }) => {
      const l = table.find((j) => j.id === where.id)
      return { enregistrementId: l.enregistrementId, entrepriseIcrmId: l.entrepriseIcrmId, tentatives: l.tentatives }
    })
    mockPrisma.partageJob.update.mockImplementation(async ({ where, data }) => Object.assign(table.find((j) => j.id === where.id), data))

    await processPendingJobs()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(URL_ENTREPRISE)
    expect(table[0].statut).toBe('succes')
  })
})

// ─── Hôte revérifié au moment de l'envoi ──────────────────────────────────────

describe('envoi — hôte de l’URL revérifié au moment de l’envoi (liste blanche)', () => {
  it('liste ICRM_API_HOSTS_AUTORISES changée depuis l’enregistrement : entreprise suspendue (motif URL), aucun appel', async () => {
    process.env.ICRM_API_HOSTS_AUTORISES = 'icrm.autre-client.example.org'
    await processJob(makeJob())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(appelsUpdateJob('suspendu')[0][0].data.erreur).toMatch(/hôte de l'URL API non autorisé \(ICRM_API_HOSTS_AUTORISES\) — envoi suspendu/)
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
  })

  it('« defaut » dans la variable : la liste par défaut reste valable', async () => {
    process.env.ICRM_API_HOSTS_AUTORISES = 'defaut,icrm.autre-client.example.org'
    await processJob(makeJob())
    expect(global.fetch.mock.calls[0][0]).toBe(URL_ENTREPRISE)
  })

  it.each([
    'https://169.254.169.254',
    'https://metadata.google.internal',
    'https://127.0.0.1.nip.io',
    'https://[::7f00:1]',
  ])('canal clé API vers %s : échec définitif sans appel réseau (le secret ne part pas)', async (apiUrl) => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      canaux: [{ ...CANAL_CLE_API, apiUrl }],
    }))
    await processJob(makeJob({ entrepriseIcrmId: null }))
    expect(global.fetch).not.toHaveBeenCalled()
    const echec = appelsUpdateJob('echec_definitif')[0][0].data
    expect(echec.erreur).toMatch(/URL API refusée au moment de l'envoi/)
    expect(tousLesLogs()).not.toContain(SECRET_CANAL)
  })
})
