/**
 * Brute Force Protection Service — Redis fast path + LoginAttempt DB fallback.
 *
 * ADR-3 — Fail-secure strategy:
 *  - Redis available  → track failed attempts per IP in Redis (fast path)
 *  - Redis unavailable → fall back to LoginAttempt DB table
 *  - Fail-secure: NEVER skip the check on Redis error — always fall back to DB
 *  - Log warning "Redis unavailable — using DB fallback" on Redis error
 *
 * Rules:
 *  - 5 failed attempts within 15 minutes → IP locked for 15 minutes
 *  - lockedUntil is set when the 5th failure is recorded
 *  - Successful login resets the counter
 *
 * Redis key schema:
 *  - brute:{ip}:attempts  — INCR counter, TTL = WINDOW_MS
 *  - brute:{ip}:locked    — SET "1" EX LOCK_DURATION_SECONDS when locked
 */

import { v4 as uuid } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { getRedisClient, isRedisAvailable } from '../lib/cache.js'

const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000      // 15 minutes
const LOCK_DURATION_SECONDS = 15 * 60        // 15 minutes in seconds
const WINDOW_SECONDS = 15 * 60               // 15-minute sliding window

const REDIS_UNAVAILABLE_MSG = 'Redis unavailable — using DB fallback'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether an IP address is currently blocked.
 *
 * Redis path: check brute:{ip}:locked key
 * DB fallback: check LoginAttempt.lockedUntil
 *
 * @param {string} ip
 * @returns {Promise<boolean>} true if the IP is blocked
 */
export async function isBlocked(ip) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const locked = await getRedisClient().get(`brute:${ip}:locked`)
      return locked !== null
    } catch (err) {
      console.warn(`[BruteForce] Redis error on isBlocked — falling back to DB:`, err.message)
    }
  } else {
    console.warn(`[BruteForce] ${REDIS_UNAVAILABLE_MSG}`)
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const record = await prisma.loginAttempt.findUnique({
    where: { ip },
  })

  if (!record) return false

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    return true
  }

  return false
}

/**
 * Record a failed login attempt for an IP.
 * Increments the attempt counter. If attempts reach MAX_ATTEMPTS,
 * sets the lock key.
 *
 * Redis path: INCR brute:{ip}:attempts + EXPIRE; SET brute:{ip}:locked on threshold
 * DB fallback: upsert LoginAttempt
 *
 * @param {string} ip
 * @returns {Promise<void>}
 */
export async function recordFailedAttempt(ip) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient()
      const attemptsKey = `brute:${ip}:attempts`
      const lockedKey = `brute:${ip}:locked`

      const attempts = await redis.incr(attemptsKey)

      // Set TTL on first increment (sliding window)
      if (attempts === 1) {
        await redis.expire(attemptsKey, WINDOW_SECONDS)
      }

      // Lock the IP when threshold is reached
      if (attempts >= MAX_ATTEMPTS) {
        await redis.set(lockedKey, '1', 'EX', LOCK_DURATION_SECONDS)
      }

      return
    } catch (err) {
      console.warn(`[BruteForce] Redis error on recordFailedAttempt — falling back to DB:`, err.message)
    }
  } else {
    console.warn(`[BruteForce] ${REDIS_UNAVAILABLE_MSG}`)
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const existing = await prisma.loginAttempt.findUnique({
    where: { ip },
  })

  if (!existing) {
    await prisma.loginAttempt.create({
      data: {
        id: uuid(),
        ip,
        attempts: 1,
        lockedUntil: null,
      },
    })
    return
  }

  const newAttempts = existing.attempts + 1
  const lockedUntil = newAttempts >= MAX_ATTEMPTS
    ? new Date(Date.now() + LOCK_DURATION_MS)
    : existing.lockedUntil

  await prisma.loginAttempt.update({
    where: { ip },
    data: {
      attempts: newAttempts,
      lockedUntil,
    },
  })
}

/**
 * Reset the attempt counter for an IP on successful login.
 *
 * Redis path: DEL brute:{ip}:attempts and brute:{ip}:locked
 * DB fallback: upsert LoginAttempt with attempts=0
 *
 * @param {string} ip
 * @returns {Promise<void>}
 */
export async function resetAttempts(ip) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient()
      await redis.del(`brute:${ip}:attempts`, `brute:${ip}:locked`)
      return
    } catch (err) {
      console.warn(`[BruteForce] Redis error on resetAttempts — falling back to DB:`, err.message)
    }
  } else {
    console.warn(`[BruteForce] ${REDIS_UNAVAILABLE_MSG}`)
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  await prisma.loginAttempt.upsert({
    where: { ip },
    update: {
      attempts: 0,
      lockedUntil: null,
    },
    create: {
      id: uuid(),
      ip,
      attempts: 0,
      lockedUntil: null,
    },
  })
}

/**
 * Get the number of remaining attempts before lockout.
 *
 * @param {string} ip
 * @returns {Promise<number>} remaining attempts (0 if already locked)
 */
export async function getRemainingAttempts(ip) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient()
      const locked = await redis.get(`brute:${ip}:locked`)
      if (locked !== null) return 0

      const attemptsRaw = await redis.get(`brute:${ip}:attempts`)
      const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0
      return Math.max(0, MAX_ATTEMPTS - attempts)
    } catch (err) {
      console.warn(`[BruteForce] Redis error on getRemainingAttempts — falling back to DB:`, err.message)
    }
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const record = await prisma.loginAttempt.findUnique({
    where: { ip },
  })

  if (!record) return MAX_ATTEMPTS

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    return 0
  }

  return Math.max(0, MAX_ATTEMPTS - record.attempts)
}

/**
 * Get the number of seconds until the lockout expires for an IP.
 * Returns 0 if the IP is not locked.
 *
 * @param {string} ip
 * @returns {Promise<number>} seconds until unlock (0 if not locked)
 */
export async function getRetryAfter(ip) {
  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    try {
      const ttl = await getRedisClient().ttl(`brute:${ip}:locked`)
      return ttl > 0 ? ttl : 0
    } catch (err) {
      console.warn(`[BruteForce] Redis error on getRetryAfter — falling back to DB:`, err.message)
    }
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const record = await prisma.loginAttempt.findUnique({
    where: { ip },
  })

  if (!record || !record.lockedUntil) return 0

  const now = Date.now()
  const lockedUntilMs = record.lockedUntil.getTime()

  if (lockedUntilMs <= now) return 0

  return Math.ceil((lockedUntilMs - now) / 1000)
}
