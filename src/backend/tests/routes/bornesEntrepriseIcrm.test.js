/**
 * Borne ↔ entreprise I-CRM destinataire — /api/bornes.
 *
 * Couvre : création et modification avec `entrepriseIcrmId` (uuid nullable,
 * entreprise existante, active, non supprimée), choix réservé au SuperAdmin
 * (AdminBorne : 403 si la valeur change, accepté si elle est renvoyée inchangée),
 * valeur inchangée non revalidée (entreprise désactivée depuis), `null` = retour
 * aux canaux, liste et détail avec l'entreprise (jamais l'URL, la clé ni le secret),
 * envois non livrés (échecs définitifs compris) gardés ou redirigés au changement
 * de destination, « Rediriger les envois » vers la destination actuelle (simulation).
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  borne: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  entrepriseIcrm: { findFirst: jest.fn(), findMany: jest.fn() },
  ecranVeille: { findFirst: jest.fn() },
  formulaire: { findUnique: jest.fn() },
  partageJob: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  enregistrement: { updateMany: jest.fn() },
  $transaction: jest.fn(),
}

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  deletePattern: jest.fn().mockResolvedValue(0),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))
jest.unstable_mockModule('../../src/services/cacheService.js', () => ({ cacheService: mockCache }))

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

process.env.JWT_SECRET = 'test_jwt_secret_bornes_entreprise_icrm'

const AB_ID = '11111111-1111-4111-8111-111111111111'
const BORNE_ID = '33333333-3333-4333-8333-333333333333'
const ENT_LENA = '66666666-6666-4666-8666-666666666666'
const ENT_CAE = '77777777-7777-4777-8777-777777777777'

const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign(AB_ID, 'ADMIN_BORNE')}` }

const SELECT_ENTREPRISE_ATTENDU = { select: { id: true, nom: true, nomIcrm: true, sousTypeIcrm: true, actif: true, verificationRequise: true } }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.borne.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }))
  mockPrisma.borne.create.mockImplementation(async ({ data }) => ({ id: BORNE_ID, ...data }))
  mockPrisma.entrepriseIcrm.findFirst.mockImplementation(async ({ where }) => (
    [ENT_LENA, ENT_CAE].includes(where.id)
      ? { id: where.id, nom: where.id === ENT_LENA ? 'LENA' : 'CAE', actif: true, deletedAt: null, verificationRequise: false }
      : null
  ))
  mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([])
  mockPrisma.partageJob.groupBy.mockResolvedValue([])
  mockPrisma.partageJob.count.mockResolvedValue(0)
  mockPrisma.partageJob.findMany.mockResolvedValue([])
  mockPrisma.partageJob.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.enregistrement.updateMany.mockResolvedValue({ count: 0 })
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
})

// ─── Création ─────────────────────────────────────────────────────────────────

describe('POST /api/bornes — entrepriseIcrmId', () => {
  it('SuperAdmin : crée la borne avec son entreprise I-CRM destinataire', async () => {
    const res = await request(app).post('/api/bornes').set(authSA)
      .send({ adresse: '1 rue A', entrepriseIcrmId: ENT_LENA })

    expect(res.status).toBe(201)
    expect(mockPrisma.entrepriseIcrm.findFirst).toHaveBeenCalledWith({
      where: { id: ENT_LENA, deletedAt: null }, select: { id: true, actif: true },
    })
    expect(mockPrisma.borne.create.mock.calls[0][0].data).toMatchObject({ entrepriseIcrmId: ENT_LENA })
  })

  it('refuse une entreprise inconnue ou supprimée (400 ENTREPRISE_ICRM_NOT_FOUND)', async () => {
    const res = await request(app).post('/api/bornes').set(authSA)
      .send({ adresse: '1 rue A', entrepriseIcrmId: '88888888-8888-4888-8888-888888888888' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ENTREPRISE_ICRM_NOT_FOUND')
    expect(mockPrisma.borne.create).not.toHaveBeenCalled()
  })

  it('refuse une entreprise inactive (400 ENTREPRISE_ICRM_INACTIVE)', async () => {
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_LENA, actif: false })
    const res = await request(app).post('/api/bornes').set(authSA)
      .send({ adresse: '1 rue A', entrepriseIcrmId: ENT_LENA })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ENTREPRISE_ICRM_INACTIVE')
  })

  it('refuse un identifiant qui n’est pas un uuid (400 VALIDATION_ERROR)', async () => {
    const res = await request(app).post('/api/bornes').set(authSA)
      .send({ adresse: '1 rue A', entrepriseIcrmId: 'lena' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('null ou absent : aucune vérification, borne sur ses canaux', async () => {
    expect((await request(app).post('/api/bornes').set(authSA).send({ adresse: '1 rue A', entrepriseIcrmId: null })).status).toBe(201)
    expect((await request(app).post('/api/bornes').set(authSA).send({ adresse: '1 rue A' })).status).toBe(201)
    expect(mockPrisma.entrepriseIcrm.findFirst).not.toHaveBeenCalled()
  })

  it('AdminBorne : la création reste réservée au SuperAdmin (403)', async () => {
    const res = await request(app).post('/api/bornes').set(authAB).send({ adresse: '1 rue A', entrepriseIcrmId: ENT_LENA })
    expect(res.status).toBe(403)
  })
})

// ─── Modification ─────────────────────────────────────────────────────────────

describe('PUT /api/bornes/:id — entrepriseIcrmId', () => {
  it('SuperAdmin : change l’entreprise destinataire (vérifiée active)', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_LENA })

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_CAE })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ENT_CAE, deletedAt: null },
    }))
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_ID }, data: { entrepriseIcrmId: ENT_CAE } })
    expect(mockCache.delete).toHaveBeenCalledWith(`borne-config:${BORNE_ID}`)
  })

  it('SuperAdmin : null retire l’entreprise (retour aux canaux) sans vérification', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_LENA })
    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: null })
    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_ID }, data: { entrepriseIcrmId: null } })
  })

  it('SuperAdmin : entreprise inactive ou inconnue refusée (400), borne inchangée', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: null })
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_CAE, actif: false })
    const inactive = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_CAE })
    expect(inactive.status).toBe(400)
    expect(inactive.body.error.code).toBe('ENTREPRISE_ICRM_INACTIVE')

    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue(null)
    const inconnue = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_CAE })
    expect(inconnue.body.error.code).toBe('ENTREPRISE_ICRM_NOT_FOUND')
    expect(mockPrisma.borne.update).not.toHaveBeenCalled()
  })

  it('SuperAdmin : valeur inchangée renvoyée par le formulaire, entreprise désactivée depuis : acceptée, non réécrite', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_LENA })
    mockPrisma.entrepriseIcrm.findFirst.mockResolvedValue({ id: ENT_LENA, actif: false })

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA)
      .send({ adresse: '2 rue B', entrepriseIcrmId: ENT_LENA })

    expect(res.status).toBe(200)
    expect(mockPrisma.entrepriseIcrm.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_ID }, data: { adresse: '2 rue B' } })
  })

  it('SuperAdmin : borne inconnue ou supprimée → 404', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue(null)
    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_CAE })
    expect(res.status).toBe(404)
    expect(mockPrisma.borne.findFirst).toHaveBeenCalledWith({
      where: { id: BORNE_ID, deletedAt: null }, select: { entrepriseIcrmId: true },
    })
  })

  it('AdminBorne : 403 s’il tente de changer l’entreprise, borne inchangée', async () => {
    // checkBorneOwnership charge la borne de l'AdminBorne (req.borne)
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, adminBorneId: AB_ID, entrepriseIcrmId: ENT_LENA })

    const autre = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authAB).send({ entrepriseIcrmId: ENT_CAE })
    expect(autre.status).toBe(403)
    expect(autre.body.error.message).toMatch(/Seul le SuperAdmin/)

    const retrait = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authAB).send({ entrepriseIcrmId: null })
    expect(retrait.status).toBe(403)
    expect(mockPrisma.borne.update).not.toHaveBeenCalled()
  })

  it('AdminBorne : la valeur actuelle renvoyée inchangée est acceptée (et ignorée)', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, adminBorneId: AB_ID, entrepriseIcrmId: ENT_LENA })

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authAB)
      .send({ adresse: '3 rue C', entrepriseIcrmId: ENT_LENA })

    expect(res.status).toBe(200)
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_ID }, data: { adresse: '3 rue C' } })
  })

  it('AdminBorne : borne sans entreprise, null renvoyé → accepté', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, adminBorneId: AB_ID, entrepriseIcrmId: null })
    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authAB).send({ entrepriseIcrmId: null, adresse: 'x' })
    expect(res.status).toBe(200)
  })

  it('AdminBorne : une borne qui n’est pas la sienne reste refusée (403) avant tout contrôle', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue(null)
    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authAB).send({ entrepriseIcrmId: ENT_CAE })
    expect(res.status).toBe(403)
    expect(mockPrisma.entrepriseIcrm.findFirst).not.toHaveBeenCalled()
  })
})

// ─── Lecture ──────────────────────────────────────────────────────────────────

describe('GET /api/bornes — entreprise I-CRM de la borne', () => {
  it('liste : inclut id, nom, nomIcrm, sous-type et actif de l’entreprise — jamais URL, clé ni secret', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([
      { id: BORNE_ID, idBorne: 'BORNE-A', entrepriseIcrm: { id: ENT_LENA, nom: 'LENA', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', actif: true } },
    ])
    mockPrisma.borne.count.mockResolvedValue(1)

    const res = await request(app).get('/api/bornes').set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data[0].entrepriseIcrm).toEqual({
      id: ENT_LENA, nom: 'LENA', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', actif: true,
    })
    expect(mockPrisma.borne.findMany.mock.calls[0][0].include.entrepriseIcrm).toEqual(SELECT_ENTREPRISE_ATTENDU)
  })

  it('détail : même projection de l’entreprise', async () => {
    mockPrisma.borne.findUniqueOrThrow.mockResolvedValue({ id: BORNE_ID, entrepriseIcrm: null })
    const res = await request(app).get(`/api/bornes/${BORNE_ID}`).set(authSA)
    expect(res.status).toBe(200)
    expect(mockPrisma.borne.findUniqueOrThrow.mock.calls[0][0].include.entrepriseIcrm).toEqual(SELECT_ENTREPRISE_ATTENDU)
  })
})

// ─── Changement de destination : envois pas encore livrés ─────────────────────

describe('PUT /api/bornes/:id — changement d’entreprise et envois non livrés', () => {
  const NON_LIVRES = ['en_attente', 'echec_temporaire', 'suspendu', 'echec_definitif']
  const JOBS_CAE = [
    { id: 'j1', enregistrementId: 'e1', statut: 'suspendu', entrepriseIcrmId: ENT_CAE },
    { id: 'j2', enregistrementId: 'e2', statut: 'en_attente', entrepriseIcrmId: ENT_CAE },
    { id: 'j3', enregistrementId: 'e3', statut: 'echec_definitif', entrepriseIcrmId: ENT_CAE },
  ]
  const LENA_ETAT = { id: ENT_LENA, nom: 'LENA', actif: true, deletedAt: null, verificationRequise: false }
  const appelsMajJobs = () => mockPrisma.partageJob.updateMany.mock.calls.map((c) => c[0])

  it('par défaut, les envois GARDENT leur cible (ancienne entreprise) : rien n’est redirigé, nombre renvoyé (échecs définitifs compris)', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_CAE })
    mockPrisma.partageJob.count.mockResolvedValue(5)

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_LENA })

    expect(res.status).toBe(200)
    expect(res.body.envoisEnAttente).toEqual({ conserves: 5 })
    expect(mockPrisma.partageJob.count).toHaveBeenCalledWith({
      where: { statut: { in: NON_LIVRES }, entrepriseIcrmId: ENT_CAE, enregistrement: { borneId: BORNE_ID } },
    })
    expect(mockPrisma.partageJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.borne.update).toHaveBeenCalledWith({ where: { id: BORNE_ID }, data: { entrepriseIcrmId: ENT_LENA } })
  })

  it('redirigerEnvoisEnAttente: true → cible = nouvelle entreprise ; suspendus remis en file, échecs définitifs reciblés seulement', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_CAE })
    mockPrisma.partageJob.findMany.mockResolvedValue(JOBS_CAE)
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([LENA_ETAT])

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA)
      .send({ entrepriseIcrmId: ENT_LENA, redirigerEnvoisEnAttente: true })

    expect(res.status).toBe(200)
    expect(res.body.envoisEnAttente).toEqual({
      rediriges: 3,
      destinations: [{ type: 'entreprise_icrm', entrepriseIcrmId: ENT_LENA, nom: 'LENA', actif: true, supprimee: false, total: 3, suspendus: 0, echecs: 1 }],
    })
    expect(mockPrisma.partageJob.findMany.mock.calls[0][0].where).toEqual({
      statut: { in: NON_LIVRES },
      enregistrement: { borneId: BORNE_ID },
      OR: [{ entrepriseIcrmId: ENT_CAE }, { entrepriseIcrm: { is: { deletedAt: { not: null } } } }],
    })
    expect(appelsMajJobs()).toEqual([
      { where: { id: { in: ['j1'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: ENT_LENA, statut: 'en_attente', erreur: null, prochainEssai: null } },
      { where: { id: { in: ['j2'] }, statut: 'en_attente' }, data: { entrepriseIcrmId: ENT_LENA } },
      { where: { id: { in: ['j3'] }, statut: 'echec_definitif' }, data: { entrepriseIcrmId: ENT_LENA } },
    ])
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1'] }, statutPartage: 'suspendu' },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    })
    // Le drapeau n'est jamais écrit sur la borne
    expect(mockPrisma.borne.update.mock.calls[0][0].data).toEqual({ entrepriseIcrmId: ENT_LENA })
  })

  it('redirection vers « Aucune » (null) : cible = canaux (NULL), suspendus remis en file', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_CAE })
    mockPrisma.partageJob.findMany.mockResolvedValue(JOBS_CAE.slice(0, 2))

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA)
      .send({ entrepriseIcrmId: null, redirigerEnvoisEnAttente: true })

    expect(res.body.envoisEnAttente).toMatchObject({ rediriges: 2, destinations: [{ type: 'canal', total: 2 }] })
    expect(appelsMajJobs()).toEqual([
      { where: { id: { in: ['j1'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: null, statut: 'en_attente', erreur: null, prochainEssai: null } },
      { where: { id: { in: ['j2'] }, statut: 'en_attente' }, data: { entrepriseIcrmId: null } },
    ])
  })

  it('redirection vers une entreprise à tester : envois redirigés mais SUSPENDUS avec son motif', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_CAE })
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([{ ...LENA_ETAT, verificationRequise: true }])
    mockPrisma.partageJob.findMany.mockResolvedValue(JOBS_CAE.slice(0, 2))

    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA).send({ entrepriseIcrmId: ENT_LENA, redirigerEnvoisEnAttente: true })

    expect(res.body.envoisEnAttente.destinations[0]).toMatchObject({ total: 2, suspendus: 2 })
    const motif = expect.stringMatching(/LENA.*identifiants non vérifiés.*testez l'entreprise/)
    expect(appelsMajJobs()).toEqual([
      { where: { id: { in: ['j1'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: ENT_LENA, statut: 'suspendu', erreur: motif, prochainEssai: null } },
      { where: { id: { in: ['j2'] }, statut: 'en_attente' }, data: { entrepriseIcrmId: ENT_LENA, statut: 'suspendu', erreur: motif, prochainEssai: null } },
    ])
  })

  it('drapeau sans changement de destination : ignoré', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ entrepriseIcrmId: ENT_CAE })
    const res = await request(app).put(`/api/bornes/${BORNE_ID}`).set(authSA)
      .send({ entrepriseIcrmId: ENT_CAE, redirigerEnvoisEnAttente: true, adresse: 'x' })
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('envoisEnAttente')
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.borne.update.mock.calls[0][0].data).toEqual({ adresse: 'x' })
  })
})

describe('GET /api/bornes/:id — envois non livrés par cible', () => {
  it('décompte par entreprise cible (nom, état, suspendus, échecs définitifs), par canaux, et hors destination actuelle', async () => {
    mockPrisma.borne.findUniqueOrThrow.mockResolvedValue({ id: BORNE_ID, entrepriseIcrmId: ENT_LENA, entrepriseIcrm: null })
    mockPrisma.partageJob.groupBy.mockResolvedValue([
      { entrepriseIcrmId: ENT_CAE, statut: 'suspendu', _count: { _all: 4 } },
      { entrepriseIcrmId: ENT_CAE, statut: 'en_attente', _count: { _all: 1 } },
      { entrepriseIcrmId: null, statut: 'echec_temporaire', _count: { _all: 2 } },
      { entrepriseIcrmId: null, statut: 'echec_definitif', _count: { _all: 3 } },
      { entrepriseIcrmId: ENT_LENA, statut: 'en_attente', _count: { _all: 6 } },
    ])
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([
      { id: ENT_CAE, nom: 'CAE España', actif: false, deletedAt: null },
      { id: ENT_LENA, nom: 'LENA', actif: true, deletedAt: null },
    ])

    const res = await request(app).get(`/api/bornes/${BORNE_ID}`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data.envoisEnAttente).toEqual({
      total: 16,
      // 16 - 6 envois qui visent déjà LENA (destination actuelle)
      horsDestination: 10,
      parEntreprise: [
        { entrepriseIcrmId: ENT_CAE, nom: 'CAE España', actif: false, supprimee: false, total: 5, suspendus: 4, echecs: 0 },
        { entrepriseIcrmId: null, nom: null, actif: null, supprimee: false, total: 5, suspendus: 0, echecs: 3 },
        { entrepriseIcrmId: ENT_LENA, nom: 'LENA', actif: true, supprimee: false, total: 6, suspendus: 0, echecs: 0 },
      ],
    })
    expect(mockPrisma.partageJob.groupBy).toHaveBeenCalledWith({
      by: ['entrepriseIcrmId', 'statut'],
      where: { statut: { in: ['en_attente', 'echec_temporaire', 'suspendu', 'echec_definitif'] }, enregistrement: { borneId: BORNE_ID, deletedAt: null } },
      _count: { _all: true },
    })
  })

  it('décompte impossible : la borne est quand même renvoyée (envoisEnAttente null)', async () => {
    mockPrisma.borne.findUniqueOrThrow.mockResolvedValue({ id: BORNE_ID })
    mockPrisma.partageJob.groupBy.mockRejectedValue(new Error('panne'))
    const res = await request(app).get(`/api/bornes/${BORNE_ID}`).set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.data.envoisEnAttente).toBeNull()
  })
})

describe('POST /api/bornes/:id/rediriger-envois — vers la destination actuelle', () => {
  const NON_LIVRES = ['en_attente', 'echec_temporaire', 'suspendu', 'echec_definitif']
  const appelsMajJobs = () => mockPrisma.partageJob.updateMany.mock.calls.map((c) => c[0])
  const rediriger = (query = '', corps = { vers: 'destination_actuelle' }, auth = authSA) =>
    request(app).post(`/api/bornes/${BORNE_ID}/rediriger-envois${query}`).set(auth).send(corps)
  // Après une suppression forcée : envois restés suspendus « CAE supprimée » sur une borne repassée aux canaux
  const ORPHELINS = [
    { id: 'j1', enregistrementId: 'e1', statut: 'suspendu', entrepriseIcrmId: ENT_CAE },
    { id: 'j2', enregistrementId: 'e2', statut: 'suspendu', entrepriseIcrmId: ENT_CAE },
  ]
  const CAE_SUPPRIMEE = { id: ENT_CAE, nom: 'CAE', actif: false, deletedAt: new Date('2026-09-27T10:00:00Z'), verificationRequise: false }

  it('?simulation=true : répartition d’origine et d’arrivée, RIEN n’est écrit', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, idBorne: 'B', entrepriseIcrmId: null })
    mockPrisma.partageJob.findMany.mockResolvedValue(ORPHELINS)
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([CAE_SUPPRIMEE])

    const res = await rediriger('?simulation=true')

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      borneId: BORNE_ID,
      simulation: true,
      destinationActuelle: { type: 'canal', entrepriseIcrmId: null, nom: null },
      total: 2,
      depuis: [{ type: 'entreprise_icrm', entrepriseIcrmId: ENT_CAE, nom: 'CAE', actif: false, supprimee: true, total: 2, suspendus: 2, echecs: 0 }],
      destinations: [{ type: 'canal', entrepriseIcrmId: null, nom: null, total: 2, suspendus: 0, echecs: 0 }],
    })
    expect(mockPrisma.partageJob.findMany.mock.calls[0][0].where).toEqual({
      statut: { in: NON_LIVRES },
      enregistrement: { borneId: BORNE_ID, deletedAt: null },
      entrepriseIcrmId: { not: null },
    })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.partageJob.updateMany).not.toHaveBeenCalled()
  })

  it('impasse après suppression forcée : les suspendus « supprimée » repartent vers les canaux de la borne', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, idBorne: 'B', entrepriseIcrmId: null })
    mockPrisma.partageJob.findMany.mockResolvedValue(ORPHELINS)
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([CAE_SUPPRIMEE])

    const res = await rediriger()

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ total: 2, destinations: [{ type: 'canal', total: 2 }] })
    expect(res.body.data).not.toHaveProperty('simulation')
    expect(appelsMajJobs()).toEqual([
      { where: { id: { in: ['j1', 'j2'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: null, statut: 'en_attente', erreur: null, prochainEssai: null } },
    ])
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] }, statutPartage: 'suspendu' },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    })
  })

  it('borne affectée à LENA : envois NULL (canaux) et d’une autre entreprise → LENA ; « différent de » inclut explicitement NULL', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, idBorne: 'B', entrepriseIcrmId: ENT_LENA })
    mockPrisma.partageJob.findMany.mockResolvedValue([
      { id: 'j5', enregistrementId: 'e5', statut: 'echec_definitif', entrepriseIcrmId: null },
      { id: 'j6', enregistrementId: 'e6', statut: 'suspendu', entrepriseIcrmId: ENT_CAE },
    ])
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([
      { id: ENT_LENA, nom: 'LENA', actif: true, deletedAt: null, verificationRequise: false },
      { id: ENT_CAE, nom: 'CAE', actif: false, deletedAt: null, verificationRequise: false },
    ])

    const res = await rediriger()

    expect(mockPrisma.partageJob.findMany.mock.calls[0][0].where).toEqual({
      statut: { in: NON_LIVRES },
      enregistrement: { borneId: BORNE_ID, deletedAt: null },
      OR: [{ entrepriseIcrmId: null }, { entrepriseIcrmId: { not: ENT_LENA } }],
    })
    expect(res.body.data.destinations).toEqual([expect.objectContaining({ entrepriseIcrmId: ENT_LENA, total: 2, echecs: 1, suspendus: 0 })])
    expect(res.body.data.depuis).toEqual([
      expect.objectContaining({ entrepriseIcrmId: ENT_CAE, total: 1, suspendus: 1 }),
      expect.objectContaining({ type: 'canal', total: 1, echecs: 1 }),
    ])
    expect(appelsMajJobs()).toEqual(expect.arrayContaining([
      { where: { id: { in: ['j5'] }, statut: 'echec_definitif' }, data: { entrepriseIcrmId: ENT_LENA } },
      { where: { id: { in: ['j6'] }, statut: 'suspendu' }, data: { entrepriseIcrmId: ENT_LENA, statut: 'en_attente', erreur: null, prochainEssai: null } },
    ]))
  })

  it('destination actuelle inutilisable (LENA désactivée) : reciblés mais SUSPENDUS avec son motif', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, idBorne: 'B', entrepriseIcrmId: ENT_LENA })
    mockPrisma.partageJob.findMany.mockResolvedValue([ORPHELINS[0]])
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([{ id: ENT_LENA, nom: 'LENA', actif: false, deletedAt: null, verificationRequise: false }, CAE_SUPPRIMEE])

    const res = await rediriger()

    expect(res.body.data.destinations[0]).toMatchObject({ entrepriseIcrmId: ENT_LENA, total: 1, suspendus: 1 })
    expect(appelsMajJobs()).toEqual([{
      where: { id: { in: ['j1'] }, statut: 'suspendu' },
      data: { entrepriseIcrmId: ENT_LENA, statut: 'suspendu', erreur: 'Entreprise I-CRM « LENA » désactivée — envoi suspendu', prochainEssai: null },
    }])
  })

  it('rien à rediriger : total 0, aucune écriture', async () => {
    mockPrisma.borne.findFirst.mockResolvedValue({ id: BORNE_ID, idBorne: 'B', entrepriseIcrmId: ENT_LENA })
    const res = await rediriger()
    expect(res.body.data).toMatchObject({ total: 0, depuis: [], destinations: [] })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    [{}, 'vers absent'],
    [{ vers: 'canaux' }, 'autre valeur'],
  ])('corps invalide (%s) : 400', async (corps) => {
    const res = await rediriger('', corps)
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/destination_actuelle/)
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
  })

  it('AdminBorne : 403 ; borne inconnue : 404', async () => {
    expect((await rediriger('', { vers: 'destination_actuelle' }, authAB)).status).toBe(403)
    mockPrisma.borne.findFirst.mockResolvedValue(null)
    expect((await rediriger()).status).toBe(404)
  })
})
