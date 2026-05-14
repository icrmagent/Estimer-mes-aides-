/**
 * CSRF Protection Middleware — csrf-csrf (double-submit cookie pattern)
 *
 * Per ADR-4: CSRF is mounted EXCLUSIVELY on the Backoffice router.
 * Borne routes (/api/borne/**, /api/enregistrements) use API key auth
 * and must NOT have CSRF applied.
 *
 * In test/development environments, CSRF validation is disabled to avoid
 * breaking existing tests that don't send CSRF tokens.
 */

import { doubleCsrf } from 'csrf-csrf'

const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'

const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.JWT_SECRET || 'csrf-dev-secret-32-chars-minimum!!',

  // Use a session identifier — fall back to IP if no user is authenticated yet
  getSessionIdentifier: (req) => {
    if (req.user?.sub) return req.user.sub
    return req.ip || 'anonymous'
  },

  cookieName: 'x-csrf-token',

  cookieOptions: {
    httpOnly: false,   // Must be false so the JS client can read the cookie value
    // sameSite='none' obligatoire en cross-site (backend Railway, back-office Vercel = sites différents).
    // 'none' requiert secure=true. En dev local (NODE_ENV=development), on tombe sur 'lax' qui marche
    // pour http://localhost:5175 → http://localhost:3000 (port différent = même site).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },

  // GET, HEAD, OPTIONS are safe methods — skip CSRF validation for them
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],

  // Read the token from the X-CSRF-Token header
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],

  errorConfig: {
    statusCode: 403,
    message: 'CSRF token invalide ou manquant',
    code: 'CSRF_INVALID',
  },
})

/**
 * Middleware that enforces CSRF validation.
 * In test/development mode it is a no-op to avoid breaking existing tests.
 */
const csrfProtectionMiddleware = (req, res, next) => {
  if (isTestOrDev) {
    return next()
  }
  return doubleCsrfProtection(req, res, next)
}

export { generateToken, doubleCsrfProtection, csrfProtectionMiddleware }
