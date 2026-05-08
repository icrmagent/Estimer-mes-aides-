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
 */

/** Required environment variables — absence causes process.exit(1) */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'API_KEY_MOBILE',
  'API_KEY_CRM',
  'PUSHER_APP_ID',
  'PUSHER_KEY',
  'PUSHER_SECRET',
  'PUSHER_CLUSTER',
  'CORS_ALLOWED_ORIGINS',
  'NODE_ENV',
  'SUPERADMIN_EMAIL',
]

/** Optional environment variables — absence logs a warning, never exits */
const OPTIONAL_VARS = [
  { name: 'REDIS_URL', hint: 'Redis cache will be disabled — DB fallback enabled.' },
  { name: 'SENTRY_DSN', hint: 'Sentry error tracking will be disabled.' },
  { name: 'PRIMARY_COLOR', hint: 'Defaulting to #5B2D8E.' },
]

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
    if (!env[varName] || env[varName].trim() === '') {
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

  // Warn about missing optional variables (no exit)
  for (const { name, hint } of OPTIONAL_VARS) {
    if (!env[name] || env[name].trim() === '') {
      console.warn(`[validateEnv] WARNING: Optional variable ${name} is not set. ${hint}`)
    }
  }
}
