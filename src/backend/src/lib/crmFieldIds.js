/**
 * src/lib/crmFieldIds.js
 *
 * Source of truth for valid CRM field IDs.
 * These IDs correspond to the 23 fields used in the 15-step form.
 * Never invent new IDs — only use values from this list.
 *
 * Reference (docs/CONTEXT.md + backend-standards.md):
 *   2262 Civilité       | 2087 Nom           | 2088 Prénom         | 2217 Adresse
 *   2089 Code postal    | 2090 Ville          | 2015 Téléphone      | 2016 Email
 *   2294 Revenu fiscal  | 2293 Statut proprio | 2292 Type logement  | 2306 Date construction
 *   2307 Surface        | 2296 Type combles   | 2298 Type plancher  | 2300 Trappe accès
 *   2301 Type chauffage | 2302 Isolation souh.| 2297 Type isolation | 2299 Travaux souhaités
 *   2303 Disponibilité  | 2304 Commentaires   | 2305 Autres besoins
 */

export const VALID_CRM_FIELD_IDS = [
  2262, // Civilité
  2087, // Nom
  2088, // Prénom
  2217, // Adresse
  2089, // Code postal
  2090, // Ville
  2015, // Téléphone
  2016, // Email
  2294, // Revenu fiscal
  2293, // Statut propriétaire
  2292, // Type logement
  2306, // Date construction
  2307, // Surface
  2296, // Type combles
  2298, // Type plancher
  2300, // Trappe accès
  2301, // Type chauffage
  2302, // Isolation souhaitée
  2297, // Type isolation
  2299, // Travaux souhaités
  2303, // Disponibilité contact
  2304, // Commentaires
  2305, // Autres besoins
]

/**
 * Validates an array of CRM field IDs against the approved list.
 *
 * @param {number[]} fieldIds - Array of field IDs to validate
 * @returns {number[]} Array of invalid IDs (empty array means all are valid)
 */
export function validateCRMFieldIds(fieldIds) {
  if (!Array.isArray(fieldIds)) return []
  return fieldIds.filter((id) => !VALID_CRM_FIELD_IDS.includes(id))
}
