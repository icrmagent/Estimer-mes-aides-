/**
 * rateLimit.js — Tier 1 rate limiting (express-rate-limit).
 *
 * Complète le tier 2 de `ipBlockMiddleware.js` (ADR-1 / R20.6) :
 *
 *   Tier 1 (ce fichier)          : compte les requêtes par IP et renvoie 429 au-delà du seuil
 *   Tier 2 (ipBlockMiddleware)   : bloque l'IP 1 h après 10 violations de tier 1 en 1 h
 *
 * Chaque 429 émis ici appelle `trackRateLimitViolation()` : c'est le seul chemin qui
 * alimente le tier 2 (il n'avait aucun appelant avant ce câblage).
 *
 * Ordre de montage imposé (voir en-tête de ipBlockMiddleware.js) :
 *   app.use(ipBlockCheck)   ← 1er
 *   app.use(globalLimiter)  ← 2e
 *
 * ── Seuils par défaut et justification ──────────────────────────────────────
 *
 * Fenêtre unique de 15 min (alignée sur la fenêtre du tier 2 et sur
 * bruteForceService), tous surchargeables par variable d'environnement.
 *
 * RATE_LIMIT_GLOBAL_MAX = 300 / 15 min / IP (~20 req/min)
 *   Une borne en usage réel : chargement de config + i18n + quelques POST par heure.
 *   Un admin du back-office : un dashboard = ~10 appels API, une session de 15 min en
 *   fait quelques dizaines. 300 laisse une marge x5 sur l'usage légitime le plus
 *   bavard (plusieurs bornes derrière le même NAT) tout en coupant net le scénario
 *   mesuré en production (30 requêtes en 38 s soutenues = 700/15 min).
 *   L'ADR-1 documentait 100 : trop bas dès que 2 bornes partagent une IP publique
 *   ou qu'un admin pagine des listes — 300 est la valeur retenue, ajustable sans
 *   redéploiement de code via la variable d'environnement.
 *
 * RATE_LIMIT_SUBMISSIONS_MAX / RATE_LIMIT_ENREGISTREMENTS_MAX = 30 / 15 min / IP
 *   C'est LA limite qui protège les leads clients : `API_KEY_MOBILE` est extractible
 *   du bundle public de la borne, donc le seul rempart sur POST /api/submissions est
 *   le débit. Une borne remplit un formulaire en plusieurs minutes (~20 formulaires
 *   par jour au maximum). 30 par quart d'heure couvre le pire cas légitime — une
 *   borne restée hors ligne qui vide sa file IndexedDB d'un coup — tout en plafonnant
 *   un attaquant à 2 écritures/minute au lieu d'un débit illimité.
 *
 * RATE_LIMIT_LOGIN_MAX = 10 échecs / 15 min / IP (`skipSuccessfulRequests`)
 *   Filet de sécurité DERRIÈRE `bruteForceService` (verrou à 5 échecs / 15 min, qui
 *   se déclenche donc en premier). Il prend le relais si la base ET Redis sont
 *   indisponibles, cas où `bruteForceService` ne peut plus compter. Les connexions
 *   réussies ne sont pas comptées : un poste back-office partagé n'est jamais bloqué
 *   par son usage normal.
 *
 * ── Redis ───────────────────────────────────────────────────────────────────
 * REDIS_URL n'est PAS provisionnée en production : le store mémoire est le mode
 * nominal (correct avec numInstances=1). Si REDIS_URL apparaît, `HybridStore`
 * bascule automatiquement sur Redis (compteurs partagés entre instances) et
 * retombe silencieusement sur la mémoire à la moindre erreur — jamais d'échec en
 * cascade, jamais de blocage au démarrage.
 */

import { rateLimit, MemoryStore } from 'express-rate-limit'
import { getRateLimitRedis, trackRateLimitViolation } from './ipBlockMiddleware.js'
import logger from '../lib/logger.js'

const MINUTE_MS = 60 * 1000
const DEFAULT_WINDOW_MS = 15 * MINUTE_MS

/** Délai minimal entre deux lignes de log pour un même compteur (anti-flood). */
const VIOLATION_LOG_INTERVAL_MS = 60 * 1000

/**
 * Chemins des sondes de disponibilité : jamais limités, et jamais comptés.
 * Render appelle /health toutes les 5 s (soit 180 appels / 15 min, bien au-dessus
 * du seuil global) : sans cette exclusion la sonde se bloquerait elle-même et
 * consommerait le quota de l'IP interne.
 *
 * Note : la même liste est dupliquée (3 lignes) dans ipBlockMiddleware.js pour
 * éviter un import circulaire entre les deux middlewares.
 */
export const PROBE_PATHS = new Set(['/health', '/healthz'])

/**
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function envInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Normalise l'URL d'une requête en chemin comparable (sans query, sans slash final).
 * @param {import('express').Request} req
 * @returns {string}
 */
function requestPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0]
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1)
  return raw
}

/**
 * Vrai pour les sondes de disponibilité (health checks).
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isProbeRequest(req) {
  return PROBE_PATHS.has(requestPath(req))
}

/**
 * Le rate limiting est toujours actif hors tests.
 * En environnement de test il est neutralisé par défaut — sinon les 510 tests
 * existants, qui tapent l'app réelle des dizaines de fois, déclencheraient des 429
 * — et réactivé explicitement par `RATE_LIMIT_TEST_MODE=enabled` dans le fichier
 * de test qui vérifie le comportement réel.
 *
 * Il n'existe volontairement AUCUN interrupteur permettant de désactiver le rate
 * limiting en production.
 *
 * @returns {boolean}
 */
export function isRateLimitActive() {
  if (process.env.NODE_ENV !== 'test') return true
  return process.env.RATE_LIMIT_TEST_MODE === 'enabled'
}

/** @type {Map<string, {last: number, suppressed: number}>} */
const violationLogState = new Map()

/**
 * Journalise une violation, au plus une ligne par minute et par compteur.
 * @param {string} scope
 * @param {string} ip
 * @param {number} limit
 */
function logViolation(scope, ip, limit) {
  const now = Date.now()
  const state = violationLogState.get(scope) ?? { last: 0, suppressed: 0 }

  if (state.last !== 0 && now - state.last < VIOLATION_LOG_INTERVAL_MS) {
    state.suppressed += 1
    violationLogState.set(scope, state)
    return
  }

  const suppressed = state.suppressed
  violationLogState.set(scope, { last: now, suppressed: 0 })

  logger.warn({
    message: '[RATE LIMIT] seuil dépassé',
    scope,
    ip,
    limit,
    suppressedSinceLastLog: suppressed,
  })
}

/**
 * Store à deux étages : Redis quand il est joignable, mémoire sinon.
 *
 * Contrat express-rate-limit v7 : init / increment / decrement / resetKey.
 * Aucune méthode ne rejette : toute erreur Redis retombe sur le store mémoire,
 * de sorte qu'une panne Redis ne peut ni ouvrir la vanne ni casser une requête.
 */
export class HybridStore {
  /** @param {string} prefix */
  constructor(prefix) {
    this.prefix = prefix
    this.memory = new MemoryStore()
    this.windowMs = DEFAULT_WINDOW_MS
  }

  /** @param {{windowMs: number}} options */
  init(options) {
    this.windowMs = options.windowMs
    this.memory.init(options)
  }

  /**
   * @param {string} key
   * @returns {Promise<{totalHits: number, resetTime: Date}>}
   */
  async increment(key) {
    const redis = getRateLimitRedis()

    if (redis) {
      try {
        const redisKey = `rl:${this.prefix}:${key}`
        const results = await redis.multi().incr(redisKey).pttl(redisKey).exec()
        if (!results) throw new Error('Redis MULTI aborted')

        const [[incrErr, hits], [, pttl]] = results
        if (incrErr) throw incrErr

        const totalHits = Number(hits)
        let ttl = Number(pttl)

        // -1 = clé sans TTL (premier INCR ou TTL perdu) → (re)pose la fenêtre.
        if (!Number.isFinite(ttl) || ttl < 0) {
          await redis.pexpire(redisKey, this.windowMs)
          ttl = this.windowMs
        }

        return { totalHits, resetTime: new Date(Date.now() + ttl) }
      } catch (err) {
        logger.warn({
          message: '[RATE LIMIT] Redis indisponible — repli sur le store mémoire',
          scope: this.prefix,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return this.memory.increment(key)
  }

  /** @param {string} key */
  async decrement(key) {
    const redis = getRateLimitRedis()
    if (redis) {
      try {
        await redis.decr(`rl:${this.prefix}:${key}`)
        return
      } catch {
        // repli silencieux : le compteur mémoire reste la référence
      }
    }
    return this.memory.decrement(key)
  }

  /** @param {string} key */
  async resetKey(key) {
    const redis = getRateLimitRedis()
    if (redis) {
      try {
        await redis.del(`rl:${this.prefix}:${key}`)
      } catch {
        // ignoré : le reset mémoire ci-dessous suffit
      }
    }
    return this.memory.resetKey(key)
  }

  async resetAll() {
    return this.memory.resetAll()
  }
}

/** @type {HybridStore[]} */
const stores = []

/**
 * Remet à zéro tous les compteurs mémoire (utilisé par les tests).
 * @returns {Promise<void>}
 */
export async function resetAllRateLimits() {
  await Promise.all(stores.map((store) => store.resetAll()))
}

/**
 * Fabrique un limiteur express-rate-limit câblé sur le tier 2 et les sondes.
 *
 * @param {object} config
 * @param {string} config.scope            identifiant du compteur (préfixe Redis + logs)
 * @param {number} config.limit            requêtes autorisées par fenêtre et par IP
 * @param {number} [config.windowMs]
 * @param {string} config.message          message renvoyé au client
 * @param {boolean} [config.skipSuccessfulRequests]
 * @param {(req: import('express').Request) => boolean} [config.appliesTo]
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({
  scope,
  limit,
  windowMs = DEFAULT_WINDOW_MS,
  message,
  skipSuccessfulRequests = false,
  appliesTo,
}) {
  const store = new HybridStore(scope)
  stores.push(store)

  return rateLimit({
    windowMs,
    limit,
    store,
    skipSuccessfulRequests,
    standardHeaders: true, // RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
    legacyHeaders: false,
    skip: (req) => {
      if (!isRateLimitActive()) return true
      if (isProbeRequest(req)) return true
      if (appliesTo && !appliesTo(req)) return true
      return false
    },
    handler: (req, res, _next, options) => {
      const ip = req.ip ?? 'unknown'
      const resetTime = req.rateLimit?.resetTime
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000)

      logViolation(scope, ip, options.limit)

      // Alimente le tier 2 : 10 violations en 1 h ⇒ IP bloquée 1 h.
      // Ne bloque jamais la réponse et n'échoue jamais (no-op sans Redis).
      Promise.resolve(trackRateLimitViolation(ip)).catch(() => {})

      res.set('Retry-After', String(retryAfter))
      return res.status(options.statusCode).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message,
          retryAfter,
        },
      })
    },
  })
}

/**
 * Vrai uniquement pour la création : POST sur la racine du routeur monté.
 * Express réécrit req.url en '/' quand l'URL vaut exactement le point de montage,
 * donc les autres verbes (GET liste, PUT sync) et les sous-routes (POST
 * /bulk-delete, réservée au SUPER_ADMIN) ne consomment pas ce quota.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
const isCreateRequest = (req) =>
  req.method === 'POST' && (req.path === '/' || req.path === '')

/**
 * Limiteur global : monté sur toute l'application, APRÈS `ipBlockCheck`.
 * @type {import('express').RequestHandler}
 */
export const globalLimiter = createRateLimiter({
  scope: 'global',
  limit: envInt('RATE_LIMIT_GLOBAL_MAX', 300),
  windowMs: envInt('RATE_LIMIT_GLOBAL_WINDOW_MS', DEFAULT_WINDOW_MS),
  message: 'Trop de requêtes. Réessayez dans quelques minutes.',
})

/**
 * POST /api/submissions — écriture publique (API key extractible du bundle borne).
 * @type {import('express').RequestHandler}
 */
export const submissionsLimiter = createRateLimiter({
  scope: 'submissions',
  limit: envInt('RATE_LIMIT_SUBMISSIONS_MAX', 30),
  windowMs: envInt('RATE_LIMIT_SUBMISSIONS_WINDOW_MS', DEFAULT_WINDOW_MS),
  message: 'Trop de soumissions depuis cette adresse. Réessayez dans quelques minutes.',
  appliesTo: isCreateRequest,
})

/**
 * POST /api/enregistrements — écriture borne authentifiée (JWT ADMIN_BORNE).
 * @type {import('express').RequestHandler}
 */
export const enregistrementsLimiter = createRateLimiter({
  scope: 'enregistrements',
  limit: envInt('RATE_LIMIT_ENREGISTREMENTS_MAX', 30),
  windowMs: envInt('RATE_LIMIT_ENREGISTREMENTS_WINDOW_MS', DEFAULT_WINDOW_MS),
  message: 'Trop d’enregistrements depuis cette adresse. Réessayez dans quelques minutes.',
  appliesTo: isCreateRequest,
})

/**
 * POST /api/auth/login — filet derrière bruteForceService (échecs uniquement).
 * @type {import('express').RequestHandler}
 */
export const loginLimiter = createRateLimiter({
  scope: 'login',
  limit: envInt('RATE_LIMIT_LOGIN_MAX', 10),
  windowMs: envInt('RATE_LIMIT_LOGIN_WINDOW_MS', DEFAULT_WINDOW_MS),
  message: 'Trop de tentatives de connexion. Réessayez plus tard.',
  skipSuccessfulRequests: true,
})
