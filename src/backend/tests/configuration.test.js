import { jest } from '@jest/globals'

const mockConfig = {
  id: 1,
  version: '1.0.0',
  updatedAt: new Date('2026-04-26T00:00:00Z'),
  formDefinition: { tabs: [], categories: [] },
}

const mockGetConfiguration = jest.fn()

jest.unstable_mockModule('../src/services/configService.js', () => ({
  getConfiguration: mockGetConfiguration,
  invalidateConfigCache: jest.fn(),
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

const VALID_KEY = 'ema_mobile_test'
process.env.API_KEY_MOBILE = VALID_KEY

describe('GET /api/configuration', () => {
  beforeEach(() => {
    mockGetConfiguration.mockReset()
  })

  it('sans x-api-key → 401', async () => {
    const res = await request(app).get('/api/configuration')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('avec mauvaise x-api-key → 401', async () => {
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', 'wrong-key')
    expect(res.status).toBe(401)
  })

  it('aucune config en base → 404', async () => {
    mockGetConfiguration.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('No configuration found')
  })

  it('config existante → 200 avec version + formDefinition', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1.0.0')
    expect(res.body.formDefinition).toBeDefined()
    expect(res.headers['etag']).toBe('"1.0.0"')
    expect(res.headers['cache-control']).toContain('max-age=3600')
  })

  it('If-None-Match correspondant → 304 Not Modified', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
      .set('If-None-Match', '"1.0.0"')
    expect(res.status).toBe(304)
  })

  it('If-None-Match différent → 200', async () => {
    mockGetConfiguration.mockResolvedValue(mockConfig)
    const res = await request(app)
      .get('/api/configuration')
      .set('x-api-key', VALID_KEY)
      .set('If-None-Match', '"0.9.0"')
    expect(res.status).toBe(200)
  })
})
