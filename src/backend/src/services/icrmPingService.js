/**
 * Test de connexion I-CRM par clé API : GET {apiUrl}/api/external/estimer-mes-aides/v1/ping.
 *
 * Partagé par le test d'un canal `icrm_api_key` (POST /api/canaux/:id/test) et
 * celui d'une entreprise I-CRM (POST /api/entreprises-icrm/:id/test) : mêmes
 * en-têtes, même délai, redirections non suivies, même contrôle du contrat.
 *
 * Hôte de l'URL revérifié avant tout appel (liste blanche, lib/icrmApiKey.js) :
 * refusé → échec `url_non_autorisee` sans requête réseau.
 * Succès UNIQUEMENT sur un 2xx au corps du contrat (`ok: true` + `api_version`) ;
 * renvoie alors l'entreprise, le sous-type et le client I-CRM liés à la clé.
 * Le secret n'apparaît jamais dans le résultat.
 */
import {
  CANAL_TYPE_ICRM_API_KEY,
  urlPointAccesIcrm,
  normaliserUrlApiIcrm,
  enTetesCleApiIcrm,
  lireCorpsJsonIcrm,
  estPingIcrmConforme,
  codeErreurIcrm,
  CODE_REPONSE_NON_CONFORME,
  CODE_URL_NON_AUTORISEE,
  urlApiIcrmAcceptable,
  messageUrlApiIcrmRefusee,
} from '../lib/icrmApiKey.js'

export const DELAI_PING_ICRM_MS = 10 * 1000

// Messages du test de connexion, par code d'erreur I-CRM
const MESSAGES_ECHEC_PING = {
  invalid_credentials: 'Clé API ou secret refusé par I-CRM : vérifiez la clé (X-Api-Key) et le secret (X-Api-Secret).',
  client_disabled: 'Le client API est désactivé dans I-CRM : réactivez-le ou demandez une nouvelle clé.',
  subscription_inactive: "L'abonnement de l'entreprise I-CRM est inactif.",
}

function messageEchecPing(status, code) {
  if (status >= 200 && status < 300) {
    // 2xx sans le corps du contrat (ok + api_version) : page d'un front en repli SPA,
    // page de proxy, autre API… L'URL saisie n'est pas celle de l'API I-CRM.
    return `Réponse inattendue (HTTP ${status}) : l'URL ne pointe pas vers l'API I-CRM. `
      + "Vérifiez l'URL API (ex. https://icrm.api.ila26.fr, sans /api ni chemin de page comme /projects)."
  }
  if (code && MESSAGES_ECHEC_PING[code]) return MESSAGES_ECHEC_PING[code]
  if (status === 401) return MESSAGES_ECHEC_PING.invalid_credentials
  if (status === 403) return 'Accès refusé par I-CRM (403) : client désactivé ou abonnement inactif.'
  if (status === 404) return "Point d'accès I-CRM introuvable (404) : vérifiez l'URL API (ex. https://icrm.api.ila26.fr, sans /api)."
  if (status >= 300 && status < 400) return `Redirection refusée (HTTP ${status}) : vérifiez l'URL API (https, sans /api).`
  return `I-CRM a répondu HTTP ${status}${code ? ` (${code})` : ''}.`
}

/**
 * Interroge le ping I-CRM avec les identifiants d'un canal ou d'une entreprise.
 *
 * Les erreurs réseau et le délai dépassé (y compris pendant la lecture du corps
 * d'un 2xx) sont LEVÉES : l'appelant les traduit (voir `resultatEchecReseauPing`).
 *
 * @param {{ apiUrl: string, apiKey: string, token: string }} identifiants
 * @returns {Promise<Object>} corps de réponse du test : `success`, `type`, `reachable`,
 *   `httpStatus`, `latencyMs`, `authValid` ; en succès `entreprise`, `subtype`,
 *   `client`, `apiVersion` ; en échec `code`, `requestId`, `error` (message FR).
 */
export async function pingerIcrm(identifiants) {
  // Hôte revérifié au moment du test (liste ICRM_API_HOSTS_AUTORISES) : le secret
  // ne part jamais vers un hôte refusé, même enregistré avant un changement de liste.
  if (!urlApiIcrmAcceptable(normaliserUrlApiIcrm(identifiants.apiUrl))) {
    return {
      type: CANAL_TYPE_ICRM_API_KEY,
      success: false,
      reachable: false,
      httpStatus: null,
      latencyMs: 0,
      authValid: null,
      code: CODE_URL_NON_AUTORISEE,
      requestId: null,
      error: messageUrlApiIcrmRefusee(normaliserUrlApiIcrm(identifiants.apiUrl)),
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DELAI_PING_ICRM_MS)
  const startedAt = Date.now()

  let icrmResponse
  let corps
  try {
    icrmResponse = await fetch(urlPointAccesIcrm(identifiants.apiUrl, '/ping'), {
      method: 'GET',
      headers: enTetesCleApiIcrm(identifiants),
      redirect: 'manual',
      signal: controller.signal,
    })
    corps = await lireCorpsJsonIcrm(icrmResponse, { propagerErreurLecture: icrmResponse.ok })
  } finally {
    clearTimeout(timeoutId)
  }

  const status = icrmResponse.status
  const base = {
    type: CANAL_TYPE_ICRM_API_KEY,
    reachable: true,
    httpStatus: status,
    latencyMs: Date.now() - startedAt,
  }

  if (icrmResponse.ok && estPingIcrmConforme(corps)) {
    return {
      ...base,
      success: true,
      authValid: true,
      entreprise: typeof corps?.entreprise === 'string' ? corps.entreprise : null,
      subtype: corps?.subtype && typeof corps.subtype === 'object'
        ? { id: corps.subtype.id ?? null, name: corps.subtype.name ?? null }
        : null,
      client: typeof corps?.client === 'string' ? corps.client : null,
      apiVersion: corps?.api_version ?? null,
    }
  }

  const code = icrmResponse.ok ? CODE_REPONSE_NON_CONFORME : codeErreurIcrm(corps)
  let requestId = corps?.error?.request_id ?? null
  if (!requestId) {
    try { requestId = icrmResponse.headers?.get?.('x-request-id') ?? null } catch { requestId = null }
  }
  return {
    ...base,
    success: false,
    authValid: status === 401 || status === 403 ? false : null,
    code,
    requestId,
    error: messageEchecPing(status, code),
  }
}

/**
 * Traduction HTTP d'une erreur levée par `pingerIcrm` (délai dépassé → 504,
 * réseau → 502). Même contrat de réponse que le test historique des canaux.
 *
 * @returns {{ status: number, body: Object, code: 'timeout'|'injoignable' }}
 */
export function resultatEchecReseauPing(error) {
  if (error?.name === 'AbortError') {
    return {
      status: 504,
      code: 'timeout',
      body: { success: false, reachable: false, error: `Timeout après ${DELAI_PING_ICRM_MS / 1000}s` },
    }
  }
  return {
    status: 502,
    code: 'injoignable',
    body: { success: false, reachable: false, error: error?.message || 'Connexion impossible' },
  }
}
