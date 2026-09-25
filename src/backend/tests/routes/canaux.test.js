/**
 * Canaux I-CRM — routes /api/canaux : type d'authentification.
 *
 * Couvre : validation Zod par type (azure_ad par défaut, icrm_api_key avec clé
 * « emak_… » + secret de 48 caractères + URL https), changement de type,
 * projection publique (secret jamais renvoyé, identifiant de clé exposé),
 * test de connexion (ping I-CRM pour icrm_api_key, OPTIONS historique sinon).
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  canal: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  borne: { findFirst: jest.fn() },
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

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

process.env.JWT_SECRET = 'test_jwt_secret_canaux'

const AB_ID = '11111111-1111-4111-8111-111111111111'
const BORNE_ID = '33333333-3333-4333-8333-333333333333'
const CANAL_ID = '55555555-5555-4555-8555-555555555555'

const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign(AB_ID, 'ADMIN_BORNE')}` }

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const now = new Date('2026-09-25T10:00:00Z')

const originalFetch = global.fetch

function canalEnBase(overrides = {}) {
  return {
    id: CANAL_ID,
    label: 'icrm-lena-prod',
    type: 'icrm_api_key',
    apiUrl: 'https://icrm.api.ila26.fr',
    apiKey: CLE,
    token: SECRET,
    borneId: BORNE_ID,
    actif: true,
    createdAt: now,
    updatedAt: now,
    borne: { adminBorneId: AB_ID },
    ...overrides,
  }
}

const creationCleApi = (overrides = {}) => ({
  type: 'icrm_api_key',
  label: 'icrm-lena-prod',
  apiUrl: 'https://icrm.api.ila26.fr',
  apiKey: CLE,
  token: SECRET,
  borneId: BORNE_ID,
  ...overrides,
})

function reponseHttp(status, corps, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nom) => headers[nom.toLowerCase()] ?? null },
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
  mockPrisma.canal.create.mockImplementation(async ({ data }) => ({
    id: CANAL_ID, createdAt: now, updatedAt: now, ...data,
  }))
  mockPrisma.canal.update.mockImplementation(async ({ data }) => ({ ...canalEnBase(), borne: undefined, ...data }))
  mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, adminBorneId: AB_ID })
})

afterAll(() => {
  global.fetch = originalFetch
})

const sansSecret = (body) => {
  const texte = JSON.stringify(body)
  expect(texte).not.toContain(SECRET)
  expect(body.token).toBeUndefined()
  expect(body.apiKey).toBeUndefined()
}

// ─── Création ─────────────────────────────────────────────────────────────────

describe('POST /api/canaux — type icrm_api_key', () => {
  it('crée le canal et renvoie type + identifiant de clé, jamais le secret', async () => {
    const res = await request(app).post('/api/canaux').set(authSA).send(creationCleApi())

    expect(res.status).toBe(201)
    expect(mockPrisma.canal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'icrm_api_key', apiKey: CLE, token: SECRET, actif: true }),
    })
    expect(res.body).toMatchObject({
      type: 'icrm_api_key',
      apiKeyId: CLE,
      hasApiKey: true,
      hasToken: true,
      tokenExpiresAt: null,
    })
    sansSecret(res.body)
  })

  it('accepte une URL avec /api final (normalisée à l’envoi) et localhost en http', async () => {
    const r1 = await request(app).post('/api/canaux').set(authSA)
      .send(creationCleApi({ apiUrl: 'https://icrm.api.es.ila26.com/api/' }))
    const r2 = await request(app).post('/api/canaux').set(authSA)
      .send(creationCleApi({ apiUrl: 'http://localhost:8000' }))
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
  })

  it.each([
    ['clé au mauvais format', { apiKey: 'cle-quelconque' }, 'apiKey', /emak_/],
    ['clé trop courte', { apiKey: 'emak_abc' }, 'apiKey', /emak_/],
    ['secret trop court', { token: 'abc' }, 'token', /48 caractères/],
    ['secret non alphanumérique', { token: `${SECRET.slice(0, 47)}-` }, 'token', /48 caractères/],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, 'apiUrl', /https/],
  ])('refuse %s (400)', async (_cas, patch, champ, message) => {
    const res = await request(app).post('/api/canaux').set(authSA).send(creationCleApi(patch))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Données invalides')
    const issue = res.body.details.find((d) => d.path[0] === champ)
    expect(issue.message).toMatch(message)
    expect(mockPrisma.canal.create).not.toHaveBeenCalled()
  })

  it('refuse un secret ou une clé absents (400)', async () => {
    const { token: _t, ...sansToken } = creationCleApi()
    const { apiKey: _k, ...sansCle } = creationCleApi()
    expect((await request(app).post('/api/canaux').set(authSA).send(sansToken)).status).toBe(400)
    expect((await request(app).post('/api/canaux').set(authSA).send(sansCle)).status).toBe(400)
  })

  it('refuse un type inconnu (400)', async () => {
    const res = await request(app).post('/api/canaux').set(authSA).send(creationCleApi({ type: 'oauth' }))
    expect(res.status).toBe(400)
  })

  it('les erreurs de validation ne renvoient pas le secret saisi', async () => {
    const res = await request(app).post('/api/canaux').set(authSA)
      .send(creationCleApi({ apiKey: 'mauvaise-cle' }))
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
  })
})

describe('POST /api/canaux — type azure_ad (historique)', () => {
  it('sans type : azure_ad par défaut, tokens libres, refresh token jamais exposé', async () => {
    const res = await request(app).post('/api/canaux').set(authSA).send({
      label: 'icrm-dev',
      apiUrl: 'http://app-web-abondance-dev-webapi.azurewebsites.net',
      apiKey: 'refresh-token-azure',
      token: 'opaque-access-token',
      borneId: BORNE_ID,
    })

    expect(res.status).toBe(201)
    expect(mockPrisma.canal.create.mock.calls[0][0].data.type).toBe('azure_ad')
    expect(res.body).toMatchObject({ type: 'azure_ad', apiKeyId: null, hasApiKey: true, hasToken: true })
    expect(JSON.stringify(res.body)).not.toContain('refresh-token-azure')
    expect(JSON.stringify(res.body)).not.toContain('opaque-access-token')
  })

  it('ADMIN_BORNE : refus sur une borne qui ne lui appartient pas', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue(null)
    const res = await request(app).post('/api/canaux').set(authAB).send(creationCleApi())
    expect(res.status).toBe(403)
  })
})

// ─── Lecture ──────────────────────────────────────────────────────────────────

describe('GET /api/canaux — projection publique', () => {
  it('icrm_api_key : type + apiKeyId, sans secret ; ancien canal sans type : azure_ad', async () => {
    const jwtAzure = [
      'e30',
      Buffer.from(JSON.stringify({ exp: 1790000000 })).toString('base64url'),
      'sig',
    ].join('.')
    mockPrisma.canal.findMany.mockResolvedValue([
      canalEnBase({ borne: undefined }),
      { ...canalEnBase({ borne: undefined }), id: 'ancien', type: undefined, apiKey: 'rt-azure', token: jwtAzure },
    ])

    const res = await request(app).get(`/api/canaux?borneId=${BORNE_ID}`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ type: 'icrm_api_key', apiKeyId: CLE, tokenExpiresAt: null })
    expect(res.body[1]).toMatchObject({
      type: 'azure_ad',
      apiKeyId: null,
      tokenExpiresAt: new Date(1790000000 * 1000).toISOString(),
    })
    res.body.forEach(sansSecret)
    expect(JSON.stringify(res.body)).not.toContain('rt-azure')
  })

  it('n’expose jamais une valeur apiKey qui n’a pas le format d’un identifiant de clé', async () => {
    mockPrisma.canal.findMany.mockResolvedValue([canalEnBase({ borne: undefined, apiKey: SECRET })])
    const res = await request(app).get(`/api/canaux?borneId=${BORNE_ID}`).set(authSA)
    expect(res.body[0].apiKeyId).toBeNull()
    sansSecret(res.body[0])
  })
})

// ─── Modification ─────────────────────────────────────────────────────────────

describe('PUT /api/canaux/:id — cohérence avec le type', () => {
  it('rotation du secret seul sur un canal icrm_api_key', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase())
    const nouveau = 'N'.repeat(48)

    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ token: nouveau })

    expect(res.status).toBe(200)
    expect(mockPrisma.canal.update).toHaveBeenCalledWith({ where: { id: CANAL_ID }, data: { token: nouveau } })
    expect(JSON.stringify(res.body)).not.toContain(nouveau)
  })

  it('label seul : aucune contrainte de secret', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase())
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ label: 'nouveau', type: 'icrm_api_key' })
    expect(res.status).toBe(200)
  })

  it('refuse un secret invalide sur un canal icrm_api_key existant (type non renvoyé)', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase())
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ token: 'court' })
    expect(res.status).toBe(400)
    expect(res.body.details[0]).toMatchObject({ path: ['token'] })
    expect(mockPrisma.canal.update).not.toHaveBeenCalled()
  })

  it('refuse une URL http distante sur un canal icrm_api_key', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase())
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ apiUrl: 'http://icrm.api.ila26.fr' })
    expect(res.status).toBe(400)
  })

  it('passage azure_ad → icrm_api_key : clé ET secret obligatoires', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ type: 'azure_ad', apiKey: 'rt', token: 'at' }))

    const incomplet = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA)
      .send({ type: 'icrm_api_key', apiKey: CLE })
    expect(incomplet.status).toBe(400)
    expect(incomplet.body.details.map((d) => d.path[0])).toEqual(['token'])

    const complet = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA)
      .send({ type: 'icrm_api_key', apiKey: CLE, token: SECRET })
    expect(complet.status).toBe(200)
    expect(complet.body).toMatchObject({ type: 'icrm_api_key', apiKeyId: CLE })
    sansSecret(complet.body)
  })

  it('passage en clé API : l’URL http déjà en base est refusée si elle n’est pas remplacée', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ type: 'azure_ad', apiUrl: 'http://legacy.example', apiKey: 'rt', token: 'at' }))
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA)
      .send({ type: 'icrm_api_key', apiKey: CLE, token: SECRET })
    expect(res.status).toBe(400)
    expect(res.body.details[0].path).toEqual(['apiUrl'])
  })

  it('passage icrm_api_key → azure_ad : nouveaux tokens obligatoires, formats libres', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase())
    expect((await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ type: 'azure_ad' })).status).toBe(400)
    const ok = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA)
      .send({ type: 'azure_ad', apiKey: 'refresh', token: 'access' })
    expect(ok.status).toBe(200)
  })

  it('les canaux azure_ad existants se modifient comme avant (token libre)', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ type: 'azure_ad', apiKey: 'rt', token: 'at' }))
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authSA).send({ token: 'nouveau-bearer' })
    expect(res.status).toBe(200)
  })

  it('ADMIN_BORNE : 403 avant toute validation de cohérence sur un canal d’une autre borne', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ borne: { adminBorneId: 'autre' } }))
    const res = await request(app).put(`/api/canaux/${CANAL_ID}`).set(authAB).send({ token: 'court' })
    expect(res.status).toBe(403)
  })
})

// ─── Test de connexion ────────────────────────────────────────────────────────

describe('POST /api/canaux/:id/test — icrm_api_key (ping I-CRM)', () => {
  beforeEach(() => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ apiUrl: 'https://icrm.api.ila26.fr/api/' }))
  })

  it('2xx : succès, renvoie entreprise, sous-type et client', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, {
      ok: true, api_version: '1', client: 'EMA LENA prod', entreprise: 'LENA',
      subtype: { id: 23, name: 'BORNE TACTILE' },
    }))

    const res = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      type: 'icrm_api_key',
      reachable: true,
      httpStatus: 200,
      authValid: true,
      entreprise: 'LENA',
      subtype: { id: 23, name: 'BORNE TACTILE' },
      client: 'EMA LENA prod',
      apiVersion: '1',
    })
    expect(typeof res.body.latencyMs).toBe('number')

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://icrm.api.ila26.fr/api/external/estimer-mes-aides/v1/ping')
    expect(options.method).toBe('GET')
    expect(options.redirect).toBe('manual')
    expect(options.headers).toMatchObject({ 'X-Api-Key': CLE, 'X-Api-Secret': SECRET, Accept: 'application/json' })
    expect(options.headers.Authorization).toBeUndefined()
    sansSecret(res.body)
  })

  it('401 invalid_credentials : échec avec message clair', async () => {
    global.fetch.mockResolvedValue(reponseHttp(401, {
      error: { code: 'invalid_credentials', message: 'Invalid credentials', request_id: 'req-1' },
    }))

    const res = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: false, reachable: true, httpStatus: 401, authValid: false,
      code: 'invalid_credentials', requestId: 'req-1',
    })
    expect(res.body.error).toMatch(/Clé API ou secret refusé par I-CRM/)
  })

  it.each([
    ['client_disabled', /désactivé/],
    ['subscription_inactive', /abonnement .* inactif/],
  ])('403 %s : échec avec message clair', async (code, message) => {
    global.fetch.mockResolvedValue(reponseHttp(403, { error: { code, message: 'Forbidden' } }, { 'x-request-id': 'hdr-7' }))

    const res = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)

    expect(res.body).toMatchObject({ success: false, httpStatus: 403, authValid: false, code, requestId: 'hdr-7' })
    expect(res.body.error).toMatch(message)
  })

  it('404 : URL à vérifier ; 500 : échec générique ; 302 : redirection refusée', async () => {
    global.fetch.mockResolvedValueOnce(reponseHttp(404, undefined))
    const r404 = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)
    expect(r404.body).toMatchObject({ success: false, httpStatus: 404, authValid: null })
    expect(r404.body.error).toMatch(/vérifiez l'URL API/)

    global.fetch.mockResolvedValueOnce(reponseHttp(500, { error: { code: 'internal_error' } }))
    const r500 = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)
    expect(r500.body).toMatchObject({ success: false, httpStatus: 500 })
    expect(r500.body.error).toMatch(/HTTP 500 \(internal_error\)/)

    global.fetch.mockResolvedValueOnce(reponseHttp(302, undefined, { location: 'https://ailleurs.example' }))
    const r302 = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)
    expect(r302.body.success).toBe(false)
    expect(r302.body.error).toMatch(/Redirection refusée/)
  })

  it('timeout → 504, erreur réseau → 502', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    global.fetch.mockRejectedValueOnce(abort)
    expect((await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)).status).toBe(504)

    global.fetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))
    const r = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)
    expect(r.status).toBe(502)
    expect(r.body.success).toBe(false)
  })

  it('canal incomplet : 400 sans appel réseau', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({ token: '' }))
    const res = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/canaux/:id/test — azure_ad (comportement historique inchangé)', () => {
  it('OPTIONS customContacts avec Bearer ; 401 reste un « succès » de joignabilité', async () => {
    mockPrisma.canal.findFirst.mockResolvedValue(canalEnBase({
      type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token: 'at',
    }))
    global.fetch.mockResolvedValue({ ok: false, status: 401 })

    const res = await request(app).post(`/api/canaux/${CANAL_ID}/test`).set(authSA)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://legacy.example/api/customContacts?lang=fr',
      expect.objectContaining({ method: 'OPTIONS', headers: { Authorization: 'Bearer at' } }),
    )
    expect(res.body).toMatchObject({ success: true, httpStatus: 401, authValid: false })
  })
})
