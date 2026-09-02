import { jest } from '@jest/globals'

// Mock Prisma avant tout import de l'app
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

const { default: request } = await import('supertest')
const { default: app, probeDatabase } = await import('../src/app.js')
const { prisma } = await import('../src/lib/prisma.js')

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
  })

  // F2 — un /health qui repond 200 sur une base morte rend le healthcheck
  // Render et le `curl -fsS $BACKEND_URL/health` de deploy.yml aveugles.
  it('should return 503 with status degraded when the DB is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.db).toBe('error')
    expect(res.body.timestamp).toBeDefined()
  })

  it('should return 200 again once the DB answers', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.db).toBe('ok')
  })

  // F2 — la sonde DB est bornee : elle ne doit pas attendre le timeout interne
  // de Prisma (~2 s mesurees) quand la base ne repond pas.
  it('probeDatabase gives up on the configured timeout instead of hanging', async () => {
    prisma.$queryRaw.mockImplementationOnce(() => new Promise(() => {}))

    const startedAt = Date.now()
    const status = await probeDatabase(50)
    const elapsed = Date.now() - startedAt

    expect(status).toBe('error')
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('GET /unknown-route', () => {
  it('should return 404', async () => {
    const res = await request(app).get('/api/unknown')
    expect(res.status).toBe(404)
  })
})

describe('Auth middleware', () => {
  it('GET /api/configuration sans x-api-key → 401', async () => {
    const res = await request(app).get('/api/configuration')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('GET /api/submissions sans JWT → 401', async () => {
    const res = await request(app).get('/api/submissions')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing JWT')
  })
})
