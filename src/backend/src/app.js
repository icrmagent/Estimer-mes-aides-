import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { configurationRouter } from './routes/configuration.js'
import { submissionsRouter } from './routes/submissions.js'
import { authRouter } from './routes/auth.js'
import { requestLogger } from './middleware/requestLogger.js'
import { bornesRouter, borneSessionRouter } from './routes/bornes.js'
import { bornesConfigRouter } from './routes/bornes-config.js'
import { adminBornesRouter } from './routes/admin-bornes.js'
import { formulairesRouter } from './routes/formulaires.js'
import { questionsRouter } from './routes/questions.js'
import { enregistrementsRouter } from './routes/enregistrements.js'
import { dashboardRouter } from './routes/dashboard.js'
import { partageRouter } from './routes/partage.js'
import { categoriesQuestionsRouter } from './routes/categories-questions.js'
import { canauxRouter } from './routes/canaux.js'
import { ecransVeilleRouter } from './routes/ecrans-veille.js'
import { csrfProtectionMiddleware, issueCsrfToken } from './middleware/csrfProtection.js'
import { globalErrorHandler } from './lib/errorSanitizer.js'
import { ipBlockCheck } from './middleware/ipBlockMiddleware.js'
import {
  globalLimiter,
  submissionsLimiter,
  enregistrementsLimiter,
} from './middleware/rateLimit.js'
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

// ─── Trust proxy ────────────────────────────────────────────────────────────
//
// La chaîne réelle en production comporte DEUX proxies qui ajoutent chacun une
// entrée à X-Forwarded-For :
//     client → edge Cloudflare → routeur/LB Render → cette application
// (les réponses portent bien `Server: cloudflare` ET `x-render-origin-server: Render`).
//
// Express interprète une valeur NUMÉRIQUE n comme « faire confiance aux n
// proxies les plus proches du serveur », et prend comme req.ip la (n+1)-ième
// adresse en partant de la droite de X-Forwarded-For. Conséquences mesurées :
//
//   XFF = "203.0.113.7, 172.68.x.y"   (client, puis edge Cloudflare ajouté par Render)
//     n=1    → req.ip = 172.68.x.y  → IP d'edge Cloudflare, DIFFÉRENTE d'une
//              requête à l'autre. C'est ce qui rendait la validation CSRF non
//              déterministe (~8 échecs 403 CSRF_INVALID sur 10) et ce qui rend
//              tout rate limiting par IP inopérant (chaque requête = un compteur).
//     n=2    → req.ip = 203.0.113.7 → vraie IP client, stable.
//
// Pourquoi 2 et pas `true` / une valeur plus grande : avec `true` (ou n ≥ 3),
// Express remonte jusqu'à l'entrée la plus à gauche de X-Forwarded-For, or
// cette entrée est fournie par le CLIENT. Un client envoyant
// `X-Forwarded-For: 1.2.3.4` se ferait alors passer pour 1.2.3.4 — contournement
// direct du blocage d'IP et du rate limiting. Avec le compte de sauts EXACT (2),
// l'entrée forgée est repoussée vers la gauche et purement ignorée : la valeur
// lue reste celle écrite par l'edge Cloudflare, que le client ne contrôle pas.
//
// Pourquoi un compte de sauts et pas une liste d'adresses de confiance : les
// plages d'edge Cloudflare (~15 préfixes, révisées régulièrement) et les IP
// internes du LB Render (non documentées, dynamiques) devraient être maintenues
// à la main ; une plage périmée casserait silencieusement la résolution d'IP.
//
// En dev/test il n'y a aucun proxy devant l'application : la valeur par défaut
// est 0 (aucune confiance), sinon un appelant local pourrait forger son IP.
// TRUST_PROXY_HOPS permet de suivre un changement de topologie d'hébergement
// sans modifier le code.
export function resolveTrustProxyHops(env = process.env) {
  const fallback = env.NODE_ENV === 'production' ? 2 : 0
  const raw = env.TRUST_PROXY_HOPS
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback
  }
  const parsed = Number.parseInt(String(raw).trim(), 10)
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== String(raw).trim()) {
    logger.warn({
      message: '[TRUST PROXY] TRUST_PROXY_HOPS invalide, valeur par défaut appliquée',
      received: String(raw),
      applied: fallback,
    })
    return fallback
  }
  return parsed
}

app.set('trust proxy', resolveTrustProxyHops())

app.use(helmet())
app.use(compression())

// CORS — allow all origins in development, restrict to CORS_ALLOWED_ORIGINS in production
// CORS_ALLOWED_ORIGINS: comma-separated list of allowed origins (required in production)
// Always-allowed origins (system, non-configurable) :
//  - https://appassets.androidplatform.net : WebViewAssetLoader Android (APK borne)
const isProduction = process.env.NODE_ENV === 'production'
const SYSTEM_ALLOWED_ORIGINS = ['https://appassets.androidplatform.net']
const allowedOrigins = [
  ...SYSTEM_ALLOWED_ORIGINS,
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : []),
]

app.use(cors({
  origin: isProduction
    ? (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl)
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        return callback(new Error(`CORS: origin ${origin} not allowed`))
      }
    // En dev : refléter l'origine de la requête. '*' est incompatible avec credentials:true.
    : (origin, callback) => callback(null, origin ?? true),
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
//
// F2 — Sonde DB bornée dans le temps.
// Sans timeout explicite, `$queryRaw` s'appuie sur les délais internes de Prisma
// (~2 s mesurées quand la base est injoignable). Le health check de Render et le
// job `curl -fsS $BACKEND_URL/health` de deploy.yml doivent trancher vite.
export const HEALTH_DB_TIMEOUT_MS =
  Number.parseInt(process.env.HEALTH_DB_TIMEOUT_MS ?? '', 10) || 1000

/**
 * Sonde la base via `SELECT 1`, bornée par un timeout explicite.
 * @param {number} [timeoutMs]
 * @returns {Promise<'ok'|'error'>}
 */
export async function probeDatabase(timeoutMs = HEALTH_DB_TIMEOUT_MS) {
  let timer
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`health db probe timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
        if (typeof timer?.unref === 'function') timer.unref()
      }),
    ])
    return 'ok'
  } catch (err) {
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

// F2 — Le corps JSON est inchangé (mêmes clés, mêmes valeurs), seul le code HTTP
// devient 503 quand la base n'est pas 'ok' : un consommateur qui ne lit que le
// statut HTTP (Render, curl -fsS) doit voir le service comme indisponible.
app.get('/health', async (req, res) => {
  const dbStatus = await probeDatabase()
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    sentry: isSentryEnabled()
      ? 'enabled'
      : 'disabled — SENTRY_DSN not configured',
  })
})

// Rate limiting tier 1 — monté APRÈS ipBlockCheck (ADR-1 / R20.6) et APRÈS la
// route /health, qui reste ainsi hors de portée du limiteur même si la liste
// PROBE_PATHS venait à changer.
app.use(globalLimiter)

// Public endpoint — generates and returns a CSRF token (no auth required)
// Deux cookies sont posés : `x-csrf-token` (paire token+hash, lisible par le JS
// client) et `x-csrf-session` (identifiant de session opaque, httpOnly) auquel
// le hash est lié. Le client doit renvoyer les deux — fetch/axios en
// `credentials: 'include'` — plus l'en-tête X-CSRF-Token sur les écritures.
app.get('/api/csrf-token', (req, res) => {
  try {
    const token = issueCsrfToken(req, res)
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
app.use('/api/submissions', submissionsLimiter, submissionsRouter)

// V2 auth routes — no CSRF (login/refresh are public or use Bearer tokens)
app.use('/api/auth', authRouter)

// V2 Borne routes — no CSRF per ADR-4 (Bearer JWT auth, not browser session)
// /api/enregistrements POST    : données soumises par la borne
// /api/bornes/:id/session POST/DELETE : sync estConnectee côté borne (kiosque)
app.use('/api/enregistrements', enregistrementsLimiter, enregistrementsRouter)
app.use('/api/bornes', borneSessionRouter)

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
backofficeRouter.use('/ecrans-veille', ecransVeilleRouter)

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
