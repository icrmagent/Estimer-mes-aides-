/**
 * Canal I-CRM authentifié par clé API (type `icrm_api_key`).
 *
 * Contrat v1 partagé avec I-CRM (API entrante « Estimer mes aides ») :
 *   base   : {apiUrl}/api/external/estimer-mes-aides/v1
 *   GET  /ping            → vérifie les identifiants, renvoie entreprise + sous-type
 *   POST /enregistrements → crée l'opportunité (idempotent sur external_id)
 *   en-têtes : X-Api-Key (identifiant public `emak_…`) + X-Api-Secret (secret, 48 car.)
 *
 * Dans la table `canaux`, un canal de ce type stocke :
 *   apiUrl = URL de base de l'API I-CRM SANS le suffixe /api
 *   apiKey = identifiant de clé (public, affichable)
 *   token  = secret (jamais renvoyé par l'API, jamais journalisé)
 *
 * Ce module ne fait aucun appel réseau : il centralise les constantes, la
 * normalisation d'URL, les en-têtes et la classification des statuts HTTP,
 * partagés par le queue worker et la route de test des canaux.
 */

export const CANAL_TYPE_AZURE_AD = 'azure_ad'
export const CANAL_TYPE_ICRM_API_KEY = 'icrm_api_key'
export const CANAL_TYPES = [CANAL_TYPE_AZURE_AD, CANAL_TYPE_ICRM_API_KEY]

export const ICRM_EMA_API_PATH = '/api/external/estimer-mes-aides/v1'

// Identifiant de clé : public, affichable dans le back-office.
export const ICRM_API_KEY_ID_REGEX = /^emak_[A-Za-z0-9]{24}$/
// Secret : montré une seule fois par I-CRM, stocké ici en écriture seule.
export const ICRM_API_SECRET_REGEX = /^[A-Za-z0-9]{48}$/

// Échecs définitifs : réessayer ne changera rien (identifiants, URL, données).
export const STATUTS_ICRM_DEFINITIFS = Object.freeze([401, 403, 404, 413, 422])

const LONGUEUR_MAX_MESSAGE = 500

/** Type effectif d'un canal : les lignes antérieures à la migration valent azure_ad. */
export function typeDeCanal(canal) {
  return canal?.type || CANAL_TYPE_AZURE_AD
}

export function estCanalCleApi(canal) {
  return typeDeCanal(canal) === CANAL_TYPE_ICRM_API_KEY
}

/**
 * URL de base de l'API I-CRM : supprime les « / » finaux puis un suffixe « /api »
 * (l'opérateur colle souvent https://…/api ou https://…/api/).
 */
export function normaliserUrlApiIcrm(apiUrl) {
  if (!apiUrl) return ''
  return String(apiUrl)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '')
    .replace(/\/+$/, '')
}

/** URL complète d'un point d'accès du contrat (ex. '/ping', '/enregistrements'). */
export function urlPointAccesIcrm(apiUrl, chemin) {
  return `${normaliserUrlApiIcrm(apiUrl)}${ICRM_EMA_API_PATH}${chemin}`
}

/** En-têtes d'authentification + JSON. Ne jamais journaliser le résultat. */
export function enTetesCleApiIcrm(canal, extra = {}) {
  return {
    Accept: 'application/json',
    'X-Api-Key': canal.apiKey,
    'X-Api-Secret': canal.token,
    ...extra,
  }
}

/**
 * true si un réessai est inutile : 401/403/404/413/422, ou redirection
 * (les redirections ne sont pas suivies pour ne pas transmettre le secret
 * à un autre hôte — c'est une erreur de configuration de l'URL).
 */
export function estStatutIcrmDefinitif(status) {
  return STATUTS_ICRM_DEFINITIFS.includes(status) || (status >= 300 && status < 400)
}

/**
 * Lit le corps JSON d'une réponse ; null si absent ou non JSON.
 *
 * Par défaut, une erreur de LECTURE (flux coupé, délai dépassé) donne aussi null.
 * Avec `propagerErreurLecture`, elle est levée : sur un 2xx, elle ne doit pas être
 * confondue avec un corps non JSON (I-CRM a peut-être créé l'opportunité).
 */
export async function lireCorpsJsonIcrm(res, { propagerErreurLecture = false } = {}) {
  let texte
  try {
    texte = typeof res.text === 'function'
      ? await res.text()
      : JSON.stringify(await res.json())
  } catch (err) {
    if (propagerErreurLecture) throw err
    return null
  }
  if (!texte) return null
  try {
    return JSON.parse(texte)
  } catch {
    return null
  }
}

// Code EMA (pas un code I-CRM) : 2xx dont le corps n'est pas celui du contrat v1.
export const CODE_REPONSE_NON_CONFORME = 'reponse_non_conforme'

const STATUTS_ENREGISTREMENT_ICRM = Object.freeze(['created', 'already_processed'])

function entierPositif(valeur) {
  if (typeof valeur === 'number') return Number.isSafeInteger(valeur) && valeur > 0 ? valeur : null
  if (typeof valeur === 'string' && /^\d+$/.test(valeur)) {
    const n = Number(valeur)
    return Number.isSafeInteger(n) && n > 0 ? n : null
  }
  return null
}

/**
 * Corps d'un 2xx de POST /enregistrements conforme au contrat v1 :
 * `{ status: created|already_processed, projet_id: entier > 0, projet_ref?, warnings? }`.
 *
 * Tout autre 2xx (page HTML d'un front en repli SPA, page de proxy, autre API
 * derrière une mauvaise URL de base…) renvoie null : il ne prouve PAS que
 * l'opportunité existe, l'enregistrement ne doit donc pas être marqué partagé.
 *
 * @returns {{ statut: string, projetId: string, projetRef: string|null, warnings: Array }|null}
 */
export function lireSuccesEnregistrementIcrm(corps) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return null
  if (!STATUTS_ENREGISTREMENT_ICRM.includes(corps.status)) return null
  const projetId = entierPositif(corps.projet_id)
  if (projetId === null) return null
  return {
    statut: corps.status,
    projetId: String(projetId),
    projetRef: typeof corps.projet_ref === 'string' && corps.projet_ref !== '' ? corps.projet_ref : null,
    warnings: Array.isArray(corps.warnings) ? corps.warnings : [],
  }
}

/**
 * Corps d'un 2xx de GET /ping conforme au contrat v1 : `ok === true` et `api_version`
 * renseignée. Sinon, l'URL du canal ne pointe pas vers l'API I-CRM.
 */
export function estPingIcrmConforme(corps) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return false
  if (corps.ok !== true) return false
  const version = corps.api_version
  return (typeof version === 'string' && version.trim() !== '') || typeof version === 'number'
}

function lireEnTete(res, nom) {
  try {
    return res.headers?.get?.(nom) ?? null
  } catch {
    return null
  }
}

/**
 * Message d'erreur lisible et SANS donnée personnelle : statut, code d'erreur
 * I-CRM, message, noms des champs en erreur (jamais leurs valeurs), request id.
 */
export function formaterErreurIcrm(status, corps, res = null) {
  const erreur = corps && typeof corps === 'object' ? corps.error : null
  const code = erreur && typeof erreur === 'object' && typeof erreur.code === 'string' ? erreur.code : null
  const message = erreur && typeof erreur === 'object' && typeof erreur.message === 'string'
    ? erreur.message
    : typeof erreur === 'string' ? erreur : null
  const champs = erreur?.details && typeof erreur.details === 'object' && !Array.isArray(erreur.details)
    ? Object.keys(erreur.details)
    : []
  const requestId = (erreur && typeof erreur === 'object' ? erreur.request_id : null)
    || lireEnTete(res, 'x-request-id')

  let texte = `I-CRM HTTP ${status}`
  if (code) texte += ` ${code}`
  if (message) texte += ` : ${message}`
  if (!code && !message) {
    texte += status >= 300 && status < 400
      ? ' : redirection refusée — vérifier l\'URL API du canal (https, sans /api)'
      : corps === null ? ' (réponse non JSON)' : ''
  }
  if (champs.length > 0) texte += ` — champs : ${champs.slice(0, 20).join(', ')}`
  if (requestId) texte += ` [request_id ${requestId}]`

  return texte.length > LONGUEUR_MAX_MESSAGE ? `${texte.slice(0, LONGUEUR_MAX_MESSAGE - 1)}…` : texte
}

/**
 * Message d'un 2xx non conforme au contrat (sans rien du corps reçu : il peut
 * s'agir d'une page quelconque).
 */
export function formaterSuccesNonConformeIcrm(status, corps) {
  const nature = corps === null ? 'réponse non JSON' : 'ni status ni projet_id attendus'
  return `I-CRM HTTP ${status} : réponse non conforme au contrat (${nature}) — `
    + "enregistrement NON partagé ; vérifier l'URL API du canal (ex. https://icrm.api.ila26.fr, "
    + 'sans /api ni chemin de page) puis relancer'
}

/** Code d'erreur I-CRM (`error.code`) d'un corps de réponse, ou null. */
export function codeErreurIcrm(corps) {
  const code = corps && typeof corps === 'object' ? corps.error?.code : null
  return typeof code === 'string' ? code : null
}
