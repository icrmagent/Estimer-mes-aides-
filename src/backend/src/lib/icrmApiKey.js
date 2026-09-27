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
 * Une « entreprise I-CRM » (table `entreprises_icrm`, routes/entreprises-icrm.js)
 * stocke les mêmes trois valeurs (apiUrl, apiKey, token) : toutes les fonctions
 * ci-dessous acceptent indifféremment un canal ou une entreprise.
 *
 * Ce module ne fait aucun appel réseau : il centralise les constantes, la
 * normalisation d'URL, les en-têtes et la classification des statuts HTTP,
 * partagés par le queue worker, la route de test des canaux et celle des
 * entreprises I-CRM (appel réseau du ping : services/icrmPingService.js).
 */

export const CANAL_TYPE_AZURE_AD = 'azure_ad'
export const CANAL_TYPE_ICRM_API_KEY = 'icrm_api_key'
export const CANAL_TYPES = [CANAL_TYPE_AZURE_AD, CANAL_TYPE_ICRM_API_KEY]

export const ICRM_EMA_API_PATH = '/api/external/estimer-mes-aides/v1'

// Identifiant de clé : public, affichable dans le back-office.
export const ICRM_API_KEY_ID_REGEX = /^emak_[A-Za-z0-9]{24}$/
// Secret : montré une seule fois par I-CRM, stocké ici en écriture seule.
export const ICRM_API_SECRET_REGEX = /^[A-Za-z0-9]{48}$/

// Messages de validation (routes canaux et entreprises I-CRM) : ne citent jamais la valeur saisie.
export const MESSAGE_CLE_API_INVALIDE = 'Clé API I-CRM invalide : format attendu « emak_ » suivi de 24 caractères alphanumériques'
export const MESSAGE_SECRET_INVALIDE = 'Secret API I-CRM invalide : 48 caractères alphanumériques attendus'
export const MESSAGE_URL_HTTPS = "L'URL API I-CRM doit être en https (le secret transite dans les en-têtes)"
export const MESSAGE_URL_INTERNE = "L'URL API I-CRM ne peut pas viser une adresse interne (localhost, réseau privé, lien local)"
export const MESSAGE_SECRET_NOUVEL_HOTE = "Nouvel hôte de l'URL API : le secret doit être saisi à nouveau (il ne part jamais vers un hôte non confirmé)"

// ─── Envois SUSPENDUS (cible d'un job : entreprise I-CRM) ─────────────────────
// Un job ciblant une entreprise n'est envoyé qu'à ELLE (jamais à un canal ni à
// l'environnement). Entreprise désactivée, supprimée ou à retester après un
// changement d'URL / de clé : le job passe au statut `suspendu` (hors de la file
// du worker, aucune tentative comptée) jusqu'à sa reprise explicite.

export const STATUT_JOB_SUSPENDU = 'suspendu'

// Fin commune des messages de suspension
export const SUFFIXE_ENVOI_SUSPENDU = '— envoi suspendu'

/**
 * Motif de suspension enregistré dans le job et l'enregistrement (sans donnée
 * personnelle), selon l'état de l'entreprise cible.
 */
export function messageEnvoiSuspendu(entreprise) {
  const nom = entreprise?.nom || entreprise?.id || '?'
  if (!entreprise || entreprise.deletedAt) return `Entreprise I-CRM « ${nom} » supprimée ${SUFFIXE_ENVOI_SUSPENDU}`
  if (entreprise.actif === false) return `Entreprise I-CRM « ${nom} » désactivée ${SUFFIXE_ENVOI_SUSPENDU}`
  if (entreprise.verificationRequise) {
    return `Entreprise I-CRM « ${nom} » : URL ou clé modifiée, testez l'entreprise pour reprendre les envois ${SUFFIXE_ENVOI_SUSPENDU}`
  }
  return `Entreprise I-CRM « ${nom} » indisponible ${SUFFIXE_ENVOI_SUSPENDU}`
}

/** Une entreprise I-CRM peut recevoir : active, non supprimée, identifiants vérifiés. */
export function entrepriseIcrmUtilisable(entreprise) {
  return Boolean(entreprise) && entreprise.actif === true && !entreprise.deletedAt && !entreprise.verificationRequise
}

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

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']

function ipv4Interne(hote) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hote)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return a === 0 // « ce réseau » / non spécifiée
    || a === 10 // privé
    || a === 127 // bouclage
    || (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
    || (a === 169 && b === 254) // lien local
    || (a === 172 && b >= 16 && b <= 31) // privé
    || (a === 192 && b === 168) // privé
}

/** 8 groupes de 16 bits d'une adresse IPv6 normalisée par new URL() (sans crochets), ou null. */
function groupesIpv6(adresse) {
  if (!adresse.includes(':')) return null
  const compressee = adresse.includes('::')
  const [tete, queue] = compressee ? adresse.split('::') : [adresse, '']
  const partie = (x) => (x ? x.split(':').map((h) => Number.parseInt(h, 16)) : [])
  const debut = partie(tete)
  const fin = partie(queue)
  const manquants = 8 - debut.length - fin.length
  if (manquants < 0 || (!compressee && manquants !== 0)) return null
  const groupes = [...debut, ...new Array(manquants).fill(0), ...fin]
  return groupes.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groupes : null
}

function ipv6Interne(hote) {
  if (!hote.startsWith('[') || !hote.endsWith(']')) return false
  const g = groupesIpv6(hote.slice(1, -1))
  if (!g) return true // littéral IPv6 illisible : refusé par prudence
  const zeros = (n) => g.slice(0, n).every((x) => x === 0)
  if (zeros(8)) return true // :: non spécifiée
  if (zeros(7) && g[7] === 1) return true // ::1 bouclage
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 lien local
  if (zeros(5) && g[5] === 0xffff) { // ::ffff:a.b.c.d (IPv4 mappée)
    return ipv4Interne(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`)
  }
  return false
}

/**
 * Le secret part dans un en-tête HTTP vers cette URL :
 * - https obligatoire ; http seulement vers localhost / 127.0.0.1 / [::1] HORS
 *   production (développement, mock I-CRM local) ;
 * - en production, refuse aussi les hôtes internes : `localhost`, adresses IP
 *   littérales privées, de bouclage, de lien local, CGNAT et IPv6 unique local
 *   (aucun secret envoyé vers le réseau interne de l'hébergeur).
 * Partagé par les canaux `icrm_api_key` et les entreprises I-CRM.
 */
export function urlApiIcrmAcceptable(apiUrl, nodeEnv = process.env.NODE_ENV) {
  let url
  try {
    url = new URL(apiUrl)
  } catch {
    return false
  }
  const hote = url.hostname.toLowerCase()
  const production = nodeEnv === 'production'
  if (url.protocol === 'http:') return !production && HOTES_LOCAUX.includes(hote)
  if (url.protocol !== 'https:') return false
  if (!production) return true
  if (hote === 'localhost' || hote.endsWith('.localhost')) return false
  return !ipv4Interne(hote) && !ipv6Interne(hote)
}

/** Message d'erreur adapté à une URL refusée par urlApiIcrmAcceptable. */
export function messageUrlApiIcrmRefusee(apiUrl) {
  try {
    if (new URL(apiUrl).protocol === 'https:') return MESSAGE_URL_INTERNE
  } catch { /* URL illisible : message https générique */ }
  return MESSAGE_URL_HTTPS
}

/** Hôte (nom + port) d'une URL API I-CRM, en minuscules ; null si illisible. */
export function hoteApiIcrm(apiUrl) {
  try {
    return new URL(normaliserUrlApiIcrm(apiUrl)).host.toLowerCase()
  } catch {
    return null
  }
}

/**
 * true si une modification change l'hôte de l'URL API : le secret doit alors être
 * ressaisi (même règle qu'un changement de clé), pour ne jamais envoyer le secret
 * enregistré vers un hôte que l'opérateur n'a pas confirmé en le saisissant.
 */
export function changementHoteApiIcrm(ancienneUrl, nouvelleUrl) {
  if (nouvelleUrl === undefined || nouvelleUrl === null) return false
  return hoteApiIcrm(ancienneUrl) !== hoteApiIcrm(nouvelleUrl)
}

/**
 * Instantané de la destination d'une livraison par entreprise I-CRM, conservé sur
 * l'enregistrement (`crmDestination`) : l'entreprise reste modifiable, cet instantané
 * dit à qui le lead a réellement été remis. Jamais le secret.
 */
export function instantaneDestinationEntreprise(entreprise) {
  if (!entreprise) return null
  return {
    entrepriseIcrmId: entreprise.id ?? null,
    nom: entreprise.nom ?? null,
    nomIcrm: entreprise.nomIcrm ?? null,
    sousTypeIcrm: entreprise.sousTypeIcrm ?? null,
    apiHost: hoteApiIcrm(entreprise.apiUrl),
    apiKeyId: ICRM_API_KEY_ID_REGEX.test(entreprise.apiKey || '') ? entreprise.apiKey : null,
  }
}

/** URL complète d'un point d'accès du contrat (ex. '/ping', '/enregistrements'). */
export function urlPointAccesIcrm(apiUrl, chemin) {
  return `${normaliserUrlApiIcrm(apiUrl)}${ICRM_EMA_API_PATH}${chemin}`
}

/**
 * En-têtes d'authentification + JSON. Ne jamais journaliser le résultat.
 * @param {{ apiKey: string, token: string }} canal canal icrm_api_key ou entreprise I-CRM
 */
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
