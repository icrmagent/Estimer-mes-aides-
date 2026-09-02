/**
 * ipBlockMiddleware.js
 *
 * Two-tier rate limiting per ADR-1 / R20.6:
 *
 * Tier 1 (express-rate-limit — voir `rateLimit.js` pour les seuils et leur
 *   justification) : compteurs par IP, 429 au-delà du seuil
 * Tier 2 (this file): IP blocked for 1 hour after 10 rate-limit violations within 1 hour
 *
 * Le tier 1 est le SEUL appelant de `trackRateLimitViolation()` : sans lui monté,
 * `ipBlockCheck` ne peut jamais bloquer quoi que ce soit.
 *
 * Redis is OPTIONAL. When REDIS_URL is absent or unreachable, tier 2 degrades to a
 * no-op: the backend still starts and still serves traffic (tier 1 remains active).
 *
 * Robustness guarantees (chantier 2c):
 *  - An 'error' listener is attached BEFORE connecting, so ioredis never falls back
 *    to its own `[ioredis] Unhandled error event` console spam (measured: 52 lines
 *    in 66 s against a closed port, i.e. ~68 000 lines/day).
 *  - Redis errors are logged at most once per REDIS_ERROR_LOG_INTERVAL_MS, with a
 *    count of the occurrences suppressed in between.
 *  - The degradation itself is logged exactly once per outage.
 *  - retryStrategy is bounded (REDIS_MAX_RETRIES) and the client is disconnected on
 *    failure, so no unbounded reconnection loop survives in the background.
 *  - Connection attempts NEVER block a request: a request served while Redis is down
 *    or still connecting simply skips tier 2 (fail open).
 *
 * Mount order in app.js:
 *   app.use(ipBlockCheck)   ← FIRST
 *   app.use(rateLimiter)    ← SECOND
 */

/** Maximum reconnection attempts before ioredis gives up and emits 'end'. */
const REDIS_MAX_RETRIES = 3
/** Backoff step between reconnection attempts. */
const REDIS_RETRY_STEP_MS = 200
/** Upper bound on a single reconnection backoff. */
const REDIS_RETRY_MAX_MS = 1000
/** TCP connect timeout for a single attempt. */
const REDIS_CONNECT_TIMEOUT_MS = 2000
/** Minimum delay between two Redis error log lines (throttling). */
const REDIS_ERROR_LOG_INTERVAL_MS = 15 * 60 * 1000
/** Delay before a new background connection attempt after a failure (self-healing). */
const REDIS_REINIT_COOLDOWN_MS = 60 * 1000

/** Connected client, or null when tier 2 is degraded. */
let redisClient = null
/** In-flight background connection attempt (never awaited by a request). */
let initInFlight = null
/** Epoch ms before which no new connection attempt is made. */
let nextInitAllowedAt = 0
/** True once the current outage has been reported — reset on successful connect. */
let degradationLogged = false
/** Epoch ms of the last Redis error line actually written. */
let lastErrorLogAt = 0
/** Redis errors swallowed by the throttle since the last written line. */
let suppressedErrorCount = 0
/** True while closeIpBlockRedis() runs, so a deliberate close is not reported as an outage. */
let closingOnPurpose = false

/**
 * Log the tier-2 degradation exactly once per outage.
 * @param {string} reason
 */
function logDegradation(reason) {
  if (degradationLogged) return
  degradationLogged = true
  console.warn(`[ipBlock] rate-limiting tier-2 désactivé : Redis indisponible (${reason})`)
}

/**
 * Log a Redis error at most once per REDIS_ERROR_LOG_INTERVAL_MS.
 * Occurrences in between are counted and reported with the next written line,
 * so an outage costs a handful of lines per day instead of tens of thousands.
 *
 * @param {unknown} err
 * @param {string} [context]
 */
function logRedisError(err, context = 'connexion') {
  const message = err instanceof Error ? err.message : String(err)
  const now = Date.now()

  if (lastErrorLogAt !== 0 && now - lastErrorLogAt < REDIS_ERROR_LOG_INTERVAL_MS) {
    suppressedErrorCount += 1
    return
  }

  const suppressed = suppressedErrorCount
  suppressedErrorCount = 0
  lastErrorLogAt = now

  console.warn(
    `[ipBlock] Erreur Redis (${context}) : ${message}` +
      (suppressed > 0
        ? ` — ${suppressed} erreur(s) identique(s) supprimée(s) depuis le dernier log`
        : '')
  )
}

/**
 * Open a Redis connection in the background.
 * Resolves to the connected client, or null if the connection failed.
 *
 * @returns {Promise<import('ioredis').Redis|null>}
 */
async function initRedis() {
  let client = null

  try {
    const { default: Redis } = await import('ioredis')

    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      // Bounded retry: after REDIS_MAX_RETRIES attempts, return null so ioredis
      // stops reconnecting and emits 'end' instead of looping forever.
      retryStrategy(times) {
        if (times > REDIS_MAX_RETRIES) return null
        return Math.min(times * REDIS_RETRY_STEP_MS, REDIS_RETRY_MAX_MS)
      },
    })

    // MUST be attached before connect(): without an 'error' listener ioredis
    // writes its own unthrottled `[ioredis] Unhandled error event` line per attempt.
    client.on('error', (err) => logRedisError(err))

    client.on('end', () => {
      if (redisClient === client) redisClient = null
      if (closingOnPurpose) return
      nextInitAllowedAt = Date.now() + REDIS_REINIT_COOLDOWN_MS
      logDegradation(`connexion fermée après ${REDIS_MAX_RETRIES} tentatives`)
    })

    await client.connect()

    redisClient = client
    degradationLogged = false
    console.info('[ipBlock] Redis connecté — rate-limiting tier-2 actif')
    return client
  } catch (err) {
    logRedisError(err)

    // Close explicitly: without this the client keeps its own reconnection
    // schedule alive and holds the event loop open.
    if (client) {
      try {
        client.disconnect()
      } catch (disconnectErr) {
        logRedisError(disconnectErr, 'fermeture')
      }
    }

    redisClient = null
    nextInitAllowedAt = Date.now() + REDIS_REINIT_COOLDOWN_MS
    logDegradation(err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Return the connected Redis client, or null when tier 2 is degraded.
 *
 * Never blocks: if no client is available a background connection attempt is
 * scheduled (at most one at a time, at most one per REDIS_REINIT_COOLDOWN_MS)
 * and null is returned immediately, so a dead Redis never adds latency to a
 * request — including the Render /health probe.
 *
 * @returns {import('ioredis').Redis|null}
 */
function getRedisClient() {
  // Skip Redis entirely in test environment to avoid hanging connections
  if (process.env.NODE_ENV === 'test') return null

  if (redisClient) return redisClient

  if (!process.env.REDIS_URL) {
    logDegradation('REDIS_URL non défini')
    return null
  }

  if (!initInFlight && Date.now() >= nextInitAllowedAt) {
    initInFlight = initRedis().finally(() => {
      initInFlight = null
    })
  }

  return null
}

/**
 * Chemins des sondes de disponibilité, exemptés de toute limitation.
 * Dupliqué (volontairement) depuis rateLimit.js : importer PROBE_PATHS d'ici
 * créerait un cycle d'import entre les deux middlewares.
 */
const PROBE_PATHS = new Set(['/health', '/healthz'])

/**
 * Client Redis partagé avec le store du rate limiter tier 1.
 *
 * Retourne null tant que Redis n'est pas connecté (et déclenche au plus une
 * tentative de connexion en arrière-plan) : l'appelant doit alors se rabattre
 * sur son propre store mémoire. Ne bloque jamais, ne lève jamais.
 *
 * @returns {import('ioredis').Redis|null}
 */
export function getRateLimitRedis() {
  return getRedisClient()
}

/**
 * Close the Redis connection cleanly (graceful shutdown).
 * Safe to call when Redis was never connected.
 *
 * @returns {Promise<void>}
 */
export async function closeIpBlockRedis() {
  const client = redisClient
  redisClient = null

  if (!client) return

  closingOnPurpose = true
  try {
    await client.quit()
  } catch (err) {
    logRedisError(err, 'fermeture')
    try {
      client.disconnect()
    } catch (disconnectErr) {
      logRedisError(disconnectErr, 'fermeture')
    }
  } finally {
    closingOnPurpose = false
  }
}

/**
 * Track a rate-limit violation for an IP.
 * After 10 violations within 1 hour, the IP is blocked for 1 hour.
 *
 * @param {string} ip
 */
export async function trackRateLimitViolation(ip) {
  const redis = getRedisClient()
  if (!redis) return // graceful degradation — already logged once

  try {
    const violationKey = `rate-block:${ip}`
    const blockKey = `ip-blocked:${ip}`

    const violations = await redis.incr(violationKey)

    // Set expiry on first violation (1-hour window)
    if (violations === 1) {
      await redis.expire(violationKey, 3600)
    }

    // Block the IP after 10 violations
    if (violations >= 10) {
      await redis.set(blockKey, '1', 'EX', 3600)
      console.warn(`[ipBlock] IP ${ip} blocked for 1 hour after ${violations} rate-limit violations`)
    }
  } catch (err) {
    // Fail open (never crash the request), but keep the error visible — throttled.
    logRedisError(err, 'trackRateLimitViolation')
  }
}

/**
 * Express middleware that rejects requests from blocked IPs.
 * Must be mounted BEFORE the rate limiter.
 *
 * Fails open (calls next()) if Redis is unavailable or any error occurs.
 *
 * @type {import('express').RequestHandler}
 */
export async function ipBlockCheck(req, res, next) {
  // Les sondes (/health toutes les 5 s côté Render) ne doivent jamais être
  // bloquées, ni payer un aller-retour Redis.
  if (PROBE_PATHS.has((req.originalUrl || req.url || '').split('?')[0])) return next()

  const redis = getRedisClient()
  if (!redis) return next() // graceful degradation — no Redis, no block

  try {
    const blockKey = `ip-blocked:${req.ip}`
    const blocked = await redis.get(blockKey)

    if (blocked) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Votre adresse IP a été temporairement bloquée. Réessayez dans 1 heure.',
        },
      })
    }
  } catch (err) {
    // Fail open, but keep the error visible — throttled.
    logRedisError(err, 'ipBlockCheck')
  }

  return next()
}
