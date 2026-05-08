/**
 * metrics.js — StatsD client via hot-shots
 *
 * Tracks application metrics:
 *   - ema.submissions.created     (increment)
 *   - ema.crm.sync                (increment, tagged success:true/false)
 *   - ema.response_time_ms        (timing)
 *   - ema.queue.jobs              (gauge, tagged status)
 *
 * If hot-shots is not installed, all functions are no-ops so the app
 * never crashes due to a missing optional dependency.
 *
 * On StatsD error, logs a warning and continues — never crashes.
 */

import logger from './logger.js'

// ─── Build the StatsD client (or a no-op fallback) ───────────────────────────

let statsd = null

try {
  // hot-shots is a CJS package; use createRequire for ESM compatibility
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const { StatsD } = require('hot-shots')

  statsd = new StatsD({
    host: process.env.STATSD_HOST || 'localhost',
    port: parseInt(process.env.STATSD_PORT || '8125', 10),
    prefix: '',          // metrics already carry the full name
    errorHandler: (err) => {
      logger.warn(`StatsD error — metrics may be lost: ${err.message}`)
    },
  })

  logger.info('StatsD metrics client (hot-shots) initialized.')
} catch (err) {
  logger.warn(`hot-shots not installed — metrics disabled. Install with: npm install hot-shots (${err.message})`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a plain tags object { key: value, ... } to the hot-shots array
 * format ['key:value', ...].
 */
function buildTags(tags) {
  if (!tags) return []
  return Object.entries(tags).map(([k, v]) => `${k}:${v}`)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Increment a counter metric.
 * @param {string} metric  - Metric name (e.g. 'ema.submissions.created')
 * @param {object} [tags]  - Optional tags object (e.g. { success: 'true' })
 */
export function increment(metric, tags) {
  if (!statsd) return
  try {
    statsd.increment(metric, 1, buildTags(tags))
  } catch (err) {
    logger.warn(`metrics.increment failed for "${metric}": ${err.message}`)
  }
}

/**
 * Record a timing metric in milliseconds.
 * @param {string} metric  - Metric name (e.g. 'ema.response_time_ms')
 * @param {number} value   - Duration in milliseconds
 * @param {object} [tags]  - Optional tags object
 */
export function timing(metric, value, tags) {
  if (!statsd) return
  try {
    statsd.timing(metric, value, buildTags(tags))
  } catch (err) {
    logger.warn(`metrics.timing failed for "${metric}": ${err.message}`)
  }
}

/**
 * Record a gauge metric.
 * @param {string} metric  - Metric name (e.g. 'ema.queue.jobs')
 * @param {number} value   - Current value
 * @param {object} [tags]  - Optional tags object (e.g. { status: 'pending' })
 */
export function gauge(metric, value, tags) {
  if (!statsd) return
  try {
    statsd.gauge(metric, value, buildTags(tags))
  } catch (err) {
    logger.warn(`metrics.gauge failed for "${metric}": ${err.message}`)
  }
}

// ─── Named metric helpers (convenience wrappers) ─────────────────────────────

/** Track a new form submission created. */
export function trackSubmissionCreated() {
  increment('ema.submissions.created')
}

/** Track a CRM sync attempt. @param {boolean} success */
export function trackCrmSync(success) {
  increment('ema.crm.sync', { success: String(success) })
}

/** Track an HTTP response time. @param {number} ms */
export function trackResponseTime(ms) {
  timing('ema.response_time_ms', ms)
}

/** Track queue job count by status. @param {string} status @param {number} count */
export function trackQueueJobs(status, count) {
  gauge('ema.queue.jobs', count, { status })
}

export default { increment, timing, gauge, trackSubmissionCreated, trackCrmSync, trackResponseTime, trackQueueJobs }
