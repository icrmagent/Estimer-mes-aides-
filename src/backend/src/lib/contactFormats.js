/**
 * src/backend/src/lib/contactFormats.js
 *
 * Validation ET normalisation de format des champs de contact.
 * Règle projet n°9 : double validation, côté client ET côté backend.
 *
 * ── Field IDs CRM concernés ───────────────────────────────────────────────────
 * Source de vérité : docs/CONTEXT.md (tableau « Étape 1 — Sous-cat 63 »).
 * Aucun ID n'est inventé ici, ce sont exactement ceux du formulaire V1 :
 *   2089 → Code postal        (`projets_Cdigo_postal`)
 *   2015 → Num. de Téléphone  (`projets_Telfono_Propietario_inicia`)
 *   2016 → Adresse Email      (`projets_Correo_electrnico_Propietario_inicia`)
 *
 * ── Pays ─────────────────────────────────────────────────────────────────────
 * Le pays est disponible côté backend : `Borne.pays` (ISO 3166-1 alpha-2,
 * défaut "FR", ajouté au commit 806b69c). Le POST /api/enregistrements charge
 * déjà la borne pour vérifier la propriété AdminBorne : aucune requête
 * supplémentaire n'est nécessaire.
 *
 * ── Choix de conception ──────────────────────────────────────────────────────
 * 1. Code postal — si le pays a une règle documentée (table POSTAL_RULES),
 *    on applique CETTE règle (FR = 5 chiffres, BE = 4 chiffres, NL = NNNN AA…).
 *    Sinon on applique une règle générique PERMISSIVE MAIS RÉELLE :
 *    3 à 10 caractères alphanumériques ET au moins un chiffre.
 *    Justification : aucun pays au monde n'utilise un code postal purement
 *    alphabétique ; cette règle accepte tous les formats connus (y compris
 *    alphanumériques type GB/CA/IE/MT) tout en rejetant "TEST AUDIT".
 *    Elle n'invente pas de règle franco-française pour un pays inconnu.
 * 2. Téléphone — le pays est déterminé d'abord par l'indicatif présent dans la
 *    valeur (`+33…`, `0033…`), sinon par `Borne.pays`. Quand il est connu, on
 *    normalise en E.164 (préfixe national « trunk » retiré : "+33 0600000000"
 *    → "+33600000000"). Quand il ne l'est pas, on exige une valeur déjà au
 *    format international (« + » suivi de 8 à 15 chiffres, borne haute E.164).
 * 3. Les valeurs vides ne sont PAS rejetées ici : le caractère obligatoire est
 *    une règle métier distincte, et le front poste volontairement des réponses
 *    partielles à l'abandon (FormPage.handleManualAbandon).
 */

// ─── Field IDs CRM (docs/CONTEXT.md) ─────────────────────────────────────────

export const CRM_FIELD_ID_CODE_POSTAL = 2089
export const CRM_FIELD_ID_TELEPHONE = 2015
export const CRM_FIELD_ID_EMAIL = 2016

/** fieldId CRM → type de format à contrôler. */
export const CONTACT_KIND_BY_FIELD_ID = {
  [CRM_FIELD_ID_CODE_POSTAL]: 'code_postal',
  [CRM_FIELD_ID_TELEPHONE]: 'telephone',
  [CRM_FIELD_ID_EMAIL]: 'email',
}

// ─── Codes postaux ───────────────────────────────────────────────────────────

const FIVE_DIGITS = { test: /^\d{5}$/, format: (c) => c, exemple: '12345' }
const FOUR_DIGITS = { test: /^\d{4}$/, format: (c) => c, exemple: '1234' }
const SIX_DIGITS = { test: /^\d{6}$/, format: (c) => c, exemple: '123456' }

/** Groupe « NNN NN » (Suède, Tchéquie, Slovaquie). */
const THREE_TWO = {
  test: /^\d{5}$/,
  format: (c) => `${c.slice(0, 3)} ${c.slice(3)}`,
  exemple: '123 45',
}

/**
 * Règles par pays (ISO 3166-1 alpha-2). Le test porte sur la forme « compacte »
 * (majuscules, sans espace ni tiret) ; `format` reconstruit la forme canonique.
 * Tout pays absent de cette table retombe sur GENERIC_POSTAL_RULE.
 */
const POSTAL_RULES = {
  // France métropolitaine + territoires utilisant le plan de numérotation FR
  FR: FIVE_DIGITS,
  GP: FIVE_DIGITS,
  MQ: FIVE_DIGITS,
  GF: FIVE_DIGITS,
  RE: FIVE_DIGITS,
  YT: FIVE_DIGITS,
  PM: FIVE_DIGITS,
  BL: FIVE_DIGITS,
  MF: FIVE_DIGITS,
  NC: FIVE_DIGITS,
  PF: FIVE_DIGITS,
  WF: FIVE_DIGITS,
  MC: FIVE_DIGITS,

  // 5 chiffres
  ES: FIVE_DIGITS,
  IT: FIVE_DIGITS,
  DE: FIVE_DIGITS,
  SM: FIVE_DIGITS,
  FI: FIVE_DIGITS,
  GR: FIVE_DIGITS,
  HR: FIVE_DIGITS,
  LT: FIVE_DIGITS,
  EE: FIVE_DIGITS,
  RS: FIVE_DIGITS,
  TR: FIVE_DIGITS,
  MX: FIVE_DIGITS,
  MA: FIVE_DIGITS,
  DZ: FIVE_DIGITS,

  // 4 chiffres
  BE: FOUR_DIGITS,
  LU: FOUR_DIGITS,
  CH: FOUR_DIGITS,
  LI: FOUR_DIGITS,
  AT: FOUR_DIGITS,
  DK: FOUR_DIGITS,
  NO: FOUR_DIGITS,
  HU: FOUR_DIGITS,
  BG: FOUR_DIGITS,
  SI: FOUR_DIGITS,
  CY: FOUR_DIGITS,
  AU: FOUR_DIGITS,
  NZ: FOUR_DIGITS,
  TN: FOUR_DIGITS,

  // 6 chiffres
  RO: SIX_DIGITS,
  RU: SIX_DIGITS,
  CN: SIX_DIGITS,
  IN: SIX_DIGITS,
  SG: SIX_DIGITS,

  // Groupés « NNN NN »
  SE: THREE_TWO,
  CZ: THREE_TWO,
  SK: THREE_TWO,

  // Formats spécifiques
  PL: { test: /^\d{5}$/, format: (c) => `${c.slice(0, 2)}-${c.slice(2)}`, exemple: '12-345' },
  PT: {
    test: /^\d{4}(\d{3})?$/,
    format: (c) => (c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4)}` : c),
    exemple: '1234-567',
  },
  NL: {
    test: /^\d{4}[A-Z]{2}$/,
    format: (c) => `${c.slice(0, 4)} ${c.slice(4)}`,
    exemple: '1234 AB',
  },
  GB: {
    test: /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/,
    format: (c) => `${c.slice(0, -3)} ${c.slice(-3)}`,
    exemple: 'SW1A 1AA',
  },
  IE: {
    test: /^[A-Z]\d[\dW][0-9A-Z]{4}$/,
    format: (c) => `${c.slice(0, 3)} ${c.slice(3)}`,
    exemple: 'D02 AF30',
  },
  CA: {
    test: /^[A-Z]\d[A-Z]\d[A-Z]\d$/,
    format: (c) => `${c.slice(0, 3)} ${c.slice(3)}`,
    exemple: 'K1A 0B1',
  },
  US: {
    test: /^\d{5}(\d{4})?$/,
    format: (c) => (c.length === 9 ? `${c.slice(0, 5)}-${c.slice(5)}` : c),
    exemple: '12345',
  },
  BR: {
    test: /^\d{8}$/,
    format: (c) => `${c.slice(0, 5)}-${c.slice(5)}`,
    exemple: '12345-678',
  },
  JP: {
    test: /^\d{7}$/,
    format: (c) => `${c.slice(0, 3)}-${c.slice(3)}`,
    exemple: '123-4567',
  },
  MT: {
    test: /^[A-Z]{3}\d{4}$/,
    format: (c) => `${c.slice(0, 3)} ${c.slice(3)}`,
    exemple: 'VLT 1117',
  },
  AD: { test: /^AD\d{3}$/, format: (c) => c, exemple: 'AD500' },
}

/**
 * Règle de repli pour un pays sans format documenté ici.
 * Permissive mais réelle : 3 à 10 caractères alphanumériques, au moins un chiffre.
 */
const GENERIC_POSTAL_RULE = {
  test: /^(?=[A-Z0-9]*\d)[A-Z0-9]{3,10}$/,
  format: (c) => c,
  exemple: null,
}

/** Majuscules, espaces/tirets/points supprimés — forme utilisée par les regex. */
function compactPostal(value) {
  return String(value).toUpperCase().replace(/[\s.\-–—]/g, '')
}

/**
 * Valide et normalise un code postal.
 *
 * @param {string} value - Valeur saisie.
 * @param {string} [pays] - Code ISO 3166-1 alpha-2 de la borne (ex: 'FR').
 * @returns {{ valid: boolean, value: string, code?: string, pays: string, exemple: string|null }}
 */
export function validateCodePostal(value, pays) {
  const paysIso = normalisePays(pays)
  const brut = value === null || value === undefined ? '' : String(value)
  const compact = compactPostal(brut)

  if (compact === '') {
    return { valid: false, value: brut, code: 'CODE_POSTAL_VIDE', pays: paysIso, exemple: null }
  }

  const rule = POSTAL_RULES[paysIso] || GENERIC_POSTAL_RULE

  if (!rule.test.test(compact)) {
    return {
      valid: false,
      value: brut,
      code: 'CODE_POSTAL_INVALIDE',
      pays: paysIso,
      exemple: rule.exemple,
    }
  }

  return { valid: true, value: rule.format(compact), pays: paysIso, exemple: rule.exemple }
}

// ─── Téléphone ───────────────────────────────────────────────────────────────

/**
 * Indicatifs + préfixe national (« trunk ») + longueur du numéro national
 * significatif (NSN). `trunk: null` = pas de préfixe national à retirer
 * (Italie et Espagne notamment : le 0 initial italien fait partie du numéro).
 *
 * L'ordre de déclaration fait foi pour les indicatifs partagés (+1, +590, +262,
 * +7) : la première entrée sert de règle canonique, et les pays qui partagent un
 * indicatif partagent aussi ici trunk et longueur NSN.
 */
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

  // Amérique du Nord (plan NANP) — pas de préfixe national, NSN 10 chiffres
  US: { dial: '1', trunk: null, nsn: [10, 10] },
  CA: { dial: '1', trunk: null, nsn: [10, 10] },

  // Territoires français d'outre-mer
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

  // Maghreb / Afrique de l'Ouest francophone
  MA: { dial: '212', trunk: '0', nsn: [9, 9] },
  DZ: { dial: '213', trunk: '0', nsn: [8, 9] },
  TN: { dial: '216', trunk: null, nsn: [8, 8] },
  SN: { dial: '221', trunk: null, nsn: [9, 9] },
  CI: { dial: '225', trunk: null, nsn: [8, 10] },
  ML: { dial: '223', trunk: null, nsn: [8, 8] },
  CM: { dial: '237', trunk: null, nsn: [8, 9] },
  GA: { dial: '241', trunk: null, nsn: [7, 8] },

  // Autres
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

/** indicatif → règle canonique (première entrée déclarée pour cet indicatif). */
const RULE_BY_DIAL = (() => {
  const map = new Map()
  for (const rule of Object.values(PHONE_RULES)) {
    if (!map.has(rule.dial)) map.set(rule.dial, rule)
  }
  return map
})()

/** Longueurs d'indicatif présentes, de la plus longue à la plus courte. */
const DIAL_LENGTHS = [...new Set([...RULE_BY_DIAL.keys()].map((d) => d.length))].sort((a, b) => b - a)

/** E.164 : 15 chiffres au maximum, indicatif compris (recommandation UIT-T). */
const E164_MAX_DIGITS = 15
const E164_MIN_DIGITS = 8

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
 * Valide un numéro de téléphone et le normalise au format E.164 (`+33612345678`).
 *
 * @param {string} value - Valeur saisie (« +33 0600000000 », « 06 00 00 00 00 »…).
 * @param {string} [pays] - Code ISO alpha-2 de la borne, utilisé si la valeur
 *   ne porte pas d'indicatif international.
 * @returns {{ valid: boolean, value: string, code?: string }}
 */
export function validateTelephone(value, pays) {
  const brut = value === null || value === undefined ? '' : String(value).trim()

  if (brut === '') {
    return { valid: false, value: brut, code: 'TELEPHONE_VIDE' }
  }

  // Seuls les séparateurs usuels sont tolérés — aucune lettre.
  if (!/^\+?[\d\s().\-/]+$/.test(brut)) {
    return { valid: false, value: brut, code: 'TELEPHONE_CARACTERES_INVALIDES' }
  }

  let digits = brut.replace(/\D/g, '')
  let international = brut.startsWith('+')

  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2)
    international = true
  }

  if (digits === '') {
    return { valid: false, value: brut, code: 'TELEPHONE_VIDE' }
  }

  const paysIso = normalisePays(pays)

  // L'indicatif porté par la valeur prime sur le pays de la borne : la borne
  // peut être en France et le visiteur saisir un numéro espagnol.
  const rule = international ? findRuleByDial(digits) : PHONE_RULES[paysIso] || null

  if (!rule) {
    // Pays inconnu de la table : on exige un E.164 déjà formé plutôt que
    // d'inventer un indicatif ou une règle de préfixe national.
    if (!international) {
      return { valid: false, value: brut, code: 'TELEPHONE_INTERNATIONAL_REQUIS' }
    }
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
      return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE' }
    }
    return { valid: true, value: `+${digits}` }
  }

  const nsnBrut = international ? digits.slice(rule.dial.length) : digits
  const nsn = stripTrunk(nsnBrut, rule.trunk)

  const [min, max] = rule.nsn
  if (nsn.length < min || nsn.length > max) {
    return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE' }
  }

  const e164 = `+${rule.dial}${nsn}`
  if (e164.length - 1 > E164_MAX_DIGITS) {
    return { valid: false, value: brut, code: 'TELEPHONE_INVALIDE' }
  }

  return { valid: true, value: e164 }
}

// ─── Email ───────────────────────────────────────────────────────────────────

const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/

/**
 * Valide une adresse email et la normalise en minuscules.
 * (Le front applique une transformation UPPERCASE sur les champs texte : sans
 * cette normalisation, un email saisi dans un champ `texte_court` arriverait
 * en majuscules dans le CRM.)
 *
 * @param {string} value
 * @returns {{ valid: boolean, value: string, code?: string }}
 */
export function validateEmail(value) {
  const brut = value === null || value === undefined ? '' : String(value).trim()

  if (brut === '') return { valid: false, value: brut, code: 'EMAIL_VIDE' }
  if (brut.length > 254) return { valid: false, value: brut, code: 'EMAIL_INVALIDE' }

  const [local] = brut.split('@')
  if (!local || local.length > 64) return { valid: false, value: brut, code: 'EMAIL_INVALIDE' }

  if (!EMAIL_RE.test(brut)) return { valid: false, value: brut, code: 'EMAIL_INVALIDE' }

  return { valid: true, value: brut.toLowerCase() }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const MESSAGES = {
  CODE_POSTAL_VIDE: 'Le code postal est vide',
  CODE_POSTAL_INVALIDE: 'Code postal invalide',
  TELEPHONE_VIDE: 'Le numéro de téléphone est vide',
  TELEPHONE_CARACTERES_INVALIDES:
    'Le numéro de téléphone ne doit contenir que des chiffres et un indicatif',
  TELEPHONE_INTERNATIONAL_REQUIS:
    'Numéro de téléphone au format international requis (ex : +33612345678)',
  TELEPHONE_INVALIDE: 'Numéro de téléphone invalide',
  EMAIL_VIDE: "L'adresse email est vide",
  EMAIL_INVALIDE: 'Adresse email invalide',
}

/** @param {string} code @param {string|null} [exemple] */
export function messageForCode(code, exemple) {
  const base = MESSAGES[code] || 'Valeur invalide'
  return exemple ? `${base} (format attendu : ${exemple})` : base
}

function normalisePays(pays) {
  if (typeof pays !== 'string') return ''
  return pays.trim().toUpperCase().slice(0, 2)
}

function normaliseCrmFieldIds(crmFieldIds) {
  if (crmFieldIds === null || crmFieldIds === undefined) return []
  const raw = Array.isArray(crmFieldIds) ? crmFieldIds : [crmFieldIds]
  return raw
    .map((id) => (typeof id === 'string' ? Number.parseInt(id, 10) : id))
    .filter((id) => Number.isInteger(id))
}

/**
 * Détermine le format à contrôler pour une question du formulaire dynamique V2.
 *
 * Une question « groupée » (plusieurs field IDs CRM sur une seule saisie) ne
 * peut pas être attribuée à un champ unique : aucun format n'est alors déduit
 * des IDs — seul `typeOption` peut encore trancher.
 *
 * @param {{ crmFieldIds?: any, typeOption?: string }} question
 * @returns {'code_postal'|'telephone'|'email'|null}
 */
export function detectContactFormat(question) {
  if (!question) return null

  if (question.typeOption === 'telephone') return 'telephone'
  if (question.typeOption === 'email') return 'email'

  const ids = normaliseCrmFieldIds(question.crmFieldIds)
  if (ids.length === 1) return CONTACT_KIND_BY_FIELD_ID[ids[0]] || null

  return null
}

/**
 * Applique la validation correspondant à un type de format.
 *
 * @param {'code_postal'|'telephone'|'email'} kind
 * @param {string} value
 * @param {string} [pays]
 * @returns {{ valid: boolean, value: string, code?: string, message?: string }}
 */
export function validateContactValue(kind, value, pays) {
  let result
  if (kind === 'code_postal') result = validateCodePostal(value, pays)
  else if (kind === 'telephone') result = validateTelephone(value, pays)
  else if (kind === 'email') result = validateEmail(value)
  else return { valid: true, value }

  if (result.valid) return { valid: true, value: result.value }
  return {
    valid: false,
    value: result.value,
    code: result.code,
    message: messageForCode(result.code, result.exemple),
  }
}

/**
 * Valide et normalise les réponses d'un enregistrement V2.
 *
 * @param {Array<{questionId: string, valeur: string}>} reponses
 * @param {Map<string, {id: string, typeOption?: string, crmFieldIds?: any}>} questionsById
 * @param {string} [pays] - `Borne.pays`
 * @returns {{ reponses: Array, erreurs: Array<{questionId: string, code: string, message: string}> }}
 */
export function validateReponsesContact(reponses, questionsById, pays) {
  const erreurs = []
  const normalisees = reponses.map((reponse) => {
    const question = questionsById?.get?.(reponse.questionId)
    const kind = detectContactFormat(question)
    if (!kind) return reponse

    // Réponse laissée vide : le caractère obligatoire est une règle métier
    // distincte, et les abandons postent volontairement des réponses partielles.
    if (typeof reponse.valeur !== 'string' || reponse.valeur.trim() === '') return reponse

    const result = validateContactValue(kind, reponse.valeur, pays)
    if (!result.valid) {
      erreurs.push({
        questionId: reponse.questionId,
        champ: kind,
        code: result.code,
        message: result.message,
      })
      return reponse
    }
    return { ...reponse, valeur: result.value }
  })

  return { reponses: normalisees, erreurs }
}

/**
 * Valide et normalise les `values` d'une soumission V1 (`{ fieldId, value }`).
 * V1 n'a pas de notion de pays (formulaire français figé de docs/CONTEXT.md) :
 * le pays par défaut est donc FR, surchargeable par l'appelant.
 *
 * @param {Array<{fieldId: number, value: string|string[]}>} values
 * @param {string} [pays='FR']
 * @returns {{ values: Array, erreurs: Array<{fieldId: number, code: string, message: string}> }}
 */
export function validateSubmissionValues(values, pays = 'FR') {
  const erreurs = []
  const normalisees = values.map((entry) => {
    const kind = CONTACT_KIND_BY_FIELD_ID[entry.fieldId]
    if (!kind) return entry
    if (typeof entry.value !== 'string' || entry.value.trim() === '') return entry

    const result = validateContactValue(kind, entry.value, pays)
    if (!result.valid) {
      erreurs.push({
        fieldId: entry.fieldId,
        champ: kind,
        code: result.code,
        message: result.message,
      })
      return entry
    }
    return { ...entry, value: result.value }
  })

  return { values: normalisees, erreurs }
}
