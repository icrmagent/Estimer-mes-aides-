/**
 * tests/lib/crmFieldIds.test.js
 *
 * Unit tests for src/lib/crmFieldIds.js
 *
 * Covers:
 *  - VALID_CRM_FIELD_IDS exports the correct 23 IDs
 *  - validateCRMFieldIds() returns empty array when all IDs are valid
 *  - validateCRMFieldIds() returns invalid IDs when none are valid
 *  - validateCRMFieldIds() returns only the invalid IDs in a mixed array
 *  - Edge cases: empty array, non-array input
 */

const { VALID_CRM_FIELD_IDS, validateCRMFieldIds } = await import(
  '../../src/lib/crmFieldIds.js'
)

describe('VALID_CRM_FIELD_IDS', () => {
  test('exports an array of 23 IDs', () => {
    expect(Array.isArray(VALID_CRM_FIELD_IDS)).toBe(true)
    expect(VALID_CRM_FIELD_IDS).toHaveLength(23)
  })

  test('contains all required CRM field IDs', () => {
    const expected = [
      2262, 2087, 2088, 2217, 2089, 2090, 2015, 2016,
      2294, 2293, 2292, 2306, 2307, 2296, 2298, 2300,
      2301, 2302, 2297, 2299, 2303, 2304, 2305,
    ]
    expect(VALID_CRM_FIELD_IDS).toEqual(expected)
  })

  test('contains only numbers', () => {
    VALID_CRM_FIELD_IDS.forEach((id) => {
      expect(typeof id).toBe('number')
    })
  })

  test('has no duplicate IDs', () => {
    const unique = new Set(VALID_CRM_FIELD_IDS)
    expect(unique.size).toBe(VALID_CRM_FIELD_IDS.length)
  })
})

describe('validateCRMFieldIds', () => {
  // ─── All valid ───────────────────────────────────────────────────────────────

  test('returns empty array when all IDs are valid', () => {
    const result = validateCRMFieldIds([2087, 2088, 2089])
    expect(result).toEqual([])
  })

  test('returns empty array for a single valid ID', () => {
    expect(validateCRMFieldIds([2262])).toEqual([])
  })

  test('returns empty array when given the full valid list', () => {
    const result = validateCRMFieldIds([...VALID_CRM_FIELD_IDS])
    expect(result).toEqual([])
  })

  // ─── All invalid ─────────────────────────────────────────────────────────────

  test('returns the invalid ID when given a single invalid ID', () => {
    const result = validateCRMFieldIds([9999])
    expect(result).toEqual([9999])
  })

  test('returns all IDs when none are valid', () => {
    const result = validateCRMFieldIds([1111, 2222, 3333])
    expect(result).toEqual([1111, 2222, 3333])
  })

  // ─── Mixed ───────────────────────────────────────────────────────────────────

  test('returns only the invalid IDs from a mixed array', () => {
    // 2087 (Nom) and 2088 (Prénom) are valid; 9999 and 1234 are not
    const result = validateCRMFieldIds([2087, 9999, 2088, 1234])
    expect(result).toEqual([9999, 1234])
  })

  test('preserves order of invalid IDs in the result', () => {
    const result = validateCRMFieldIds([3333, 2087, 1111, 2088, 2222])
    expect(result).toEqual([3333, 1111, 2222])
  })

  // ─── Edge cases ──────────────────────────────────────────────────────────────

  test('returns empty array for an empty input array', () => {
    expect(validateCRMFieldIds([])).toEqual([])
  })

  test('returns empty array when input is not an array (null)', () => {
    expect(validateCRMFieldIds(null)).toEqual([])
  })

  test('returns empty array when input is not an array (undefined)', () => {
    expect(validateCRMFieldIds(undefined)).toEqual([])
  })

  test('returns empty array when input is not an array (string)', () => {
    expect(validateCRMFieldIds('2087')).toEqual([])
  })

  test('returns empty array when input is not an array (number)', () => {
    expect(validateCRMFieldIds(2087)).toEqual([])
  })

  test('treats string IDs as invalid (IDs must be numbers)', () => {
    // '2087' as a string is not strictly equal to 2087 (number)
    const result = validateCRMFieldIds(['2087'])
    expect(result).toEqual(['2087'])
  })
})
