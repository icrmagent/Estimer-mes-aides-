import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { loginUser, issueAccessToken } from '../services/authService.js'
import { createRefreshToken, refreshAccessToken, revokeRefreshToken } from '../services/refreshTokenService.js'
import { addToBlacklist } from '../services/tokenBlacklistService.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
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
authRouter.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  const { email, password, context } = result.data
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown'

  try {
    const auth = await loginUser({ email, password, context })

    if (!auth) {
      logger.warn({ message: '[AUTH FAILED]', ip, email, timestamp: new Date().toISOString() })
      return res.status(401).json({ error: 'Identifiants invalides' })
    }

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
