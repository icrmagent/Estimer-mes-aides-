/**
 * ipBlockMiddleware.js
 *
 * Two-tier rate limiting per ADR-1 / R20.6:
 *
 * Tier 1 (handled by express-rate-limit): 100 req/15 min global, 5 req/15 min login
 * Tier 2 (this file): IP blocked for 1 hour after 10 rate-limit violations within 1 hour
 *
 * Uses Redis for fast lookups. Gracefully degrades (no-op) if Redis is unavailable.
 *
 * Mount order in app.js:
 *   app.use(ipBlockCheck)   ← FIRST
 *   app.use(rateLimiter)    ← SECOND
 */

let redisClient = null
let redisInitAttempted = false

/**
 * Lazily initialise the Redis client.
 * Returns null if REDIS_URL is not set, connection fails, or in test environment.
 */
async function getRedisClient() {
  // Skip Redis entirely in test environment to avoid hanging connections
  if (process.env.NODE_ENV === 'test') return null

  if (redisInitAttempted) return redisClient
  redisInitAttempted = true

  if (!process.env.REDIS_URL) return null

  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    })
    await client.connect()
    redisClient = client
    return redisClient
  } catch {
    return null
  }
}

/**
 * Track a rate-limit violation for an IP.
 * After 10 violations within 1 hour, the IP is blocked for 1 hour.
 *
 * @param {string} ip
 */
export async function trackRateLimitViolation(ip) {
  const redis = await getRedisClient()
  if (!redis) return // graceful degradation

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
  } catch {
    // Redis error — fail open (don't crash the request)
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
  const redis = await getRedisClient()
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
  } catch {
    // Redis error — fail open
  }

  return next()
}
