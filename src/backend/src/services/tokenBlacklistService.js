/**
 * JWT Blacklist Service — Redis fast path + RevokedToken DB fallback.
 *
 * ADR-3 — Fail-secure strategy:
 *  - Redis available  → store/check revoked JTI in Redis (fast path)
 *  - Redis unavailable → fall back to RevokedToken DB table
 *  - Redis outage MUST NOT silently allow revoked tokens
 *  - Log warning "Redis unavailable — using DB fallback" on Redis error
 */

import { v4 as uuid } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { getRedisClient, isRedisAvailable } from '../lib/cache.js'

const REDIS_UNAVAILABLE_MSG = 'Redis unavailable — using DB fallback'

/**
 * Add a JWT ID (jti) to the token blacklist.
 * Called on logout to prevent reuse of the access token until it expires.
 *
 * Redis path: SET jti "1" EX <remaining_lifetime_seconds>
 * DB fallback: upsert into RevokedToken table
 *
 * @param {string} jti - JWT ID claim from the access token
 * @param {Date} expiresAt - expiry time of the access token (mirrors JWT exp)
 * @returns {Promise<void>}
 */
export async function addToBlacklist(jti, expiresAt) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
      await getRedisClient().set(`blacklist:${jti}`, '1', 'EX', ttlSeconds)
      // Also persist to DB for recovery after Redis restart
      await _persistToDb(jti, expiresAt)
      return
    } catch (err) {
      console.warn(`[JWTBlacklist] Redis error on addToBlacklist — falling back to DB:`, err.message)
    }
  } else {
    console.warn(`[JWTBlacklist] ${REDIS_UNAVAILABLE_MSG}`)
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  await _persistToDb(jti, expiresAt)
}

/**
 * Check whether a JWT ID is in the blacklist.
 *
 * Redis path: GET blacklist:{jti}
 * DB fallback: findUnique in RevokedToken table
 *
 * FAIL-SECURE: if Redis errors, we ALWAYS fall back to DB — never return false
 * without checking.
 *
 * @param {string} jti - JWT ID claim from the access token
 * @returns {Promise<boolean>} true if blacklisted (token should be rejected)
 */
export async function isBlacklisted(jti) {
  if (!jti) return false

  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const result = await getRedisClient().get(`blacklist:${jti}`)
      if (result !== null) return true
      // Redis says not blacklisted — trust it (Redis is source of truth when available)
      return false
    } catch (err) {
      console.warn(`[JWTBlacklist] Redis error on isBlacklisted — falling back to DB:`, err.message)
    }
  } else {
    console.warn(`[JWTBlacklist] ${REDIS_UNAVAILABLE_MSG}`)
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const record = await prisma.revokedToken.findUnique({
    where: { jti },
  })

  return record !== null
}

/**
 * Remove expired entries from the blacklist.
 * Tokens past their expiry date are no longer valid anyway, so they can be pruned.
 *
 * @returns {Promise<number>} number of deleted records
 */
export async function cleanupExpired() {
  const result = await prisma.revokedToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function _persistToDb(jti, expiresAt) {
  await prisma.revokedToken.upsert({
    where: { jti },
    update: {}, // already blacklisted — no-op
    create: {
      id: uuid(),
      jti,
      expiresAt,
    },
  })
}
