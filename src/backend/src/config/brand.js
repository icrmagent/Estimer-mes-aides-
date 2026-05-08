/**
 * src/backend/src/config/brand.js
 *
 * Brand configuration — primary color is read from the PRIMARY_COLOR env var
 * at startup, defaulting to #5B2D8E if not set (ADR-2).
 *
 * PRIMARY_COLOR is an optional env var. Absent = default brand color.
 */

export const ALLOWED_PRIMARY_COLOR = process.env.PRIMARY_COLOR ?? '#5B2D8E'
