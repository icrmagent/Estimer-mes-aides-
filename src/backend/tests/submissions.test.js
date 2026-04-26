import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockSubmission = {
  id: 'uuid-1234',
  createdAt: new Date('2026-04-26T00:00:00Z'),
  configVersion: '1.0.0',
  synced: false,
  syncedAt: null,
  crmProjectId: null,
  values: [{ id: 1, submissionId: 'uuid-1234', fieldId: 2087, value: 'Dupont' }],
}

jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    configuration: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    submission: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')
const { prisma } = await import('../src/lib/prisma.js')

const VALID_KEY = 'ema_mobile_test'
process.env.API_KEY_MOBILE = VALID_KEY
process.env.JWT_SECRET = 'test_jwt_secret'

const makeToken = (payload = { role: 'crm' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })

// ─── POST /api/submissions ────────────────────────────────────────────────────

describe('POST /api/submissions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans x-api-key → 401', async () => {
    const res = await request(app).post('/api/submissions').send({})
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('corps vide → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({})
    expect(res.status).toBe(400)
  })

  it('configVersion manquant → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ values: [{ fieldId: 2087, value: 'Dupont' }] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('configVersion')
  })

  it('values vide → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [] })
    expect(res.status).toBe(400)
  })

  it('values sans fieldId → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ value: 'test' }] })
    expect(res.status).toBe(400)
  })

  it('données valides → 201 + id, createdAt, synced', async () => {
    prisma.submission.create.mockResolvedValue(mockSubmission)
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2087, value: 'Dupont' }] })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('uuid-1234')
    expect(res.body.synced).toBe(false)
    expect(res.body.configVersion).toBe('1.0.0')
    expect(res.body.createdAt).toBeDefined()
  })

  it('value tableau (multi-select) accepté → 201', async () => {
    prisma.submission.create.mockResolvedValue(mockSubmission)
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', VALID_KEY)
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2303, value: ['Isolation', 'Chauffage'] }] })
    expect(res.status).toBe(201)
  })
})

// ─── GET /api/submissions ─────────────────────────────────────────────────────

describe('GET /api/submissions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans JWT → 401', async () => {
    const res = await request(app).get('/api/submissions')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing JWT')
  })

  it('JWT invalide → 401', async () => {
    const res = await request(app)
      .get('/api/submissions')
      .set('Authorization', 'Bearer bad.token.here')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid JWT')
  })

  it('JWT valide → 200 avec data + total + page + limit', async () => {
    prisma.submission.findMany.mockResolvedValue([mockSubmission])
    prisma.submission.count.mockResolvedValue(1)
    const res = await request(app)
      .get('/api/submissions')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.total).toBe(1)
    expect(res.body.page).toBe(1)
    expect(res.body.limit).toBe(50)
  })

  it('?synced=false filtre correctement', async () => {
    prisma.submission.findMany.mockResolvedValue([])
    prisma.submission.count.mockResolvedValue(0)
    const res = await request(app)
      .get('/api/submissions?synced=false')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('?synced=invalid → 400', async () => {
    const res = await request(app)
      .get('/api/submissions?synced=maybe')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })

  it('?since=2026-04-01 accepté → 200', async () => {
    prisma.submission.findMany.mockResolvedValue([mockSubmission])
    prisma.submission.count.mockResolvedValue(1)
    const res = await request(app)
      .get('/api/submissions?since=2026-04-01')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
  })

  it('?since=format-invalide → 400', async () => {
    const res = await request(app)
      .get('/api/submissions?since=01-04-2026')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })

  it('?limit=300 (> max) → 400', async () => {
    const res = await request(app)
      .get('/api/submissions?limit=300')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })
})

// ─── PUT /api/submissions/:id/sync ───────────────────────────────────────────

describe('PUT /api/submissions/:id/sync', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sans JWT → 401', async () => {
    const res = await request(app).put('/api/submissions/uuid-1234/sync')
    expect(res.status).toBe(401)
  })

  it('ID inexistant → 404', async () => {
    const prismaError = Object.assign(new Error('Not found'), { code: 'P2025' })
    prisma.submission.update.mockRejectedValue(prismaError)
    const res = await request(app)
      .put('/api/submissions/nonexistent/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('nonexistent')
  })

  it('sync sans crmProjectId → 200 + synced=true', async () => {
    const synced = { ...mockSubmission, synced: true, syncedAt: new Date('2026-04-26T01:00:00Z'), crmProjectId: null }
    prisma.submission.update.mockResolvedValue(synced)
    const res = await request(app)
      .put('/api/submissions/uuid-1234/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.synced).toBe(true)
    expect(res.body.syncedAt).toBeDefined()
  })

  it('sync avec crmProjectId → 200 + crmProjectId présent', async () => {
    const synced = { ...mockSubmission, synced: true, syncedAt: new Date(), crmProjectId: 'crm-933' }
    prisma.submission.update.mockResolvedValue(synced)
    const res = await request(app)
      .put('/api/submissions/uuid-1234/sync')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ crmProjectId: 'crm-933' })
    expect(res.status).toBe(200)
    expect(res.body.crmProjectId).toBe('crm-933')
  })
})
