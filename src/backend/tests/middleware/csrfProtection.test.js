/**
 * Unit tests for csrfProtection middleware
 *
 * Tests cover:
 * - GET requests skip CSRF validation
 * - POST with valid CSRF token → allowed
 * - POST without CSRF token → 403
 *
 * Note: The csrfProtectionMiddleware is a no-op in test/development mode
 * (NODE_ENV=test). To test the actual CSRF enforcement logic we test the
 * underlying doubleCsrfProtection directly, and also verify the
 * csrfProtectionMiddleware passthrough behaviour in test mode.
 */

import { jest } from '@jest/globals'
import express from 'express'
import cookieParser from 'cookie-parser'

// ─── Test the csrfProtectionMiddleware bypass in test mode ───────────────────

describe('csrfProtectionMiddleware — test/dev mode bypass', () => {
  let app
  let request

  beforeAll(async () => {
    // NODE_ENV is 'test' in Jest — the middleware should be a no-op
    const { csrfProtectionMiddleware } = await import('../../src/middleware/csrfProtection.js')
    const { default: supertest } = await import('supertest')
    request = supertest

    app = express()
    app.use(express.json())

    // Apply the middleware to a test route
    app.post('/test', csrfProtectionMiddleware, (req, res) => {
      res.json({ ok: true })
    })

    app.get('/test', csrfProtectionMiddleware, (req, res) => {
      res.json({ ok: true })
    })
  })

  it('GET request passes through without CSRF token (safe method)', async () => {
    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST request passes through in test mode (no CSRF token needed)', async () => {
    const res = await request(app)
      .post('/test')
      .send({ data: 'test' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST request without CSRF token passes in test mode (bypass active)', async () => {
    const res = await request(app)
      .post('/test')
      .send({})
    // In test mode, CSRF is bypassed — should be 200
    expect(res.status).toBe(200)
  })
})

// ─── Test the real doubleCsrfProtection enforcement ──────────────────────────

describe('doubleCsrfProtection — real CSRF enforcement', () => {
  let app
  let request
  let generateToken
  let doubleCsrfProtection

  beforeAll(async () => {
    const csrfModule = await import('../../src/middleware/csrfProtection.js')
    generateToken = csrfModule.generateToken
    doubleCsrfProtection = csrfModule.doubleCsrfProtection

    const { default: supertest } = await import('supertest')
    request = supertest

    app = express()
    app.use(express.json())
    app.use(cookieParser())

    // Endpoint to get a CSRF token (sets cookie + returns token)
    app.get('/csrf-token', (req, res) => {
      const token = generateToken(req, res)
      res.json({ csrfToken: token })
    })

    // Protected POST endpoint using the real doubleCsrfProtection
    app.post('/protected', doubleCsrfProtection, (req, res) => {
      res.json({ ok: true })
    })

    // Protected DELETE endpoint
    app.delete('/protected', doubleCsrfProtection, (req, res) => {
      res.json({ ok: true })
    })

    // GET endpoint — should always pass (safe method)
    app.get('/protected', doubleCsrfProtection, (req, res) => {
      res.json({ ok: true })
    })
  })

  it('GET request skips CSRF validation (safe method)', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST without CSRF token → 403', async () => {
    const res = await request(app)
      .post('/protected')
      .send({ data: 'test' })
    expect(res.status).toBe(403)
  })

  it('DELETE without CSRF token → 403', async () => {
    const res = await request(app)
      .delete('/protected')
    expect(res.status).toBe(403)
  })

  it('POST with valid CSRF token → 200', async () => {
    // Step 1: Get a CSRF token (this sets the cookie)
    const tokenRes = await request(app).get('/csrf-token')
    expect(tokenRes.status).toBe(200)
    expect(tokenRes.body.csrfToken).toBeDefined()

    const csrfToken = tokenRes.body.csrfToken

    // Extract the csrf cookie set by the server
    const setCookieHeader = tokenRes.headers['set-cookie']
    expect(setCookieHeader).toBeDefined()

    // Step 2: POST with the CSRF token in the header and cookie
    const res = await request(app)
      .post('/protected')
      .set('Cookie', setCookieHeader)
      .set('x-csrf-token', csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST with wrong CSRF token → 403', async () => {
    // Get a valid cookie first
    const tokenRes = await request(app).get('/csrf-token')
    const setCookieHeader = tokenRes.headers['set-cookie']

    // Send a wrong token value
    const res = await request(app)
      .post('/protected')
      .set('Cookie', setCookieHeader)
      .set('x-csrf-token', 'invalid-token-value')
      .send({ data: 'test' })

    expect(res.status).toBe(403)
  })

  it('POST with CSRF token but no cookie → 403', async () => {
    // Get a valid token
    const tokenRes = await request(app).get('/csrf-token')
    const csrfToken = tokenRes.body.csrfToken

    // Send token in header but no cookie
    const res = await request(app)
      .post('/protected')
      .set('x-csrf-token', csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(403)
  })
})

// ─── Test GET /api/csrf-token endpoint in the full app ───────────────────────

describe('GET /api/csrf-token endpoint', () => {
  let request
  let app

  beforeAll(async () => {
    // Mock all dependencies before importing app
    jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
      prisma: {
        configuration: { findFirst: jest.fn() },
        submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
        superAdmin: { findUnique: jest.fn() },
        adminBorne: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
        borne: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
        formulaire: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
        question: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        enregistrement: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
        partageJob: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
        refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
      },
    }))

    jest.unstable_mockModule('../../src/services/authService.js', () => ({
      loginUser: jest.fn(),
      issueAccessToken: jest.fn(),
    }))

    jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
      createRefreshToken: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      cleanupExpiredTokens: jest.fn(),
    }))

    jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
      addToBlacklist: jest.fn(),
      isBlacklisted: jest.fn().mockResolvedValue(false),
      cleanupExpired: jest.fn(),
    }))

    jest.unstable_mockModule('../../src/services/bruteForceService.js', () => ({
      isBlocked: jest.fn().mockResolvedValue(false),
      recordFailedAttempt: jest.fn(),
      resetAttempts: jest.fn(),
      getRemainingAttempts: jest.fn().mockResolvedValue(5),
      getRetryAfter: jest.fn().mockResolvedValue(0),
    }))

    const { default: supertest } = await import('supertest')
    request = supertest

    const { default: appModule } = await import('../../src/app.js')
    app = appModule
  })

  it('GET /api/csrf-token → 200 with csrfToken in body', async () => {
    const res = await request(app).get('/api/csrf-token')
    expect(res.status).toBe(200)
    expect(res.body.csrfToken).toBeDefined()
    expect(typeof res.body.csrfToken).toBe('string')
    expect(res.body.csrfToken.length).toBeGreaterThan(0)
  })

  it('GET /api/csrf-token → sets a cookie', async () => {
    const res = await request(app).get('/api/csrf-token')
    expect(res.status).toBe(200)
    // csrf-csrf sets a cookie with the token hash
    const setCookieHeader = res.headers['set-cookie']
    expect(setCookieHeader).toBeDefined()
  })
})
