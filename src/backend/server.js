// tracer.js MUST be the very first import — required for dd-trace auto-instrumentation
import './src/lib/tracer.js'

import 'dotenv/config'
import { validateEnv } from './src/lib/validateEnv.js'

// Validate all required environment variables before starting the server.
// Exits with code 1 if any required variable is missing.
validateEnv()

import app from './src/app.js'
import { prisma } from './src/lib/prisma.js'
import { startQueueWorker } from './src/services/queueWorker.js'
import logger from './src/lib/logger.js'
import { shutdown } from './src/lib/shutdown.js'

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
  logger.info({ message: `Server running on port ${PORT}`, port: PORT, env: process.env.NODE_ENV || 'development' })

  // Démarrer le queue worker pour le partage I-CRM asynchrone (Phase 8)
  if (process.env.NODE_ENV !== 'test') {
    startQueueWorker()
  }
})

// Tasks 34.1 — Graceful shutdown via shared shutdown handler
// pusherClient is optional — pass null if not used at server level
process.on('SIGTERM', () => shutdown('SIGTERM', server, prisma, null, logger))
process.on('SIGINT',  () => shutdown('SIGINT',  server, prisma, null, logger))
