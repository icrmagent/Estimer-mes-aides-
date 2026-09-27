/**
 * Instantané de livraison `crmDestination` selon le rôle — /api/enregistrements.
 *
 * Le SuperAdmin voit l'instantané entier (entreprise, hôte de l'API, identifiant
 * de clé — jamais de secret). L'AdminBorne n'en voit que l'entreprise : nom,
 * entreprise et sous-type I-CRM — ni `apiHost` ni `apiKeyId` (liste et détail).
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  borne: { findMany: jest.fn() },
  enregistrement: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  enregistrementReponse: { findMany: jest.fn() },
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
const { projeterDestinationLivraison } = await import('../../src/routes/enregistrements.js')

process.env.JWT_SECRET = 'test_jwt_secret_crm_destination'

const AB_ID = '11111111-1111-4111-8111-111111111111'
const BORNE_ID = '33333333-3333-4333-8333-333333333333'
const ENR_ID = '55555555-5555-4555-8555-555555555555'
const sign = (sub, role) => jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${sign('uuid-super', 'SUPER_ADMIN')}` }
const authAB = { Authorization: `Bearer ${sign(AB_ID, 'ADMIN_BORNE')}` }

const INSTANTANE = {
  entrepriseIcrmId: '66666666-6666-4666-8666-666666666666',
  nom: 'LENA (France)',
  nomIcrm: 'LENA',
  sousTypeIcrm: 'BORNE TACTILE',
  apiHost: 'icrm.api.ila26.fr',
  apiKeyId: 'emak_A1b2C3d4E5f6G7h8I9j0K1l2',
}

const enregistrement = (overrides = {}) => ({
  id: ENR_ID,
  borneId: BORNE_ID,
  statutPartage: 'partage',
  crmEntrepriseIcrmId: INSTANTANE.entrepriseIcrmId,
  crmDestination: INSTANTANE,
  borne: { id: BORNE_ID, idBorne: 'BORNE-A', adresse: 'a', adminBorneId: AB_ID },
  formulaire: { id: 'f', label: 'F', version: '1.0.0' },
  reponses: [],
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.borne.findMany.mockResolvedValue([{ id: BORNE_ID }])
  mockPrisma.enregistrement.findMany.mockResolvedValue([enregistrement(), enregistrement({ id: 'e2', crmDestination: null })])
  mockPrisma.enregistrement.findUniqueOrThrow.mockResolvedValue(enregistrement())
  mockPrisma.enregistrementReponse.findMany.mockResolvedValue([])
})

describe('crmDestination — projection par rôle', () => {
  it('AdminBorne, liste : seulement nom, entreprise et sous-type I-CRM (ni hôte ni identifiant de clé)', async () => {
    const res = await request(app).get('/api/enregistrements').set(authAB)

    expect(res.status).toBe(200)
    expect(res.body.data[0].crmDestination).toEqual({ nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE' })
    expect(res.body.data[1].crmDestination).toBeNull()
    const texte = JSON.stringify(res.body)
    expect(texte).not.toContain('apiHost')
    expect(texte).not.toContain('icrm.api.ila26.fr')
    expect(texte).not.toContain('emak_')
  })

  it('AdminBorne, détail : même projection', async () => {
    const res = await request(app).get(`/api/enregistrements/${ENR_ID}`).set(authAB)
    expect(res.status).toBe(200)
    expect(res.body.data.crmDestination).toEqual({ nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE' })
    expect(JSON.stringify(res.body)).not.toContain('emak_')
  })

  it('SuperAdmin, liste et détail : instantané complet', async () => {
    const liste = await request(app).get('/api/enregistrements').set(authSA)
    expect(liste.body.data[0].crmDestination).toEqual(INSTANTANE)
    const detail = await request(app).get(`/api/enregistrements/${ENR_ID}`).set(authSA)
    expect(detail.body.data.crmDestination).toEqual(INSTANTANE)
  })

  it('fonction : tout rôle autre que SUPER_ADMIN est réduit ; valeur non objet → null ; sans instantané → inchangé', () => {
    expect(projeterDestinationLivraison(enregistrement(), 'AUTRE').crmDestination)
      .toEqual({ nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE' })
    expect(projeterDestinationLivraison(enregistrement({ crmDestination: 'texte' }), 'ADMIN_BORNE').crmDestination).toBeNull()
    expect(projeterDestinationLivraison(enregistrement({ crmDestination: { nom: 'X' } }), 'ADMIN_BORNE').crmDestination)
      .toEqual({ nom: 'X', nomIcrm: null, sousTypeIcrm: null })
    const sans = { id: 'x' }
    expect(projeterDestinationLivraison(sans, 'ADMIN_BORNE')).toBe(sans)
    expect(projeterDestinationLivraison(null, 'ADMIN_BORNE')).toBeNull()
  })
})
