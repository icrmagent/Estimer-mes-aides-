/**
 * CSRF Protection Middleware — csrf-csrf (double-submit cookie pattern)
 *
 * Per ADR-4: CSRF is mounted EXCLUSIVELY on the Backoffice router.
 * Borne routes (/api/borne/**, /api/enregistrements) use API key auth
 * and must NOT have CSRF applied.
 *
 * In test/development environments, CSRF validation is disabled to avoid
 * breaking existing tests that don't send CSRF tokens.
 *
 * ─── Identifiant de session CSRF : POURQUOI PAS req.ip ──────────────────────
 *
 * csrf-csrf calcule le hash stocké en cookie ainsi :
 *     sha256(getSessionIdentifier(req) + csrfToken + secret)
 * et le RECALCULE à la vérification. Si `getSessionIdentifier` ne renvoie pas
 * exactement la même valeur à l'émission et à la vérification, le hash ne
 * correspond plus et la requête est rejetée en 403 CSRF_INVALID.
 *
 * L'implémentation précédente retombait sur `req.ip`. C'était non déterministe
 * en production :
 *  - derrière Cloudflare + Render, `req.ip` dépend du réglage `trust proxy`
 *    (cf. src/app.js) et pouvait résoudre vers une IP d'edge Cloudflare
 *    différente d'une requête à l'autre ;
 *  - même avec un `trust proxy` correct, une borne/tablette qui bascule de
 *    Wi-Fi à 4G change d'IP entre l'obtention du token et l'écriture, et
 *    perdrait son token à chaque changement de réseau.
 *
 * L'identifiant est désormais un identifiant opaque tiré aléatoirement côté
 * serveur et déposé dans un cookie httpOnly (`x-csrf-session`), émis en même
 * temps que le cookie CSRF et portant exactement les mêmes attributs : les
 * deux cookies voyagent donc toujours ensemble et restent stables quel que
 * soit le réseau du client. La liaison token ↔ client est conservée (un token
 * émis pour une session ne valide pas une écriture d'une autre session), sans
 * aucune dépendance à l'adresse IP.
 *
 * Note : la branche `req.user?.sub` de l'implémentation précédente était du
 * code mort — `csrfProtectionMiddleware` est monté AVANT `requireAuth` sur le
 * routeur backoffice, et `GET /api/csrf-token` est public : `req.user` est
 * toujours indéfini au moment où l'identifiant est calculé. Pire, elle était
 * un piège : si l'authentification passait un jour avant le CSRF, l'émission
 * (anonyme) et la vérification (authentifiée) utiliseraient deux identifiants
 * différents et TOUTES les écritures casseraient.
 */

import { randomUUID } from 'node:crypto'
import { doubleCsrf } from 'csrf-csrf'

const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'

export const CSRF_COOKIE_NAME = 'x-csrf-token'
export const CSRF_SESSION_COOKIE_NAME = 'x-csrf-session'

/**
 * Attributs partagés par le cookie CSRF et le cookie de session CSRF.
 * Ils DOIVENT rester identiques : les deux cookies forment une paire, si l'un
 * est envoyé sans l'autre la validation échoue.
 *
 * sameSite='none' obligatoire en cross-site (backend Render, back-office Vercel
 * = sites différents). 'none' requiert secure=true. En dev local
 * (NODE_ENV=development), on tombe sur 'lax' qui marche pour
 * http://localhost:5175 → http://localhost:3000 (port différent = même site).
 */
const baseCookieOptions = () => ({
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
})

/**
 * Lit l'identifiant de session CSRF déjà présent sur la requête.
 * Ne crée rien : utilisé côté vérification, où l'on ne doit accepter que ce
 * que le client a réellement renvoyé.
 *
 * @param {import('express').Request} req
 * @returns {string} identifiant, ou '' si absent
 */
const readCsrfSessionId = (req) => {
  if (typeof req.csrfSessionId === 'string' && req.csrfSessionId.length > 0) {
    return req.csrfSessionId
  }
  const fromCookie = req.cookies?.[CSRF_SESSION_COOKIE_NAME]
  return typeof fromCookie === 'string' && fromCookie.length > 0 ? fromCookie : ''
}

/**
 * Garantit qu'un identifiant de session CSRF existe pour cette requête et que
 * le client le possède en cookie. Réutilise l'identifiant existant s'il y en a
 * un (multi-onglets : les onglets partagent la même session CSRF).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string} l'identifiant de session CSRF
 */
export const ensureCsrfSessionId = (req, res) => {
  const existing = readCsrfSessionId(req)
  if (existing) {
    req.csrfSessionId = existing
    return existing
  }
  const sessionId = randomUUID()
  req.csrfSessionId = sessionId
  res.cookie(CSRF_SESSION_COOKIE_NAME, sessionId, {
    ...baseCookieOptions(),
    httpOnly: true, // le client JS n'a jamais besoin de le lire
  })
  return sessionId
}

const {
  generateToken,
  doubleCsrfProtection,
  validateRequest,
} = doubleCsrf({
  getSecret: () => process.env.JWT_SECRET || 'csrf-dev-secret-32-chars-minimum!!',

  getSessionIdentifier: readCsrfSessionId,

  cookieName: CSRF_COOKIE_NAME,

  cookieOptions: {
    ...baseCookieOptions(),
    httpOnly: false, // Must be false so the JS client can read the cookie value
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
 * Émet un token CSRF pour la route publique GET /api/csrf-token.
 *
 * Deux garanties par rapport à un appel direct à `generateToken` :
 *  1. le cookie de session CSRF est déposé AVANT le calcul du hash, donc le
 *     hash est bien lié à l'identifiant que le client va renvoyer ;
 *  2. `validateOnReuse=false` : si le client arrive avec un cookie CSRF
 *     périmé/étranger (identifiant de session différent), csrf-csrf le
 *     remplace silencieusement au lieu de lever une erreur. Avec le défaut
 *     (`true`), un cookie devenu invalide faisait échouer l'endpoint
 *     d'émission lui-même (500 CSRF_ERROR) et le client restait bloqué
 *     jusqu'à expiration du cookie — impossible de se rétablir seul.
 *
 * `overwrite=false` est conservé : tant que le cookie est valide il est
 * réutilisé, ce qui garde plusieurs onglets du back-office fonctionnels.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string} le token CSRF à renvoyer dans le corps de la réponse
 */
export const issueCsrfToken = (req, res) => {
  ensureCsrfSessionId(req, res)
  return generateToken(req, res, false, false)
}

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

export { generateToken, doubleCsrfProtection, validateRequest, csrfProtectionMiddleware }
