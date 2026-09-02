/**
 * validateEnv.js
 *
 * Validates required environment variables at startup.
 * Exits with code 1 if any required variable is missing.
 * Logs a warning (no exit) for optional variables that are absent.
 *
 * Design constraints:
 *  - ESM module
 *  - Collects ALL missing vars before exiting (not just the first)
 *  - JWT_SECRET length check (≥ 32 chars) only applies in production
 *  - In test environment (NODE_ENV=test), validation is skipped entirely
 *    to allow tests to run without a full .env file
 *  - SENTRY_DSN is optional — warning only if absent
 *  - PRIMARY_COLOR is optional — defaults to #5B2D8E if not set
 *  - PUSHER_* are optional (F5) — src/services/pusherService.js dégrade en mock
 *    no-op quand elles manquent ; bloquer le démarrage sur une dépendance
 *    optionnelle par conception empêcherait un déploiement volontairement livré
 *    sans temps réel (cf. render.yaml : « sans ces valeurs, le temps reel est desactive »)
 */

/** Required environment variables — absence causes process.exit(1) */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'API_KEY_MOBILE',
  'API_KEY_CRM',
  'CORS_ALLOWED_ORIGINS',
  'NODE_ENV',
  'SUPERADMIN_EMAIL',
]

/**
 * Variables Pusher — optionnelles par conception (F5).
 * pusherService.getPusher() renvoie un mock no-op dès que PUSHER_APP_ID ou
 * PUSHER_KEY manque, et publishEvent() n'a jamais propagé d'exception.
 */
const PUSHER_VARS = ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER']

/** Optional environment variables — absence logs a warning, never exits */
const OPTIONAL_VARS = [
  { name: 'REDIS_URL', hint: 'Redis cache will be disabled — DB fallback enabled.' },
  { name: 'SENTRY_DSN', hint: 'Sentry error tracking will be disabled.' },
  { name: 'PRIMARY_COLOR', hint: 'Defaulting to #5B2D8E.' },
]

/** True when the variable is absent or blank in the given env object */
function isBlank(env, name) {
  return !env[name] || env[name].trim() === ''
}

/**
 * Première ligne utile d'une erreur Prisma : son `message` commence par une ligne
 * vide puis « Invalid `prisma.$queryRaw()` invocation: », qui ne dit rien de la cause.
 */
function firstMeaningfulLine(err) {
  const lines = String(err?.message ?? err)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.find((line) => !line.endsWith('invocation:')) ?? lines[0] ?? String(err)
}

/**
 * Validates all required and optional environment variables.
 *
 * Behaviour:
 *  - Skipped entirely when NODE_ENV === 'test'
 *  - Logs all missing required vars at once, then calls process.exit(1)
 *  - Logs a warning for each missing optional var (no exit)
 *  - In production, also validates JWT_SECRET is at least 32 characters (P6)
 *
 * @param {object} [env=process.env] - Environment object (injectable for testing)
 */
export function validateEnv(env = process.env) {
  // Skip validation entirely in test environment
  if (env.NODE_ENV === 'test') {
    return
  }

  const missing = []

  // Check all required variables
  for (const varName of REQUIRED_VARS) {
    if (isBlank(env, varName)) {
      missing.push(varName)
    }
  }

  // Report all missing required vars at once before exiting
  if (missing.length > 0) {
    console.error(
      `[validateEnv] FATAL: Missing required environment variable(s):\n` +
        missing.map((v) => `  - ${v}`).join('\n') +
        `\nServer cannot start. Please set the missing variables and restart.`
    )
    process.exit(1)
  }

  // P6 — JWT_SECRET must be at least 32 characters in production
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET.length < 32) {
      console.error(
        `[validateEnv] FATAL: JWT_SECRET must be at least 32 characters in production ` +
          `(current length: ${env.JWT_SECRET.length}).`
      )
      process.exit(1)
    }
  }

  // F5 — Pusher : dépendance optionnelle par conception, jamais bloquante
  const missingPusher = PUSHER_VARS.filter((name) => isBlank(env, name))
  if (missingPusher.length > 0) {
    console.warn(
      `[validateEnv] WARNING: notifications temps réel désactivées : variables Pusher absentes ` +
        `(${missingPusher.join(', ')}). Le service Pusher dégrade en mock no-op ; ` +
        `le reste de l'API fonctionne normalement.`
    )
  }

  // Warn about missing optional variables (no exit)
  for (const { name, hint } of OPTIONAL_VARS) {
    if (isBlank(env, name)) {
      console.warn(`[validateEnv] WARNING: Optional variable ${name} is not set. ${hint}`)
    }
  }
}

/**
 * F1 — Vérifie que DATABASE_URL (URL d'exécution du PrismaClient, pooler pgbouncer)
 * est réellement joignable, et pas seulement DIRECT_URL (URL utilisée par
 * `prisma migrate deploy` via `directUrl` dans schema.prisma).
 *
 * `prisma migrate deploy` réussissant ne prouve RIEN sur DATABASE_URL : avec un
 * DIRECT_URL vivant et un DATABASE_URL mort, le serveur démarrait, /health
 * renvoyait « degraded » et toutes les routes métier renvoyaient 500.
 *
 * Appelée depuis le script npm `db:check:runtime`, enchaîné dans `start:prod`
 * juste après `prisma:deploy:strict` et AVANT `node server.js` : le processus
 * serveur n'est jamais lancé si la base d'exécution est inutilisable.
 *
 * @param {object}  [options]
 * @param {object}  [options.env=process.env]
 * @param {number}  [options.timeoutMs] - défaut : STARTUP_DB_PROBE_TIMEOUT_MS ou 15000
 * @param {Function} [options.exit=process.exit]
 * @returns {Promise<boolean>} true si la base répond
 */
export async function assertDatabaseUrlReachable({
  env = process.env,
  timeoutMs = Number.parseInt(env.STARTUP_DB_PROBE_TIMEOUT_MS ?? '', 10) || 15000,
  exit = (code) => process.exit(code),
} = {}) {
  const fail = (detail) => {
    console.error(
      `\n============================================================\n` +
        `[start:prod] FATAL - DATABASE_URL est INJOIGNABLE.\n` +
        `${detail}\n` +
        `Le serveur NE DEMARRE PAS : DATABASE_URL est l'URL utilisee par le\n` +
        `PrismaClient d'execution (pooler). Elle est DIFFERENTE de DIRECT_URL,\n` +
        `seule verifiee par 'prisma migrate deploy'. Servir du trafic sans elle\n` +
        `produirait des 500 sur toutes les routes metier avec un /health vert.\n` +
        `A verifier : valeur de DATABASE_URL, accessibilite du pooler,\n` +
        `regles reseau/IP du fournisseur PostgreSQL.\n` +
        `============================================================\n`
    )
    exit(1)
    return false
  }

  if (isBlank(env, 'DATABASE_URL')) {
    return fail('Cause : la variable DATABASE_URL est absente ou vide.')
  }

  const { PrismaClient } = await import('@prisma/client')
  const client = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: ['error'] })
  let timer

  try {
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`aucune reponse apres ${timeoutMs} ms`)),
          timeoutMs
        )
      }),
    ])
    console.log('[validateEnv] OK: DATABASE_URL joignable (SELECT 1).')
    return true
  } catch (err) {
    return fail(`Cause : ${firstMeaningfulLine(err)}`)
  } finally {
    clearTimeout(timer)
    await client.$disconnect().catch(() => {})
  }
}
