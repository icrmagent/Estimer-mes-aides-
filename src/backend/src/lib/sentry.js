import * as Sentry from '@sentry/node'
import logger from './logger.js'

let sentryEnabled = false

export function initSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    })
    sentryEnabled = true
    logger.info('Sentry initialized.')
  } else {
    logger.warn('SENTRY_DSN not set — Sentry error tracking disabled.')
  }
}

export function isSentryEnabled() {
  return sentryEnabled
}

export { Sentry }
