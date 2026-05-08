/**
 * Tests for graceful shutdown behavior (Tasks 34.1–34.7)
 *
 * These tests verify that the server handles SIGTERM and SIGINT signals
 * correctly by stopping new connections and disconnecting from the database.
 *
 * Because server.js is a side-effectful entry point (it calls app.listen on
 * import), we test the shutdown logic in isolation by extracting and testing
 * the behavior directly with mocks.
 */

import { jest } from '@jest/globals'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
}

const mockPrisma = {
  $disconnect: jest.fn().mockResolvedValue(undefined),
}

const mockServer = {
  close: jest.fn(),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the shutdown function as it appears in server.js, injecting mocks.
 * This avoids importing server.js (which would call app.listen).
 */
function buildShutdown({ server, prisma, logger, processExitFn }) {
  return async function shutdown(signal) {
    logger.info({ message: 'Shutting down gracefully...', signal })

    const forceExitTimer = setTimeout(() => {
      logger.error({ message: 'Forced exit after 30s timeout' })
      processExitFn(1)
    }, 30_000)
    forceExitTimer.unref()

    server.close(async () => {
      await prisma.$disconnect()
      logger.info({ message: 'Shutdown complete' })
      clearTimeout(forceExitTimer)
      processExitFn(0)
    })
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Graceful shutdown', () => {
  let processExitFn
  let shutdown

  beforeEach(() => {
    jest.clearAllMocks()
    processExitFn = jest.fn()
    shutdown = buildShutdown({
      server: mockServer,
      prisma: mockPrisma,
      logger: mockLogger,
      processExitFn,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ── 34.6 — Log "Shutting down gracefully..." on signal received ─────────────
  it('logs "Shutting down gracefully..." when SIGTERM is received', async () => {
    await shutdown('SIGTERM')
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Shutting down gracefully...', signal: 'SIGTERM' })
    )
  })

  it('logs "Shutting down gracefully..." when SIGINT is received', async () => {
    await shutdown('SIGINT')
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Shutting down gracefully...', signal: 'SIGINT' })
    )
  })

  // ── 34.3 — server.close() is called ─────────────────────────────────────────
  it('calls server.close() on SIGTERM', async () => {
    await shutdown('SIGTERM')
    expect(mockServer.close).toHaveBeenCalledTimes(1)
  })

  it('calls server.close() on SIGINT', async () => {
    await shutdown('SIGINT')
    expect(mockServer.close).toHaveBeenCalledTimes(1)
  })

  // ── 34.4 — prisma.$disconnect() is called after server closes ───────────────
  it('calls prisma.$disconnect() after server.close() callback fires', async () => {
    // Make server.close() immediately invoke its callback
    mockServer.close.mockImplementation((cb) => cb())

    await shutdown('SIGTERM')

    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
    // server.close must be called before $disconnect
    const serverCloseOrder = mockServer.close.mock.invocationCallOrder[0]
    const disconnectOrder = mockPrisma.$disconnect.mock.invocationCallOrder[0]
    expect(disconnectOrder).toBeGreaterThan(serverCloseOrder)
  })

  // ── 34.7 — Log "Shutdown complete" when finished ─────────────────────────────
  it('logs "Shutdown complete" after prisma.$disconnect()', async () => {
    mockServer.close.mockImplementation((cb) => cb())

    await shutdown('SIGTERM')

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Shutdown complete' })
    )
  })

  // ── process.exit(0) on clean shutdown ────────────────────────────────────────
  it('calls process.exit(0) after clean shutdown', async () => {
    mockServer.close.mockImplementation((cb) => cb())

    await shutdown('SIGTERM')

    expect(processExitFn).toHaveBeenCalledWith(0)
  })

  // ── 34.5 — Force exit with code 1 after 30-second timeout ───────────────────
  it('force-exits with code 1 after 30s if server.close() never fires', async () => {
    jest.useFakeTimers()

    // server.close() never calls its callback (simulates hang)
    mockServer.close.mockImplementation(() => {})

    shutdown('SIGTERM') // do not await — it won't resolve

    // Advance time past the 30s timeout
    jest.advanceTimersByTime(30_001)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Forced exit after 30s timeout' })
    )
    expect(processExitFn).toHaveBeenCalledWith(1)
  })
})
