/**
 * canalConfig.js — règles du formulaire « canal I-CRM » (sans React, testable).
 *
 * Deux modes d'authentification :
 * - icrm_api_key (recommandé) : clé API I-CRM (identifiant public « emak_… ») + secret ;
 * - azure_ad (ancien) : refresh token + access token Azure AD.
 * Le backend refait les mêmes contrôles (double validation) : voir routes/canaux.js.
 */

export const CANAL_TYPE_ICRM_API_KEY = 'icrm_api_key'
export const CANAL_TYPE_AZURE_AD = 'azure_ad'

export const TYPES_CANAL = [
  { value: CANAL_TYPE_ICRM_API_KEY, label: 'Clé API I-CRM (recommandé)', court: 'Clé API I-CRM' },
  { value: CANAL_TYPE_AZURE_AD, label: 'Azure AD (ancien)', court: 'Azure AD' },
]

export const CLE_API_REGEX = /^emak_[A-Za-z0-9]{24}$/
export const SECRET_API_REGEX = /^[A-Za-z0-9]{48}$/

export const URL_API_ICRM_FR = 'https://icrm.api.ila26.fr'
export const URL_API_ICRM_ES = 'https://icrm.api.es.ila26.com'

/** Type effectif d'un canal renvoyé par l'API (les anciens canaux n'ont pas de type). */
export function typeDuCanal(canal) {
  return canal?.type || CANAL_TYPE_AZURE_AD
}

export function libelleTypeCanal(type) {
  return TYPES_CANAL.find((t) => t.value === (type || CANAL_TYPE_AZURE_AD))?.court || type
}

/** Type proposé à l'ouverture du formulaire : celui du canal édité, sinon la clé API. */
export function typeInitialFormulaire(initialCanal) {
  return initialCanal?.id ? typeDuCanal(initialCanal) : CANAL_TYPE_ICRM_API_KEY
}

/**
 * Valide la saisie. Retourne un message d'erreur en français, ou null si valide.
 *
 * @param {Object} saisie
 * @param {boolean} saisie.isEdit
 * @param {string} saisie.type        type choisi dans le formulaire
 * @param {?string} saisie.typeInitial type du canal édité (null en création)
 * @param {string} saisie.borneId
 * @param {string} saisie.label
 * @param {string} saisie.apiUrl
 * @param {string} saisie.apiKey      clé (icrm_api_key) ou refresh token (azure_ad)
 * @param {string} saisie.token       secret (icrm_api_key) ou access token (azure_ad)
 */
export function validerSaisieCanal({ isEdit, type, typeInitial = null, borneId, label, apiUrl, apiKey, token }) {
  const cle = (apiKey || '').trim()
  const secret = (token || '').trim()
  const url = (apiUrl || '').trim()

  if (!borneId) return 'Sélectionnez une borne'
  if (!(label || '').trim()) return 'Le label du canal est requis'
  if (!url) return "L'URL API est requise"

  // En création ou lors d'un changement de type, la clé et le secret sont obligatoires.
  // En édition sans changement de type, un champ vide = ne pas modifier.
  const secretsObligatoires = !isEdit || (typeInitial !== null && type !== typeInitial)

  if (type === CANAL_TYPE_ICRM_API_KEY) {
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
      return "L'URL API I-CRM doit commencer par https://"
    }
    if (secretsObligatoires && !cle) return 'La clé API I-CRM est requise'
    if (secretsObligatoires && !secret) return 'Le secret API I-CRM est requis'
    if (cle && !CLE_API_REGEX.test(cle)) {
      return 'Clé API invalide : « emak_ » suivi de 24 caractères alphanumériques'
    }
    if (secret && !SECRET_API_REGEX.test(secret)) {
      return 'Secret invalide : 48 caractères alphanumériques attendus'
    }
    return null
  }

  if (secretsObligatoires && !cle) return 'Le refresh token I-CRM est requis'
  if (secretsObligatoires && !secret) return "Le token d'accès est requis"
  return null
}

/**
 * Corps de la requête : POST /api/canaux (création) ou PUT /api/canaux/:id (patch).
 * En édition, la clé n'est envoyée que si elle a changé et le secret que s'il est saisi.
 */
export function construireRequeteCanal({ isEdit, type, borneId, label, apiUrl, apiKey, token, actif, apiKeyInitiale = '' }) {
  const cle = (apiKey || '').trim()
  const secret = (token || '').trim()
  const base = { type, label: label.trim(), apiUrl: apiUrl.trim(), actif }

  if (!isEdit) {
    return { ...base, apiKey: cle, token: secret, borneId }
  }
  const patch = { ...base }
  if (cle && cle !== (apiKeyInitiale || '')) patch.apiKey = cle
  if (secret) patch.token = secret
  return patch
}

/**
 * Résumé d'un test de connexion (POST /api/canaux/:id/test) pour un toast.
 * @returns {{ message: string, type: 'success'|'error' }}
 */
export function resumeTestCanal(r = {}) {
  if (!r.success) {
    return { message: `Connexion impossible : ${r.error || 'erreur inconnue'}`, type: 'error' }
  }
  const mesure = `HTTP ${r.httpStatus}, ${r.latencyMs}ms`
  if (r.type === CANAL_TYPE_ICRM_API_KEY) {
    const sousType = r.subtype?.name
      ? ` · sous-type ${r.subtype.name}${r.subtype.id !== null && r.subtype.id !== undefined ? ` (#${r.subtype.id})` : ''}`
      : ''
    return { message: `Connecté à ${r.entreprise || 'I-CRM'}${sousType} (${mesure})`, type: 'success' }
  }
  return {
    message: `Connexion OK (${r.httpStatus}, ${r.latencyMs}ms)${r.tokenExpired ? ' — token expiré !' : ''}`,
    type: r.tokenExpired ? 'error' : 'success',
  }
}
