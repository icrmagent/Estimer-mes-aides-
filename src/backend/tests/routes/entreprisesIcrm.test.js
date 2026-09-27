/**
 * Entreprises (tenants) I-CRM — routes /api/entreprises-icrm.
 *
 * Couvre : CRUD SuperAdmin, lecture AdminBorne cloisonnée à ses bornes, écritures
 * refusées à l'AdminBorne, validation Zod (clé « emak_… », secret de 48 caractères,
 * URL https hors localhost, nom), secret en écriture seule (jamais renvoyé, même
 * dans une erreur), nouvelle clé sans secret refusée, vérification effacée quand
 * les identifiants changent, suppression logique (409 si des bornes l'utilisent,
 * désaffectation avec ?force=true), test de connexion (ping I-CRM : succès,
 * 401, 2xx non conforme, timeout, réseau, entreprise incomplète) avec mémorisation
 * de l'entreprise / du sous-type / du statut.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  entrepriseIcrm: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  borne: { findFirst: jest.fn(), updateMany: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
  mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(null)
  mockPrisma.entrepriseIcrm.create.mockImplementation(async ({ data }) => ({
    ...entrepriseEnBase({ nomIcrm: null, sousTypeIcrm: null, derniereVerification: null, dernierStatut: null }),
    ...data,
  }))
  mockPrisma.entrepriseIcrm.update.mockImplementation(async ({ data }) => ({ ...entrepriseEnBase(), ...data }))
  mockPrisma.borne.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
})

afterAll(() => {
  global.fetch = originalFetch
})

// ─── Rôles ────────────────────────────────────────────────────────────────────

describe('Entreprises I-CRM — rôles', () => {
  it('sans JWT → 401', async () => {
    expect((await request(app).get('/api/entreprises-icrm')).status).toBe(401)
  })

  it.each([
    ['POST', '/api/entreprises-icrm'],
    ['PUT', `/api/entreprises-icrm/${ENT_ID}`],
    ['DELETE', `/api/entreprises-icrm/${ENT_ID}`],
    ['POST', `/api/entreprises-icrm/${ENT_ID}/test`],
  ])('AdminBorne : %s %s → 403 sans toucher à la base ni appeler I-CRM', async (methode, url) => {
    const res = await request(app)[methode.toLowerCase()](url).set(authAB).send(creation())
    expect(res.status).toBe(403)
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('le préfixe canonique /api/backoffice/entreprises-icrm est monté', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/backoffice/entreprises-icrm').set(authSA)
    expect(res.status).toBe(200)
  })
})

// ─── Lecture ──────────────────────────────────────────────────────────────────

describe('GET /api/entreprises-icrm', () => {
  it('SuperAdmin : toutes les entreprises non supprimées, nombre de bornes, jamais le secret', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([
      { ...entrepriseEnBase(), _count: { bornes: 3 } },
    ])

    const res = await request(app).get('/api/entreprises-icrm').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      id: ENT_ID,
      nom: 'LENA (France)',
      nomIcrm: 'LENA',
      sousTypeIcrm: 'BORNE TACTILE',
      apiUrl: 'https://icrm.api.ila26.fr',
      apiKeyId: CLE,
      hasToken: true,
      actif: true,
      dernierStatut: 'ok',
      nbBornes: 3,
    })
    expect(res.body.data[0]).not.toHaveProperty('deletedAt')
    sansSecret(res.body)
    const { where, include } = mockPrisma.entrepriseIcrm.findMany.mock.calls[0][0]
    expect(where).toEqual({ deletedAt: null })
    expect(include._count.select.bornes).toEqual({ where: { deletedAt: null } })
  })

  it('?actif=true filtre les entreprises actives', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
    await request(app).get('/api/entreprises-icrm?actif=true').set(authSA)
    expect(mockPrisma.entrepriseIcrm.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, actif: true })
  })

  it('AdminBorne : seulement les entreprises de SES bornes, sans compteur global', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([entrepriseEnBase()])

    const res = await request(app).get('/api/entreprises-icrm').set(authAB)

    expect(res.status).toBe(200)
    const args = mockPrisma.entrepriseIcrm.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ deletedAt: null, bornes: { some: { deletedAt: null, adminBorneId: AB_ID } } })
    expect(args.include).toBeUndefined()
    sansSecret(res.body)
  })

  it('n’expose jamais un apiKey qui n’a pas le format d’un identifiant de clé', async () => {
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([entrepriseEnBase({ apiKey: SECRET })])
    const res = await request(app).get('/api/entreprises-icrm').set(authSA)
    expect(res.body.data[0].apiKeyId).toBeNull()
    sansSecret(res.body)
  })

  it('détail : bornes affectées sans adminBorneId ; AdminBorne limité à ses bornes (403 sinon)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({
      bornes: [
        { id: BORNE_ID, idBorne: 'BORNE-A', adresse: '1 rue A', pays: 'FR', adminBorneId: AB_ID },
        { id: 'autre', idBorne: 'BORNE-B', adresse: '2 rue B', pays: 'FR', adminBorneId: 'autre-ab' },
      ],
    }))

    const sa = await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(sa.status).toBe(200)
    expect(sa.body.data.bornes).toHaveLength(2)
    expect(sa.body.data.bornes[0]).not.toHaveProperty('adminBorneId')
    sansSecret(sa.body)

    const ab = await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authAB)
    expect(ab.status).toBe(200)
    expect(ab.body.data.bornes.map((b) => b.idBorne)).toEqual(['BORNE-A'])

    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({ bornes: [] }))
    expect((await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authAB)).status).toBe(403)
  })

  it('détail : 404 si inconnue ou supprimée', async () => {
    const res = await request(app).get(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(res.status).toBe(404)
    expect(mockPrisma.entrepriseIcrm.findFirst.mock.calls[0][0].where).toEqual({ id: ENT_ID, deletedAt: null })
  })
})

// ─── Création ─────────────────────────────────────────────────────────────────

describe('POST /api/entreprises-icrm', () => {
  it('crée l’entreprise (URL normalisée, active par défaut) et ne renvoie jamais le secret', async () => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA)
      .send(creation({ apiUrl: 'https://icrm.api.ila26.fr/api/', nomIcrm: 'forgé', dernierStatut: 'ok' }))

    expect(res.status).toBe(201)
    expect(mockPrisma.entrepriseIcrm.create).toHaveBeenCalledWith({
      data: {
        nom: 'LENA (France)',
        apiUrl: 'https://icrm.api.ila26.fr',
        apiKey: CLE,
        token: SECRET,
        actif: true,
      },
    })
    expect(res.body.data).toMatchObject({ apiKeyId: CLE, hasToken: true, actif: true })
    sansSecret(res.body)
    expect(tousLesLogs()).not.toContain(SECRET)
  })

  it('accepte http://localhost (mock I-CRM de développement)', async () => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA)
      .send(creation({ apiUrl: 'http://localhost:8000' }))
    expect(res.status).toBe(201)
  })

  it.each([
    ['nom vide', { nom: '  ' }, 'nom', /nom est requis/],
    ['nom trop long', { nom: 'N'.repeat(121) }, 'nom', /120 caractères/],
    ['clé au mauvais format', { apiKey: 'cle-quelconque' }, 'apiKey', /emak_/],
    ['secret trop court', { token: 'abc' }, 'token', /48 caractères/],
    ['secret non alphanumérique', { token: `${SECRET.slice(0, 47)}-` }, 'token', /48 caractères/],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, 'apiUrl', /https/],
    ['URL invalide', { apiUrl: 'pas une url' }, 'apiUrl', /URL API invalide/],
  ])('refuse %s (400, message FR, secret jamais renvoyé)', async (_cas, patch, champ, message) => {
    const res = await request(app).post('/api/entreprises-icrm').set(authSA).send(creation(patch))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.fieldErrors[champ][0]).toMatch(message)
    expect(res.body.error.message).toMatch(message)
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
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
    expect(res.body.error.code).toBe('DUPLICATE')
    expect(mockPrisma.entrepriseIcrm.findFirst.mock.calls[0][0].where).toEqual({
      deletedAt: null, nom: { equals: 'lena (france)', mode: 'insensitive' },
    })
    expect(mockPrisma.entrepriseIcrm.create).not.toHaveBeenCalled()
  })
})

// ─── Modification ─────────────────────────────────────────────────────────────

describe('PUT /api/entreprises-icrm/:id', () => {
  beforeEach(() => {
    mockPrisma.entrepriseIcrm.findFirst.mockImplementation(async ({ where }) => (
      where.id === ENT_ID ? entrepriseEnBase() : null
    ))
  })

  it('nom / actif seuls : secret non requis, vérification conservée', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ nom: 'LENA France', actif: false })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID }, data: { nom: 'LENA France', actif: false },
    })
    sansSecret(res.body)
  })

  it('rotation du secret : statut de vérification effacé, entreprise vérifiée conservée', async () => {
    const nouveau = 'N'.repeat(48)
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ token: nouveau })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID },
      data: { token: nouveau, derniereVerification: null, dernierStatut: null },
    })
    expect(JSON.stringify(res.body)).not.toContain(nouveau)
  })

  it('nouvelle clé sans secret : refusée (I-CRM émet toujours la clé avec un nouveau secret)', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ apiKey: 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/Nouvelle clé API/)
    expect(res.body.error.details.fieldErrors.token[0]).toMatch(/Nouvelle clé API/)
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
  })

  it('nouvelle clé + secret : acceptée, entreprise vérifiée effacée (peut-être un autre tenant)', async () => {
    const nouvelleCle = 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ'
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ apiKey: nouvelleCle, token: 'N'.repeat(48) })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID },
      data: {
        apiKey: nouvelleCle,
        token: 'N'.repeat(48),
        nomIcrm: null,
        sousTypeIcrm: null,
        derniereVerification: null,
        dernierStatut: null,
      },
    })
  })

  it('même clé renvoyée sans secret : acceptée, rien n’est effacé', async () => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiKey: CLE, nom: 'LENA' })
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({ apiKey: CLE, nom: 'LENA' })
  })

  it('nouvelle URL : normalisée, entreprise vérifiée effacée ; même URL avec /api final : rien d’effacé', async () => {
    await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ apiUrl: 'https://icrm.api.es.ila26.com/api' })
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({
      apiUrl: 'https://icrm.api.es.ila26.com',
      nomIcrm: null,
      sousTypeIcrm: null,
      derniereVerification: null,
      dernierStatut: null,
    })

    await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ apiUrl: 'https://icrm.api.ila26.fr/api/' })
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[1][0].data).toEqual({ apiUrl: 'https://icrm.api.ila26.fr' })
  })

  it.each([
    ['secret invalide', { token: 'court' }, 'token'],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, 'apiUrl'],
    ['clé invalide', { apiKey: 'emak_abc', token: SECRET }, 'apiKey'],
  ])('refuse %s (400)', async (_cas, patch, champ) => {
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send(patch)
    expect(res.status).toBe(400)
    expect(res.body.error.details.fieldErrors[champ]).toBeDefined()
    expect(mockPrisma.entrepriseIcrm.update).not.toHaveBeenCalled()
  })

  it('les champs calculés envoyés par le client sont ignorés', async () => {
    await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
      .send({ nom: 'LENA', nomIcrm: 'forgé', dernierStatut: 'ok', deletedAt: null })
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({ nom: 'LENA' })
  })

  it('renommage vers un nom déjà pris : 409', async () => {
    mockPrisma.entrepriseIcrm.findFirst
      .mockResolvedValueOnce(entrepriseEnBase())
      .mockResolvedValueOnce({ id: 'autre' })
    const res = await request(app).put(`/api/entreprises-icrm/${ENT_ID}`).set(authSA).send({ nom: 'CAE España' })
    expect(res.status).toBe(409)
    expect(mockPrisma.entrepriseIcrm.findFirst.mock.calls[1][0].where).toMatchObject({ id: { not: ENT_ID } })
  })

  it('404 si l’entreprise est inconnue ou supprimée', async () => {
    const res = await request(app).put('/api/entreprises-icrm/inconnue').set(authSA).send({ nom: 'x' })
    expect(res.status).toBe(404)
  })
})

// ─── Suppression ──────────────────────────────────────────────────────────────

describe('DELETE /api/entreprises-icrm/:id', () => {
  const BORNES = [{ id: BORNE_ID, idBorne: 'BORNE-A', adresse: '1 rue A' }]

  it('409 avec la liste des bornes qui l’utilisent, rien n’est modifié', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'LENA', bornes: BORNES })

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ENTREPRISE_ICRM_EN_USAGE')
    expect(res.body.error.details.bornes).toEqual(BORNES)
    expect(res.body.error.message).toMatch(/1 borne\./)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('?force=true : désaffecte les bornes puis supprime logiquement, dans une transaction', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'LENA', bornes: BORNES })
    mockPrisma.borne.updateMany.mockResolvedValue({ count: 1 })

    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}?force=true`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: ENT_ID, bornesDesaffectees: 1 })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.borne.updateMany).toHaveBeenCalledWith({
      where: { entrepriseIcrmId: ENT_ID }, data: { entrepriseIcrmId: null },
    })
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID }, data: { deletedAt: expect.any(Date), actif: false },
    })
  })

  it('sans borne affectée : suppression logique directe', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_ID, nom: 'LENA', bornes: [] })
    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalled()
  })

  it('404 si déjà supprimée', async () => {
    const res = await request(app).delete(`/api/entreprises-icrm/${ENT_ID}`).set(authSA)
    expect(res.status).toBe(404)
    expect(mockPrisma.entrepriseIcrm.findFirst.mock.calls[0][0].where).toEqual({ id: ENT_ID, deletedAt: null })
  })
})

// ─── Test de connexion ────────────────────────────────────────────────────────

describe('POST /api/entreprises-icrm/:id/test', () => {
  beforeEach(() => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({
      apiUrl: 'https://icrm.api.es.ila26.com', nomIcrm: null, sousTypeIcrm: null, dernierStatut: null,
    }))
  })

  it('2xx conforme : succès, mémorise entreprise / sous-type / date / statut ok', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, {
      ok: true, api_version: '1', client: 'EMA CAE prod', entreprise: 'CAE España',
      subtype: { id: 6, name: 'BORNE TACTILE' },
    }))

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      type: 'icrm_api_key',
      httpStatus: 200,
      authValid: true,
      entreprise: 'CAE España',
      subtype: { id: 6, name: 'BORNE TACTILE' },
      client: 'EMA CAE prod',
      apiVersion: '1',
      entrepriseIcrm: { id: ENT_ID, nomIcrm: 'CAE España', sousTypeIcrm: 'BORNE TACTILE', dernierStatut: 'ok' },
    })
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID },
      data: {
        nomIcrm: 'CAE España',
        sousTypeIcrm: 'BORNE TACTILE',
        derniereVerification: expect.any(Date),
        dernierStatut: 'ok',
      },
    })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://icrm.api.es.ila26.com/api/external/estimer-mes-aides/v1/ping')
    expect(options.method).toBe('GET')
    expect(options.redirect).toBe('manual')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.headers).toEqual({ Accept: 'application/json', 'X-Api-Key': CLE, 'X-Api-Secret': SECRET })
    sansSecret(res.body)
  })

  it('401 invalid_credentials : échec, message FR, statut mémorisé, entreprise vérifiée conservée', async () => {
    global.fetch.mockResolvedValue(reponseHttp(401, {
      error: { code: 'invalid_credentials', message: 'Invalid credentials', request_id: 'req-1' },
    }))

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: false, httpStatus: 401, authValid: false, code: 'invalid_credentials', requestId: 'req-1',
    })
    expect(res.body.error).toMatch(/Clé API ou secret refusé par I-CRM/)
    expect(mockPrisma.entrepriseIcrm.update).toHaveBeenCalledWith({
      where: { id: ENT_ID },
      data: { derniereVerification: expect.any(Date), dernierStatut: 'invalid_credentials' },
    })
  })

  it('500 sans code I-CRM : statut http_500', async () => {
    global.fetch.mockResolvedValue(reponseHttp(500, '<html>oops</html>'))
    await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data.dernierStatut).toBe('http_500')
  })

  it('2xx non conforme (page HTML d’un front) : jamais « Connecté », statut reponse_non_conforme', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, '<!doctype html><html></html>'))

    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)

    expect(res.body).toMatchObject({ success: false, code: 'reponse_non_conforme' })
    expect(res.body.error).toMatch(/Réponse inattendue \(HTTP 200\)/)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[0][0].data).toEqual({
      derniereVerification: expect.any(Date), dernierStatut: 'reponse_non_conforme',
    })
  })

  it('timeout → 504 + statut timeout ; erreur réseau → 502 + statut injoignable', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    global.fetch.mockRejectedValueOnce(abort)
    const r504 = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(r504.status).toBe(504)
    expect(r504.body).toMatchObject({ success: false, reachable: false, entrepriseIcrm: { dernierStatut: 'timeout' } })

    global.fetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND icrm.api.es.ila26.com'))
    const r502 = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(r502.status).toBe(502)
    expect(r502.body.error).toMatch(/ENOTFOUND/)
    expect(mockPrisma.entrepriseIcrm.update.mock.calls[1][0].data.dernierStatut).toBe('injoignable')
    expect(tousLesLogs()).not.toContain(SECRET)
  })

  it('entreprise incomplète : 400 sans appel réseau', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(entrepriseEnBase({ token: '' }))
    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('404 si inconnue', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(null)
    const res = await request(app).post(`/api/entreprises-icrm/${ENT_ID}/test`).set(authSA)
    expect(res.status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
