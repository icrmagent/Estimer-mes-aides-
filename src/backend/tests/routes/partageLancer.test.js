/**
 * Cible figée des jobs de partage — tous les chemins de création / relance.
 *
 * - POST /api/enregistrements (kiosque) : job créé avec la cible = entreprise
 *   actuelle de la borne (NULL = canaux) ; entreprise inutilisable → job ET
 *   enregistrement créés `suspendu` (hors file du worker) ;
 * - POST /api/partage/bornes/:borneId/lancer : vers la destination ACTUELLE de la
 *   borne — job créé et job sans cible (NULL, ère des canaux) → son entreprise ;
 *   job ciblant une AUTRE entreprise → la garde (sauf redirigerEnvoisEnAttente) ;
 *   répartition `destinations` (une seule `destination` si une seule s'applique) ;
 *   `?simulation=true` sans écriture ; cible inutilisable → `suspendu` +
 *   avertissement ; canaux requis seulement pour des envois vers les canaux ;
 * - POST /api/partage/jobs/:id/relancer : garde la cible ; suspendu sans reprise
 *   possible → 409 ENVOI_SUSPENDU (renvoie vers « Rediriger les envois ») ; échec
 *   vers cible inutilisable → suspendu ;
 * - GET /api/partage/jobs : cible du job + instantané crmDestination ; statut
 *   `suspendu` filtrable ; stats : catégorie à part (pas dans les échecs).
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  borne: { findUnique: jest.fn() },
  enregistrement: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  entrepriseIcrm: { findMany: jest.fn(), findUnique: jest.fn() },
  partageJob: {
    findMany: jest.fn(), update: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(),
    count: jest.fn(), groupBy: jest.fn(),
  },
  question: { findMany: jest.fn() },
  formulaire: { findUnique: jest.fn() },
  $transaction: jest.fn(),
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

process.env.JWT_SECRET = 'test_jwt_secret_partage_lancer'

const AB_ID = '11111111-1111-4111-8111-111111111111'
const BORNE_ID = '33333333-3333-4333-8333-333333333333'
const FORM_ID = '22222222-2222-4222-8222-222222222222'
const Q_NOM = '44444444-4444-4444-8444-444444444444'
const ENT_ID = '66666666-6666-4666-8666-666666666666'
const AUTRE_ID = '77777777-7777-4777-8777-777777777777'
const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign(AB_ID, 'ADMIN_BORNE')}` }

const ENTREPRISE = { id: ENT_ID, nom: 'LENA (France)', actif: true, deletedAt: null, verificationRequise: false }
const AUTRE = { id: AUTRE_ID, nom: 'CAE España', actif: false, deletedAt: null, verificationRequise: false }

function borne(overrides = {}) {
  return {
    id: BORNE_ID, idBorne: 'BORNE-A', canalTransmission: null, canaux: [],
    entrepriseIcrmId: null, entrepriseIcrm: null, ...overrides,
  }
}

const lancer = (auth = authSA) => request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer`).set(auth)
const creations = () => mockPrisma.partageJob.create.mock.calls.map((c) => c[0].data)
const relances = () => mockPrisma.partageJob.update.mock.calls.map((c) => c[0])

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.enregistrement.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
  mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: null }])
  mockPrisma.entrepriseIcrm.findMany.mockImplementation(async ({ where }) => (
    [ENTREPRISE, AUTRE].filter((e) => where.id.in.includes(e.id))
  ))
  mockPrisma.$transaction.mockResolvedValue([])
})

// ─── lancer : cibles ──────────────────────────────────────────────────────────

describe('POST /api/partage/bornes/:borneId/lancer — vers la destination ACTUELLE de la borne', () => {
  const DEST_LENA = { type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, nom: 'LENA (France)', actif: true, supprimee: false }

  it('borne avec entreprise active et sans canal : job CRÉÉ et job « canal » (cible NULL) ciblent l’entreprise', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))

    const res = await lancer()

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      borneId: BORNE_ID,
      canalTransmission: null,
      destinationActuelle: DEST_LENA,
      destination: { ...DEST_LENA, total: 2, suspendus: 0, echecs: 0 },
      destinations: [{ ...DEST_LENA, total: 2, suspendus: 0, echecs: 0 }],
      queued: 2,
      created: 1,
      relaunched: 1,
      suspendus: 0,
      jobsRecibles: 1,
      autresCibles: 0,
    })
    expect(creations()).toEqual([{ enregistrementId: 'e2', entrepriseIcrmId: ENT_ID }])
    // j1 ciblait les canaux (NULL : aucune entreprise n'avait été choisie) → l'entreprise de la borne
    expect(relances()).toEqual([{
      where: { id: 'j1' },
      data: { statut: 'en_attente', tentatives: 0, erreur: null, prochainEssai: null, entrepriseIcrmId: ENT_ID },
    }])
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('job EN COURS d’envoi : laissé de côté (ni remis en file ni reciblé), compté dans `enCours`', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', statut: 'en_cours', entrepriseIcrmId: null }])

    const res = await lancer()

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ queued: 1, created: 1, relaunched: 0, enCours: 1 })
    expect(relances()).toEqual([])
    expect(creations()).toEqual([{ enregistrementId: 'e2', entrepriseIcrmId: ENT_ID }])
  })

  it('scénario revue : échec définitif de l’ère des canaux (cible NULL) sur une borne affectée à LENA → relancé vers LENA, jamais les canaux', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({
      entrepriseIcrmId: ENT_ID, canalTransmission: 'canal-autre-tenant', canaux: [{ id: 'c1', label: 'canal-autre-tenant' }],
    }))
    mockPrisma.enregistrement.findMany.mockResolvedValue([{ id: 'e5' }])
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j5', enregistrementId: 'e5', statut: 'echec_definitif', entrepriseIcrmId: null }])

    const res = await lancer()

    expect(res.body.data.destinations).toEqual([expect.objectContaining({ type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, total: 1 })])
    expect(res.body.data.destination).toMatchObject({ type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID })
    expect(relances()[0].data).toMatchObject({ statut: 'en_attente', entrepriseIcrmId: ENT_ID })
    expect(relances().some((r) => r.data.entrepriseIcrmId === null)).toBe(false)
  })

  it('job ciblant une AUTRE entreprise : il GARDE sa cible ; plusieurs destinations → aucune destination unique annoncée', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: AUTRE_ID }])

    const res = await lancer()

    expect(res.body.data.destination).toBeNull()
    expect(res.body.data.destinations).toEqual([
      expect.objectContaining({ entrepriseIcrmId: AUTRE_ID, nom: 'CAE España', total: 1, suspendus: 1 }),
      expect.objectContaining({ entrepriseIcrmId: ENT_ID, nom: 'LENA (France)', total: 1, suspendus: 0 }),
    ])
    expect(res.body.data).toMatchObject({ suspendus: 1, queued: 2, jobsRecibles: 0, autresCibles: 1 })
    expect(res.body.data.avertissement).toMatch(/Plusieurs destinations : 1 → « CAE España », 1 → « LENA \(France\) »/)
    expect(res.body.data.avertissement).toMatch(/1 envoi\(s\) resteront suspendus — Entreprise I-CRM « CAE España » désactivée/)
    expect(relances()[0].data).toMatchObject({ statut: 'suspendu', entrepriseIcrmId: AUTRE_ID })
    expect(creations()).toEqual([{ enregistrementId: 'e2', entrepriseIcrmId: ENT_ID }])
  })

  it('redirigerEnvoisEnAttente: true dans le corps : TOUT vers la destination actuelle, suspendus compris', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: AUTRE_ID }])

    const res = await request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer`).set(authSA).send({ redirigerEnvoisEnAttente: true })

    expect(mockPrisma.enregistrement.findMany.mock.calls[0][0].where.statutPartage).toEqual({
      in: ['en_attente', 'echec_temporaire', 'echec_definitif', 'suspendu'],
    })
    expect(res.body.data.destinations).toEqual([expect.objectContaining({ entrepriseIcrmId: ENT_ID, total: 2 })])
    expect(res.body.data).toMatchObject({ jobsRecibles: 1, autresCibles: 0, suspendus: 0 })
    expect(relances()[0].data).toMatchObject({ statut: 'en_attente', entrepriseIcrmId: ENT_ID })
  })

  it('?simulation=true : même répartition, RIEN n’est écrit', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: AUTRE_ID }])

    const res = await request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer?simulation=true`).set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ simulation: true, queued: 2, created: 1, relaunched: 1, autresCibles: 1, destination: null })
    expect(res.body.data.destinations).toHaveLength(2)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.partageJob.update).not.toHaveBeenCalled()
    expect(mockPrisma.partageJob.create).not.toHaveBeenCalled()
    expect(mockPrisma.enregistrement.updateMany).not.toHaveBeenCalled()
  })

  it('paramètres invalides (simulation, drapeau) : 400', async () => {
    expect((await request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer?simulation=oui`).set(authSA)).status).toBe(400)
    expect((await request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer`).set(authSA).send({ redirigerEnvoisEnAttente: 'oui' })).status).toBe(400)
  })

  it('les enregistrements déjà SUSPENDUS ne sont pas relancés sans redirection explicite', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    await lancer()
    expect(mockPrisma.enregistrement.findMany.mock.calls[0][0].where.statutPartage).toEqual({
      in: ['en_attente', 'echec_temporaire', 'echec_definitif'],
    })
  })

  it('entreprise de la borne désactivée : jobs mis en file au statut `suspendu` + avertissement, jamais « canal »', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({
      entrepriseIcrmId: AUTRE_ID, canalTransmission: 'icrm-lena', canaux: [{ id: 'c1', label: 'icrm-lena' }],
    }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: AUTRE_ID }])

    const res = await lancer()

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      destination: { type: 'entreprise_icrm', entrepriseIcrmId: AUTRE_ID, total: 2, suspendus: 2 },
      queued: 2,
      suspendus: 2,
    })
    expect(res.body.data.avertissement).toMatch(/« CAE España » désactivée : les envois sont suspendus/)
    const motif = 'Entreprise I-CRM « CAE España » désactivée — envoi suspendu'
    expect(creations()).toEqual([{ enregistrementId: 'e2', entrepriseIcrmId: AUTRE_ID, statut: 'suspendu', erreur: motif }])
    expect(relances()[0].data).toEqual({ statut: 'suspendu', tentatives: 0, erreur: motif, prochainEssai: null, entrepriseIcrmId: AUTRE_ID })
    expect(mockPrisma.enregistrement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      data: { statutPartage: 'suspendu', derniereErreur: motif, tentatives: 0 },
    })
  })

  it('entreprise NOUVELLE (à tester) : envois mis en file au statut `suspendu`, repris au premier test réussi', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.entrepriseIcrm.findMany.mockResolvedValue([{ ...ENTREPRISE, verificationRequise: true }])
    const res = await lancer()
    expect(res.body.data).toMatchObject({ suspendus: 2 })
    expect(res.body.data.avertissement).toMatch(/à tester \(identifiants non vérifiés\)/)
  })

  it('aucun enregistrement à transmettre : 200, destination = destination actuelle de la borne', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrmId: ENT_ID }))
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    const res = await lancer()
    expect(res.body.data).toMatchObject({ queued: 0, suspendus: 0, destinations: [], destination: { type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID } })
    expect(mockPrisma.partageJob.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('POST /api/partage/bornes/:borneId/lancer — borne sans entreprise (canaux)', () => {
  it('ni entreprise ni canal : 409 NO_ACTIVE_CHANNEL', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne())
    const res = await lancer()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NO_ACTIVE_CHANNEL')
  })

  it('canalTransmission sans canal actif correspondant : 409 CHANNEL_LABEL_MISMATCH', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ canalTransmission: 'x', canaux: [{ id: 'c1', label: 'y' }] }))
    const res = await lancer()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CHANNEL_LABEL_MISMATCH')
  })

  it('canal actif : jobs ciblant les canaux (NULL), destination « canal »', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ canalTransmission: 'icrm-lena', canaux: [{ id: 'c1', label: 'icrm-lena' }] }))
    const res = await lancer()
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      destination: { type: 'canal', entrepriseIcrmId: null, label: 'icrm-lena', total: 2 },
      queued: 2,
      suspendus: 0,
    })
    expect(creations()).toEqual([{ enregistrementId: 'e2' }])
    expect(relances()[0].data.entrepriseIcrmId).toBeNull()
    expect(mockPrisma.entrepriseIcrm.findMany).not.toHaveBeenCalled()
  })

  it('borne repassée aux canaux avec un arriéré ciblant une entreprise : l’arriéré garde sa cible, le reste part aux canaux', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ canalTransmission: 'icrm-lena', canaux: [{ id: 'c1', label: 'icrm-lena' }] }))
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: ENT_ID }])
    const res = await lancer()
    expect(res.body.data.destination).toBeNull()
    expect(res.body.data.destinations).toEqual([
      expect.objectContaining({ type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, total: 1 }),
      expect.objectContaining({ type: 'canal', total: 1, label: 'icrm-lena' }),
    ])
    expect(relances()[0].data.entrepriseIcrmId).toBe(ENT_ID)
  })

  it('sans canal mais tout l’arriéré cible une entreprise : accepté (aucun envoi vers les canaux)', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne())
    mockPrisma.enregistrement.findMany.mockResolvedValue([{ id: 'e1' }])
    mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1', entrepriseIcrmId: ENT_ID }])
    const res = await lancer()
    expect(res.status).toBe(200)
    expect(res.body.data.destination).toMatchObject({ entrepriseIcrmId: ENT_ID, total: 1 })
  })

  it('borne inconnue : 404 ; AdminBorne : 403', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(null)
    expect((await lancer()).status).toBe(404)
    expect((await lancer(authAB)).status).toBe(403)
  })
})

// ─── relancer ─────────────────────────────────────────────────────────────────

describe('POST /api/partage/jobs/:id/relancer — la cible est conservée', () => {
  const relancer = () => request(app).post('/api/partage/jobs/j1/relancer').set(authSA)

  it('échec vers une entreprise active : remis en file, cible inchangée', async () => {
    mockPrisma.partageJob.findUniqueOrThrow.mockResolvedValue({
      id: 'j1', enregistrementId: 'e1', statut: 'echec_definitif', entrepriseIcrmId: ENT_ID, entrepriseIcrm: ENTREPRISE,
    })
    mockPrisma.partageJob.update.mockResolvedValue({ id: 'j1', statut: 'en_attente' })

    const res = await relancer()

    expect(res.status).toBe(200)
    expect(relances()[0]).toEqual({ where: { id: 'j1' }, data: { statut: 'en_attente', tentatives: 0, erreur: null, prochainEssai: null } })
    expect(mockPrisma.enregistrement.update).toHaveBeenCalledWith({
      where: { id: 'e1' }, data: { statutPartage: 'en_attente', derniereErreur: null, tentatives: 0 },
    })
    expect(mockPrisma.partageJob.findUniqueOrThrow.mock.calls[0][0].include.entrepriseIcrm).toBeDefined()
  })

  it('échec vers une entreprise désactivée : passe `suspendu` (jamais vers un canal) + avertissement', async () => {
    mockPrisma.partageJob.findUniqueOrThrow.mockResolvedValue({
      id: 'j1', enregistrementId: 'e1', statut: 'echec_temporaire', entrepriseIcrmId: AUTRE_ID, entrepriseIcrm: AUTRE,
    })
    mockPrisma.partageJob.update.mockResolvedValue({ id: 'j1', statut: 'suspendu' })

    const res = await relancer()

    expect(res.status).toBe(200)
    expect(relances()[0].data.statut).toBe('suspendu')
    expect(res.body.avertissement).toMatch(/désactivée : les envois sont suspendus/)
  })

  it('job SUSPENDU dont l’entreprise est toujours inutilisable : 409 ENVOI_SUSPENDU pointant vers « Rediriger les envois », rien ne change', async () => {
    mockPrisma.partageJob.findUniqueOrThrow.mockResolvedValue({
      id: 'j1', enregistrementId: 'e1', statut: 'suspendu', entrepriseIcrmId: AUTRE_ID, entrepriseIcrm: AUTRE,
      enregistrement: { borneId: BORNE_ID },
    })
    const res = await relancer()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ENVOI_SUSPENDU')
    expect(res.body.error.message).toMatch(/« Rediriger les envois » dans la fiche de la borne/)
    expect(res.body.error.details).toEqual({ borneId: BORNE_ID, action: `POST /api/bornes/${BORNE_ID}/rediriger-envois` })
    expect(mockPrisma.partageJob.findUniqueOrThrow.mock.calls[0][0].include.enregistrement).toEqual({ select: { borneId: true } })
    expect(mockPrisma.partageJob.update).not.toHaveBeenCalled()
  })

  it('job SUSPENDU dont l’entreprise est redevenue utilisable : remis en file', async () => {
    mockPrisma.partageJob.findUniqueOrThrow.mockResolvedValue({
      id: 'j1', enregistrementId: 'e1', statut: 'suspendu', entrepriseIcrmId: ENT_ID, entrepriseIcrm: ENTREPRISE,
    })
    mockPrisma.partageJob.update.mockResolvedValue({ id: 'j1', statut: 'en_attente' })
    expect((await relancer()).status).toBe(200)
    expect(relances()[0].data.statut).toBe('en_attente')
  })

  it('job canal (cible NULL) : comportement historique', async () => {
    mockPrisma.partageJob.findUniqueOrThrow.mockResolvedValue({
      id: 'j1', enregistrementId: 'e1', statut: 'echec_definitif', entrepriseIcrmId: null, entrepriseIcrm: null,
    })
    mockPrisma.partageJob.update.mockResolvedValue({ id: 'j1' })
    expect((await relancer()).status).toBe(200)
    expect(relances()[0].data.statut).toBe('en_attente')
  })
})

// ─── liste / stats ────────────────────────────────────────────────────────────

describe('GET /api/partage/jobs et /stats — statut `suspendu`', () => {
  it('liste : cible du job et instantané crmDestination inclus ; filtre ?statut=suspendu accepté', async () => {
    mockPrisma.partageJob.findMany.mockResolvedValue([])
    mockPrisma.partageJob.count.mockResolvedValue(0)

    const res = await request(app).get('/api/partage/jobs?statut=suspendu').set(authSA)

    expect(res.status).toBe(200)
    const args = mockPrisma.partageJob.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ statut: 'suspendu' })
    expect(args.include.entrepriseIcrm).toEqual({ select: { id: true, nom: true, actif: true, deletedAt: true, verificationRequise: true } })
    expect(args.include.enregistrement.select.crmDestination).toBe(true)
  })

  it('stats : `suspendu` compté à part, jamais dans les échecs des 24 h', async () => {
    mockPrisma.partageJob.groupBy.mockResolvedValue([
      { statut: 'suspendu', _count: { _all: 300 } },
      { statut: 'succes', _count: { _all: 4 } },
    ])
    mockPrisma.partageJob.count.mockResolvedValueOnce(4).mockResolvedValueOnce(0)

    const res = await request(app).get('/api/partage/stats').set(authSA)

    expect(res.body.data.byStatut).toMatchObject({ suspendu: 300, succes: 4, echec_temporaire: 0, echec_definitif: 0 })
    expect(res.body.data.echecs24h).toBe(0)
    expect(mockPrisma.partageJob.count.mock.calls[1][0].where.statut).toEqual({ in: ['echec_temporaire', 'echec_definitif'] })
  })
})

// ─── Kiosque : création du job ────────────────────────────────────────────────

describe('POST /api/enregistrements (kiosque) — job créé avec la cible actuelle de la borne', () => {
  function armer(borneEnBase) {
    mockPrisma.borne.findUnique.mockResolvedValue({ id: BORNE_ID, adminBorneId: AB_ID, pays: 'FR', ...borneEnBase })
    mockPrisma.question.findMany.mockResolvedValue([{ id: Q_NOM, typeOption: 'texte_court', crmFieldIds: [2087] }])
    mockPrisma.formulaire.findUnique.mockResolvedValue({ version: '1.3.0' })
    mockPrisma.partageJob.create.mockResolvedValue({ id: 'job-1' })
    mockPrisma.enregistrement.create.mockImplementation(async ({ data }) => ({ id: 'enr-1', borneId: BORNE_ID, ...data, reponses: [] }))
  }
  const soumettre = () => request(app).post('/api/enregistrements').set(authAB)
    .send({ borneId: BORNE_ID, formulaireId: FORM_ID, reponses: [{ questionId: Q_NOM, valeur: 'DUPONT' }] })

  it('borne affectée à une entreprise active : job en file ciblant l’entreprise', async () => {
    armer({ entrepriseIcrmId: ENT_ID })
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue(ENTREPRISE)

    const res = await soumettre()

    expect(res.status).toBe(201)
    expect(mockPrisma.partageJob.create).toHaveBeenCalledWith({ data: { enregistrementId: 'enr-1', entrepriseIcrmId: ENT_ID } })
    expect(mockPrisma.enregistrement.create.mock.calls[0][0].data).not.toHaveProperty('statutPartage')
  })

  it('borne affectée à une entreprise désactivée : job ET enregistrement créés `suspendu` (hors file)', async () => {
    armer({ entrepriseIcrmId: AUTRE_ID })
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue(AUTRE)

    const res = await soumettre()

    const motif = 'Entreprise I-CRM « CAE España » désactivée — envoi suspendu'
    expect(res.status).toBe(201)
    expect(mockPrisma.partageJob.create).toHaveBeenCalledWith({
      data: { enregistrementId: 'enr-1', entrepriseIcrmId: AUTRE_ID, statut: 'suspendu', erreur: motif },
    })
    expect(mockPrisma.enregistrement.create.mock.calls[0][0].data).toMatchObject({ statutPartage: 'suspendu', derniereErreur: motif })
  })

  it('borne affectée à une entreprise NOUVELLE (jamais testée) : job ET enregistrement créés `suspendu`', async () => {
    armer({ entrepriseIcrmId: ENT_ID })
    mockPrisma.entrepriseIcrm.findUnique.mockResolvedValue({ ...ENTREPRISE, verificationRequise: true })

    const res = await soumettre()

    expect(res.status).toBe(201)
    const motif = "Entreprise I-CRM « LENA (France) » : identifiants non vérifiés (nouvelle entreprise, URL ou clé modifiée), "
      + "testez l'entreprise pour reprendre les envois — envoi suspendu"
    expect(mockPrisma.partageJob.create).toHaveBeenCalledWith({
      data: { enregistrementId: 'enr-1', entrepriseIcrmId: ENT_ID, statut: 'suspendu', erreur: motif },
    })
    expect(mockPrisma.enregistrement.create.mock.calls[0][0].data).toMatchObject({ statutPartage: 'suspendu', derniereErreur: motif })
  })

  it('borne sans entreprise : job « canal » (cible NULL), aucune lecture d’entreprise', async () => {
    armer({ entrepriseIcrmId: null })
    const res = await soumettre()
    expect(res.status).toBe(201)
    expect(mockPrisma.partageJob.create).toHaveBeenCalledWith({ data: { enregistrementId: 'enr-1' } })
    expect(mockPrisma.entrepriseIcrm.findUnique).not.toHaveBeenCalled()
  })
})
