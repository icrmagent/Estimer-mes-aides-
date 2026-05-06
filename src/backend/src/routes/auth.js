import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { loginUser } from '../services/authService.js'

export const authRouter = Router()

// Rate limiting: 10 req/min/IP (R6.10)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 1 minute' },
})

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  context: z.enum(['backoffice', 'borne']).optional().default('backoffice'),
})

// POST /api/auth/login
authRouter.post('/login', authLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }

  const { email, password, context } = result.data

  try {
    const auth = await loginUser({ email, password, context })

    if (!auth) {
      // Log failed attempt (R6.9) — IP + timestamp + email attempted
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
      console.warn(`[AUTH FAILED] ${new Date().toISOString()} | IP: ${ip} | email: ${email}`)
      return res.status(401).json({ error: 'Identifiants invalides' })
    }

    return res.json({
      token: auth.token,
      role: auth.role,
      expiresIn: auth.expiresIn,
    })
  } catch (err) {
    console.error('[AUTH ERROR]', err)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})
