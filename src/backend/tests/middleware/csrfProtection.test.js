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
  let appNs

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

    appNs = await import('../../src/app.js')
    app = appNs.default
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

  it('GET /api/csrf-token → pose AUSSI le cookie de session CSRF (httpOnly)', async () => {
    const res = await request(app).get('/api/csrf-token')
    const cookies = res.headers['set-cookie']

    const session = cookies.find((c) => c.startsWith('x-csrf-session='))
    expect(session).toBeDefined()
    expect(session).toMatch(/HttpOnly/i)

    const csrf = cookies.find((c) => c.startsWith('x-csrf-token='))
    expect(csrf).toBeDefined()
    // Le cookie CSRF doit rester lisible par le JS client (double-submit)
    expect(csrf).not.toMatch(/HttpOnly/i)
  })

  it('GET /api/csrf-token avec un cookie CSRF périmé → 200 avec un token frais (pas de 500)', async () => {
    // Régression : avec validateOnReuse=true (défaut de csrf-csrf), un cookie
    // CSRF dont le hash ne valide plus faisait LEVER une erreur depuis
    // l'endpoint d'émission lui-même → 500 CSRF_ERROR, et le client restait
    // bloqué jusqu'à expiration du cookie.
    const res = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', ['x-csrf-token=stale-token|stale-hash', 'x-csrf-session=00000000-0000-4000-8000-000000000000'])

    expect(res.status).toBe(200)
    expect(typeof res.body.csrfToken).toBe('string')
    expect(res.body.csrfToken.length).toBeGreaterThan(0)
    expect(res.body.csrfToken).not.toBe('stale-token')
  })
})

// ─── trust proxy — chaîne Cloudflare → Render ────────────────────────────────

describe('resolveTrustProxyHops — configuration du nombre de sauts de proxy', () => {
  let resolveTrustProxyHops
  let app

  beforeAll(async () => {
    const appNs = await import('../../src/app.js')
    resolveTrustProxyHops = appNs.resolveTrustProxyHops
    app = appNs.default
  })

  it('production → 2 sauts (edge Cloudflare + LB Render)', () => {
    expect(resolveTrustProxyHops({ NODE_ENV: 'production' })).toBe(2)
  })

  it('hors production → 0 saut (aucun proxy devant l\'app en local)', () => {
    expect(resolveTrustProxyHops({ NODE_ENV: 'test' })).toBe(0)
    expect(resolveTrustProxyHops({ NODE_ENV: 'development' })).toBe(0)
  })

  it('TRUST_PROXY_HOPS surcharge la valeur par défaut', () => {
    expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '3' })).toBe(3)
    expect(resolveTrustProxyHops({ NODE_ENV: 'test', TRUST_PROXY_HOPS: '1' })).toBe(1)
    expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })).toBe(0)
  })

  it('TRUST_PROXY_HOPS invalide → retombe sur la valeur par défaut (jamais permissif)', () => {
    for (const bad of ['', '   ', 'true', 'abc', '-1', '2.5', 'NaN']) {
      expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: bad })).toBe(2)
    }
  })

  it('l\'app applique un nombre de sauts, jamais `true`', () => {
    const configured = app.get('trust proxy')
    expect(typeof configured).toBe('number')
    expect(configured).not.toBe(true)
    // NODE_ENV=test sous Jest
    expect(configured).toBe(0)
  })
})

describe('trust proxy — résolution de req.ip derrière Cloudflare puis Render', () => {
  let request

  // Chaîne réelle : client → edge Cloudflare → LB Render → app.
  // Cloudflare ajoute l'IP client, Render ajoute l'IP de l'edge Cloudflare.
  const CLIENT = '203.0.113.7'
  const EDGE_A = '172.68.1.10'
  const EDGE_B = '172.68.99.250'

  const makeApp = (hops) => {
    const a = express()
    a.set('trust proxy', hops)
    a.get('/ip', (req, res) => res.json({ ip: req.ip }))
    return a
  }

  const ipBehind = async (hops, xff) => {
    const res = await request(makeApp(hops)).get('/ip').set('X-Forwarded-For', xff)
    return res.body.ip
  }

  beforeAll(async () => {
    const { default: supertest } = await import('supertest')
    request = supertest
  })

  it('2 sauts → req.ip = vraie IP client, STABLE malgré un edge Cloudflare différent', async () => {
    const first = await ipBehind(2, `${CLIENT}, ${EDGE_A}`)
    const second = await ipBehind(2, `${CLIENT}, ${EDGE_B}`)

    expect(first).toBe(CLIENT)
    expect(second).toBe(CLIENT)
    expect(first).toBe(second)
  })

  it('1 saut (ancien réglage) → req.ip = IP d\'edge Cloudflare, VARIABLE : cause de la panne CSRF', async () => {
    const first = await ipBehind(1, `${CLIENT}, ${EDGE_A}`)
    const second = await ipBehind(1, `${CLIENT}, ${EDGE_B}`)

    expect(first).toBe(EDGE_A)
    expect(second).toBe(EDGE_B)
    expect(first).not.toBe(second)
  })

  it('2 sauts → un X-Forwarded-For forgé par le client est ignoré', async () => {
    // Le client envoie « X-Forwarded-For: 1.2.3.4 » ; Cloudflare puis Render
    // ajoutent leurs entrées à droite, l'entrée forgée est donc la plus à gauche.
    const ip = await ipBehind(2, `1.2.3.4, ${CLIENT}, ${EDGE_A}`)

    expect(ip).toBe(CLIENT)
    expect(ip).not.toBe('1.2.3.4')
  })

  it('`true` ou un nombre de sauts trop grand → usurpation d\'IP possible (réglages rejetés)', async () => {
    const forged = `1.2.3.4, ${CLIENT}, ${EDGE_A}`

    expect(await ipBehind(3, forged)).toBe('1.2.3.4')
    expect(await ipBehind(true, forged)).toBe('1.2.3.4')
  })
})

// ─── Cycle token → écriture : indépendance vis-à-vis de l'IP ─────────────────

describe('CSRF — cycle token → écriture derrière la chaîne Cloudflare/Render', () => {
  let request
  let app
  let issueCsrfToken
  let doubleCsrfProtection

  const CLIENT = '203.0.113.7'
  const EDGE_A = '172.68.1.10'
  const EDGE_B = '172.68.99.250'

  const cookiesOf = (res) => res.headers['set-cookie'] ?? []
  const withoutCookie = (cookies, name) => cookies.filter((c) => !c.startsWith(`${name}=`))
  const onlyCookie = (cookies, name) => cookies.filter((c) => c.startsWith(`${name}=`))

  beforeAll(async () => {
    const csrfModule = await import('../../src/middleware/csrfProtection.js')
    issueCsrfToken = csrfModule.issueCsrfToken
    doubleCsrfProtection = csrfModule.doubleCsrfProtection

    const { default: supertest } = await import('supertest')
    request = supertest

    app = express()
    // Même réglage qu'en production : 2 sauts de proxy.
    app.set('trust proxy', 2)
    app.use(express.json())
    app.use(cookieParser())

    app.get('/csrf-token', (req, res) => {
      res.json({ csrfToken: issueCsrfToken(req, res) })
    })

    app.post('/protected', doubleCsrfProtection, (req, res) => {
      res.json({ ok: true, ip: req.ip })
    })
  })

  it('token puis écriture depuis un AUTRE edge Cloudflare → 200 (scénario de la panne)', async () => {
    const tokenRes = await request(app)
      .get('/csrf-token')
      .set('X-Forwarded-For', `${CLIENT}, ${EDGE_A}`)
    expect(tokenRes.status).toBe(200)

    const res = await request(app)
      .post('/protected')
      .set('X-Forwarded-For', `${CLIENT}, ${EDGE_B}`)
      .set('Cookie', cookiesOf(tokenRes))
      .set('x-csrf-token', tokenRes.body.csrfToken)
      .send({ label: 'ecriture backoffice' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('10 cycles token→écriture consécutifs avec des edges Cloudflare tous différents → 10/10', async () => {
    // Reproduit la mesure de production (8 échecs sur 10) : ici, 0 échec attendu.
    const statuses = []
    for (let i = 0; i < 10; i++) {
      const tokenRes = await request(app)
        .get('/csrf-token')
        .set('X-Forwarded-For', `${CLIENT}, 172.68.${i}.${i + 1}`)

      const res = await request(app)
        .post('/protected')
        .set('X-Forwarded-For', `${CLIENT}, 172.69.${i + 20}.${i + 3}`)
        .set('Cookie', cookiesOf(tokenRes))
        .set('x-csrf-token', tokenRes.body.csrfToken)
        .send({ i })

      statuses.push(res.status)
    }

    expect(statuses).toEqual(Array(10).fill(200))
  })

  it('changement complet de réseau client (Wi-Fi → 4G) → l\'écriture passe toujours', async () => {
    const tokenRes = await request(app)
      .get('/csrf-token')
      .set('X-Forwarded-For', `192.0.2.55, ${EDGE_A}`)

    const res = await request(app)
      .post('/protected')
      .set('X-Forwarded-For', `198.51.100.200, ${EDGE_B}`)
      .set('Cookie', cookiesOf(tokenRes))
      .set('x-csrf-token', tokenRes.body.csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(200)
  })

  it('écriture sans le cookie de session CSRF → 403 (la liaison de session est bien vérifiée)', async () => {
    const tokenRes = await request(app)
      .get('/csrf-token')
      .set('X-Forwarded-For', `${CLIENT}, ${EDGE_A}`)

    const res = await request(app)
      .post('/protected')
      .set('X-Forwarded-For', `${CLIENT}, ${EDGE_A}`)
      .set('Cookie', withoutCookie(cookiesOf(tokenRes), 'x-csrf-session'))
      .set('x-csrf-token', tokenRes.body.csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(403)
  })

  it('token d\'une session rejoué avec le cookie de session d\'une AUTRE session → 403', async () => {
    const sessionA = await request(app).get('/csrf-token')
    const sessionB = await request(app).get('/csrf-token')

    const csrfCookieA = onlyCookie(cookiesOf(sessionA), 'x-csrf-token')
    const sessionCookieB = onlyCookie(cookiesOf(sessionB), 'x-csrf-session')
    expect(csrfCookieA).toHaveLength(1)
    expect(sessionCookieB).toHaveLength(1)

    const res = await request(app)
      .post('/protected')
      .set('Cookie', [...csrfCookieA, ...sessionCookieB])
      .set('x-csrf-token', sessionA.body.csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(403)
  })

  it('l\'identifiant de session CSRF est réutilisé quand le client le renvoie (multi-onglets)', async () => {
    const first = await request(app).get('/csrf-token')
    const sessionCookie = onlyCookie(cookiesOf(first), 'x-csrf-session')

    // Deuxième onglet : même cookie de session, pas de nouveau cookie de session émis
    const second = await request(app).get('/csrf-token').set('Cookie', cookiesOf(first))
    expect(onlyCookie(cookiesOf(second), 'x-csrf-session')).toHaveLength(0)

    // Le token du premier onglet reste valide
    const res = await request(app)
      .post('/protected')
      .set('Cookie', [...onlyCookie(cookiesOf(first), 'x-csrf-token'), ...sessionCookie])
      .set('x-csrf-token', first.body.csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(200)
  })

  it('un X-Forwarded-For forgé ne permet pas de rejouer un token d\'une autre session', async () => {
    const victim = await request(app)
      .get('/csrf-token')
      .set('X-Forwarded-For', `${CLIENT}, ${EDGE_A}`)

    // L'attaquant possède le token (fuite) mais pas le cookie de session httpOnly,
    // et tente d'usurper l'IP de la victime.
    const res = await request(app)
      .post('/protected')
      .set('X-Forwarded-For', `${CLIENT}, 198.51.100.9, ${EDGE_B}`)
      .set('Cookie', onlyCookie(cookiesOf(victim), 'x-csrf-token'))
      .set('x-csrf-token', victim.body.csrfToken)
      .send({ data: 'test' })

    expect(res.status).toBe(403)
  })
})
