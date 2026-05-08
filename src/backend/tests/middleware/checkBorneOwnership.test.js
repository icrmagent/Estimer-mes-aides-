/**
 * Unit tests for checkBorneOwnership middleware
 *
 * Tests cover:
 * - SuperAdmin (role: 'SUPER_ADMIN') → calls next() without checking borne ownership
 * - AdminBorne with matching borneId → calls next()
 * - AdminBorne with non-matching borneId → returns 403 FORBIDDEN
 * - Missing borneId param → returns 400 BAD_REQUEST
 * - Missing req.user → returns 401 UNAUTHORIZED
 */

import { jest } from '@jest/globals'

describe('checkBorneOwnership middleware', () => {
  let checkBorneOwnership
  let mockPrisma
  let req
  let res
  let next

  beforeAll(async () => {
    // Mock Prisma before importing the middleware
    mockPrisma = {
      borne: {
        findFirst: jest.fn(),
      },
    }

    jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
      prisma: mockPrisma,
    }))

    // Import the middleware after mocking
    const module = await import('../../src/middleware/borneOwnership.js')
    checkBorneOwnership = module.checkBorneOwnership
  })

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()

    // Setup mock request, response, and next
    req = {
      user: null,
      params: {},
      borne: null,
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    next = jest.fn()
  })

  describe('Authentication checks', () => {
    it('returns 401 when req.user is missing', async () => {
      req.user = null
      req.params.id = 'borne-123'

      await checkBorneOwnership(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Non authentifié' })
      expect(next).not.toHaveBeenCalled()
      expect(mockPrisma.borne.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('SuperAdmin bypass', () => {
    it('calls next() without checking borne ownership for SUPER_ADMIN', async () => {
      req.user = { sub: 'super-admin-id', role: 'SUPER_ADMIN' }
      req.params.id = 'borne-123'

      await checkBorneOwnership(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(mockPrisma.borne.findFirst).not.toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('bypasses ownership check even when borneId is missing (SUPER_ADMIN)', async () => {
      req.user = { sub: 'super-admin-id', role: 'SUPER_ADMIN' }
      // No borneId in params

      await checkBorneOwnership(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(mockPrisma.borne.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('AdminBorne ownership checks', () => {
    it('calls next() when AdminBorne owns the borne', async () => {
      const adminBorneId = 'admin-borne-123'
      const borneId = 'borne-456'
      const mockBorne = {
        id: borneId,
        adminBorneId,
        nom: 'Test Borne',
      }

      req.user = { sub: adminBorneId, role: 'ADMIN_BORNE' }
      req.params.id = borneId

      mockPrisma.borne.findFirst.mockResolvedValue(mockBorne)

      await checkBorneOwnership(req, res, next)

      expect(mockPrisma.borne.findFirst).toHaveBeenCalledWith({
        where: { id: borneId, adminBorneId },
      })
      expect(req.borne).toBe(mockBorne)
      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('returns 403 when AdminBorne does not own the borne', async () => {
      const adminBorneId = 'admin-borne-123'
      const borneId = 'borne-456'

      req.user = { sub: adminBorneId, role: 'ADMIN_BORNE' }
      req.params.id = borneId

      // Borne not found (either doesn't exist or belongs to another AdminBorne)
      mockPrisma.borne.findFirst.mockResolvedValue(null)

      await checkBorneOwnership(req, res, next)

      expect(mockPrisma.borne.findFirst).toHaveBeenCalledWith({
        where: { id: borneId, adminBorneId },
      })
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'Accès refusé' })
      expect(next).not.toHaveBeenCalled()
    })

    it('checks req.params.borneId when req.params.id is not present', async () => {
      const adminBorneId = 'admin-borne-123'
      const borneId = 'borne-789'
      const mockBorne = {
        id: borneId,
        adminBorneId,
        nom: 'Test Borne',
      }

      req.user = { sub: adminBorneId, role: 'ADMIN_BORNE' }
      req.params.borneId = borneId // Using borneId instead of id

      mockPrisma.borne.findFirst.mockResolvedValue(mockBorne)

      await checkBorneOwnership(req, res, next)

      expect(mockPrisma.borne.findFirst).toHaveBeenCalledWith({
        where: { id: borneId, adminBorneId },
      })
      expect(req.borne).toBe(mockBorne)
      expect(next).toHaveBeenCalled()
    })

    it('returns 400 when borneId is missing from params', async () => {
      req.user = { sub: 'admin-borne-123', role: 'ADMIN_BORNE' }
      // No id or borneId in params

      await checkBorneOwnership(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'borneId manquant' })
      expect(next).not.toHaveBeenCalled()
      expect(mockPrisma.borne.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('returns 500 when database query fails', async () => {
      const adminBorneId = 'admin-borne-123'
      const borneId = 'borne-456'

      req.user = { sub: adminBorneId, role: 'ADMIN_BORNE' }
      req.params.id = borneId

      // Simulate database error
      mockPrisma.borne.findFirst.mockRejectedValue(new Error('Database connection failed'))

      await checkBorneOwnership(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur serveur' })
      expect(next).not.toHaveBeenCalled()
    })
  })
})
