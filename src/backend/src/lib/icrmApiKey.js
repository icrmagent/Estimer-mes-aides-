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
export const MESSAGE_URL_IDENTIFIANTS = "L'URL API I-CRM ne doit pas contenir d'identifiants (« utilisateur:motdepasse@ »)"
export const MESSAGE_URL_LOCALE_PRODUCTION = "L'URL API I-CRM ne peut pas viser localhost en production"
export const MESSAGE_SECRET_NOUVEL_HOTE = "Nouvel hôte de l'URL API : le secret doit être saisi à nouveau (il ne part jamais vers un hôte non confirmé)"

// ─── Envois SUSPENDUS (cible d'un job : entreprise I-CRM) ─────────────────────
// Un job ciblant une entreprise n'est envoyé qu'à ELLE (jamais à un canal ni à
// l'environnement). Entreprise désactivée, supprimée, ou à tester (nouvelle
// entreprise, URL / clé modifiée) : le job passe au statut `suspendu` (hors de
// la file du worker, aucune tentative comptée) jusqu'à sa reprise.

export const STATUT_JOB_SUSPENDU = 'suspendu'

// Fin commune des messages de suspension
export const SUFFIXE_ENVOI_SUSPENDU = '— envoi suspendu'

/**
 * Motif de suspension enregistré dans le job et l'enregistrement (sans donnée
 * personnelle), selon l'état de l'entreprise cible. Si `apiUrl` est fourni, un
 * hôte hors de la liste autorisée (ICRM_API_HOSTS_AUTORISES) est aussi un motif.
 */
export function messageEnvoiSuspendu(entreprise) {
  const nom = entreprise?.nom || entreprise?.id || '?'
  if (!entreprise || entreprise.deletedAt) return `Entreprise I-CRM « ${nom} » supprimée ${SUFFIXE_ENVOI_SUSPENDU}`
  if (entreprise.actif === false) return `Entreprise I-CRM « ${nom} » désactivée ${SUFFIXE_ENVOI_SUSPENDU}`
  if (entreprise.verificationRequise) {
    return `Entreprise I-CRM « ${nom} » : identifiants non vérifiés (nouvelle entreprise, URL ou clé modifiée), `
      + `testez l'entreprise pour reprendre les envois ${SUFFIXE_ENVOI_SUSPENDU}`
  }
  if (entreprise.apiUrl !== undefined && !urlApiIcrmAcceptable(entreprise.apiUrl)) {
    return `Entreprise I-CRM « ${nom} » : hôte de l'URL API non autorisé (ICRM_API_HOSTS_AUTORISES) ${SUFFIXE_ENVOI_SUSPENDU}`
  }
  return `Entreprise I-CRM « ${nom} » indisponible ${SUFFIXE_ENVOI_SUSPENDU}`
}

/**
 * Une entreprise I-CRM peut recevoir : active, non supprimée, identifiants vérifiés
 * par un test réussi (une entreprise NOUVELLE est à tester : verificationRequise).
 * État seul : l'hôte de l'URL est contrôlé en plus au moment de l'envoi
 * (`entrepriseIcrmEnvoyable`).
 */
export function entrepriseIcrmUtilisable(entreprise) {
  return Boolean(entreprise) && entreprise.actif === true && !entreprise.deletedAt && !entreprise.verificationRequise
}

/**
 * Contrôle au moment d'ENVOYER (worker) ou de reprendre des envois (balayage) :
 * entreprise utilisable ET hôte de son URL toujours autorisé (la liste
 * ICRM_API_HOSTS_AUTORISES a pu changer depuis l'enregistrement de l'URL).
 */
export function entrepriseIcrmEnvoyable(entreprise) {
  return entrepriseIcrmUtilisable(entreprise) && urlApiIcrmAcceptable(entreprise.apiUrl)
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

// ─── Hôtes autorisés (liste blanche) ──────────────────────────────────────────
// Le secret part dans un en-tête HTTP vers l'URL API : seuls les hôtes d'I-CRM
// sont acceptés (liste blanche de suffixes), jamais une adresse interne de
// l'hébergeur, une IP littérale ni un nom qui s'y résout (nip.io…). Contrôle
// fait à l'enregistrement de l'URL ET au moment de chaque envoi / test.

// Suffixes d'hôte autorisés par défaut (hôte exact ou sous-domaine)
export const HOTES_API_ICRM_PAR_DEFAUT = Object.freeze(['ila26.fr', 'ila26.com', 'azurewebsites.net', 'code.run'])
// Variable d'environnement : liste de suffixes séparés par des virgules. Elle
// REMPLACE la liste par défaut, sauf si elle contient le mot « defaut » (qui la
// reprend) : ICRM_API_HOSTS_AUTORISES="defaut,icrm.exemple.org".
export const VARIABLE_HOTES_API_ICRM = 'ICRM_API_HOSTS_AUTORISES'
const MOTS_LISTE_PAR_DEFAUT = new Set(['defaut', 'défaut', 'default'])

// Hôtes locaux : acceptés (http ou https) HORS production seulement (mock I-CRM local)
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Suffixe d'hôte normalisé : minuscules, IDN en punycode, sans « *. » ni point
 * initial / final. null si invalide : caractère hors nom d'hôte, un seul label
 * (« com » ouvrirait tout un domaine de premier niveau) ou dernier label
 * numérique (une IP n'est jamais un suffixe autorisé).
 */
export function normaliserSuffixeHoteIcrm(brut) {
  const s = String(brut ?? '').trim().toLowerCase().replace(/^\*?\.+/, '').replace(/\.+$/, '')
  if (!s || /[/?#@:\s\\[\]]/.test(s)) return null
  let hote
  try {
    hote = new URL(`https://${s}/`).hostname.replace(/\.$/, '')
  } catch {
    return null
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hote)) return null
  if (/^\d+$/.test(hote.slice(hote.lastIndexOf('.') + 1))) return null
  return hote
}

/**
 * Liste effective des suffixes autorisés et entrées ignorées (invalides).
 * @param {string|undefined} valeurEnv valeur de ICRM_API_HOSTS_AUTORISES
 * @returns {{ hotes: string[], invalides: string[], personnalisee: boolean }}
 */
export function analyserHotesApiIcrm(valeurEnv = process.env[VARIABLE_HOTES_API_ICRM]) {
  if (valeurEnv === undefined || valeurEnv === null || String(valeurEnv).trim() === '') {
    return { hotes: [...HOTES_API_ICRM_PAR_DEFAUT], invalides: [], personnalisee: false }
  }
  const entrees = String(valeurEnv).split(',').map((e) => e.trim()).filter(Boolean)
  const hotes = new Set()
  const invalides = []
  for (const entree of entrees) {
    if (MOTS_LISTE_PAR_DEFAUT.has(entree.toLowerCase())) {
      HOTES_API_ICRM_PAR_DEFAUT.forEach((h) => hotes.add(h))
      continue
    }
    const suffixe = normaliserSuffixeHoteIcrm(entree)
    if (suffixe) hotes.add(suffixe)
    else invalides.push(entree)
  }
  return { hotes: [...hotes], invalides, personnalisee: true }
}

/** Suffixes d'hôte autorisés (défaut, ou ICRM_API_HOSTS_AUTORISES). */
export function hotesApiIcrmAutorises(valeurEnv = process.env[VARIABLE_HOTES_API_ICRM]) {
  return analyserHotesApiIcrm(valeurEnv).hotes
}

/**
 * Analyse d'une URL API I-CRM (voir `urlApiIcrmAcceptable`).
 * @returns {{ ok: boolean, motif?: 'illisible'|'https'|'identifiants'|'locale_production'|'hote' }}
 */
function analyserUrlApiIcrm(apiUrl, { nodeEnv = process.env.NODE_ENV, hotesAutorises } = {}) {
  let url
  try {
    url = new URL(String(apiUrl ?? '').trim())
  } catch {
    return { ok: false, motif: 'illisible' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, motif: 'https' }
  if (url.username || url.password) return { ok: false, motif: 'identifiants' }
  // new URL() a déjà mis l'hôte en minuscules, l'IDN en punycode et normalisé les
  // formes d'IPv4 (0x7f.1, 2130706433 → 127.0.0.1)
  const brut = url.hostname
  if (HOTES_LOCAUX.has(brut)) {
    return nodeEnv === 'production' ? { ok: false, motif: 'locale_production' } : { ok: true }
  }
  if (url.protocol !== 'https:') return { ok: false, motif: 'https' }
  // Point final (FQDN « ila26.fr. ») retiré ; une IP littérale n'est jamais autorisée
  const hote = brut.replace(/\.$/, '')
  if (hote.startsWith('[') || /^[\d.]+$/.test(hote)) return { ok: false, motif: 'hote' }
  const liste = hotesAutorises ?? hotesApiIcrmAutorises()
  const autorise = liste.some((suffixe) => hote === suffixe || hote.endsWith(`.${suffixe}`))
  return autorise ? { ok: true } : { ok: false, motif: 'hote' }
}

/**
 * Le secret part dans un en-tête HTTP vers cette URL. Acceptée seulement si :
 * - https, sans identifiants dans l'URL ;
 * - hôte = un suffixe autorisé ou l'un de ses sous-domaines (défaut : ila26.fr,
 *   ila26.com, azurewebsites.net, code.run ; variable ICRM_API_HOSTS_AUTORISES) ;
 *   jamais une IP littérale ;
 * - exception HORS production : localhost / 127.0.0.1 / [::1] (http ou https),
 *   pour un mock I-CRM local.
 * Partagé par les canaux `icrm_api_key` et les entreprises I-CRM, et revérifié
 * au moment de l'envoi (worker) et du test (ping).
 * @param {object} [options] `nodeEnv`, `hotesAutorises` (injectables pour les tests)
 */
export function urlApiIcrmAcceptable(apiUrl, options = {}) {
  return analyserUrlApiIcrm(apiUrl, options).ok
}

/** Message d'erreur adapté à une URL refusée par urlApiIcrmAcceptable (null si acceptée). */
export function messageUrlApiIcrmRefusee(apiUrl, options = {}) {
  const { ok, motif } = analyserUrlApiIcrm(apiUrl, options)
  if (ok) return null
  if (motif === 'identifiants') return MESSAGE_URL_IDENTIFIANTS
  if (motif === 'locale_production') return MESSAGE_URL_LOCALE_PRODUCTION
  if (motif === 'hote') {
    const liste = options.hotesAutorises ?? hotesApiIcrmAutorises()
    return liste.length > 0
      ? `Hôte de l'URL API I-CRM non autorisé : domaines acceptés ${liste.join(', ')} `
        + `(et leurs sous-domaines ; variable ${VARIABLE_HOTES_API_ICRM})`
      : `Hôte de l'URL API I-CRM non autorisé : aucun domaine autorisé (variable ${VARIABLE_HOTES_API_ICRM} invalide)`
  }
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
// Code EMA : URL API refusée au moment de l'envoi ou du test (hôte hors liste, http…)
export const CODE_URL_NON_AUTORISEE = 'url_non_autorisee'

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
