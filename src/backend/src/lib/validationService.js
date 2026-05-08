/**
 * src/backend/src/lib/validationService.js
 *
 * Shared validation helpers used across route handlers.
 */

import { ALLOWED_PRIMARY_COLOR } from '../config/brand.js'

/**
 * Validates that a couleurPrimaire value matches the allowed brand color.
 *
 * The allowed color is read from the PRIMARY_COLOR env var at startup
 * (default: #5B2D8E). This avoids hardcoding the color string in validators
 * so that a brand color change only requires an env var update (ADR-2).
 *
 * @param {string} color - The hex color string to validate.
 * @returns {boolean} true if the color matches ALLOWED_PRIMARY_COLOR, false otherwise.
 */
export function validatePrimaryColor(color) {
  return color === ALLOWED_PRIMARY_COLOR
}
