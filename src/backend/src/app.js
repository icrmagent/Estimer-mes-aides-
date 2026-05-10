import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { configurationRouter } from './routes/configuration.js'
import { submissionsRouter } from './routes/submissions.js'
import { authRouter } from './routes/auth.js'
import { requestLogger } from './middleware/requestLogger.js'
import { bornesRouter } from './routes/bornes.js'
import { bornesConfigRouter } from './routes/bornes-config.js'
import { adminBornesRouter } from './routes/admin-bornes.js'
import { formulairesRouter } from './routes/formulaires.js'
import { questionsRouter } from './routes/questions.js'
import { enregistrementsRouter } from './routes/enregistrements.js'
import { dashboardRouter } from './routes/dashboard.js'
import { partageRouter } from './routes/partage.js'
import { categoriesQuestionsRouter } from './routes/categories-questions.js'
import { canauxRouter } from './routes/canaux.js'
import { csrfProtectionMiddleware, generateToken } from './middleware/csrfProtection.js'
import { globalErrorHandler } from './lib/errorSanitizer.js'
import { ipBlockCheck } from './middleware/ipBlockMiddleware.js'
import logger from './lib/logger.js'
import { initSentry, isSentryEnabled, Sentry } from './lib/sentry.js'
import { prisma } from './lib/prisma.js'

// Task 29.2 — Initialize Sentry (conditional on SENTRY_DSN)
initSentry()

// Task 29.5 — Capture unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ message: 'Unhandled Promise Rejection', reason: String(reason) })
  if (isSentryEnabled()) {
    Sentry.captureException(reason)
  }
})

process.on('uncaughtException', (err) => {
  logger.error({ message: 'Uncaught Exception', error: err.message, stack: err.stack })
  if (isSentryEnabled()) {
    Sentry.captureException(err)
  }
  process.exit(1)
})

const app = express()

app.use(helmet())
app.use(compression())

// CORS — allow all origins in development, restrict to CORS_ALLOWED_ORIGINS in production
// CORS_ALLOWED_ORIGINS: comma-separated list of allowed origins (required in production)
const isProduction = process.env.NODE_ENV === 'production'
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : []

app.use(cors({
  origin: isProduction
    ? (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl)
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        return callback(new Error(`CORS: origin ${origin} not allowed`))
      }
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Task 29.3 — Sentry request handler before routes
if (isSentryEnabled()) {
  app.use(Sentry.Handlers.requestHandler())
}

app.use(requestLogger)

// IP block check — must run BEFORE rate limiter (ADR-1 / R20.6)
app.use(ipBlockCheck)

// Task 29.6 — Add user context (userId, role) to Sentry scope on authenticated requests
if (isSentryEnabled()) {
  app.use((req, _res, next) => {
    if (req.user) {
      Sentry.configureScope((scope) => {
        scope.setUser({
          id: req.user.sub ?? req.user.id,
          role: req.user.role,
        })
      })
    }
    next()
  })
}

// Task 29.7 / 31.5 — Health check with DB connectivity verification
app.get('/health', async (req, res) => {
  let dbStatus = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    dbStatus = 'error'
  }
  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    sentry: isSentryEnabled()
      ? 'enabled'
      : 'disabled — SENTRY_DSN not configured',
  })
})

// Public endpoint — generates and returns a CSRF token (no auth required)
// The token is also set in a cookie by csrf-csrf for the double-submit pattern
app.get('/api/csrf-token', (req, res) => {
  try {
    const token = generateToken(req, res)
    return res.json({ csrfToken: token })
  } catch (err) {
    // Task 28.6 — Use logger.error() in route error handlers
    logger.error({ message: '[CSRF TOKEN ERROR]', error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'CSRF_ERROR', message: 'Impossible de g\u00e9n\u00e9rer le token CSRF' },
    })
  }
})

// V1 routes (conservés) — no CSRF (backward compatibility)
app.use('/api/configuration', configurationRouter)
app.use('/api/submissions', submissionsRouter)

// V2 auth routes — no CSRF (login/refresh are public or use Bearer tokens)
app.use('/api/auth', authRouter)

// V2 Borne routes — no CSRF per ADR-4 (API key auth, not browser session)
// /api/enregistrements POST is borne-submitted data — must NOT have CSRF
app.use('/api/enregistrements', enregistrementsRouter)

// V2 Backoffice routes — CSRF protected per ADR-4
// All state-changing admin routes are grouped under csrfProtectionMiddleware
const backofficeRouter = express.Router()
backofficeRouter.use(csrfProtectionMiddleware)
backofficeRouter.use('/bornes', bornesRouter)
backofficeRouter.use('/bornes', bornesConfigRouter)       // /api/bornes/:id/config
backofficeRouter.use('/admin-bornes', adminBornesRouter)
backofficeRouter.use('/formulaires', formulairesRouter)
backofficeRouter.use('/formulaires', questionsRouter)     // /api/formulaires/:id/questions
backofficeRouter.use('/categories-questions', categoriesQuestionsRouter)
backofficeRouter.use('/dashboard', dashboardRouter)
backofficeRouter.use('/partage', partageRouter)           // /api/partage/jobs
backofficeRouter.use('/canaux', canauxRouter)

// Mount backoffice router at /api (legacy paths) and /api/backoffice (new canonical prefix)
app.use('/api', backofficeRouter)
app.use('/api/backoffice', backofficeRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Task 29.4 — Sentry error handler after routes (before global error handler)
if (isSentryEnabled()) {
  app.use(Sentry.Handlers.errorHandler())
}

// Global error handler — sanitizes Prisma errors, strips stack traces in production (P7, P8)
app.use(globalErrorHandler)

export default app
