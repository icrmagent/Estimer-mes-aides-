import jwt from 'jsonwebtoken'
import { isBlacklisted } from '../services/tokenBlacklistService.js'

// V1 — backward compatible (used by /api/submissions CRM routes)
export const jwtAuth = (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing JWT' })
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.crm = decoded   // V1 compat
    req.user = decoded  // V2 compat (set both)
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'JWT expired' : 'Invalid JWT'
    res.status(401).json({ error: message })
  }
}

// V2 — requires valid JWT with jti claim, checks blacklist, sets req.user
export const jwtAuthV2 = async (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing JWT' })
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET)

    // Check token blacklist (logout / revocation)
    if (decoded.jti) {
      const blacklisted = await isBlacklisted(decoded.jti)
      if (blacklisted) {
        return res.status(401).json({ error: 'Token revoked' })
      }
    }

    req.user = decoded
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'JWT expired' : 'Invalid JWT'
    res.status(401).json({ error: message })
  }
}
