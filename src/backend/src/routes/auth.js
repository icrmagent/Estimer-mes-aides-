import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { loginUser, issueAccessToken } from '../services/authService.js'
import { createRefreshToken, refreshAccessToken, revokeRefreshToken } from '../services/refreshTokenService.js'
import { addToBlacklist } from '../services/tokenBlacklistService.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { loginLimiter } from '../middleware/rateLimit.js'
import {
  isBlocked,
  recordFailedAttempt,
  resetAttempts,
  getRetryAfter,
} from '../services/bruteForceService.js'
import logger from '../lib/logger.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  context: z.enum(['backoffice', 'borne']).optional().default('backoffice'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
})

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

// POST /api/auth/login
// Public — returns accessToken (8h) + refreshToken (30d)
//
// Trois couches, dans cet ordre :
//   1. loginLimiter (tier 1)      — 10 ECHECS / 15 min / IP, filet de dernier recours
//   2. bruteForceService (ADR-3)  — verrou 15 min après 5 échecs, Redis puis repli DB
//   3. loginUser                  — vérification bcrypt des identifiants
authRouter.post('/login', loginLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  const { email, password, context } = result.data

  // req.ip et non l'en-tête X-Forwarded-For brut : cet en-tête est fourni par le
  // client. L'utiliser comme clé de comptage laisserait un attaquant repartir de
  // zéro à chaque tentative en changeant sa valeur. req.ip est calculé par Express
  // à partir du réglage `trust proxy`, donc non falsifiable par le client.
  const ip = req.ip || 'unknown'

  try {
    // ── Verrou anti-brute-force ────────────────────────────────────────────
    // Erreur inattendue (Redis ET base injoignables) : on log et on continue —
    // le tier 1 plafonne toujours les tentatives, et un refus systématique ici
    // transformerait une panne de base en interdiction totale de se connecter.
    let locked = false
    try {
      locked = await isBlocked(ip)
    } catch (err) {
      logger.error({ message: '[BRUTE FORCE CHECK ERROR]', ip, error: err.message })
    }

    if (locked) {
      const retryAfter = await getRetryAfter(ip).catch(() => 0)
      logger.warn({ message: '[AUTH BLOCKED]', ip, email, retryAfter })
      res.set('Retry-After', String(retryAfter || 900))
      return res.status(429).json({
        error: 'Trop de tentatives de connexion échouées. Réessayez plus tard.',
        retryAfter,
      })
    }

    const auth = await loginUser({ email, password, context })

    if (!auth) {
      await recordFailedAttempt(ip).catch((err) =>
        logger.error({ message: '[BRUTE FORCE RECORD ERROR]', ip, error: err.message })
      )
      logger.warn({ message: '[AUTH FAILED]', ip, email, timestamp: new Date().toISOString() })
      return res.status(401).json({ error: 'Identifiants invalides' })
    }

    await resetAttempts(ip).catch((err) =>
      logger.error({ message: '[BRUTE FORCE RESET ERROR]', ip, error: err.message })
    )

    // Issue refresh token (30d, stored as bcrypt hash in DB)
    const refreshToken = await createRefreshToken(auth.userId, auth.userType)

    return res.json({
      token: auth.token,        // kept for backward compat with existing tests
      accessToken: auth.token,  // new field per spec
      refreshToken,
      role: auth.role,
      expiresIn: auth.expiresIn,
    })
  } catch (err) {
    logger.error({ message: '[AUTH ERROR]', error: err.message })
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/auth/refresh
// Public — rotates refresh token and issues new access token
authRouter.post('/refresh', async (req, res) => {
  const result = refreshSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  const { refreshToken } = result.data

  try {
    const tokens = await refreshAccessToken(refreshToken, issueAccessToken)

    return res.json({
      token: tokens.accessToken,        // backward compat
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: tokens.role,
      expiresIn: tokens.expiresIn,
    })
  } catch (err) {
    if (err.message === 'INVALID_REFRESH_TOKEN') {
      return res.status(401).json({ error: 'Refresh token invalide ou expiré' })
    }
    logger.error({ message: '[REFRESH ERROR]', error: err.message })
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/auth/logout
// Protected — blacklists the access token and revokes the refresh token
authRouter.post('/logout', jwtAuthV2, async (req, res) => {
  const result = logoutSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  try {
    const decoded = req.user

    // Blacklist the current access token by its jti
    if (decoded.jti && decoded.exp) {
      const expiresAt = new Date(decoded.exp * 1000)
      await addToBlacklist(decoded.jti, expiresAt)
    }

    // Revoke the refresh token if provided
    if (result.data.refreshToken) {
      await revokeRefreshToken(result.data.refreshToken)
    }

    return res.json({ success: true, message: 'Déconnexion réussie' })
  } catch (err) {
    logger.error({ message: '[LOGOUT ERROR]', error: err.message })
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})
