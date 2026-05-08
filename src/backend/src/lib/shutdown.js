/**
 * shutdown.js — Graceful shutdown handler
 *
 * Usage in server.js:
 *   import { shutdown } from './src/lib/shutdown.js'
 *   process.on('SIGTERM', () => shutdown('SIGTERM', server, prisma, pusherClient, logger))
 *   process.on('SIGINT',  () => shutdown('SIGINT',  server, prisma, pusherClient, logger))
 */

/** Maximum time (ms) to wait for in-flight requests before forcing exit. */
const SHUTDOWN_TIMEOUT = 30_000

/**
 * Gracefully shut down the application.
 *
 * @param {string}      signal       - OS signal that triggered shutdown (e.g. 'SIGTERM')
 * @param {import('http').Server} server - Node HTTP server returned by app.listen()
 * @param {object}      prisma       - PrismaClient instance
 * @param {object|null} pusherClient - Optional Pusher server client (may be null/undefined)
 * @param {object}      logger       - Winston logger (or any object with .info() / .error())
 */
export async function shutdown(signal, server, prisma, pusherClient, logger) {
  logger.info({ message: `Shutting down gracefully... (signal: ${signal})`, signal })

  // Force exit after SHUTDOWN_TIMEOUT if something hangs
  const forceExitTimer = setTimeout(() => {
    logger.error({ message: `Forced exit after ${SHUTDOWN_TIMEOUT / 1000}s timeout`, signal })
    process.exit(1)
  }, SHUTDOWN_TIMEOUT)

  // Allow the Node event loop to exit naturally once everything else is done
  forceExitTimer.unref()

  // Stop accepting new connections; wait for existing ones to finish
  server.close(async () => {
    try {
      await prisma.$disconnect()

      if (pusherClient && typeof pusherClient.disconnect === 'function') {
        pusherClient.disconnect()
      }

      logger.info({ message: 'Shutdown complete', signal })
      clearTimeout(forceExitTimer)
      process.exit(0)
    } catch (err) {
      logger.error({ message: 'Error during shutdown', signal, error: err.message, stack: err.stack })
      clearTimeout(forceExitTimer)
      process.exit(1)
    }
  })
}
