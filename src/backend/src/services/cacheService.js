/**
 * Generic Redis cache service with graceful DB fallback.
 *
 * ADR-3 — Fail-secure strategy:
 *  - All operations are no-ops (return null / false) when Redis is unavailable
 *  - Callers are responsible for falling back to DB when get() returns null
 *  - Errors are logged as warnings — the process is NEVER crashed
 */

import { getRedisClient, isRedisAvailable } from '../lib/cache.js'

const REDIS_UNAVAILABLE_MSG = 'Redis unavailable — using DB fallback'

/**
 * Get a cached value by key.
 *
 * @param {string} key - cache key
 * @returns {Promise<any|null>} parsed value, or null on miss / Redis error
 */
async function get(key) {
  if (!isRedisAvailable()) {
    console.warn(`[Cache] ${REDIS_UNAVAILABLE_MSG} (get: ${key})`)
    return null
  }

  try {
    const raw = await getRedisClient().get(key)
    if (raw === null) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn(`[Cache] Redis get error for key "${key}":`, err.message)
    return null
  }
}

/**
 * Store a value in the cache with an optional TTL.
 *
 * @param {string} key - cache key
 * @param {any} value - value to store (will be JSON-serialised)
 * @param {number} [ttlSeconds] - time-to-live in seconds (omit for no expiry)
 * @returns {Promise<boolean>} true on success, false on Redis error / unavailable
 */
async function set(key, value, ttlSeconds) {
  if (!isRedisAvailable()) {
    console.warn(`[Cache] ${REDIS_UNAVAILABLE_MSG} (set: ${key})`)
    return false
  }

  try {
    const serialised = JSON.stringify(value)
    if (ttlSeconds && ttlSeconds > 0) {
      await getRedisClient().set(key, serialised, 'EX', ttlSeconds)
    } else {
      await getRedisClient().set(key, serialised)
    }
    return true
  } catch (err) {
    console.warn(`[Cache] Redis set error for key "${key}":`, err.message)
    return false
  }
}

/**
 * Delete a single key from the cache.
 *
 * @param {string} key - cache key to delete
 * @returns {Promise<boolean>} true on success, false on Redis error / unavailable
 */
async function del(key) {
  if (!isRedisAvailable()) {
    console.warn(`[Cache] ${REDIS_UNAVAILABLE_MSG} (delete: ${key})`)
    return false
  }

  try {
    await getRedisClient().del(key)
    return true
  } catch (err) {
    console.warn(`[Cache] Redis delete error for key "${key}":`, err.message)
    return false
  }
}

/**
 * Delete all keys matching a glob pattern using SCAN + DEL.
 * Uses SCAN to avoid blocking the Redis server on large keyspaces.
 *
 * @param {string} pattern - glob pattern (e.g. "borne-config:*")
 * @returns {Promise<number>} number of keys deleted, or 0 on error / unavailable
 */
async function deletePattern(pattern) {
  if (!isRedisAvailable()) {
    console.warn(`[Cache] ${REDIS_UNAVAILABLE_MSG} (deletePattern: ${pattern})`)
    return 0
  }

  try {
    const redis = getRedisClient()
    let cursor = '0'
    let deleted = 0

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor

      if (keys.length > 0) {
        await redis.del(...keys)
        deleted += keys.length
      }
    } while (cursor !== '0')

    return deleted
  } catch (err) {
    console.warn(`[Cache] Redis deletePattern error for pattern "${pattern}":`, err.message)
    return 0
  }
}

export const cacheService = {
  get,
  set,
  delete: del,
  deletePattern,
}
