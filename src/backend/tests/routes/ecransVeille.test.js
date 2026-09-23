/**
 * Écran de veille des bornes — routes /api/ecrans-veille, extension de
 * GET /api/bornes/:id/config et affectation via PUT /api/bornes/:id.
 *
 * Couvre : validation Zod par type de diapositive, cloisonnement AdminBorne
 * (lecture seule), remplacement transactionnel de la séquence, invalidation
 * cache + notification Pusher des bornes touchées, signature d'envoi Supabase.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  ecranVeille: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  diapositiveVeille: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  borne: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  formulaire: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}

const mockPublishEvent = jest.fn().mockResolvedValue(undefined)
const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  deletePattern: jest.fn().mockResolvedValue(0),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  publishEvent: mockPublishEvent,
  pusherService: { publish: mockPublishEvent },
  notifyPartageSucces: jest.fn(),
  notifyPartageEchec: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/cacheService.js', () => ({ cacheService: mockCache }))

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
const { Prisma } = await import('@prisma/client')
const { __resetStorageForTests } = await import('../../src/services/storageService.js')

process.env.JWT_SECRET = 'test_jwt_secret_ecrans_veille'

const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign('11111111-1111-4111-8111-111111111111', 'ADMIN_BORNE')}` }

const ECRAN_ID = '22222222-2222-4222-8222-222222222222'
const BORNE_A = '33333333-3333-4333-8333-333333333333'
const BORNE_B = '44444444-4444-4444-8444-444444444444'
const AB_ID = '11111111-1111-4111-8111-111111111111'

const now = new Date('2026-09-23T10:00:00Z')

const diapoTexte = {
  type: 'texte',
  duree: 6,
  titre: { fr: 'Estimez vos aides', es: 'Calcule sus ayudas' },
  sousTitre: { fr: 'Rénovation énergétique' },
  contenu: { fond: { type: 'degrade', couleur: '#5B2D8E', couleur2: '#1A56A0', angle: 135 } },
}

const diapoGalerie = {
  type: 'galerie',
  duree: 99,
  contenu: {
    images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/c.jpg'],
    dureeParImage: 5,
  },
}

const diapoVideo = {
  type: 'video',
  duree: 30,
  contenu: { videoUrl: 'https://cdn.test/v.mp4' },
}

function ecranDetail(overrides = {}) {
  return {
    id: ECRAN_ID,
    nom: 'Veille agence',
    description: null,
    actif: true,
    delaiActivation: 60,
    transition: 'fondu',
    ordreAleatoire: false,
    afficherCta: true,
    texteCta: null,
    afficherLogo: true,
    afficherHorloge: false,
    heureDebut: null,
    heureFin: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    diapositives: [],
    bornes: [{ id: BORNE_A, idBorne: 'BORNE-A', adresse: '1 rue A', statut: 'actif', adminBorneId: AB_ID }],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCache.get.mockResolvedValue(null)
  mockPrisma.$transaction.mockImplementation(async (arg) => (
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)
  ))
  mockPrisma.borne.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.diapositiveVeille.deleteMany.mockResolvedValue({ count: 0 })
  mockPrisma.diapositiveVeille.createMany.mockResolvedValue({ count: 0 })
})

// ─── Lecture ──────────────────────────────────────────────────────────────────

describe('GET /api/ecrans-veille', () => {
  it('SuperAdmin : liste résumée, durée totale sur les seules diapos actives', async () => {
    mockPrisma.ecranVeille.findMany.mockResolvedValue([
      ecranDetail({
        diapositives: [
          { duree: 15, actif: false, type: 'video' },
          { duree: 6, actif: true, type: 'texte' },
          { duree: 10, actif: true, type: 'image' },
        ],
      }),
    ])

    const res = await request(app).get('/api/ecrans-veille').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({ nbDiapositives: 3, nbDiapositivesActives: 2, dureeTotale: 16 })
    expect(res.body.data[0].diapositives).toBeUndefined()
    expect(res.body.data[0].apercu).toEqual({ duree: 6, actif: true, type: 'texte' })
    expect(res.body.data[0].bornes[0].adminBorneId).toBeUndefined()
    expect(mockPrisma.ecranVeille.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null })
  })

  it('AdminBorne : ne voit que les écrans affectés à ses bornes', async () => {
    mockPrisma.ecranVeille.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/ecrans-veille').set(authAB)

    expect(res.status).toBe(200)
    const { where, include } = mockPrisma.ecranVeille.findMany.mock.calls[0][0]
    expect(where.bornes).toEqual({ some: { deletedAt: null, adminBorneId: AB_ID } })
    expect(include.bornes.where).toEqual({ deletedAt: null, adminBorneId: AB_ID })
  })
})

describe('GET /api/ecrans-veille/:id', () => {
  it('404 si supprimé ou inexistant', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(null)
    const res = await request(app).get(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA)
    expect(res.status).toBe(404)
  })

  it('AdminBorne : 403 si aucune de ses bornes ne diffuse cet écran', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(ecranDetail({
      bornes: [{ id: BORNE_B, idBorne: 'BORNE-B', adresse: 'x', statut: 'actif', adminBorneId: 'autre' }],
    }))
    const res = await request(app).get(`/api/ecrans-veille/${ECRAN_ID}`).set(authAB)
    expect(res.status).toBe(403)
  })

  it('AdminBorne : 200 limité à ses propres bornes', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(ecranDetail({
      bornes: [
        { id: BORNE_A, idBorne: 'BORNE-A', adresse: 'a', statut: 'actif', adminBorneId: AB_ID },
        { id: BORNE_B, idBorne: 'BORNE-B', adresse: 'b', statut: 'actif', adminBorneId: 'autre' },
      ],
    }))
    const res = await request(app).get(`/api/ecrans-veille/${ECRAN_ID}`).set(authAB)
    expect(res.status).toBe(200)
    expect(res.body.data.bornes).toEqual([{ id: BORNE_A, idBorne: 'BORNE-A', adresse: 'a', statut: 'actif' }])
  })
})

// ─── Création ─────────────────────────────────────────────────────────────────

describe('POST /api/ecrans-veille', () => {
  it('AdminBorne : 403 (lecture seule)', async () => {
    const res = await request(app).post('/api/ecrans-veille').set(authAB).send({ nom: 'X' })
    expect(res.status).toBe(403)
    expect(mockPrisma.ecranVeille.create).not.toHaveBeenCalled()
  })

  it.each([
    ['URL non HTTPS', { diapositives: [{ type: 'image', contenu: { imageUrl: 'http://cdn.test/a.jpg' } }] }],
    ['texte sans titre FR', { diapositives: [{ type: 'texte', contenu: { fond: {} } }] }],
    ['galerie à une image', { diapositives: [{ type: 'galerie', contenu: { images: ['https://cdn.test/a.jpg'] } }] }],
    ['type inconnu', { diapositives: [{ type: 'pdf', contenu: {} }] }],
    ['plage horaire incomplète', { heureDebut: '08:00' }],
    ['heure invalide', { heureDebut: '25:00', heureFin: '08:00' }],
    ['délai trop court', { delaiActivation: 5 }],
    ['champ inconnu', { couleurPrimaire: '#000000' }],
    ['dates de diffusion inversées', { diapositives: [{ ...diapoVideo, dateDebut: '2026-10-01T00:00:00Z', dateFin: '2026-09-01T00:00:00Z' }] }],
  ])('400 — %s', async (_label, patch) => {
    const res = await request(app).post('/api/ecrans-veille').set(authSA).send({ nom: 'Test', ...patch })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(mockPrisma.ecranVeille.create).not.toHaveBeenCalled()
  })

  it('400 si une borne affectée est inconnue', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([{ id: BORNE_A }])
    const res = await request(app).post('/api/ecrans-veille').set(authSA)
      .send({ nom: 'Test', borneIds: [BORNE_A, BORNE_B] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: 'BORNE_NOT_FOUND', details: { borneIds: [BORNE_B] } })
  })

  it('201 — crée la séquence ordonnée, affecte les bornes et les prévient', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([{ id: BORNE_A }])
    mockPrisma.ecranVeille.create.mockResolvedValue({ id: ECRAN_ID })
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(ecranDetail())

    const res = await request(app).post('/api/ecrans-veille').set(authSA).send({
      nom: 'Veille agence',
      heureDebut: '20:00',
      heureFin: '08:00',
      diapositives: [diapoTexte, diapoGalerie, diapoVideo],
      borneIds: [BORNE_A],
    })

    expect(res.status).toBe(201)
    const { data } = mockPrisma.ecranVeille.create.mock.calls[0][0]
    expect(data).toMatchObject({ nom: 'Veille agence', delaiActivation: 60, transition: 'fondu', heureDebut: '20:00' })
    const created = data.diapositives.create
    expect(created.map((d) => [d.ordre, d.type])).toEqual([[0, 'texte'], [1, 'galerie'], [2, 'video']])
    expect(created[1].duree).toBe(15) // 3 images × 5 s, la saisie « 99 » est ignorée
    expect(created[1].contenu.ajustement).toBe('couvrir')
    expect(created[2].contenu.lireJusquaFin).toBe(true)
    expect(created[0].style).toBeUndefined()

    expect(mockPrisma.borne.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [BORNE_A] } },
      data: { ecranVeilleId: ECRAN_ID },
    })
    expect(mockCache.delete).toHaveBeenCalledWith(`borne-config:${BORNE_A}`)
    expect(mockPublishEvent).toHaveBeenCalledWith(`borne-${BORNE_A}`, 'ecran-veille.maj', { ecranVeilleId: ECRAN_ID })
    expect(res.body.data.bornes[0].adminBorneId).toBeUndefined()
  })
})

// ─── Mise à jour ──────────────────────────────────────────────────────────────

describe('PUT /api/ecrans-veille/:id', () => {
  it('404 sur un écran supprimé', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(null)
    const res = await request(app).put(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA).send({ nom: 'X' })
    expect(res.status).toBe(404)
  })

  it('remplace la séquence et la liste des bornes, prévient anciennes et nouvelles', async () => {
    mockPrisma.ecranVeille.findFirst
      .mockResolvedValueOnce({ id: ECRAN_ID, heureDebut: null, heureFin: null, bornes: [{ id: BORNE_A }] })
      .mockResolvedValueOnce(ecranDetail())
    mockPrisma.borne.findMany.mockResolvedValue([{ id: BORNE_B }])
    mockPrisma.ecranVeille.update.mockResolvedValue({})

    const res = await request(app).put(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA).send({
      diapositives: [diapoVideo, diapoTexte],
      borneIds: [BORNE_B],
    })

    expect(res.status).toBe(200)
    expect(mockPrisma.diapositiveVeille.deleteMany).toHaveBeenCalledWith({ where: { ecranVeilleId: ECRAN_ID } })
    const rows = mockPrisma.diapositiveVeille.createMany.mock.calls[0][0].data
    expect(rows.map((d) => [d.ordre, d.type, d.ecranVeilleId])).toEqual([[0, 'video', ECRAN_ID], [1, 'texte', ECRAN_ID]])
    expect(mockPrisma.borne.updateMany).toHaveBeenNthCalledWith(1, {
      where: { ecranVeilleId: ECRAN_ID, id: { notIn: [BORNE_B] } },
      data: { ecranVeilleId: null },
    })
    const notified = mockPublishEvent.mock.calls.map((c) => c[0]).sort()
    expect(notified).toEqual([`borne-${BORNE_A}`, `borne-${BORNE_B}`].sort())
  })

  it('ne touche ni séquence ni bornes quand elles sont absentes du patch', async () => {
    mockPrisma.ecranVeille.findFirst
      .mockResolvedValueOnce({ id: ECRAN_ID, heureDebut: null, heureFin: null, bornes: [{ id: BORNE_A }] })
      .mockResolvedValueOnce(ecranDetail())
    mockPrisma.ecranVeille.update.mockResolvedValue({})

    const res = await request(app).put(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA).send({ actif: false })

    expect(res.status).toBe(200)
    expect(mockPrisma.ecranVeille.update).toHaveBeenCalledWith({ where: { id: ECRAN_ID }, data: { actif: false } })
    expect(mockPrisma.diapositiveVeille.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.borne.updateMany).not.toHaveBeenCalled()
    expect(mockPublishEvent).toHaveBeenCalledWith(`borne-${BORNE_A}`, 'ecran-veille.maj', { ecranVeilleId: ECRAN_ID })
  })

  it('valide la plage horaire sur l\'état fusionné', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValueOnce({
      id: ECRAN_ID, heureDebut: '08:00', heureFin: '20:00', bornes: [],
    })
    const res = await request(app).put(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA).send({ heureFin: null })
    expect(res.status).toBe(400)
    expect(mockPrisma.ecranVeille.update).not.toHaveBeenCalled()
  })

  it('texteCta: null vide la colonne JSON via Prisma.DbNull', async () => {
    mockPrisma.ecranVeille.findFirst
      .mockResolvedValueOnce({ id: ECRAN_ID, heureDebut: null, heureFin: null, bornes: [] })
      .mockResolvedValueOnce(ecranDetail())
    mockPrisma.ecranVeille.update.mockResolvedValue({})

    const res = await request(app).put(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA).send({ texteCta: null })

    expect(res.status).toBe(200)
    expect(mockPrisma.ecranVeille.update.mock.calls[0][0].data.texteCta).toBe(Prisma.DbNull)
  })
})

// ─── Duplication & suppression ────────────────────────────────────────────────

describe('POST /api/ecrans-veille/:id/dupliquer', () => {
  it('copie réglages et séquence, sans affectation de borne', async () => {
    mockPrisma.ecranVeille.findFirst
      .mockResolvedValueOnce(ecranDetail({
        diapositives: [{
          id: 'd1', ecranVeilleId: ECRAN_ID, ordre: 0, type: 'video', duree: 30, actif: true,
          titre: null, sousTitre: null, contenu: { videoUrl: 'https://cdn.test/v.mp4' }, style: null,
          dateDebut: null, dateFin: null, createdAt: now, updatedAt: now,
        }],
      }))
      .mockResolvedValueOnce(ecranDetail({ id: 'copie', bornes: [] }))
    mockPrisma.ecranVeille.create.mockResolvedValue({ id: 'copie' })

    const res = await request(app).post(`/api/ecrans-veille/${ECRAN_ID}/dupliquer`).set(authSA)

    expect(res.status).toBe(201)
    const { data } = mockPrisma.ecranVeille.create.mock.calls[0][0]
    expect(data.nom).toBe('Veille agence (copie)')
    expect(data.texteCta).toBe(Prisma.DbNull)
    expect(data.diapositives.create[0]).toMatchObject({ type: 'video', ordre: 0 })
    expect(data.diapositives.create[0].id).toBeUndefined()
    expect(mockPrisma.borne.updateMany).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/ecrans-veille/:id', () => {
  it('soft delete, désaffecte les bornes et les prévient', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue({ id: ECRAN_ID, bornes: [{ id: BORNE_A }] })
    mockPrisma.ecranVeille.update.mockResolvedValue({})

    const res = await request(app).delete(`/api/ecrans-veille/${ECRAN_ID}`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data.bornesDesaffectees).toBe(1)
    expect(mockPrisma.borne.updateMany).toHaveBeenCalledWith({ where: { ecranVeilleId: ECRAN_ID }, data: { ecranVeilleId: null } })
    expect(mockPrisma.ecranVeille.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date)
    expect(mockPublishEvent).toHaveBeenCalledWith(`borne-${BORNE_A}`, 'ecran-veille.maj', { ecranVeilleId: null })
  })

  it('AdminBorne : 403', async () => {
    const res = await request(app).delete(`/api/ecrans-veille/${ECRAN_ID}`).set(authAB)
    expect(res.status).toBe(403)
  })
})

// ─── Signature d'envoi Supabase Storage ───────────────────────────────────────

describe('POST /api/ecrans-veille/medias/signature', () => {
  const ENV = { ...process.env }
  let fetchSpy

  beforeEach(() => {
    __resetStorageForTests()
    fetchSpy = jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    process.env = { ...ENV }
  })

  it('503 quand le stockage n\'est pas configuré', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await request(app).post('/api/ecrans-veille/medias/signature').set(authSA)
      .send({ typeMime: 'image/png', taille: 1000 })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED')
  })

  it('400 sur un type non autorisé, 413 au-delà de la limite du type', async () => {
    const bad = await request(app).post('/api/ecrans-veille/medias/signature').set(authSA)
      .send({ typeMime: 'application/pdf', taille: 1000 })
    expect(bad.status).toBe(400)

    const big = await request(app).post('/api/ecrans-veille/medias/signature').set(authSA)
      .send({ typeMime: 'image/jpeg', taille: 11 * 1024 * 1024 })
    expect(big.status).toBe(413)
  })

  it('crée le bucket si besoin puis renvoie URL signée et URL publique', async () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co/'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    fetchSpy
      .mockResolvedValueOnce(new Response('{"error":"Duplicate","message":"The resource already exists"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: '/object/upload/sign/ecrans-veille/2026-09/x.mp4?token=abc' }), { status: 200 }))

    const res = await request(app).post('/api/ecrans-veille/medias/signature').set(authSA)
      .send({ typeMime: 'video/mp4', taille: 40 * 1024 * 1024 })

    expect(res.status).toBe(200)
    expect(res.body.data.uploadUrl).toBe('https://proj.supabase.co/storage/v1/object/upload/sign/ecrans-veille/2026-09/x.mp4?token=abc')
    expect(res.body.data.publicUrl).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/ecrans-veille\/\d{4}-\d{2}\/[0-9a-f-]{36}\.mp4$/)
    expect(res.body.data.typeMedia).toBe('video')

    const [bucketUrl, bucketInit] = fetchSpy.mock.calls[0]
    expect(bucketUrl).toBe('https://proj.supabase.co/storage/v1/bucket')
    expect(JSON.parse(bucketInit.body)).toMatchObject({ id: 'ecrans-veille', public: true })
    expect(bucketInit.headers.Authorization).toBe('Bearer service-key')
  })

  it('502 quand Supabase refuse la signature', async () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))

    const res = await request(app).post('/api/ecrans-veille/medias/signature').set(authSA)
      .send({ typeMime: 'image/webp', taille: 1000 })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('STORAGE_ERROR')
  })

  it('AdminBorne : 403', async () => {
    const res = await request(app).post('/api/ecrans-veille/medias/signature').set(authAB)
      .send({ typeMime: 'image/png', taille: 1000 })
    expect(res.status).toBe(403)
  })
})

// ─── Config borne & affectation ───────────────────────────────────────────────

describe('GET /api/bornes/:id/config — écran de veille', () => {
  const borneBase = {
    id: BORNE_A, idBorne: 'BORNE-A', langueDefaut: 'fr', pays: 'FR', adresse: 'a',
    commercant: null, regie: null, installateur: null, statut: 'actif',
    adminBorneId: AB_ID, formulaireId: 'f1',
    formulaire: { id: 'f1', label: 'F', questions: [] },
  }

  it('renvoie l\'écran actif, sans champs internes', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue({
      ...borneBase,
      ecranVeille: {
        id: ECRAN_ID, nom: 'V', actif: true, deletedAt: null, updatedAt: now,
        delaiActivation: 45, transition: 'zoom', ordreAleatoire: false,
        afficherCta: true, texteCta: null, afficherLogo: true, afficherHorloge: true,
        heureDebut: null, heureFin: null,
        diapositives: [{ id: 'd1', type: 'texte', duree: 6, contenu: {} }],
      },
    })

    const res = await request(app).get(`/api/bornes/${BORNE_A}/config`).set(authAB)

    expect(res.status).toBe(200)
    expect(res.body.data.ecranVeille).toMatchObject({ id: ECRAN_ID, delaiActivation: 45, transition: 'zoom' })
    expect(res.body.data.ecranVeille.actif).toBeUndefined()
    expect(res.body.data.ecranVeille.deletedAt).toBeUndefined()
    expect(res.body.data.borne.ecranVeille).toBeUndefined()
    const select = mockPrisma.borne.findUnique.mock.calls[0][0].select.ecranVeille.select
    expect(select.diapositives.where).toEqual({ actif: true })
  })

  it.each([
    ['aucun écran affecté', null],
    ['écran désactivé', { actif: false, deletedAt: null, diapositives: [{ id: 'd1' }] }],
    ['écran sans diapositive active', { actif: true, deletedAt: null, diapositives: [] }],
  ])('ecranVeille = null — %s', async (_label, ecranVeille) => {
    mockPrisma.borne.findUnique.mockResolvedValue({ ...borneBase, ecranVeille })
    const res = await request(app).get(`/api/bornes/${BORNE_A}/config`).set(authAB)
    expect(res.status).toBe(200)
    expect(res.body.data.ecranVeille).toBeNull()
  })
})

describe('PUT /api/bornes/:id — ecranVeilleId', () => {
  it('AdminBorne : 403, affectation réservée au SuperAdmin', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_A, adminBorneId: AB_ID })
    const res = await request(app).put(`/api/bornes/${BORNE_A}`).set(authAB).send({ ecranVeilleId: ECRAN_ID })
    expect(res.status).toBe(403)
    expect(mockPrisma.borne.update).not.toHaveBeenCalled()
  })

  it('SuperAdmin : 400 si l\'écran est inconnu', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue(null)
    const res = await request(app).put(`/api/bornes/${BORNE_A}`).set(authSA).send({ ecranVeilleId: ECRAN_ID })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ECRAN_VEILLE_NOT_FOUND')
  })

  it('SuperAdmin : affecte, invalide le cache et prévient la borne', async () => {
    mockPrisma.ecranVeille.findFirst.mockResolvedValue({ id: ECRAN_ID })
    mockPrisma.borne.update.mockResolvedValue({ id: BORNE_A, ecranVeilleId: ECRAN_ID })

    const res = await request(app).put(`/api/bornes/${BORNE_A}`).set(authSA).send({ ecranVeilleId: ECRAN_ID })

    expect(res.status).toBe(200)
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_A }, data: { ecranVeilleId: ECRAN_ID } })
    expect(mockCache.delete).toHaveBeenCalledWith(`borne-config:${BORNE_A}`)
    expect(mockPublishEvent).toHaveBeenCalledWith(`borne-${BORNE_A}`, 'ecran-veille.maj', { ecranVeilleId: ECRAN_ID })
  })

  it('SuperAdmin : null retire l\'écran sans vérification préalable', async () => {
    mockPrisma.borne.update.mockResolvedValue({ id: BORNE_A, ecranVeilleId: null })
    const res = await request(app).put(`/api/bornes/${BORNE_A}`).set(authSA).send({ ecranVeilleId: null })
    expect(res.status).toBe(200)
    expect(mockPrisma.ecranVeille.findFirst).not.toHaveBeenCalled()
  })
})
