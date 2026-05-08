/**
 * tests/lib/validationService.test.js
 *
 * Unit tests for src/lib/validationService.js — validatePrimaryColor()
 *
 * Covers:
 *  - Default color (#5B2D8E) is accepted when PRIMARY_COLOR env var is not set
 *  - Custom color via PRIMARY_COLOR env var is accepted (via mocked brand config)
 *  - Wrong color returns false (→ 400 INVALID_PRIMARY_COLOR in route handlers)
 *  - Edge cases: undefined, null, empty string, wrong case
 *
 * Validates: Requirements 9.2, 9.5 (P15)
 */

import { jest } from '@jest/globals'

// ─── Tests using the real ALLOWED_PRIMARY_COLOR (default #5B2D8E) ─────────────
// These tests run without mocking — they rely on PRIMARY_COLOR not being set
// in the test environment, so ALLOWED_PRIMARY_COLOR defaults to '#5B2D8E'.

describe('validatePrimaryColor — default color (#5B2D8E)', () => {
  let validatePrimaryColor

  beforeAll(async () => {
    // Ensure PRIMARY_COLOR is not set so the default applies
    delete process.env.PRIMARY_COLOR
    const mod = await import('../../src/lib/validationService.js')
    validatePrimaryColor = mod.validatePrimaryColor
  })

  test('accepts #5B2D8E (the default allowed color)', () => {
    expect(validatePrimaryColor('#5B2D8E')).toBe(true)
  })

  test('rejects a wrong color (#FF0000)', () => {
    expect(validatePrimaryColor('#FF0000')).toBe(false)
  })

  test('rejects the old V1 color #5C2DD3', () => {
    expect(validatePrimaryColor('#5C2DD3')).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(validatePrimaryColor(undefined)).toBe(false)
  })

  test('returns false for null', () => {
    expect(validatePrimaryColor(null)).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(validatePrimaryColor('')).toBe(false)
  })

  test('is case-sensitive — lowercase #5b2d8e is rejected', () => {
    // ALLOWED_PRIMARY_COLOR is '#5B2D8E' (uppercase) — lowercase must not match
    expect(validatePrimaryColor('#5b2d8e')).toBe(false)
  })
})

// ─── Tests using a custom ALLOWED_PRIMARY_COLOR (via mocked brand config) ─────
// ESM modules cache ALLOWED_PRIMARY_COLOR at load time, so we mock the brand
// module to simulate a custom PRIMARY_COLOR env var value.

describe('validatePrimaryColor — custom color via env var (mocked brand config)', () => {
  const CUSTOM_COLOR = '#123456'

  beforeAll(async () => {
    jest.unstable_mockModule('../../src/config/brand.js', () => ({
      ALLOWED_PRIMARY_COLOR: CUSTOM_COLOR,
    }))
  })

  afterAll(() => {
    jest.resetModules()
  })

  test('accepts the custom color when PRIMARY_COLOR env var is set to #123456', async () => {
    const { validatePrimaryColor } = await import('../../src/lib/validationService.js?custom=1')
    // Note: since ESM caches the real module, we test the logic directly
    // by verifying the function compares its argument against ALLOWED_PRIMARY_COLOR.
    // The mock above sets ALLOWED_PRIMARY_COLOR = '#123456'.
    // We re-import with a cache-busting query param to get the mocked version.
    expect(validatePrimaryColor(CUSTOM_COLOR)).toBe(true)
  })

  test('rejects #5B2D8E when custom color is #123456', async () => {
    const { validatePrimaryColor } = await import('../../src/lib/validationService.js?custom=2')
    expect(validatePrimaryColor('#5B2D8E')).toBe(false)
  })
})
