/**
 * Tests pour DELETE /api/admin-bornes/:id
 *
 * Règles métier :
 *  - Suppression autorisée si l'admin n'a aucune borne OU si toutes ses bornes
 *    ont statut = 'inactif'.
 *  - Refusée (403) s'il existe au moins une borne avec statut = 'actif'.
 *  - Les bornes (inactives) sont réassignées au SuperAdmin (adminBorneId = null)
 *    via une transaction Prisma.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = {
  superAdmin: { findUnique: jest.fn() },
  adminBorne: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  borne: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(async (cb) => cb({
    borne: { updateMany: mockPrisma.borne.updateMany },
    adminBorne: { delete: mockPrisma.adminBorne.delete },
  })),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_admin_bornes_delete'

const superAdminToken = jwt.sign(
  { sub: 'uuid-super', role: 'SUPER_ADMIN' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
)
const adminBorneToken = jwt.sign(
  { sub: 'uuid-admin-other', role: 'ADMIN_BORNE' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
)

const authSA = { Authorization: `Bearer ${superAdminToken}` }
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (cb) => cb({
    borne: { updateMany: mockPrisma.borne.updateMany },
    adminBorne: { delete: mockPrisma.adminBorne.delete },
  }))
})

describe('DELETE /api/admin-bornes/:id', () => {
  it('404 si l\'admin n\'existe pas', async () => {
    mockPrisma.adminBorne.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/admin-bornes/unknown-id')
      .set(authSA)

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(mockPrisma.adminBorne.delete).not.toHaveBeenCalled()
    expect(mockPrisma.borne.updateMany).not.toHaveBeenCalled()
  })

  it('403 (Forbidden) pour un caller ADMIN_BORNE', async () => {
    const res = await request(app)
      .delete('/api/admin-bornes/uuid-admin-1')
      .set(authAB)

    expect(res.status).toBe(403)
    expect(mockPrisma.adminBorne.findUnique).not.toHaveBeenCalled()
  })

  it('autorise la suppression quand l\'admin n\'a aucune borne', async () => {
    mockPrisma.adminBorne.findUnique.mockResolvedValue({
      id: 'uuid-admin-1',
      email: 'a@b.fr',
      bornes: [],
    })
    mockPrisma.adminBorne.delete.mockResolvedValue({ id: 'uuid-admin-1' })

    const res = await request(app)
      .delete('/api/admin-bornes/uuid-admin-1')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.bornesReassignees).toBe(0)
    expect(mockPrisma.borne.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.adminBorne.delete).toHaveBeenCalledWith({
      where: { id: 'uuid-admin-1' },
    })
  })

  it('autorise la suppression quand toutes les bornes sont inactives et les réassigne', async () => {
    mockPrisma.adminBorne.findUnique.mockResolvedValue({
      id: 'uuid-admin-2',
      email: 'a@b.fr',
      bornes: [
        { id: 'b1', statut: 'inactif' },
        { id: 'b2', statut: 'inactif' },
      ],
    })
    mockPrisma.borne.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.adminBorne.delete.mockResolvedValue({ id: 'uuid-admin-2' })

    const res = await request(app)
      .delete('/api/admin-bornes/uuid-admin-2')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.bornesReassignees).toBe(2)
    expect(res.body.message).toMatch(/2 borne\(s\) réassignée\(s\) au SuperAdmin/)

    expect(mockPrisma.borne.updateMany).toHaveBeenCalledWith({
      where: { adminBorneId: 'uuid-admin-2' },
      data: { adminBorneId: null },
    })
    expect(mockPrisma.adminBorne.delete).toHaveBeenCalledWith({
      where: { id: 'uuid-admin-2' },
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('refuse (403) s\'il existe au moins une borne active', async () => {
    mockPrisma.adminBorne.findUnique.mockResolvedValue({
      id: 'uuid-admin-3',
      email: 'a@b.fr',
      bornes: [
        { id: 'b1', statut: 'inactif' },
        { id: 'b2', statut: 'actif' },
      ],
    })

    const res = await request(app)
      .delete('/api/admin-bornes/uuid-admin-3')
      .set(authSA)

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(res.body.error.details.bornesActivesCount).toBe(1)

    expect(mockPrisma.borne.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.adminBorne.delete).not.toHaveBeenCalled()
  })

  it('refuse (403) si toutes les bornes sont actives', async () => {
    mockPrisma.adminBorne.findUnique.mockResolvedValue({
      id: 'uuid-admin-4',
      email: 'a@b.fr',
      bornes: [
        { id: 'b1', statut: 'actif' },
        { id: 'b2', statut: 'actif' },
        { id: 'b3', statut: 'actif' },
      ],
    })

    const res = await request(app)
      .delete('/api/admin-bornes/uuid-admin-4')
      .set(authSA)

    expect(res.status).toBe(403)
    expect(res.body.error.details.bornesActivesCount).toBe(3)
    expect(mockPrisma.adminBorne.delete).not.toHaveBeenCalled()
  })
})
