import { jest } from '@jest/globals'

// Mock Prisma avant tout import de l'app
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  },
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
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
