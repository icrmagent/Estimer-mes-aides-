import { z } from 'zod'

/**
 * Schémas de validation Zod côté client — miroir des schémas backend.
 * Utilisés pour valider les données avant soumission à l'API.
 *
 * Règle projet : double validation client + backend (Zod des deux côtés).
 */

// ─── Schéma d'une réponse individuelle ───────────────────────────────────────

export const ReponseSchema = z.object({
  questionId: z.string().min(1, 'questionId requis'),
  valeur: z.string().min(1, 'valeur requise'),
})

// ─── Schéma de soumission d'un enregistrement ────────────────────────────────

export const EnregistrementSchema = z.object({
  borneId: z.string().uuid('borneId doit être un UUID v4 valide'),
  formulaireId: z.string().uuid('formulaireId doit être un UUID v4 valide'),
  langueUtilisee: z.enum(['fr', 'es', 'en']).default('fr'),
  reponses: z
    .array(ReponseSchema)
    .min(1, 'Au moins une réponse est requise'),
})

// ─── Schéma de configuration borne (réponse API) ─────────────────────────────

export const BorneConfigSchema = z.object({
  borne: z.object({
    id: z.string().uuid(),
    idBorne: z.string().optional(),
    langueDefaut: z.enum(['fr', 'es', 'en']).default('fr'),
    adresse: z.string().optional(),
    commercant: z.string().optional(),
    regie: z.string().optional(),
    installateur: z.string().optional(),
  }),
  formulaire: z.object({
    id: z.string().uuid(),
    label: z.string(),
    version: z.number().int().positive(),
    dureeRetourAccueil: z.number().int().positive().default(30),
    annulationInactivite: z.number().int().positive().default(120),
    pageDebutConfig: z.record(z.unknown()).optional(),
    pageFinConfig: z.record(z.unknown()).optional(),
    questions: z.array(z.unknown()).default([]),
  }),
})

// ─── Helpers de validation ────────────────────────────────────────────────────

/**
 * Valide un enregistrement avant soumission.
 * @param {object} data
 * @returns {{ success: boolean, errors?: object, data?: object }}
 */
export function validateEnregistrement(data) {
  const result = EnregistrementSchema.safeParse(data)
  if (!result.success) {
    return { success: false, errors: result.error.flatten() }
  }
  return { success: true, data: result.data }
}

/**
 * Valide la config borne reçue de l'API.
 * @param {object} data
 * @returns {{ success: boolean, errors?: object, data?: object }}
 */
export function validateBorneConfig(data) {
  const result = BorneConfigSchema.safeParse(data)
  if (!result.success) {
    return { success: false, errors: result.error.flatten() }
  }
  return { success: true, data: result.data }
}
