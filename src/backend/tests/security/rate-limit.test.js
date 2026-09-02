/**
 * Security Tests — Rate limiting tier 1 (chantier 2)
 *
 * Vérifie sur l'APPLICATION RÉELLE (src/app.js, routes réelles) :
 *  - un 429 arrive bien au-delà du seuil sur POST /api/submissions et globalement
 *  - le 429 alimente le tier 2 (`trackRateLimitViolation`), qui n'avait aucun appelant
 *  - /health n'est jamais limité et ne consomme pas le compteur
 *  - le login se verrouille après 5 échecs (bruteForceService câblé, repli DB sans Redis)
 *  - l'application démarre et limite sans REDIS_URL
 *
 * Les seuils sont abaissés par variables d'environnement pour garder le test rapide ;
 * le mécanisme testé est identique en production, seules les valeurs changent.
 */

import { jest } from '@jest/globals'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Environnement : DOIT être posé avant l'import de l'app ──────────────────

process.env.RATE_LIMIT_TEST_MODE = 'enabled' // réactive les limiteurs en env de test
process.env.RATE_LIMIT_GLOBAL_MAX = '20'
process.env.RATE_LIMIT_SUBMISSIONS_MAX = '3'
process.env.RATE_LIMIT_LOGIN_MAX = '10'
process.env.API_KEY_MOBILE = 'ema_mobile_test_rate_limit'
process.env.JWT_SECRET = 'test_jwt_secret_rate_limit'
delete process.env.REDIS_URL // le mode nominal en production

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockTrackRateLimitViolation = jest.fn().mockResolvedValue(undefined)

jest.unstable_mockModule('../../src/middleware/ipBlockMiddleware.js', () => ({
  ipBlockCheck: (_req, _res, next) => next(),
  trackRateLimitViolation: mockTrackRateLimitViolation,
  getRateLimitRedis: () => null, // pas de Redis : store mémoire
  closeIpBlockRedis: jest.fn().mockResolvedValue(undefined),
}))

const mockCreateSubmission = jest.fn()
jest.unstable_mockModule('../../src/services/submissionService.js', () => ({
  createSubmission: mockCreateSubmission,
  getSubmissions: jest.fn(),
  markSynced: jest.fn(),
}))

const mockLoginUser = jest.fn()
jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: mockLoginUser,
  issueAccessToken: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: jest.fn().mockResolvedValue('refresh-token-test'),
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  cleanupExpiredTokens: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn().mockResolvedValue(false),
  cleanupExpired: jest.fn(),
}))

/**
 * Table `login_attempts` en mémoire : bruteForceService (repli DB, sans Redis)
 * tourne pour de vrai contre ce faux Prisma.
 * @type {Map<string, {id: string, ip: string, attempts: number, lockedUntil: Date|null}>}
 */
const loginAttempts = new Map()

const mockPrisma = {
  $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
  loginAttempt: {
    findUnique: jest.fn(async ({ where }) => loginAttempts.get(where.ip) ?? null),
    create: jest.fn(async ({ data }) => {
      const record = { ...data }
      loginAttempts.set(data.ip, record)
      return record
    }),
    update: jest.fn(async ({ where, data }) => {
      const record = { ...loginAttempts.get(where.ip), ...data }
      loginAttempts.set(where.ip, record)
      return record
    }),
    upsert: jest.fn(async ({ where, update, create }) => {
      const existing = loginAttempts.get(where.ip)
      const record = existing ? { ...existing, ...update } : { ...create }
      loginAttempts.set(where.ip, record)
      return record
    }),
  },
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')
const { resetAllRateLimits } = await import('../../src/middleware/rateLimit.js')

const VALID_BODY = {
  configVersion: '1.0.0',
  values: [{ fieldId: 2087, value: 'Test' }],
}

beforeEach(async () => {
  jest.clearAllMocks()
  loginAttempts.clear()
  await resetAllRateLimits()
  mockCreateSubmission.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date(),
    synced: false,
    configVersion: '1.0.0',
  })
})

// ─── POST /api/submissions — l'écriture publique est plafonnée ───────────────

describe('Rate limiting — POST /api/submissions', () => {
  it('429 après N écritures avec une clé API valide', async () => {
    const max = Number(process.env.RATE_LIMIT_SUBMISSIONS_MAX)

    for (let i = 1; i <= max; i++) {
      const res = await request(app)
        .post('/api/submissions')
        .set('x-api-key', process.env.API_KEY_MOBILE)
        .send(VALID_BODY)

      expect(res.status).toBe(201)
      expect(res.headers['ratelimit-limit']).toBe(String(max))
      expect(res.headers['ratelimit-remaining']).toBe(String(max - i))
    }

    const blocked = await request(app)
      .post('/api/submissions')
      .set('x-api-key', process.env.API_KEY_MOBILE)
      .send(VALID_BODY)

    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: expect.any(String),
        retryAfter: expect.any(Number),
      },
    })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    // La soumission refusée n'atteint jamais la base
    expect(mockCreateSubmission).toHaveBeenCalledTimes(max)
  })

  it('le 429 alimente le tier 2 (trackRateLimitViolation)', async () => {
    const max = Number(process.env.RATE_LIMIT_SUBMISSIONS_MAX)

    for (let i = 0; i <= max; i++) {
      await request(app)
        .post('/api/submissions')
        .set('x-api-key', process.env.API_KEY_MOBILE)
        .send(VALID_BODY)
    }

    expect(mockTrackRateLimitViolation).toHaveBeenCalledTimes(1)
    expect(typeof mockTrackRateLimitViolation.mock.calls[0][0]).toBe('string')
  })

  it('une clé API invalide consomme aussi le quota (limiteur avant apiKeyAuth)', async () => {
    const max = Number(process.env.RATE_LIMIT_SUBMISSIONS_MAX)

    for (let i = 1; i <= max; i++) {
      const res = await request(app)
        .post('/api/submissions')
        .set('x-api-key', 'cle-volee-invalide')
        .send(VALID_BODY)
      expect(res.status).toBe(401)
    }

    const blocked = await request(app)
      .post('/api/submissions')
      .set('x-api-key', 'cle-volee-invalide')
      .send(VALID_BODY)

    expect(blocked.status).toBe(429)
  })

  it('GET /api/submissions ne consomme pas le quota d’écriture', async () => {
    const max = Number(process.env.RATE_LIMIT_SUBMISSIONS_MAX)

    for (let i = 0; i <= max; i++) {
      await request(app)
        .post('/api/submissions')
        .set('x-api-key', process.env.API_KEY_MOBILE)
        .send(VALID_BODY)
    }

    // Quota POST épuisé, mais la lecture reste servie (401 = jwtAuth, pas 429)
    const read = await request(app).get('/api/submissions')
    expect(read.status).toBe(401)
  })
})

// ─── Limiteur global ─────────────────────────────────────────────────────────

describe('Rate limiting — limiteur global', () => {
  it('429 au-delà du seuil global', async () => {
    const max = Number(process.env.RATE_LIMIT_GLOBAL_MAX)

    for (let i = 1; i <= max; i++) {
      const res = await request(app).get('/api/csrf-token')
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/api/csrf-token')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
  })
})

// ─── Sondes de disponibilité ─────────────────────────────────────────────────

describe('Rate limiting — /health (sonde Render toutes les 5 s)', () => {
  it('n’est jamais limité et ne consomme pas le compteur global', async () => {
    const max = Number(process.env.RATE_LIMIT_GLOBAL_MAX)

    // Bien plus de sondes que le seuil global
    for (let i = 0; i < max + 5; i++) {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.headers['ratelimit-limit']).toBeUndefined()
    }

    // Le compteur global est intact : première requête réelle = quota plein
    const res = await request(app).get('/api/csrf-token')
    expect(res.status).toBe(200)
    expect(res.headers['ratelimit-remaining']).toBe(String(max - 1))
  })
})

// ─── Brute force login ───────────────────────────────────────────────────────

describe('Rate limiting — verrouillage du login après 5 échecs', () => {
  it('5 échecs → le 6e essai est verrouillé (429 + retryAfter)', async () => {
    mockLoginUser.mockResolvedValue(null) // identifiants invalides

    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'attaquant@example.com', password: `essai-${i}` })

      expect(res.status).toBe(401)
    }

    const [record] = [...loginAttempts.values()]
    expect(record.attempts).toBe(5)
    expect(record.lockedUntil).toBeInstanceOf(Date)
    expect(record.lockedUntil.getTime()).toBeGreaterThan(Date.now())

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'attaquant@example.com', password: 'essai-6' })

    expect(blocked.status).toBe(429)
    expect(blocked.body.retryAfter).toBeGreaterThan(0)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    // Le 6e essai n'atteint jamais la vérification du mot de passe
    expect(mockLoginUser).toHaveBeenCalledTimes(5)
  })

  it('une connexion réussie remet le compteur à zéro', async () => {
    mockLoginUser.mockResolvedValueOnce(null)
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'faux' })

    expect([...loginAttempts.values()][0].attempts).toBe(1)

    mockLoginUser.mockResolvedValue({
      token: 'access-token',
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
      userId: 'uuid-user',
      userType: 'superadmin',
    })

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'bon' })

    expect(ok.status).toBe(200)
    expect([...loginAttempts.values()][0].attempts).toBe(0)
    expect([...loginAttempts.values()][0].lockedUntil).toBeNull()
  })

  it('l’en-tête X-Forwarded-For ne permet pas de réinitialiser le compteur', async () => {
    mockLoginUser.mockResolvedValue(null)

    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`) // IP forgée, différente à chaque essai
        .send({ email: 'attaquant@example.com', password: `essai-${i}` })
    }

    // Un seul compteur, malgré 5 IP annoncées différentes
    expect(loginAttempts.size).toBe(1)
    expect([...loginAttempts.values()][0].attempts).toBe(5)
  })
})

// ─── Démarrage sans REDIS_URL ────────────────────────────────────────────────

describe('Rate limiting — démarrage sans REDIS_URL', () => {
  const backendDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

  it('l’app démarre en NODE_ENV=production sans REDIS_URL et limite en mémoire', async () => {
    const bootScript = `
      import http from 'node:http'
      import { pathToFileURL } from 'node:url'
      // Prisma injecte le .env du projet dans process.env a l'instanciation du client :
      // on l'importe d'abord, PUIS on retire REDIS_URL, sinon la variable revient par
      // la bande et le scenario "pas de Redis provisionne" ne serait pas teste.
      await import(pathToFileURL(process.cwd() + '/src/lib/prisma.js').href)
      delete process.env.REDIS_URL
      const { default: app } = await import(pathToFileURL(process.cwd() + '/src/app.js').href)
      const server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        http.get({ host: '127.0.0.1', port, path: '/api/csrf-token' }, (res) => {
          res.resume()
          res.on('end', () => {
            console.log(JSON.stringify({
              status: res.statusCode,
              limit: res.headers['ratelimit-limit'],
              remaining: res.headers['ratelimit-remaining'],
            }))
            server.close(() => process.exit(0))
          })
        }).on('error', (err) => { console.error(err.message); process.exit(1) })
      })
    `

    const env = { ...process.env }
    delete env.REDIS_URL
    env.NODE_ENV = 'production'
    env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/unused'
    env.DIRECT_URL = env.DATABASE_URL
    delete env.RATE_LIMIT_TEST_MODE
    delete env.RATE_LIMIT_GLOBAL_MAX
    delete env.RATE_LIMIT_SUBMISSIONS_MAX
    delete env.RATE_LIMIT_LOGIN_MAX

    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', bootScript],
        { cwd: backendDir, env }
      )

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    })

    expect(result.code).toBe(0)

    const payload = JSON.parse(
      result.stdout.split('\n').filter(Boolean).at(-1)
    )

    expect(payload.status).toBe(200)
    // Seuil global par défaut, actif sans Redis (store mémoire)
    expect(payload.limit).toBe('300')
    expect(payload.remaining).toBe('299')
    // Le tier 2 s'est bien dégradé proprement, sans empêcher le démarrage
    expect(result.stderr).toContain('REDIS_URL non défini')
  }, 60000)
})
