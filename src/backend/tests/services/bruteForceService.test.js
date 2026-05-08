import { jest } from '@jest/globals'

// ─── Mock Prisma before any service import ────────────────────────────────────

const mockLoginAttempt = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsert: jest.fn(),
}

const mockPrisma = {
  loginAttempt: mockLoginAttempt,
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Import service after mocks ───────────────────────────────────────────────

const {
  isBlocked,
  recordFailedAttempt,
  resetAttempts,
  getRemainingAttempts,
  getRetryAfter,
} = await import('../../src/services/bruteForceService.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFutureDate(minutes = 15) {
  return new Date(Date.now() + minutes * 60 * 1000)
}

function makePastDate(minutes = 1) {
  return new Date(Date.now() - minutes * 60 * 1000)
}

const TEST_IP = '192.168.1.1'

// ─── isBlocked ────────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns false when no record exists for IP', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue(null)

    const result = await isBlocked(TEST_IP)
    expect(result).toBe(false)
  })

  it('returns false when lockedUntil is null', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 3,
      lockedUntil: null,
    })

    const result = await isBlocked(TEST_IP)
    expect(result).toBe(false)
  })

  it('returns false when lockedUntil is in the past (lock expired)', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makePastDate(1), // 1 minute ago
    })

    const result = await isBlocked(TEST_IP)
    expect(result).toBe(false)
  })

  it('returns true when lockedUntil is in the future', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makeFutureDate(15), // locked for 15 more minutes
    })

    const result = await isBlocked(TEST_IP)
    expect(result).toBe(true)
  })
})

// ─── recordFailedAttempt ──────────────────────────────────────────────────────

describe('recordFailedAttempt', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a new record with attempts=1 when no prior record exists', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue(null)
    mockLoginAttempt.create.mockResolvedValue({})

    await recordFailedAttempt(TEST_IP)

    expect(mockLoginAttempt.create).toHaveBeenCalledTimes(1)
    const callArg = mockLoginAttempt.create.mock.calls[0][0]
    expect(callArg.data.ip).toBe(TEST_IP)
    expect(callArg.data.attempts).toBe(1)
    expect(callArg.data.lockedUntil).toBeNull()
  })

  it('increments attempts when below threshold (no lock)', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 2,
      lockedUntil: null,
    })
    mockLoginAttempt.update.mockResolvedValue({})

    await recordFailedAttempt(TEST_IP)

    expect(mockLoginAttempt.update).toHaveBeenCalledTimes(1)
    const callArg = mockLoginAttempt.update.mock.calls[0][0]
    expect(callArg.data.attempts).toBe(3)
    expect(callArg.data.lockedUntil).toBeNull()
  })

  it('sets lockedUntil ~15 min in the future on the 5th failed attempt', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 4, // one more will hit the threshold
      lockedUntil: null,
    })
    mockLoginAttempt.update.mockResolvedValue({})

    const before = Date.now()
    await recordFailedAttempt(TEST_IP)
    const after = Date.now()

    expect(mockLoginAttempt.update).toHaveBeenCalledTimes(1)
    const callArg = mockLoginAttempt.update.mock.calls[0][0]
    expect(callArg.data.attempts).toBe(5)

    const lockedUntil = callArg.data.lockedUntil
    expect(lockedUntil).toBeInstanceOf(Date)

    // lockedUntil should be ~15 minutes from now
    const diffMs = lockedUntil.getTime() - before
    expect(diffMs).toBeGreaterThanOrEqual(14 * 60 * 1000) // at least 14 min
    expect(diffMs).toBeLessThanOrEqual(16 * 60 * 1000)    // at most 16 min
  })

  it('block after 5 attempts — IP is blocked after 5 consecutive failures', async () => {
    // Simulate 4 existing attempts, then record the 5th
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 4,
      lockedUntil: null,
    })
    mockLoginAttempt.update.mockResolvedValue({})

    await recordFailedAttempt(TEST_IP)

    const callArg = mockLoginAttempt.update.mock.calls[0][0]
    expect(callArg.data.attempts).toBe(5)
    expect(callArg.data.lockedUntil).toBeInstanceOf(Date)
    expect(callArg.data.lockedUntil.getTime()).toBeGreaterThan(Date.now())
  })

  it('uses a UUID v4 as the record id when creating', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue(null)
    mockLoginAttempt.create.mockResolvedValue({})

    await recordFailedAttempt(TEST_IP)

    const callArg = mockLoginAttempt.create.mock.calls[0][0]
    expect(callArg.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })
})

// ─── resetAttempts ────────────────────────────────────────────────────────────

describe('resetAttempts', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resets attempts to 0 and clears lockedUntil on success', async () => {
    mockLoginAttempt.upsert.mockResolvedValue({})

    await resetAttempts(TEST_IP)

    expect(mockLoginAttempt.upsert).toHaveBeenCalledTimes(1)
    const callArg = mockLoginAttempt.upsert.mock.calls[0][0]
    expect(callArg.update.attempts).toBe(0)
    expect(callArg.update.lockedUntil).toBeNull()
  })

  it('creates a clean record if none exists', async () => {
    mockLoginAttempt.upsert.mockResolvedValue({})

    await resetAttempts(TEST_IP)

    const callArg = mockLoginAttempt.upsert.mock.calls[0][0]
    expect(callArg.create.attempts).toBe(0)
    expect(callArg.create.lockedUntil).toBeNull()
    expect(callArg.create.ip).toBe(TEST_IP)
  })
})

// ─── getRemainingAttempts ─────────────────────────────────────────────────────

describe('getRemainingAttempts', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns MAX_ATTEMPTS (5) when no record exists', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue(null)

    const remaining = await getRemainingAttempts(TEST_IP)
    expect(remaining).toBe(5)
  })

  it('returns correct remaining count based on current attempts', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 3,
      lockedUntil: null,
    })

    const remaining = await getRemainingAttempts(TEST_IP)
    expect(remaining).toBe(2) // 5 - 3 = 2
  })

  it('returns 0 when IP is locked (lockedUntil in future)', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makeFutureDate(10),
    })

    const remaining = await getRemainingAttempts(TEST_IP)
    expect(remaining).toBe(0)
  })

  it('returns remaining attempts when lock has expired', async () => {
    // Lock expired — attempts still at 5 but lockedUntil is in the past
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makePastDate(5), // expired 5 minutes ago
    })

    const remaining = await getRemainingAttempts(TEST_IP)
    // 5 - 5 = 0, clamped to 0
    expect(remaining).toBe(0)
  })

  it('never returns a negative number', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 10, // more than MAX_ATTEMPTS
      lockedUntil: null,
    })

    const remaining = await getRemainingAttempts(TEST_IP)
    expect(remaining).toBeGreaterThanOrEqual(0)
  })
})

// ─── getRetryAfter ────────────────────────────────────────────────────────────

describe('getRetryAfter', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 0 when no record exists', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue(null)

    const seconds = await getRetryAfter(TEST_IP)
    expect(seconds).toBe(0)
  })

  it('returns 0 when lockedUntil is null', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 3,
      lockedUntil: null,
    })

    const seconds = await getRetryAfter(TEST_IP)
    expect(seconds).toBe(0)
  })

  it('returns 0 when lock has expired', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makePastDate(1),
    })

    const seconds = await getRetryAfter(TEST_IP)
    expect(seconds).toBe(0)
  })

  it('returns positive seconds when lock is active', async () => {
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makeFutureDate(15), // 15 minutes from now
    })

    const seconds = await getRetryAfter(TEST_IP)
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(15 * 60)
  })
})

// ─── Integration scenario: block after 5 attempts, unblock after 15 min ──────

describe('Integration scenario', () => {
  beforeEach(() => jest.clearAllMocks())

  it('unblock after 15 min — isBlocked returns false when lockedUntil is in the past', async () => {
    // Simulate a previously locked IP whose lock has now expired
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 5,
      lockedUntil: makePastDate(1), // lock expired 1 minute ago
    })

    const blocked = await isBlocked(TEST_IP)
    expect(blocked).toBe(false)
  })

  it('reset on success — after resetAttempts, getRemainingAttempts returns MAX', async () => {
    // After reset, findUnique returns a clean record
    mockLoginAttempt.upsert.mockResolvedValue({})
    mockLoginAttempt.findUnique.mockResolvedValue({
      ip: TEST_IP,
      attempts: 0,
      lockedUntil: null,
    })

    await resetAttempts(TEST_IP)
    const remaining = await getRemainingAttempts(TEST_IP)

    expect(remaining).toBe(5)
  })
})
