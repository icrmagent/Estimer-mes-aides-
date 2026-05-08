/**
 * Unit tests for jwtAuth middleware (jwtAuthV2)
 *
 * Tests cover:
 * - Valid JWT token → sets req.user and calls next()
 * - Expired JWT token → returns 401 with 'JWT expired'
 * - Blacklisted token → returns 401 with 'Token revoked'
 * - Missing Authorization header → returns 401
 * - Malformed token → returns 401
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars!!'

describe('jwtAuthV2 middleware', () => {
  let jwtAuthV2
  let mockIsBlacklisted
  let req
  let res
  let next

  beforeAll(async () => {
    // Set JWT_SECRET before importing middleware
    process.env.JWT_SECRET = TEST_JWT_SECRET

    // Mock tokenBlacklistService before importing jwtAuth
    mockIsBlacklisted = jest.fn()

    jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
      isBlacklisted: mockIsBlacklisted,
      addToBlacklist: jest.fn(),
      cleanupExpired: jest.fn(),
    }))

    // Import jwtAuth after mocking
    const module = await import('../../src/middleware/jwtAuth.js')
    jwtAuthV2 = module.jwtAuthV2
  })

  beforeEach(() => {
    jest.clearAllMocks()

    req = {
      headers: {},
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    next = jest.fn()

    // Default: token is not blacklisted
    mockIsBlacklisted.mockResolvedValue(false)
  })

  describe('Missing or malformed Authorization header', () => {
    it('returns 401 when Authorization header is missing', async () => {
      req.headers = {}

      await jwtAuthV2(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing JWT' })
      expect(next).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header does not start with Bearer', async () => {
      req.headers.authorization = 'Basic sometoken'

      await jwtAuthV2(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing JWT' })
      expect(next).not.toHaveBeenCalled()
    })

    it('returns 401 for a malformed JWT token', async () => {
      req.headers.authorization = 'Bearer not.a.valid.jwt.token'

      await jwtAuthV2(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid JWT' })
      expect(next).not.toHaveBeenCalled()
    })

    it('returns 401 for a token signed with wrong secret', async () => {
      const wrongToken = jwt.sign(
        { sub: 'user-123', role: 'SUPER_ADMIN', jti: 'jti-abc' },
        'wrong-secret-key-that-is-different',
        { expiresIn: '1h' }
      )
      req.headers.authorization = `Bearer ${wrongToken}`

      await jwtAuthV2(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid JWT' })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('Valid JWT token', () => {
    it('sets req.user and calls next() for a valid SUPER_ADMIN token', async () => {
      const payload = { sub: 'super-admin-id', role: 'SUPER_ADMIN', jti: 'jti-valid-1' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '8h' })
      req.headers.authorization = `Bearer ${token}`

      await jwtAuthV2(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toBeDefined()
      expect(req.user.sub).toBe('super-admin-id')
      expect(req.user.role).toBe('SUPER_ADMIN')
      expect(res.status).not.toHaveBeenCalled()
    })

    it('sets req.user and calls next() for a valid ADMIN_BORNE token', async () => {
      const payload = { sub: 'admin-borne-id', role: 'ADMIN_BORNE', jti: 'jti-valid-2' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '8h' })
      req.headers.authorization = `Bearer ${token}`

      await jwtAuthV2(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toBeDefined()
      expect(req.user.sub).toBe('admin-borne-id')
      expect(req.user.role).toBe('ADMIN_BORNE')
      expect(res.status).not.toHaveBeenCalled()
    })

    it('checks blacklist when token has a jti claim', async () => {
      const jti = 'jti-to-check'
      const payload = { sub: 'user-id', role: 'SUPER_ADMIN', jti }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' })
      req.headers.authorization = `Bearer ${token}`

      mockIsBlacklisted.mockResolvedValue(false)

      await jwtAuthV2(req, res, next)

      expect(mockIsBlacklisted).toHaveBeenCalledWith(jti)
      expect(next).toHaveBeenCalled()
    })

    it('does not check blacklist when token has no jti claim', async () => {
      // Token without jti
      const payload = { sub: 'user-id', role: 'SUPER_ADMIN' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' })
      req.headers.authorization = `Bearer ${token}`

      await jwtAuthV2(req, res, next)

      expect(mockIsBlacklisted).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })
  })

  describe('Expired JWT token', () => {
    it('returns 401 with "JWT expired" for an expired token', async () => {
      // Create a token that expired 1 second ago
      const payload = { sub: 'user-id', role: 'SUPER_ADMIN', jti: 'jti-expired' }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: -1 })
      req.headers.authorization = `Bearer ${token}`

      await jwtAuthV2(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'JWT expired' })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('Blacklisted token', () => {
    it('returns 401 with "Token revoked" for a blacklisted token', async () => {
      const jti = 'jti-blacklisted'
      const payload = { sub: 'user-id', role: 'SUPER_ADMIN', jti }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' })
      req.headers.authorization = `Bearer ${token}`

      // Simulate blacklisted token
      mockIsBlacklisted.mockResolvedValue(true)

      await jwtAuthV2(req, res, next)

      expect(mockIsBlacklisted).toHaveBeenCalledWith(jti)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token revoked' })
      expect(next).not.toHaveBeenCalled()
    })

    it('does not set req.user when token is blacklisted', async () => {
      const jti = 'jti-revoked'
      const payload = { sub: 'user-id', role: 'ADMIN_BORNE', jti }
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' })
      req.headers.authorization = `Bearer ${token}`

      mockIsBlacklisted.mockResolvedValue(true)

      await jwtAuthV2(req, res, next)

      expect(req.user).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    })
  })
})
