import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { prisma } from '../lib/prisma.js'

const REFRESH_TOKEN_EXPIRY_DAYS = 30
const BCRYPT_COST = 10

/**
 * Generate a cryptographically random opaque token string.
 * Uses uuid v4 concatenated with a second uuid for extra entropy.
 * @returns {string} raw token (never stored — only its hash is persisted)
 */
function generateOpaqueToken() {
  return `${uuid()}-${uuid()}`
}

/**
 * Create a new refresh token for a user.
 * Stores a bcrypt hash in the DB and returns the raw token to the caller.
 *
 * @param {string} userId
 * @param {'superadmin'|'adminborne'} userType
 * @returns {Promise<string>} raw refresh token
 */
export async function createRefreshToken(userId, userType) {
  const rawToken = generateOpaqueToken()
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_COST)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  await prisma.refreshToken.create({
    data: {
      id: uuid(),
      tokenHash,
      userId,
      userType,
      expiresAt,
    },
  })

  return rawToken
}

/**
 * Verify a raw refresh token, rotate it (invalidate old, issue new pair),
 * and return a new access token + refresh token.
 *
 * @param {string} rawRefreshToken
 * @param {Function} issueAccessToken - callback(userId, userType) → { token, role, expiresIn }
 * @returns {Promise<{accessToken: string, refreshToken: string, role: string, expiresIn: string}>}
 * @throws {Error} if token is invalid, expired, or revoked
 */
export async function refreshAccessToken(rawRefreshToken, issueAccessToken) {
  // Find all non-revoked, non-expired tokens and check bcrypt hash
  const candidates = await prisma.refreshToken.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // safety limit — in practice there are few active tokens per user
  })

  let matchedToken = null
  for (const candidate of candidates) {
    const matches = await bcrypt.compare(rawRefreshToken, candidate.tokenHash)
    if (matches) {
      matchedToken = candidate
      break
    }
  }

  if (!matchedToken) {
    throw new Error('INVALID_REFRESH_TOKEN')
  }

  // Revoke the old token (rotation)
  await prisma.refreshToken.update({
    where: { id: matchedToken.id },
    data: { revokedAt: new Date() },
  })

  // Issue new access token
  const authResult = await issueAccessToken(matchedToken.userId, matchedToken.userType)

  // Issue new refresh token
  const newRawRefreshToken = await createRefreshToken(matchedToken.userId, matchedToken.userType)

  return {
    accessToken: authResult.token,
    refreshToken: newRawRefreshToken,
    role: authResult.role,
    expiresIn: authResult.expiresIn,
  }
}

/**
 * Revoke a refresh token by marking it as revoked in the DB.
 *
 * @param {string} rawRefreshToken
 * @returns {Promise<boolean>} true if revoked, false if not found
 */
export async function revokeRefreshToken(rawRefreshToken) {
  const candidates = await prisma.refreshToken.findMany({
    where: {
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  for (const candidate of candidates) {
    const matches = await bcrypt.compare(rawRefreshToken, candidate.tokenHash)
    if (matches) {
      await prisma.refreshToken.update({
        where: { id: candidate.id },
        data: { revokedAt: new Date() },
      })
      return true
    }
  }

  return false
}

/**
 * Delete expired and revoked refresh tokens from the DB.
 * Should be called periodically (e.g., daily cleanup job).
 *
 * @returns {Promise<number>} number of deleted records
 */
export async function cleanupExpiredTokens() {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  })
  return result.count
}
