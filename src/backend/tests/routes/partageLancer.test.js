/**
 * POST /api/partage/bornes/:borneId/lancer — destination de la transmission.
 *
 * Couvre : borne avec une entreprise I-CRM active et SANS canal (acceptée),
 * entreprise prioritaire sur un canalTransmission incohérent, entreprise
 * désactivée ou supprimée = jobs mis en file mais envois SUSPENDUS
 * (avertissement, jamais « canal »), borne sans entreprise : erreurs historiques
 * NO_ACTIVE_CHANNEL / CHANNEL_LABEL_MISMATCH conservées, mise en file
 * (création / relance des jobs), destination renvoyée.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  borne: { findUnique: jest.fn() },
  enregistrement: { findMany: jest.fn(), updateMany: jest.fn() },
  partageJob: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
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

const BORNE_ID = '33333333-3333-4333-8333-333333333333'
const ENT_ID = '66666666-6666-4666-8666-666666666666'
const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign('11111111-1111-4111-8111-111111111111', 'ADMIN_BORNE')}` }

const ENTREPRISE = { id: ENT_ID, nom: 'LENA (France)', actif: true, deletedAt: null }

function borne(overrides = {}) {
  return { id: BORNE_ID, idBorne: 'BORNE-A', canalTransmission: null, canaux: [], entrepriseIcrm: null, ...overrides }
}

const lancer = (auth = authSA) => request(app).post(`/api/partage/bornes/${BORNE_ID}/lancer`).set(auth)

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.enregistrement.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
  mockPrisma.partageJob.findMany.mockResolvedValue([{ id: 'j1', enregistrementId: 'e1' }])
  mockPrisma.$transaction.mockResolvedValue([])
})

describe('POST /api/partage/bornes/:borneId/lancer — entreprise I-CRM', () => {
  it('borne avec entreprise active et sans canal : mise en file acceptée', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrm: ENTREPRISE }))

    const res = await lancer()

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      borneId: BORNE_ID,
      canalTransmission: null,
      destination: { type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, nom: 'LENA (France)' },
      queued: 2,
      created: 1,
      relaunched: 1,
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.borne.findUnique.mock.calls[0][0].select.entrepriseIcrm).toEqual({
      select: { id: true, nom: true, actif: true, deletedAt: true },
    })
  })

  it('entreprise active prioritaire : un canalTransmission sans canal correspondant ne bloque pas', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({
      entrepriseIcrm: ENTREPRISE,
      canalTransmission: 'ancien-canal',
      canaux: [{ id: 'c1', label: 'autre' }],
    }))
    const res = await lancer()
    expect(res.status).toBe(200)
    expect(res.body.data.destination.type).toBe('entreprise_icrm')
  })

  it('aucun enregistrement à transmettre : 200, destination renvoyée', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrm: ENTREPRISE }))
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    const res = await lancer()
    expect(res.body.data).toMatchObject({ queued: 0, destination: { type: 'entreprise_icrm' } })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['désactivée', { ...ENTREPRISE, actif: false }, /désactivée : les envois sont suspendus/],
    ['supprimée', { ...ENTREPRISE, actif: false, deletedAt: new Date() }, /supprimée : les envois sont suspendus/],
  ])('entreprise %s, sans canal : jobs mis en file + avertissement « envois suspendus »', async (_cas, entrepriseIcrm, message) => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrm }))

    const res = await lancer()

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      queued: 2,
      destination: { type: 'entreprise_icrm', entrepriseIcrmId: ENT_ID, nom: 'LENA (France)', suspendu: true },
    })
    expect(res.body.data.avertissement).toMatch(message)
    expect(res.body.data.avertissement).toMatch(/aucun envoi vers les canaux/)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('entreprise désactivée + canal actif : jamais « canal » comme destination, avertissement renvoyé', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({
      entrepriseIcrm: { ...ENTREPRISE, actif: false },
      canalTransmission: 'icrm-lena',
      canaux: [{ id: 'c1', label: 'icrm-lena' }],
    }))
    const res = await lancer()
    expect(res.status).toBe(200)
    expect(res.body.data.destination).toMatchObject({ type: 'entreprise_icrm', suspendu: true })
    expect(res.body.data.avertissement).toMatch(/suspendus/)
  })

  it('entreprise active : pas d’avertissement ni de marque « suspendu »', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ entrepriseIcrm: ENTREPRISE }))
    const res = await lancer()
    expect(res.body.data).not.toHaveProperty('avertissement')
    expect(res.body.data.destination).not.toHaveProperty('suspendu')
  })
})

describe('POST /api/partage/bornes/:borneId/lancer — canaux (comportement historique)', () => {
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

  it('canal actif : mise en file, destination « canal »', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(borne({ canalTransmission: 'icrm-lena', canaux: [{ id: 'c1', label: 'icrm-lena' }] }))
    const res = await lancer()
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      canalTransmission: 'icrm-lena',
      destination: { type: 'canal', label: 'icrm-lena' },
      queued: 2,
    })
  })

  it('borne inconnue : 404 ; AdminBorne : 403', async () => {
    mockPrisma.borne.findUnique.mockResolvedValue(null)
    expect((await lancer()).status).toBe(404)
    expect((await lancer(authAB)).status).toBe(403)
  })
})
