import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Mock authService avant tout import de l'app
const mockLoginUser = jest.fn()
jest.unstable_mockModule('../src/services/authService.js', () => ({
  loginUser: mockLoginUser,
}))

// Mock Prisma pour éviter les connexions DB réelles
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    superAdmin: { findUnique: jest.fn() },
    adminBorne: { findUnique: jest.fn() },
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  },
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')
const { default: express } = await import('express')
const { jwtAuthV2 } = await import('../src/middleware/jwtAuth.js')
const { requireRole } = await import('../src/middleware/roleAuth.js')

process.env.JWT_SECRET = 'test_jwt_secret'

// Helpers pour générer des tokens
const makeExpiredToken = (payload = { sub: 'uuid-1', role: 'SUPER_ADMIN' }) => {
  return jwt.sign(payload, 'test_jwt_secret', { expiresIn: -1 })
}

const makeToken = (payload = { sub: 'uuid-1', role: 'SUPER_ADMIN' }) => {
  return jwt.sign(payload, 'test_jwt_secret', { expiresIn: '1h' })
}

// Mini app pour tester les middlewares de rôle
const testApp = express()
testApp.use(express.json())
testApp.get('/test-superadmin', jwtAuthV2, requireRole('SUPER_ADMIN'), (req, res) =>
  res.json({ ok: true })
)
testApp.get('/test-adminborne', jwtAuthV2, requireRole('ADMIN_BORNE'), (req, res) =>
  res.json({ ok: true })
)

// ─── Validation du body ───────────────────────────────────────────────────────

describe('POST /api/auth/login — validation du body', () => {
  it('email manquant → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('email invalide → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pas-un-email', password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('password manquant → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

// ─── Login invalide ───────────────────────────────────────────────────────────

describe('POST /api/auth/login — identifiants invalides', () => {
  beforeEach(() => {
    mockLoginUser.mockReset()
  })

  it('mauvais identifiants → 401 avec message Identifiants invalides', async () => {
    mockLoginUser.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'mauvais_mdp' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Identifiants invalides')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'mauvais_mdp',
      context: 'backoffice',
    })
  })
})

// ─── Login valide ─────────────────────────────────────────────────────────────

describe('POST /api/auth/login — login valide', () => {
  beforeEach(() => {
    mockLoginUser.mockReset()
  })

  it('SuperAdmin → 200 avec token, role SUPER_ADMIN, expiresIn 8h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'SUPER_ADMIN',
      expiresIn: '8h',
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@example.com', password: 'correct_mdp' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('SUPER_ADMIN')
    expect(res.body.expiresIn).toBe('8h')
  })

  it('AdminBorne (contexte backoffice) → 200 avec role ADMIN_BORNE, expiresIn 8h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'ADMIN_BORNE',
      expiresIn: '8h',
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'adminborne@example.com', password: 'correct_mdp', context: 'backoffice' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('ADMIN_BORNE')
    expect(res.body.expiresIn).toBe('8h')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'adminborne@example.com',
      password: 'correct_mdp',
      context: 'backoffice',
    })
  })

  it('AdminBorne (contexte borne) → 200 avec role ADMIN_BORNE, expiresIn 24h', async () => {
    const fakeToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })
    mockLoginUser.mockResolvedValue({
      token: fakeToken,
      role: 'ADMIN_BORNE',
      expiresIn: '24h',
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'adminborne@example.com', password: 'correct_mdp', context: 'borne' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe(fakeToken)
    expect(res.body.role).toBe('ADMIN_BORNE')
    expect(res.body.expiresIn).toBe('24h')
    expect(mockLoginUser).toHaveBeenCalledWith({
      email: 'adminborne@example.com',
      password: 'correct_mdp',
      context: 'borne',
    })
  })
})

// ─── JWT expiré ───────────────────────────────────────────────────────────────

describe('JWT expiré sur une route protégée', () => {
  it('token expiré → 401 avec message JWT expired', async () => {
    const expiredToken = makeExpiredToken({ sub: 'uuid-1', role: 'SUPER_ADMIN' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${expiredToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('JWT expired')
  })
})

// ─── Rôle insuffisant ─────────────────────────────────────────────────────────

describe('Rôle insuffisant', () => {
  it('ADMIN_BORNE tente une route SUPER_ADMIN → 403 Accès refusé', async () => {
    const adminBorneToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${adminBorneToken}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Accès refusé')
  })

  it('SUPER_ADMIN accède à une route SUPER_ADMIN → 200', async () => {
    const superAdminToken = makeToken({ sub: 'uuid-super', role: 'SUPER_ADMIN' })

    const res = await request(testApp)
      .get('/test-superadmin')
      .set('Authorization', `Bearer ${superAdminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('ADMIN_BORNE accède à une route ADMIN_BORNE → 200', async () => {
    const adminBorneToken = makeToken({ sub: 'uuid-admin', role: 'ADMIN_BORNE' })

    const res = await request(testApp)
      .get('/test-adminborne')
      .set('Authorization', `Bearer ${adminBorneToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
