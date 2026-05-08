/**
 * errorSanitizer.js
 *
 * Sanitizes errors before sending them to the client.
 * - Maps Prisma error codes to safe HTTP responses (P7)
 * - Strips table names, column names, file paths from messages in production (P7)
 * - Never sends stack traces to the client in production (P8)
 */
import logger from './logger.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// ─── Prisma error code → safe response mapping ────────────────────────────────

const PRISMA_ERROR_MAP = {
  P2002: {
    status: 409,
    code: 'DUPLICATE',
    message: 'Cette ressource existe déjà.',
  },
  P2025: {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Ressource introuvable.',
  },
  P2003: {
    status: 409,
    code: 'FOREIGN_KEY_VIOLATION',
    message: 'Opération impossible : une ressource liée existe encore.',
  },
}

/**
 * Strip internal details from a raw Prisma error message.
 * Removes table names, column names, file paths, and stack-like content.
 *
 * @param {string} raw - raw error message from Prisma
 * @returns {string} sanitized message safe for client consumption
 */
function stripPrismaInternals(raw) {
  if (!raw || typeof raw !== 'string') return 'Erreur base de données.'

  // Remove file paths (e.g. /app/node_modules/.prisma/...)
  let sanitized = raw.replace(/\/?[\w./\\-]+\.(js|ts|prisma|json)\b/g, '[file]')

  // Remove table/model references like `"table"."column"`
  sanitized = sanitized.replace(/"[^"]+"\."[^"]+"/g, '[field]')
  sanitized = sanitized.replace(/`[^`]+`\.[^`\s]+/g, '[field]')

  // Remove Prisma-specific meta like "Unique constraint failed on the fields: (`idBorne`)"
  sanitized = sanitized.replace(/\(.*?\)/g, '')

  // Collapse whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim()

  return sanitized || 'Erreur base de données.'
}

/**
 * Sanitize a Prisma error into a safe HTTP response object.
 *
 * @param {Error} err - Prisma error (has .code property)
 * @param {string} [contextMessage] - optional human-readable override for known codes
 * @returns {{ status: number, body: object }}
 */
export function sanitizePrismaError(err, contextMessage) {
  const mapped = PRISMA_ERROR_MAP[err.code]

  if (mapped) {
    return {
      status: mapped.status,
      body: {
        success: false,
        error: {
          code: mapped.code,
          message: contextMessage || mapped.message,
        },
      },
    }
  }

  // Unknown Prisma error — generic 500
  const devMessage = IS_PRODUCTION
    ? 'Erreur base de données.'
    : stripPrismaInternals(err.message)

  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: devMessage,
      },
    },
  }
}

/**
 * Sanitize a Zod validation error into a safe HTTP response object.
 *
 * @param {import('zod').ZodError} zodError
 * @param {string} [message] - optional top-level message override
 * @returns {{ status: number, body: object }}
 */
export function sanitizeValidationError(zodError, message = 'Données invalides.') {
  return {
    status: 400,
    body: {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
        details: zodError.flatten ? zodError.flatten() : zodError.errors,
      },
    },
  }
}

/**
 * Global Express error handler middleware.
 * Mount LAST in app.js: app.use(globalErrorHandler)
 *
 * Handles:
 *  - Prisma errors (identified by err.code starting with 'P')
 *  - Generic errors
 *  - Never leaks stack traces in production (P8)
 *
 * @type {import('express').ErrorRequestHandler}
 */
export function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Log the full error server-side (stack trace stays on the server)
  logger.error({
    message: '[GLOBAL ERROR]',
    errorMessage: err.message,
    code: err.code,
    stack: IS_PRODUCTION ? '[hidden in production]' : err.stack,
    path: req.path,
    method: req.method,
  })

  // Prisma errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    const { status, body } = sanitizePrismaError(err)
    return res.status(status).json(body)
  }

  // HTTP errors with explicit status (e.g. from express-rate-limit or csrf-csrf)
  if (err.status && err.status < 500) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code || 'CLIENT_ERROR',
        message: err.message || 'Requête invalide.',
      },
    })
  }

  // Generic 500 — never leak internals in production
  const message = IS_PRODUCTION ? 'Erreur serveur interne.' : (err.message || 'Erreur serveur interne.')

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      // Only include stack in development
      ...(IS_PRODUCTION ? {} : { stack: err.stack }),
    },
  })
}
