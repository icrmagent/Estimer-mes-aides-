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

// ─── Formats de contact : code postal / téléphone / email ────────────────────
//
// Règle projet n°9 : double validation client ET backend.
// ⚠️ MIROIR STRICT de src/backend/src/lib/contactFormats.js — toute évolution
// d'une règle doit être répercutée des deux côtés (les mêmes cas de référence
// sont testés ici et dans src/backend/tests/lib/contactFormats.test.js).
//
// Field IDs CRM concernés — source de vérité docs/CONTEXT.md :
//   2089 Code postal · 2015 Num. de Téléphone · 2016 Adresse Email

export const CRM_FIELD_ID_CODE_POSTAL = 2089
export const CRM_FIELD_ID_TELEPHONE = 2015
export const CRM_FIELD_ID_EMAIL = 2016

const CONTACT_KIND_BY_FIELD_ID = {
  [CRM_FIELD_ID_CODE_POSTAL]: 'code_postal',
  [CRM_FIELD_ID_TELEPHONE]: 'telephone',
  [CRM_FIELD_ID_EMAIL]: 'email',
}

const FIVE_DIGITS = { test: /^\d{5}$/, format: c => c, exemple: '12345' }
const FOUR_DIGITS = { test: /^\d{4}$/, format: c => c, exemple: '1234' }
const SIX_DIGITS = { test: /^\d{6}$/, format: c => c, exemple: '123456' }
const THREE_TWO = { test: /^\d{5}$/, format: c => `${c.slice(0, 3)} ${c.slice(3)}`, exemple: '123 45' }

const POSTAL_RULES = {
  FR: FIVE_DIGITS, GP: FIVE_DIGITS, MQ: FIVE_DIGITS, GF: FIVE_DIGITS, RE: FIVE_DIGITS,
  YT: FIVE_DIGITS, PM: FIVE_DIGITS, BL: FIVE_DIGITS, MF: FIVE_DIGITS, NC: FIVE_DIGITS,
  PF: FIVE_DIGITS, WF: FIVE_DIGITS, MC: FIVE_DIGITS,
  ES: FIVE_DIGITS, IT: FIVE_DIGITS, DE: FIVE_DIGITS, SM: FIVE_DIGITS, FI: FIVE_DIGITS,
  GR: FIVE_DIGITS, HR: FIVE_DIGITS, LT: FIVE_DIGITS, EE: FIVE_DIGITS, RS: FIVE_DIGITS,
  TR: FIVE_DIGITS, MX: FIVE_DIGITS, MA: FIVE_DIGITS, DZ: FIVE_DIGITS,
  BE: FOUR_DIGITS, LU: FOUR_DIGITS, CH: FOUR_DIGITS, LI: FOUR_DIGITS, AT: FOUR_DIGITS,
  DK: FOUR_DIGITS, NO: FOUR_DIGITS, HU: FOUR_DIGITS, BG: FOUR_DIGITS, SI: FOUR_DIGITS,
  CY: FOUR_DIGITS, AU: FOUR_DIGITS, NZ: FOUR_DIGITS, TN: FOUR_DIGITS,
  RO: SIX_DIGITS, RU: SIX_DIGITS, CN: SIX_DIGITS, IN: SIX_DIGITS, SG: SIX_DIGITS,
  SE: THREE_TWO, CZ: THREE_TWO, SK: THREE_TWO,
  PL: { test: /^\d{5}$/, format: c => `${c.slice(0, 2)}-${c.slice(2)}`, exemple: '12-345' },
  PT: { test: /^\d{4}(\d{3})?$/, format: c => (c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4)}` : c), exemple: '1234-567' },
  NL: { test: /^\d{4}[A-Z]{2}$/, format: c => `${c.slice(0, 4)} ${c.slice(4)}`, exemple: '1234 AB' },
  GB: { test: /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/, format: c => `${c.slice(0, -3)} ${c.slice(-3)}`, exemple: 'SW1A 1AA' },
  IE: { test: /^[A-Z]\d[\dW][0-9A-Z]{4}$/, format: c => `${c.slice(0, 3)} ${c.slice(3)}`, exemple: 'D02 AF30' },
  CA: { test: /^[A-Z]\d[A-Z]\d[A-Z]\d$/, format: c => `${c.slice(0, 3)} ${c.slice(3)}`, exemple: 'K1A 0B1' },
  US: { test: /^\d{5}(\d{4})?$/, format: c => (c.length === 9 ? `${c.slice(0, 5)}-${c.slice(5)}` : c), exemple: '12345' },
  BR: { test: /^\d{8}$/, format: c => `${c.slice(0, 5)}-${c.slice(5)}`, exemple: '12345-678' },
  JP: { test: /^\d{7}$/, format: c => `${c.slice(0, 3)}-${c.slice(3)}`, exemple: '123-4567' },
  MT: { test: /^[A-Z]{3}\d{4}$/, format: c => `${c.slice(0, 3)} ${c.slice(3)}`, exemple: 'VLT 1117' },
  AD: { test: /^AD\d{3}$/, format: c => c, exemple: 'AD500' },
}

// Repli permissif mais réel : 3 à 10 caractères alphanumériques, au moins un
// chiffre. Aucun pays n'utilise un code postal purement alphabétique, donc
// "TEST AUDIT" est rejeté sans imposer une règle franco-française ailleurs.
const GENERIC_POSTAL_RULE = { test: /^(?=[A-Z0-9]*\d)[A-Z0-9]{3,10}$/, format: c => c, exemple: null }

const PHONE_RULES = {
  FR: { dial: '33', trunk: '0', nsn: [9, 9] },
  BE: { dial: '32', trunk: '0', nsn: [8, 9] },
  LU: { dial: '352', trunk: null, nsn: [4, 11] },
  CH: { dial: '41', trunk: '0', nsn: [9, 9] },
  LI: { dial: '423', trunk: null, nsn: [7, 9] },
  MC: { dial: '377', trunk: null, nsn: [8, 9] },
  AD: { dial: '376', trunk: null, nsn: [6, 9] },
  ES: { dial: '34', trunk: null, nsn: [9, 9] },
  PT: { dial: '351', trunk: null, nsn: [9, 9] },
  IT: { dial: '39', trunk: null, nsn: [6, 11] },
  SM: { dial: '378', trunk: null, nsn: [6, 10] },
  DE: { dial: '49', trunk: '0', nsn: [6, 11] },
  AT: { dial: '43', trunk: '0', nsn: [4, 13] },
  NL: { dial: '31', trunk: '0', nsn: [9, 9] },
  GB: { dial: '44', trunk: '0', nsn: [9, 10] },
  IE: { dial: '353', trunk: '0', nsn: [7, 9] },
  DK: { dial: '45', trunk: null, nsn: [8, 8] },
  NO: { dial: '47', trunk: null, nsn: [8, 8] },
  SE: { dial: '46', trunk: '0', nsn: [7, 13] },
  FI: { dial: '358', trunk: '0', nsn: [5, 12] },
  IS: { dial: '354', trunk: null, nsn: [7, 9] },
  PL: { dial: '48', trunk: null, nsn: [9, 9] },
  CZ: { dial: '420', trunk: null, nsn: [9, 9] },
  SK: { dial: '421', trunk: '0', nsn: [9, 9] },
  HU: { dial: '36', trunk: '06', nsn: [8, 9] },
  RO: { dial: '40', trunk: '0', nsn: [9, 9] },
  BG: { dial: '359', trunk: '0', nsn: [8, 9] },
  GR: { dial: '30', trunk: null, nsn: [10, 10] },
  HR: { dial: '385', trunk: '0', nsn: [8, 9] },
  SI: { dial: '386', trunk: '0', nsn: [8, 8] },
  RS: { dial: '381', trunk: '0', nsn: [8, 9] },
  LT: { dial: '370', trunk: '8', nsn: [8, 8] },
  LV: { dial: '371', trunk: null, nsn: [8, 8] },
  EE: { dial: '372', trunk: null, nsn: [7, 8] },
  CY: { dial: '357', trunk: null, nsn: [8, 8] },
  MT: { dial: '356', trunk: null, nsn: [8, 8] },
  TR: { dial: '90', trunk: '0', nsn: [10, 10] },
  UA: { dial: '380', trunk: '0', nsn: [9, 9] },
  RU: { dial: '7', trunk: '8', nsn: [10, 10] },
  KZ: { dial: '7', trunk: '8', nsn: [10, 10] },
  US: { dial: '1', trunk: null, nsn: [10, 10] },
  CA: { dial: '1', trunk: null, nsn: [10, 10] },
  GP: { dial: '590', trunk: '0', nsn: [9, 9] },
  BL: { dial: '590', trunk: '0', nsn: [9, 9] },
  MF: { dial: '590', trunk: '0', nsn: [9, 9] },
  MQ: { dial: '596', trunk: '0', nsn: [9, 9] },
  GF: { dial: '594', trunk: '0', nsn: [9, 9] },
  RE: { dial: '262', trunk: '0', nsn: [9, 9] },
  YT: { dial: '262', trunk: '0', nsn: [9, 9] },
  PM: { dial: '508', trunk: null, nsn: [6, 6] },
  NC: { dial: '687', trunk: null, nsn: [6, 6] },
  PF: { dial: '689', trunk: null, nsn: [8, 8] },
  WF: { dial: '681', trunk: null, nsn: [6, 6] },
  MA: { dial: '212', trunk: '0', nsn: [9, 9] },
  DZ: { dial: '213', trunk: '0', nsn: [8, 9] },
  TN: { dial: '216', trunk: null, nsn: [8, 8] },
  SN: { dial: '221', trunk: null, nsn: [9, 9] },
  CI: { dial: '225', trunk: null, nsn: [8, 10] },
  ML: { dial: '223', trunk: null, nsn: [8, 8] },
  CM: { dial: '237', trunk: null, nsn: [8, 9] },
  GA: { dial: '241', trunk: null, nsn: [7, 8] },
  BR: { dial: '55', trunk: '0', nsn: [10, 11] },
  MX: { dial: '52', trunk: '01', nsn: [10, 10] },
  AR: { dial: '54', trunk: '0', nsn: [10, 11] },
  CL: { dial: '56', trunk: null, nsn: [9, 9] },
  CO: { dial: '57', trunk: null, nsn: [10, 10] },
  CN: { dial: '86', trunk: '0', nsn: [9, 11] },
  IN: { dial: '91', trunk: '0', nsn: [10, 10] },
  JP: { dial: '81', trunk: '0', nsn: [9, 10] },
  AU: { dial: '61', trunk: '0', nsn: [9, 9] },
  NZ: { dial: '64', trunk: '0', nsn: [8, 10] },
  ZA: { dial: '27', trunk: '0', nsn: [9, 9] },
  IL: { dial: '972', trunk: '0', nsn: [8, 9] },
  AE: { dial: '971', trunk: '0', nsn: [8, 9] },
}

const RULE_BY_DIAL = (() => {
  const map = new Map()
  for (const rule of Object.values(PHONE_RULES)) {
    if (!map.has(rule.dial)) map.set(rule.dial, rule)
  }
  return map
})()

const DIAL_LENGTHS = [...new Set([...RULE_BY_DIAL.keys()].map(d => d.length))].sort((a, b) => b - a)

const E164_MAX_DIGITS = 15
const E164_MIN_DIGITS = 8

const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/

/**
 * Messages d'erreur traduits FR / ES / EN.
 * Le projet n'a pas de fichier de traduction : utils/i18n.js ne résout que les
 * libellés trilingues venant de la base, les textes statiques sont portés par
 * le code (cf. FormPage, BorneInfoBar). Ce dictionnaire suit cette convention.
 */
export const CONTACT_ERROR_MESSAGES = {
  fr: {
    CODE_POSTAL_VIDE: 'Le code postal est obligatoire',
    CODE_POSTAL_INVALIDE: 'Code postal invalide',
    TELEPHONE_VIDE: 'Le numéro de téléphone est obligatoire',
    TELEPHONE_CARACTERES_INVALIDES: 'Le numéro ne doit contenir que des chiffres',
    TELEPHONE_INTERNATIONAL_REQUIS: 'Numéro au format international requis',
    TELEPHONE_INVALIDE: 'Numéro de téléphone invalide',
    EMAIL_VIDE: "L'adresse email est obligatoire",
    EMAIL_INVALIDE: 'Adresse email invalide',
    EXEMPLE: 'format attendu',
  },
  es: {
    CODE_POSTAL_VIDE: 'El código postal es obligatorio',
    CODE_POSTAL_INVALIDE: 'Código postal no válido',
    TELEPHONE_VIDE: 'El número de teléfono es obligatorio',
    TELEPHONE_CARACTERES_INVALIDES: 'El número solo debe contener cifras',
    TELEPHONE_INTERNATIONAL_REQUIS: 'Se requiere un número en formato internacional',
    TELEPHONE_INVALIDE: 'Número de teléfono no válido',
    EMAIL_VIDE: 'El correo electrónico es obligatorio',
    EMAIL_INVALIDE: 'Correo electrónico no válido',
    EXEMPLE: 'formato esperado',
  },
  en: {
    CODE_POSTAL_VIDE: 'Postal code is required',
    CODE_POSTAL_INVALIDE: 'Invalid postal code',
    TELEPHONE_VIDE: 'Phone number is required',
    TELEPHONE_CARACTERES_INVALIDES: 'The number must contain digits only',
    TELEPHONE_INTERNATIONAL_REQUIS: 'A phone number in international format is required',
    TELEPHONE_INVALIDE: 'Invalid phone number',
    EMAIL_VIDE: 'Email address is required',
    EMAIL_INVALIDE: 'Invalid email address',
    EXEMPLE: 'expected format',
  },
}

/**
 * Message d'erreur lisible, traduit dans la langue de la borne.
 * @param {string} code
 * @param {'fr'|'es'|'en'} [langue]
 * @param {string|null} [exemple]
 * @returns {string}
 */
export function contactErrorMessage(code, langue = 'fr', exemple = null) {
  const dict = CONTACT_ERROR_MESSAGES[langue] || CONTACT_ERROR_MESSAGES.fr
  const base = dict[code] || dict.CODE_POSTAL_INVALIDE
  return exemple ? `${base} (${dict.EXEMPLE} : ${exemple})` : base
}

function normalisePays(pays) {
  if (typeof pays !== 'string') return ''
  return pays.trim().toUpperCase().slice(0, 2)
}

function compactPostal(value) {
  return String(value).toUpperCase().replace(/[\s.\-–—]/g, '')
}

/**
 * Valide et normalise un code postal selon le pays de la borne.
 * @param {string} value
 * @param {string} [pays] - ISO 3166-1 alpha-2 (Borne.pays)
 * @returns {{ valid: boolean, value: string, code?: string, exemple: string|null }}
 */
export function validateCodePostal(value, pays) {
  const brut = value === null || value === undefined ? '' : String(value)
  const compact = compactPostal(brut)
  if (compact === '') return { valid: false, value: brut, code: 'CODE_POSTAL_VIDE', exemple: null }

  const rule = POSTAL_RULES[normalisePays(pays)] || GENERIC_POSTAL_RULE
  if (!rule.test.test(compact)) {
    return { valid: false, value: brut, code: 'CODE_POSTAL_INVALIDE', exemple: rule.exemple }
  }
  return { valid: true, value: rule.format(compact), exemple: rule.exemple }
}

function findRuleByDial(digits) {
  for (const len of DIAL_LENGTHS) {
    const rule = RULE_BY_DIAL.get(digits.slice(0, len))
    if (rule) return rule
  }
  return null
}

function stripTrunk(nsn, trunk) {
  if (!trunk) return nsn
  return nsn.startsWith(trunk) && nsn.length > trunk.length ? nsn.slice(trunk.length) : nsn
}

/**
 * Valide un téléphone et le normalise en E.164.
 * « +33 0600000000 » → « +33600000000 » (le 0 national est retiré).
 * @param {string} value
 * @param {string} [pays] - ISO alpha-2, utilisé quand la valeur n'a pas d'indicatif
 * @returns {{ valid: boolean, value: string, code?: string, exemple: null }}
 */
export function validateTelephone(value, pays) {
  const brut = value === null || value === undefined ? '' : String(value).trim()
  if (brut === '') return { valid: false, value: brut, code: 'TELEPHONE_VIDE', exemple: null }

  if (!/^\+?[\d\s().\-/]+$/.test(brut)) {
    return { valid: false, value: brut, code: 'TELEPHONE_CARACTERES_INVALIDES', exemple: null }
  }

  let digits = brut.replace(/\D/g, '')
  let international = brut.startsWith('+')
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2)
    international = true
  }
  if (digits === '') return { valid: false, value: brut, code: 'TELEPHONE_VIDE', exemple: null }

  const rule = international ? findRuleByDial(digits) : PHONE_RULES[normalisePays(pays)] || null

  if (!rule) {
    if (!international) {
      return { valid: false, value: brut, code: 'TELEPHONE_INTERNATIONAL_REQUIS', exemple: null }
    }
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
      return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE', exemple: null }
    }
    return { valid: true, value: `+${digits}`, exemple: null }
  }

  const nsn = stripTrunk(international ? digits.slice(rule.dial.length) : digits, rule.trunk)
  const [min, max] = rule.nsn
  if (nsn.length < min || nsn.length > max) {
    return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE', exemple: null }
  }

  const e164 = `+${rule.dial}${nsn}`
  if (e164.length - 1 > E164_MAX_DIGITS) {
    return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE', exemple: null }
  }
  return { valid: true, value: e164, exemple: null }
}

/**
 * Valide une adresse email et la normalise en minuscules.
 * @param {string} value
 * @returns {{ valid: boolean, value: string, code?: string, exemple: null }}
 */
export function validateEmailAddress(value) {
  const brut = value === null || value === undefined ? '' : String(value).trim()
  if (brut === '') return { valid: false, value: brut, code: 'EMAIL_VIDE', exemple: null }
  if (brut.length > 254) return { valid: false, value: brut, code: 'EMAIL_INVALIDE', exemple: null }

  const [local] = brut.split('@')
  if (!local || local.length > 64) {
    return { valid: false, value: brut, code: 'EMAIL_INVALIDE', exemple: null }
  }
  if (!EMAIL_RE.test(brut)) return { valid: false, value: brut, code: 'EMAIL_INVALIDE', exemple: null }

  return { valid: true, value: brut.toLowerCase(), exemple: null }
}

/**
 * Détermine le format à contrôler pour une question du formulaire dynamique.
 * Miroir de detectContactFormat() côté backend : une question portant plusieurs
 * field IDs CRM ne peut pas être rattachée à un champ unique.
 * @param {{ crmFieldIds?: any, typeOption?: string }} question
 * @returns {'code_postal'|'telephone'|'email'|null}
 */
export function detectContactFormat(question) {
  if (!question) return null
  if (question.typeOption === 'telephone') return 'telephone'
  if (question.typeOption === 'email') return 'email'

  const raw = question.crmFieldIds
  if (raw === null || raw === undefined) return null
  const ids = (Array.isArray(raw) ? raw : [raw])
    .map(id => (typeof id === 'string' ? Number.parseInt(id, 10) : id))
    .filter(id => Number.isInteger(id))

  return ids.length === 1 ? CONTACT_KIND_BY_FIELD_ID[ids[0]] || null : null
}

/**
 * Valide la réponse à une question et renvoie un message traduit si invalide.
 * Une réponse vide n'est pas contrôlée ici : le caractère obligatoire reste géré
 * par isStepValid dans FormPage, et l'abandon poste volontairement du partiel.
 *
 * @param {{ crmFieldIds?: any, typeOption?: string }} question
 * @param {any} value
 * @param {{ pays?: string, langue?: 'fr'|'es'|'en' }} [options]
 * @returns {string|null} message d'erreur traduit, ou null si la valeur est valide
 */
export function validateQuestionValue(question, value, { pays, langue = 'fr' } = {}) {
  const kind = detectContactFormat(question)
  if (!kind) return null
  if (typeof value !== 'string' || value.trim() === '') return null

  let result
  if (kind === 'code_postal') result = validateCodePostal(value, pays)
  else if (kind === 'telephone') result = validateTelephone(value, pays)
  else result = validateEmailAddress(value)

  return result.valid ? null : contactErrorMessage(result.code, langue, result.exemple)
}

/**
 * Normalise la réponse à une question de contact avant envoi API.
 * Renvoie `{ valid: true, value }` avec la valeur canonique (CP formaté,
 * téléphone E.164, email en minuscules), ou `{ valid: false }` si le format
 * est invalide. Les questions hors contact sont renvoyées inchangées.
 *
 * @param {{ crmFieldIds?: any, typeOption?: string }} question
 * @param {any} value
 * @param {{ pays?: string }} [options]
 * @returns {{ valid: boolean, value: any }}
 */
export function normalizeQuestionValue(question, value, { pays } = {}) {
  const kind = detectContactFormat(question)
  if (!kind) return { valid: true, value }
  if (typeof value !== 'string' || value.trim() === '') return { valid: true, value }

  let result
  if (kind === 'code_postal') result = validateCodePostal(value, pays)
  else if (kind === 'telephone') result = validateTelephone(value, pays)
  else result = validateEmailAddress(value)

  return { valid: result.valid, value: result.valid ? result.value : value }
}
