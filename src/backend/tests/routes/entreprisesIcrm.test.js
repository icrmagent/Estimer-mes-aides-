/**
 * Entreprises (tenants) I-CRM — routes /api/entreprises-icrm.
 *
 * Couvre : SuperAdmin seul (lecture comprise : AdminBorne 403 partout), CRUD,
 * nouvelle entreprise « à tester » (verificationRequise), validation Zod (clé,
 * secret, URL https, liste blanche d'hôtes ; localhost refusé en production),
 * secret en écriture seule, nouvelle clé OU nouvel hôte sans secret refusés,
 * `verificationRequise` après un changement d'URL / de clé, suspension des envois
 * à la désactivation et au changement d'identifiants, reprise à la réactivation
 * seulement pour des identifiants inchangés et vérifiés, suppression (409 si
 * bornes ou envois non livrés, avec la répartition d'une redirection ; force :
 * envois gardés suspendus, ou redirigés vers la destination actuelle de LEUR
 * borne sur choix explicite), test de connexion (ping, hôte revérifié, écriture
 * conditionnelle contre la course, reprise des envois sur succès).
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  entrepriseIcrm: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  borne: { findFirst: jest.fn(), updateMany: jest.fn() },
  partageJob: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  enregistrement: { updateMany: jest.fn() },
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() }
jest.unstable_mockModule('../../src/lib/logger.js', () => ({ default: mockLogger }))

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  pusherService: { publish: jest.fn() },
  notifyPartageSucces: jest.fn(),
  notifyPartageEchec: jest.fn(),
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

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

process.env.JWT_SECRET = 'test_jwt_secret_entreprises_icrm'

const AB_ID = '11111111-1111-4111-8111-111111111111'
const ENT_ID = '66666666-6666-4666-8666-666666666666'
const BORNE_ID = '33333333-3333-4333-8333-333333333333'

const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign(AB_ID, 'ADMIN_BORNE')}` }

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const now = new Date('2026-09-27T10:00:00Z')

const originalFetch = global.fetch

function entrepriseEnBase(overrides = {}) {
  return {
    id: ENT_ID,
    nom: 'LENA (France)',
    nomIcrm: 'LENA',
    sousTypeIcrm: 'BORNE TACTILE',
    apiUrl: 'https://icrm.api.ila26.fr',
    apiKey: CLE,
    token: SECRET,
    actif: true,
    verificationRequise: false,
    derniereVerification: now,
    dernierStatut: 'ok',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }
}

const creation = (overrides = {}) => ({
  nom: 'LENA (France)',
  apiUrl: 'https://icrm.api.ila26.fr',
  apiKey: CLE,
  token: SECRET,
  ...overrides,
})

function reponseHttp(status, corps, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nom) => headers[nom.toLowerCase()] ?? null },
    text: async () => (corps === undefined ? '' : typeof corps === 'string' ? corps : JSON.stringify(corps)),
  }
}

const sansSecret = (body) => {
  const texte = JSON.stringify(body)
  expect(texte).not.toContain(SECRET)
  expect(texte).not.toMatch(/"token"/)
  expect(texte).not.toMatch(/"apiKey"/)
}

function tousLesLogs() {
  return JSON.stringify([
    ...mockLogger.info.mock.calls,
    ...mockLogger.warn.mock.calls,
    ...mockLogger.error.mock.calls,
  ])
}

const JOBS = [
  { id: 'j1', enregistrementId: 'e1', statut: 'en_attente' },
  { id: 'j2', enregistrementId: 'e2', statut: 'suspendu' },
]

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
  mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(null)
  mockPrisma.entrepriseIcrm.create.mockImplementation(async ({ data }) => ({
    ...entrepriseEnBase({ nomIcrm: null, sousTypeIcrm: null, derniereVerification: null, dernierStatut: null }),
    ...data,
  }))
  mockPrisma.entrepriseIcrm.update.mockImplementation(async ({ data }) => ({ ...entrepriseEnBase(), ...data }))
  mockPrisma.entrepriseIcrm.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.borne.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.partageJob.findMany.mockResolvedValue([])
  mockPrisma.partageJob.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.partageJob.count.mockResolvedValue(0)
  mockPrisma.enregistrement.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
})

afterAll(() => {
  global.fetch = originalFetch
})

const appelsMajJobs = () => mockPrisma.partageJob.updateMany.mock.calls.map((c) => c[0])

// ─── Rôles ────────────────────────────────────────────────────────────────────

describe('Entreprises I-CRM — SuperAdmin seulement', () => {
  it('sans JWT → 401', async () => {
    expect((await request(app).get('/api/entreprises-icrm')).status).toBe(401)
  })

  it.each([
    ['GET', '/api/entreprises-icrm'],
    ['GET', `/api/entreprises-icrm/${ENT_ID}`],
    ['POST', '/api/entreprises-icrm'],
    ['PUT', `/api/entreprises-icrm/${ENT_ID}`],
    ['DELETE', `/api/entreprises-icrm/${ENT_ID}`],
    ['POST', `/api/entreprises-icrm/${ENT_ID}/test`],
  ])('AdminBorne : %s %s → 403 sans toucher à la base ni appeler I-CRM', async (methode, url) => {
    const res = await request(app)[methode.toLowerCase()](url).set(authAB).send(creation())
    expect(res.status).toBe(403)
    expect(mockPrisma.entrepriseIcrm.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.entrepriseIcrm.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('le préfixe canonique /api/backoffice/entreprises-icrm est monté', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
    expect((await request(app).get('/api/backoffice/entreprises-icrm').set(authSA)).status).toBe(200)
  })
})

// ─── Lecture ──────────────────────────────────────────────────────────────────

describe('GET /api/entreprises-icrm', () => {
  it('toutes les entreprises non supprimées + nombre de bornes et d’envois suspendus, jamais le secret', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([
      { ...entrepriseEnBase(), _count: { bornes: 3, partageJobs: 12 } },
    ])

    const res = await request(app).get('/api/entreprises-icrm').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      id: ENT_ID, nom: 'LENA (France)', nomIcrm: 'LENA', apiKeyId: CLE, hasToken: true,
      actif: true, verificationRequise: false, dernierStatut: 'ok', nbBornes: 3, nbEnvoisSuspendus: 12,
    })
    expect(res.body.data[0]).not.toHaveProperty('deletedAt')
    sansSecret(res.body)
    const { where, include } = mockPrisma.entrepriseIcrm.findMany.mock.calls[0][0]
    expect(where).toEqual({ deletedAt: null })
    expect(include._count.select).toEqual({
      bornes: { where: { deletedAt: null } },
      partageJobs: { where: { statut: 'suspendu' } },
    })
  })

  it('?actif=true filtre les entreprises actives', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
    await request(app).get('/api/entreprises-icrm?actif=true').set(authSA)
    expect(mockPrisma.entrepriseIcrm.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, actif: true })
  })

  it('n’expose jamais un apiKey qui n’a pas le format d’un identifiant de clé', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([entrepriseEnBase({ apiKey: SECRET })])
    const res = await request(app).get('/api/entreprises-icrm').set(authSA)
    expect(res.body.data[0].apiKeyId).toBeNull()
    sansSecret(res.body)
  })

  it('détail : bornes affectées ; 404 si inconnue ou supprimée', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValueOnce(entrepriseEnBase({
      bornes: [{ id: BORNE_ID, idBorne: 'BORNE-A', adresse: '1 rue A', pays: 'FR' }],
    }))
    const sa = await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(sa.status).toBe(200)
    expect(sa.body.data.bornes).toHaveLength(1)
    sansSecret(sa.body)

    const inconnue = await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(inconnue.status).toBe(404)
  })
})

// ─── Création ─────────────────────────────────────────────────────────────────

describe('POST /api/entreprises-icrm', () => {
  it('crée l’entreprise À TESTER (verificationRequise, URL normalisée, active par défaut) et ne renvoie jamais le secret', async () => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA)
      .send(creation({ apiUrl: 'https://icrm.api.ila26.fr/api/', nomIcrm: 'forgé', dernierStatut: 'ok', verificationRequise: false }))

    expect(res.status).toBe(201)
    // verificationRequise forcée à true (la valeur envoyée par le client est ignorée) :
    // aucune capture ne lui est envoyée avant un test réussi
    expect(mockPrisma.entrepriseIcrm.create).toHaveBeenCalledWith({
      data: { nom: 'LENA (France)', apiUrl: 'https://icrm.api.ila26.fr', apiKey: CLE, token: SECRET, actif: true, verificationRequise: true },
    })
    expect(res.body.data).toMatchObject({ apiKeyId: CLE, hasToken: true, actif: true, verificationRequise: true })
    expect(res.body.avertissement).toMatch(/Testez l'entreprise : elle ne recevra aucun enregistrement avant un test de connexion réussi/)
    sansSecret(res.body)
    expect(tousLesLogs()).not.toContain(SECRET)
  })

  it('hors production : http://localhost accepté (mock I-CRM de développement)', async () => {
    expect((await request(app).post('/api/entreprises-icrm').set(authSA).send(creation({ apiUrl: 'http://localhost:8000' }))).status).toBe(201)
  })

  it.each([
    ['nom vide', { nom: '  ' }, 'nom', /nom est requis/],
    ['nom trop long', { nom: 'N'.repeat(121) }, 'nom', /120 caractères/],
    ['clé au mauvais format', { apiKey: 'cle-quelconque' }, 'apiKey', /emak_/],
    ['secret trop court', { token: 'abc' }, 'token', /48 caractères/],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, 'apiUrl', /https/],
    ['URL invalide', { apiUrl: 'pas une url' }, 'apiUrl', /URL API invalide/],
  ])('refuse %s (400, message FR, secret jamais renvoyé)', async (_cas, patch, champ, message) => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(creation(patch))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.fieldErrors[champ][0]).toMatch(message)
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
  })

  it.each([
    ['https://localhost.', /non autorisé/],
    ['https://[::7f00:1]', /non autorisé/],
    ['https://127.0.0.1.nip.io', /non autorisé/],
    ['https://metadata.google.internal', /non autorisé/],
    ['https://icrm.autre-hebergeur.example', /domaines acceptés ila26.fr, ila26.com, azurewebsites.net, code.run/],
    ['https://u:p@icrm.api.ila26.fr', /identifiants/],
  ])('hôte hors liste blanche %s : refusé (même hors production)', async (apiUrl, message) => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(creation({ apiUrl }))
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors.apiUrl[0]).toMatch(message)
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
  })

  it.each([
    ['http://localhost:8000', /localhost en production/],
    ['https://localhost', /localhost en production/],
    ['https://10.0.0.5', /non autorisé/],
    ['https://169.254.169.254', /non autorisé/],
    ['https://[fd00::1]', /non autorisé/],
  ])('production : %s refusé', async (apiUrl, message) => {
    const avant = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(creation({ apiUrl }))
      expect(res.status).toBe(400)
      expect(res.body.error.details.fieldErrors.apiUrl[0]).toMatch(message)
    } finally {
      process.env.NODE_ENV = avant
    }
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
  })

  it.each([['token'], ['apiKey'], ['apiUrl'], ['nom']])('refuse une création sans %s (400)', async (champ) => {
    const corps = creation()
    delete corps[champ]
    const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(corps)
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors[champ]).toBeDefined()
  })

  it('refuse un nom déjà porté par une autre entreprise (409, casse ignorée)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: 'autre' })
    const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(creation({ nom: 'lena (france)' }))
    expect(res.status).toBe(409)
    expect(mockPrisma.entrepriseIcrm.findFirst.mock.calls[0][0].where).toEqual({
      deletedAt: null, nom: { equals: 'lena (france)', mode: 'insensitive' },
    })
  })
})

// ─── Modification ─────────────────────────────────────────────────────────────

describe('PUT /api/entreprises-icrm/:id — identifiants', () => {
  beforeEach(() => {
    mockPrisma.entrepriseIcrm.findFirst.mockImplementation(async ({ where }) => (where.id === ENT_ID ? entrepriseEnBase() : null))
  })

  it('nom seul : ni secret requis, ni vérification effacée, ni suspension', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ nom: 'LENA France' })
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({ where: { id: ENT_ID }, data: { nom: 'LENA France' } })
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    sansSecret(res.body)
  })

  it('rotation du secret (même clé, même hôte) : statut du test effacé, pas de suspension', async () => {
    const nouveau = 'N'.repeat(48)
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ token: nouveau })
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID }, data: { token: nouveau, derniereVerification: null, dernierStatut: null },
    })
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain(nouveau)
  })

  it('nouvelle clé sans secret : refusée', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiKey: 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors.token[0]).toMatch(/Nouvelle clé API/)
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
  })

  it.each([
    ['autre domaine', 'https://icrm.api.es.ila26.com'],
    ['autre port', 'https://icrm.api.ila26.fr:8443'],
  ])('nouvel hôte d’URL (%s) sans secret : refusé', async (_cas, apiUrl) => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiUrl })
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors.token[0]).toMatch(/Nouvel hôte/)
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
  })

  it('nouvelle clé + secret : identité effacée, verificationRequise, envois en file SUSPENDUS', async () => {
    mockPrisma.partageJob.findMany.mockResolvedValue([JOBS[0]])
    const nouvelleCle = 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ'
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ apiKey: nouvelleCle, token: 'N'.repeat(48) })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({
      apiKey: nouvelleCle,
      token: 'N'.repeat(48),
      nomIcrm: null,
      sousTypeIcrm: null,
      derniereVerification: null,
      dernierStatut: null,
      verificationRequise: true,
    })
    expect(mockPrisma.partageJob.findMany).toHaveBeenCalledWith({
      where: { entrepriseIcrmId: ENT_ID, statut: { in: ['en_attente', 'echec_temporaire'] } },
      select: { id: true, enregistrementId: true },
    })
    expect(appelsMajJobs()[0]).toEqual({
      where: { id: { in: ['j1'] }, statut: { in: ['en_attente', 'echec_temporaire'] } },
      data: { statut: 'suspendu', erreur: expect.stringMatching(/identifiants non vérifiés.*testez l'entreprise/), prochainEssai: null },
    })
    expect(res.body.jobsSuspendus).toBe(1)
  })

  it('même hôte, autre chemin, sans secret : accepté, mais à retester (envois suspendus)', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiUrl: 'https://icrm.api.ila26.fr/v2' })
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toMatchObject({ apiUrl: 'https://icrm.api.ila26.fr/v2', verificationRequise: true })
  })

  it('même URL renvoyée avec /api final : rien d’effacé, rien de suspendu', async () => {
    await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiUrl: 'https://icrm.api.ila26.fr/api/' })
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({ apiUrl: 'https://icrm.api.ila26.fr' })
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['secret invalide', { token: 'court' }, 'token'],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, 'apiUrl'],
    ['clé invalide', { apiKey: 'emak_abc', token: SECRET }, 'apiKey'],
  ])('refuse %s (400)', async (_cas, patch, champ) => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send(patch)
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors[champ]).toBeDefined()
  })

  it('les champs calculés envoyés par le client sont ignorés', async () => {
    await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ nom: 'LENA', nomIcrm: 'forgé', dernierStatut: 'ok', verificationRequise: false, deletedAt: null })
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({ nom: 'LENA' })
  })

  it('renommage vers un nom déjà pris : 409 ; entreprise inconnue : 404', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockReset()
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValueOnce(entrepriseEnBase()).mockResolvedValueOnce({ id: 'autre' })
    expect((await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ nom: 'CAE España' })).status).toBe(409)
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(null)
    expect((await request(app).put('/api/entreprises-icrm/inconnue').set(authSA).send({ nom: 'x' })).status).toBe(404)
  })
})

describe('PUT /api/entreprises-icrm/:id — désactivation / réactivation', () => {
  it('désactivation : envois en file SUSPENDUS (jobs + enregistrements), rien n’est repris', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase())
    mockPrisma.partageJob.findMany.mockResolvedValue([JOBS[0], { id: 'j3', enregistrementId: 'e3' }])

    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ actif: false })

    expect(res.status).toBe(200)
    expect(res.body.jobsSuspendus).toBe(2)
    expect(res.body).not.toHaveProperty('jobsRepris')
    const motif = 'Entreprise I-CRM « LENA (France) » désactivée — envoi suspendu'
    expect(appelsMajJobs()).toEqual([{
      where: { id: { in: ['j1', 'j3'] }, statut: { in: ['en_attente', 'echec_temporaire'] } },
      data: { statut: 'suspendu', erreur: motif, prochainEssai: null },
    }])
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e3'] }, statutPartage: { not: 'partage' } },
      data: { statutPartage: 'suspendu', derniereErreur: motif },
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('réactivation, identifiants inchangés et dernier test réussi : envois suspendus repris (jobsRepris)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({ actif: false }))
    mockPrisma.partageJob.findMany.mockResolvedValue([JOBS[1]])

    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ actif: true })

    expect(res.status).toBe(200)
    expect(res.body.jobsRepris).toBe(1)
    expect(res.body).not.toHaveProperty('avertissement')
    expect(mockPrisma.partageJob.findMany).toHaveBeenCalledWith({
      where: { entrepriseIcrmId: ENT_ID, statut: 'suspendu' },
      select: { id: true, enregistrementId: true },
    })
    expect(appelsMajJobs()).toEqual([{
      where: { id: { in: ['j2'] }, statut: 'suspendu' },
      data: { statut: 'en_attente', erreur: null, prochainEssai: null },
    }])
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e2'] }, statutPartage: 'suspendu' },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    })
  })

  it.each([
    ['jamais testée', {}, { actif: true }],
    ['dernier test en échec', { dernierStatut: 'invalid_credentials' }, { actif: true }],
    ['secret changé dans la même requête', {}, { actif: true, token: 'N'.repeat(48) }],
  ])('réactivation — %s : envois NON repris, « testez l’entreprise »', async (_cas, etat, corps) => {
    const existante = entrepriseEnBase({ actif: false, dernierStatut: null, ...etat })
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(existante)
    mockPrisma.entrepriseIcrm.update.mockImplementation(async ({ data }) => ({ ...existante, ...data }))
    mockPrisma.partageJob.findMany.mockResolvedValue([JOBS[1]])

    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send(corps)

    expect(res.status).toBe(200)
    expect(res.body.jobsRepris).toBe(0)
    expect(res.body.avertissement).toMatch(/Testez l'entreprise pour reprendre les envois/)
    expect(appelsMajJobs().some((c) => c.data.statut === 'en_attente')).toBe(false)
  })

  it('réactivation + nouvelle URL / clé dans la même requête : reste suspendue (à retester), rien n’est repris', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({ actif: false }))
    mockPrisma.partageJob.findMany.mockResolvedValue([])

    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ actif: true, apiUrl: 'https://icrm.api.es.ila26.com', token: 'N'.repeat(48) })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ actif: true, verificationRequise: true })
    expect(res.body.jobsRepris).toBe(0)
    expect(res.body.avertissement).toMatch(/Testez l'entreprise/)
    // Suspension (en_attente / echec_temporaire), jamais de reprise des suspendus
    expect(mockPrisma.partageJob.findMany.mock.calls.every((c) => c[0].where.statut.in !== undefined)).toBe(true)
  })

  it('entreprise déjà active renvoyée active : rien n’est repris ni suspendu', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase())
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ actif: true, nom: 'LENA' })
    expect(res.body).not.toHaveProperty('jobsRepris')
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
  })
})

// ─── Suppression ──────────────────────────────────────────────────────────────

describe('DELETE /api/entreprises-icrm/:id', () => {
  const BORNES = [{ id: BORNE_ID, idBorne: 'BORNE-A', adresse: '1 rue A' }]
  const LENA_ID = '77777777-7777-4777-8777-777777777777'
  const LENA_ETAT = { id: LENA_ID, nom: 'LENA', actif: true, deletedAt: null, verificationRequise: false }
  const NON_LIVRES = ['en_attente', 'echec_temporaire', 'suspendu', 'echec_definitif']
  // Envois non livrés de CAE : j1 sur une borne encore affectée à CAE, j2 (suspendu)
  // et j3 (échec définitif) sur la borne B4 réaffectée à LENA (« garder » choisi)
  const ENVOIS_CAE = [
    { id: 'j1', enregistrementId: 'e1', statut: 'en_attente', entrepriseIcrmId: ENT_ID, enregistrement: { borne: { entrepriseIcrmId: ENT_ID } } },
    { id: 'j2', enregistrementId: 'e2', statut: 'suspendu', entrepriseIcrmId: ENT_ID, enregistrement: { borne: { entrepriseIcrmId: LENA_ID } } },
    { id: 'j3', enregistrementId: 'e3', statut: 'echec_definitif', entrepriseIcrmId: ENT_ID, enregistrement: { borne: { entrepriseIcrmId: LENA_ID } } },
  ]

  // partageJob.findMany : envois non livrés de l'entreprise (select avec la borne) ou
  // jobs à suspendre (suspendreEnvoisEntreprise)
  function envoisEnBase(envois = ENVOIS_CAE) {
    mockPrisma.partageJob.findMany.mockImplementation(async ({ select }) => (
      select?.enregistrement ? envois : envois.filter((j) => j.statut !== 'echec_definitif')
    ))
    mockPrisma.entrepriseIcrm.findMany.mockImplementation(async ({ where }) => (
      where.id.in.includes(LENA_ID) ? [LENA_ETAT] : []
    ))
  }

  it('409 : bornes, nombre d’envois NON LIVRÉS (échecs définitifs compris) et répartition d’une redirection, rien n’est modifié', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'CAE', bornes: BORNES })
    envoisEnBase()

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ENTREPRISE_ICRM_EN_USAGE')
    expect(mockPrisma.partageJob.findMany.mock.calls[0][0].where).toEqual({ entrepriseIcrmId: ENT_ID, statut: { in: NON_LIVRES } })
    expect(res.body.error.details).toEqual({
      bornes: BORNES,
      envoisEnAttente: 3,
      redirection: [
        { type: 'entreprise_icrm', entrepriseIcrmId: LENA_ID, nom: 'LENA', actif: true, supprimee: false, total: 2, suspendus: 0, echecs: 1 },
        { type: 'canal', entrepriseIcrmId: null, nom: null, total: 1, suspendus: 0, echecs: 0 },
      ],
    })
    // Le message annonce chaque destination, jamais une seule quand plusieurs s'appliquent
    expect(res.body.error.message).toMatch(/2 → « LENA », 1 → canaux/)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.partageJob.updateMany).not.toHaveBeenCalled()
  })

  it('409 aussi sans borne affectée si des envois la ciblent encore (arriéré conservé après réaffectation)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'CAE', bornes: [] })
    envoisEnBase([ENVOIS_CAE[2]]) // un seul échec définitif suffit
    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(res.status).toBe(409)
    expect(res.body.error.details.envoisEnAttente).toBe(1)
  })

  it('?force=true (défaut) : bornes désaffectées, entreprise supprimée, envois GARDÉS suspendus « supprimée »', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'CAE', bornes: BORNES })
    mockPrisma.borne.updateMany.mockResolvedValue({ count: 1 })
    envoisEnBase()

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}?force=true`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: ENT_ID, bornesDesaffectees: 1, envoisRediriges: 0, envoisSuspendus: 2 })
    expect(mockPrisma.borne.updateMany).toHaveBeenCalledWith({ where: { entrepriseIcrmId: ENT_ID }, data: { entrepriseIcrmId: null } })
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID }, data: { deletedAt: expect.any(Date), actif: false },
    })
    // Jobs en file et déjà suspendus (motif mis à jour), cible conservée ; échecs définitifs intacts
    expect(appelsMajJobs()).toEqual([{
      where: { id: { in: ['j1', 'j2'] }, statut: { in: ['en_attente', 'echec_temporaire', 'suspendu'] } },
      data: { statut: 'suspendu', erreur: 'Entreprise I-CRM « CAE » supprimée — envoi suspendu', prochainEssai: null },
    }])
    expect(appelsMajJobs().some((c) => 'entrepriseIcrmId' in c.data)).toBe(false)
  })

  it('?force=true&redirigerEnvoisEnAttente=true : CHAQUE envoi va vers la destination actuelle de SA borne (B4 réaffectée à LENA → LENA, jamais ses canaux)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'CAE', bornes: BORNES })
    envoisEnBase()

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}?force=true&redirigerEnvoisEnAttente=true`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      envoisRediriges: 3,
      envoisSuspendus: 0,
      destinations: [
        { type: 'entreprise_icrm', entrepriseIcrmId: LENA_ID, nom: 'LENA', total: 2, suspendus: 0, echecs: 1 },
        { type: 'canal', entrepriseIcrmId: null, total: 1 },
      ],
    })
    // Destination relue APRÈS la désaffectation : la borne de CAE → canaux (NULL)
    expect(appelsMajJobs()).toEqual(expect.arrayContaining([
      { where: { id: { in: ['j1'] }, statut: 'en_attente' }, data: { entrepriseIcrmId: null } },
      { where: { id: { in: ['j2'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: LENA_ID, statut: 'en_attente', erreur: null, prochainEssai: null } },
      // échec définitif : cible changée seulement (relance explicite ensuite)
      { where: { id: { in: ['j3'] }, statut: 'echec_definitif' }, data: { entrepriseIcrmId: LENA_ID } },
    ]))
    expect(appelsMajJobs()).toHaveLength(3)
    expect(appelsMajJobs().some((c) => c.data.entrepriseIcrmId === null && c.where.id.in.includes('j2'))).toBe(false)
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e2'] }, statutPartage: 'suspendu' },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    })
    const log = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Entreprise supprimée/.test(l.message))
    expect(log.redirection).toBe('2 → « LENA », 1 → canaux')
  })

  it('redirection vers une entreprise elle-même désactivée : les envois y restent SUSPENDUS (son motif), jamais vers les canaux', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'CAE', bornes: [] })
    envoisEnBase([ENVOIS_CAE[1]])
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([{ ...LENA_ETAT, actif: false }])

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}?force=true&redirigerEnvoisEnAttente=true`).set(authSA)

    expect(res.body.data.destinations).toEqual([expect.objectContaining({ entrepriseIcrmId: LENA_ID, total: 1, suspendus: 1 })])
    expect(appelsMajJobs()).toEqual([{
      where: { id: { in: ['j2'] }, statut: 'suspendu' },
      data: { entrepriseIcrmId: LENA_ID, statut: 'suspendu', erreur: 'Entreprise I-CRM « LENA » désactivée — envoi suspendu', prochainEssai: null },
    }])
  })

  it('ni borne ni envoi : suppression logique directe ; 404 si déjà supprimée', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValueOnce({ id: ENT_ID, nom: 'CAE', bornes: [] })
    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(res.status).toBe(200)
    expect(mockPrisma.partageJob.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.partageJob.updateMany).not.toHaveBeenCalled()
    expect((await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)).status).toBe(404)
  })
})

// ─── Test de connexion ────────────────────────────────────────────────────────

describe('POST /api/entreprises-icrm/:id/test', () => {
  const ENTREPRISE_TESTEE = entrepriseEnBase({
    apiUrl: 'https://icrm.api.es.ila26.com', nomIcrm: null, sousTypeIcrm: null, dernierStatut: null, verificationRequise: true,
  })
  const PING_OK = {
    ok: true, api_version: '1', client: 'EMA CAE prod', entreprise: 'CAE España', subtype: { id: 6, name: 'BORNE TACTILE' },
  }

  beforeEach(() => {
    mockPrisma.entrepriseIcrm.findFirst
      .mockResolvedValueOnce(ENTREPRISE_TESTEE)
      .mockResolvedValueOnce({ ...ENTREPRISE_TESTEE, nomIcrm: 'CAE España', verificationRequise: false, dernierStatut: 'ok', _count: { bornes: 1, partageJobs: 0 } })
  })

  it('succès : écriture CONDITIONNELLE (identifiants testés), verificationRequise levée, envois suspendus repris', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, PING_OK))
    mockPrisma.partageJob.findMany.mockResolvedValue([JOBS[1]])

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true, entreprise: 'CAE España', subtype: { id: 6, name: 'BORNE TACTILE' }, persiste: true, jobsRepris: 1,
      entrepriseIcrm: { id: ENT_ID, nomIcrm: 'CAE España', verificationRequise: false, dernierStatut: 'ok' },
    })
    expect(mockPrisma.entrepriseIcrm.updateMany).toHaveBeenCalledWith({
      where: { id: ENT_ID, deletedAt: null, apiUrl: 'https://icrm.api.es.ila26.com', apiKey: CLE, token: SECRET },
      data: {
        nomIcrm: 'CAE España',
        sousTypeIcrm: 'BORNE TACTILE',
        verificationRequise: false,
        derniereVerification: expect.any(Date),
        dernierStatut: 'ok',
      },
    })
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://icrm.api.es.ila26.com/api/external/estimer-mes-aides/v1/ping')
    expect(options.redirect).toBe('manual')
    expect(options.headers).toEqual({ Accept: 'application/json', 'X-Api-Key': CLE, 'X-Api-Secret': SECRET })
    sansSecret(res.body)
    expect(tousLesLogs()).not.toContain(SECRET)
  })

  it('course : identifiants modifiés pendant le ping → résultat NON enregistré, rien n’est repris', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, PING_OK))
    mockPrisma.entrepriseIcrm.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, persiste: false })
    expect(res.body.avertissement).toMatch(/modifiés pendant le test : résultat non enregistré/)
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    expect(mockLogger.warn.mock.calls.some((c) => /non enregistré/.test(c[0].message))).toBe(true)
  })

  it('succès sur une entreprise désactivée : vérifiée, mais envois NON repris', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockReset()
    mockPrisma.entrepriseIcrm.findFirst
      .mockResolvedValueOnce({ ...ENTREPRISE_TESTEE, actif: false })
      .mockResolvedValueOnce({ ...ENTREPRISE_TESTEE, actif: false, verificationRequise: false, dernierStatut: 'ok' })
    global.fetch.mockResolvedValue(reponseHttp(200, PING_OK))

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(res.body).toMatchObject({ success: true, persiste: true })
    expect(res.body).not.toHaveProperty('jobsRepris')
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
  })

  it('401 invalid_credentials : statut mémorisé, vérification NON levée, rien n’est repris', async () => {
    global.fetch.mockResolvedValue(reponseHttp(401, { error: { code: 'invalid_credentials', message: 'x', request_id: 'req-1' } }))
    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(res.body).toMatchObject({ success: false, httpStatus: 401, code: 'invalid_credentials', persiste: true })
    expect(res.body.error).toMatch(/Clé API ou secret refusé par I-CRM/)
    expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[0][0].data).toEqual({
      derniereVerification: expect.any(Date), dernierStatut: 'invalid_credentials',
    })
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
  })

  it('2xx non conforme : reponse_non_conforme ; 500 : http_500', async () => {
    global.fetch.mockResolvedValueOnce(reponseHttp(200, '<!doctype html><html></html>'))
    await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[0][0].data.dernierStatut).toBe('reponse_non_conforme')

    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(ENTREPRISE_TESTEE)
    global.fetch.mockResolvedValueOnce(reponseHttp(500, '<html>oops</html>'))
    await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[1][0].data.dernierStatut).toBe('http_500')
  })

  it('timeout → 504 + statut timeout ; réseau → 502 + injoignable', async () => {
    global.fetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const r504 = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(r504.status).toBe(504)
    expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[0][0].data.dernierStatut).toBe('timeout')

    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(ENTREPRISE_TESTEE)
    global.fetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND icrm.api.es.ila26.com'))
    const r502 = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(r502.status).toBe(502)
    expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[1][0].data.dernierStatut).toBe('injoignable')
  })

  it('hôte de l’URL plus autorisé (liste ICRM_API_HOSTS_AUTORISES changée) : aucun appel, statut url_non_autorisee, rien repris', async () => {
    process.env.ICRM_API_HOSTS_AUTORISES = 'icrm.autre-client.example.org'
    try {
      const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
      expect(res.body).toMatchObject({ success: false, reachable: false, code: 'url_non_autorisee', persiste: true })
      expect(res.body.error).toMatch(/non autorisé/)
      expect(global.fetch).not.toHaveBeenCalled()
      expect(mockPrisma.entrepriseIcrm.updateMany.mock.calls[0][0].data).toEqual({
        derniereVerification: expect.any(Date), dernierStatut: 'url_non_autorisee',
      })
      expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    } finally {
      delete process.env.ICRM_API_HOSTS_AUTORISES
    }
  })

  it('entreprise incomplète : 400 sans appel réseau ; inconnue : 404', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockReset()
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValueOnce(entrepriseEnBase({ token: '' })).mockResolvedValueOnce(null)
    expect((await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)).status).toBe(400)
    expect((await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)).status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
