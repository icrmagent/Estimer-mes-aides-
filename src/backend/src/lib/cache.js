/**
 * Redis client singleton (ioredis).
 *
 * ADR-3 — Fail-secure Redis strategy:
 *  - Redis available  → use Redis (fast path)
 *  - Redis unavailable → use DB fallback (LoginAttempt, RevokedToken tables)
 *  - Log warning "Redis unavailable — using DB fallback" on Redis error
 *  - NEVER skip the security check on Redis error — always fall back to DB
 *
 * Configuration:
 *  - REDIS_URL env var (required in production)
 *  - lazyConnect: true  — does not connect until first command
 *  - enableOfflineQueue: false — commands fail immediately when disconnected
 *  - maxRetriesPerRequest: 1  — fail fast, let the DB fallback take over
 */

import Redis from 'ioredis'

let client = null
let _available = null

/**
 * Get (or create) the Redis client singleton.
 * @returns {Redis} ioredis client instance
 */
export function getRedisClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })

    client.on('error', (err) => {
      console.warn('[Redis] Connection error:', err.message)
      _available = false
    })

    client.on('connect', () => {
      _available = true
    })

    client.on('ready', () => {
      _available = true
    })

    client.on('close', () => {
      _available = false
    })

    client.on('end', () => {
      _available = false
    })
  }

  return client
}

/**
 * Check whether Redis is currently available and ready.
 * Used by services to decide whether to use Redis or DB fallback.
 *
 * @returns {boolean} true if Redis is connected and ready
 */
export function isRedisAvailable() {
  return _available === true && client?.status === 'ready'
}
