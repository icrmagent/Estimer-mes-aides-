/**
 * tracer.js — APM auto-detection
 *
 * MUST be imported as the VERY FIRST import in server.js (before all other
 * imports) so that dd-trace can instrument modules as they are loaded.
 *
 * Priority order:
 *   1. Datadog  — DD_API_KEY or DD_AGENT_HOST present
 *   2. New Relic — NEW_RELIC_LICENSE_KEY present
 *   3. No-op    — log warning and export stub
 *
 * This file never crashes even if neither APM package is installed.
 */

import logger from './logger.js'

// No-op tracer stub — used when no APM is configured or package is missing
const noopTracer = {
  trace: (_name, _options, fn) => (typeof fn === 'function' ? fn({}) : Promise.resolve()),
  wrap: (_name, fn) => fn,
  startSpan: () => ({ finish: () => {}, setTag: () => {} }),
  scope: () => ({ active: () => null }),
  inject: () => {},
  extract: () => null,
}

let tracer = noopTracer

if (process.env.DD_API_KEY || process.env.DD_AGENT_HOST) {
  try {
    // dd-trace must be loaded via createRequire because it is a CJS package
    // and must be the very first thing loaded to instrument other modules.
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    const ddTrace = require('dd-trace')
    tracer = ddTrace.init({
      logInjection: true,
      runtimeMetrics: true,
    })
    logger.info('Datadog APM (dd-trace) initialized.')
  } catch (err) {
    logger.warn(`dd-trace not installed — Datadog APM disabled. Install with: npm install dd-trace (${err.message})`)
  }
} else if (process.env.NEW_RELIC_LICENSE_KEY) {
  try {
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    require('newrelic')
    logger.info('New Relic APM initialized.')
  } catch (err) {
    logger.warn(`newrelic not installed — New Relic APM disabled. Install with: npm install newrelic (${err.message})`)
  }
} else {
  logger.warn('APM not configured — set DD_API_KEY or NEW_RELIC_LICENSE_KEY')
}

export default tracer
