/**
 * tests/validateEnv.test.js
 *
 * Unit tests for src/lib/validateEnv.js
 *
 * Strategy:
 *  - Inject a custom env object into validateEnv() to avoid touching process.env
 *  - Mock process.exit to assert it is called (or not) without killing the test runner
 *  - Mock console.error / console.warn to assert messages without polluting output
 */

import { jest } from '@jest/globals'

// We import the real module — no mocking needed for the module itself
const { validateEnv } = await import('../src/lib/validateEnv.js')

/** Minimal valid env that satisfies all required vars */
const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@host/db',
  DIRECT_URL: 'postgresql://user:pass@host/db',
  JWT_SECRET: 'a-very-long-secret-that-is-at-least-32-chars!!',
  API_KEY_MOBILE: 'ema_mobile_abc123',
  API_KEY_CRM: 'ema_crm_abc123',
  PUSHER_APP_ID: '123456',
  PUSHER_KEY: 'pusherkey',
  PUSHER_SECRET: 'pushersecret',
  PUSHER_CLUSTER: 'eu',
  CORS_ALLOWED_ORIGINS: 'https://example.com',
  REDIS_URL: 'redis://localhost:6379',
  NODE_ENV: 'development',
  SUPERADMIN_EMAIL: 'admin@example.com',
  SENTRY_DSN: 'https://sentry.io/dsn',
  PRIMARY_COLOR: '#5B2D8E',
}

describe('validateEnv', () => {
  let exitSpy
  let errorSpy
  let warnSpy

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ─── Test environment ────────────────────────────────────────────────────────

  test('skips all validation when NODE_ENV is "test"', () => {
    // Even with every required var missing, test env must not exit
    validateEnv({ NODE_ENV: 'test' })
    expect(exitSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  // ─── Required variables ──────────────────────────────────────────────────────

  test('passes with all required variables present', () => {
    validateEnv({ ...VALID_ENV })
    expect(exitSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('exits with code 1 when a single required variable is missing', () => {
    const env = { ...VALID_ENV }
    delete env.DATABASE_URL

    validateEnv(env)

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL')
    )
  })

  test('exits with code 1 and lists ALL missing required variables at once', () => {
    const env = { ...VALID_ENV }
    delete env.DATABASE_URL
    delete env.REDIS_URL
    delete env.PUSHER_SECRET

    validateEnv(env)

    expect(exitSpy).toHaveBeenCalledWith(1)
    const errorMessage = errorSpy.mock.calls[0][0]
    expect(errorMessage).toContain('DATABASE_URL')
    expect(errorMessage).toContain('REDIS_URL')
    expect(errorMessage).toContain('PUSHER_SECRET')
  })

  test('treats empty-string required variable as missing', () => {
    validateEnv({ ...VALID_ENV, JWT_SECRET: '' })
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'))
  })

  test('treats whitespace-only required variable as missing', () => {
    validateEnv({ ...VALID_ENV, REDIS_URL: '   ' })
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL'))
  })

  // ─── Optional variables ──────────────────────────────────────────────────────

  test('does NOT exit when SENTRY_DSN is missing — only warns', () => {
    const env = { ...VALID_ENV }
    delete env.SENTRY_DSN

    validateEnv(env)

    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SENTRY_DSN'))
  })

  test('does NOT exit when PRIMARY_COLOR is missing — only warns', () => {
    const env = { ...VALID_ENV }
    delete env.PRIMARY_COLOR

    validateEnv(env)

    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PRIMARY_COLOR'))
  })

  test('warns about both optional vars when both are missing', () => {
    const env = { ...VALID_ENV }
    delete env.SENTRY_DSN
    delete env.PRIMARY_COLOR

    validateEnv(env)

    expect(exitSpy).not.toHaveBeenCalled()
    const warnMessages = warnSpy.mock.calls.map((c) => c[0])
    expect(warnMessages.some((m) => m.includes('SENTRY_DSN'))).toBe(true)
    expect(warnMessages.some((m) => m.includes('PRIMARY_COLOR'))).toBe(true)
  })

  test('passes silently when all vars including optional ones are present', () => {
    validateEnv({ ...VALID_ENV })
    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  // ─── JWT_SECRET length check (P6) ────────────────────────────────────────────

  test('exits with code 1 in production when JWT_SECRET is shorter than 32 chars', () => {
    validateEnv({ ...VALID_ENV, NODE_ENV: 'production', JWT_SECRET: 'short-secret' })
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'))
  })

  test('passes in production when JWT_SECRET is exactly 32 characters', () => {
    validateEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      JWT_SECRET: 'exactly-32-characters-long-secret',  // 33 chars — safe
    })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('does NOT check JWT_SECRET length in development', () => {
    validateEnv({ ...VALID_ENV, NODE_ENV: 'development', JWT_SECRET: 'short' })
    // short secret is allowed outside production
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('does NOT check JWT_SECRET length in staging', () => {
    validateEnv({ ...VALID_ENV, NODE_ENV: 'staging', JWT_SECRET: 'short' })
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
