import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'
import {
  CANAL_TYPES,
  CANAL_TYPE_AZURE_AD,
  CANAL_TYPE_ICRM_API_KEY,
  ICRM_API_KEY_ID_REGEX,
  ICRM_API_SECRET_REGEX,
  typeDeCanal,
  estCanalCleApi,
  normaliserUrlApiIcrm,
  urlPointAccesIcrm,
  enTetesCleApiIcrm,
  lireCorpsJsonIcrm,
  estPingIcrmConforme,
  codeErreurIcrm,
  CODE_REPONSE_NON_CONFORME,
} from '../lib/icrmApiKey.js'

export const canauxRouter = express.Router()

const MESSAGE_CLE_API_INVALIDE = 'Clé API I-CRM invalide : format attendu « emak_ » suivi de 24 caractères alphanumériques'
const MESSAGE_SECRET_INVALIDE = 'Secret API I-CRM invalide : 48 caractères alphanumériques attendus'
const MESSAGE_URL_HTTPS = "L'URL API I-CRM doit être en https (le secret transite dans les en-têtes)"

// Le secret part dans un en-tête HTTP : https obligatoire (localhost toléré en développement).
function urlAcceptablePourCleApi(apiUrl) {
  try {
    const url = new URL(apiUrl)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

/**
 * Règles propres au type icrm_api_key, communes à la création et à la modification.
 * `valeurs` ne contient que les champs fournis (en modification : patch partiel).
 */
function verifierChampsCleApi(valeurs, ctx) {
  if (valeurs.apiKey !== undefined && !ICRM_API_KEY_ID_REGEX.test(valeurs.apiKey)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiKey'], message: MESSAGE_CLE_API_INVALIDE })
  }
  if (valeurs.token !== undefined && !ICRM_API_SECRET_REGEX.test(valeurs.token)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['token'], message: MESSAGE_SECRET_INVALIDE })
  }
  if (valeurs.apiUrl !== undefined && !urlAcceptablePourCleApi(valeurs.apiUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiUrl'], message: MESSAGE_URL_HTTPS })
  }
}

// Schéma de validation pour créer/modifier un canal
// type : azure_ad (défaut, historique) | icrm_api_key (apiKey = identifiant de clé, token = secret)
const canalSchema = z.object({
  type: z.enum(CANAL_TYPES).optional().default(CANAL_TYPE_AZURE_AD),
  label: z.string().min(1, 'Le label est requis'),
  apiUrl: z.string().url('URL API invalide'),
  apiKey: z.string().min(1, 'La clé API est requise'),
  token: z.string().min(1, 'Le token est requis'),
  borneId: z.string().uuid('ID de borne invalide'),
  actif: z.boolean().optional().default(true)
}).superRefine((data, ctx) => {
  if (data.type === CANAL_TYPE_ICRM_API_KEY) verifierChampsCleApi(data, ctx)
})

// Schéma de validation pour modification partielle (rotation token uniquement, etc.)
const canalUpdateSchema = z.object({
  type: z.enum(CANAL_TYPES).optional(),
  label: z.string().min(1, 'Le label est requis').optional(),
  apiUrl: z.string().url('URL API invalide').optional(),
  apiKey: z.string().min(1, 'La clé API est requise').optional(),
  token: z.string().min(1, 'Le token est requis').optional(),
  actif: z.boolean().optional(),
})

/**
 * Cohérence d'une modification avec le type EFFECTIF du canal (type du patch,
 * sinon type en base). Un changement de type impose de fournir la clé ET le
 * secret : les anciennes valeurs appartiennent à l'autre mode d'authentification.
 * Canal icrm_api_key : une NOUVELLE clé impose aussi son secret — I-CRM émet
 * toujours un identifiant de clé avec un nouveau secret (la rotation, elle, ne
 * change que le secret) ; garder l'ancien secret donnerait 401 sur chaque envoi.
 * @returns {Array} issues au format ZodError.errors (vide si valide)
 */
function verifierModificationCanal(patch, canalExistant) {
  const typeEffectif = patch.type ?? typeDeCanal(canalExistant)
  const changementDeType = patch.type !== undefined && patch.type !== typeDeCanal(canalExistant)
  const nouvelleCleApi = typeEffectif === CANAL_TYPE_ICRM_API_KEY
    && !changementDeType
    && patch.apiKey !== undefined
    && patch.apiKey !== canalExistant.apiKey
  const schema = z.any().superRefine((valeurs, ctx) => {
    if (changementDeType) {
      if (valeurs.apiKey === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiKey'], message: 'Changement de type : la clé (apiKey) doit être fournie' })
      }
      if (valeurs.token === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['token'], message: 'Changement de type : le secret (token) doit être fourni' })
      }
    }
    if (nouvelleCleApi && valeurs.token === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['token'],
        message: 'Nouvelle clé API : le secret émis avec cette clé par I-CRM doit être saisi',
      })
    }
    if (typeEffectif === CANAL_TYPE_ICRM_API_KEY) {
      verifierChampsCleApi({
        ...valeurs,
        // L'URL déjà en base est re-vérifiée lors d'un passage en clé API
        apiUrl: valeurs.apiUrl ?? (changementDeType ? canalExistant.apiUrl : undefined),
      }, ctx)
    }
  })
  const resultat = schema.safeParse(patch)
  return resultat.success ? [] : resultat.error.errors
}

// Décode l'expiration d'un JWT (format JWS à 3 segments base64url)
function decodeTokenExp(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload.exp ? new Date(payload.exp * 1000).toISOString() : null
  } catch {
    return null
  }
}

// Projection publique : ne JAMAIS renvoyer le secret (token) ni le refresh token Azure (apiKey).
// Seul l'identifiant d'une clé I-CRM (« emak_… », public par construction) est exposé.
function toPublicCanal(canal) {
  if (!canal) return null
  const { apiKey, token, ...rest } = canal
  const type = typeDeCanal(canal)
  const estCleApi = type === CANAL_TYPE_ICRM_API_KEY
  return {
    ...rest,
    type,
    hasApiKey: Boolean(apiKey),
    hasToken: Boolean(token),
    tokenExpiresAt: estCleApi ? null : decodeTokenExp(token),
    apiKeyId: estCleApi && ICRM_API_KEY_ID_REGEX.test(apiKey || '') ? apiKey : null,
  }
}

// Messages du test de connexion d'un canal icrm_api_key, par code d'erreur I-CRM
const MESSAGES_ECHEC_PING = {
  invalid_credentials: 'Clé API ou secret refusé par I-CRM : vérifiez la clé (X-Api-Key) et le secret (X-Api-Secret) du canal.',
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
 * Test d'un canal icrm_api_key : GET {apiUrl}/api/external/estimer-mes-aides/v1/ping.
 * Succès uniquement sur un 2xx au corps du contrat (`ok: true` + `api_version`) ;
 * renvoie l'entreprise, le sous-type et le client I-CRM.
 * Les erreurs réseau / timeout (y compris pendant la lecture du corps d'un 2xx)
 * remontent au catch de la route (502 / 504).
 */
async function testerCanalCleApi(canal, res) {
  if (!normaliserUrlApiIcrm(canal.apiUrl) || !canal.apiKey || !canal.token) {
    return res.status(400).json({
      success: false,
      error: 'Canal incomplet : URL API, clé ou secret manquant',
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10 * 1000)
  const startedAt = Date.now()

  let icrmResponse
  let corps
  try {
    icrmResponse = await fetch(urlPointAccesIcrm(canal.apiUrl, '/ping'), {
      method: 'GET',
      headers: enTetesCleApiIcrm(canal),
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
    return res.json({
      ...base,
      success: true,
      authValid: true,
      entreprise: typeof corps?.entreprise === 'string' ? corps.entreprise : null,
      subtype: corps?.subtype && typeof corps.subtype === 'object'
        ? { id: corps.subtype.id ?? null, name: corps.subtype.name ?? null }
        : null,
      client: typeof corps?.client === 'string' ? corps.client : null,
      apiVersion: corps?.api_version ?? null,
    })
  }

  const code = icrmResponse.ok ? CODE_REPONSE_NON_CONFORME : codeErreurIcrm(corps)
  let requestId = corps?.error?.request_id ?? null
  if (!requestId) {
    try { requestId = icrmResponse.headers?.get?.('x-request-id') ?? null } catch { requestId = null }
  }
  return res.json({
    ...base,
    success: false,
    authValid: status === 401 || status === 403 ? false : null,
    code,
    requestId,
    error: messageEchecPing(status, code),
  })
}

// Middleware pour vérifier l'accès à la borne
const checkBorneAccess = async (req, res, next) => {
  const { borneId } = req.body.borneId ? req.body : req.params

  if (req.user.role === 'SUPER_ADMIN') {
    return next()
  }

  if (req.user.role !== 'ADMIN_BORNE') {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  try {
    const borne = await prisma.borne.findFirst({
      where: { id: borneId, adminBorneId: req.user.sub }
    })

    if (!borne) {
      return res.status(403).json({ error: 'Accès refusé à cette borne' })
    }

    req.borne = borne
    next()
  } catch (error) {
    console.error('Erreur lors de la vérification d\'accès à la borne:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

// GET /api/canaux?borneId=... - Lister les canaux d'une borne
canauxRouter.get('/', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { borneId } = req.query

    if (!borneId) {
      return res.status(400).json({ error: 'borneId requis' })
    }

    // Vérifier l'accès à la borne
    if (req.user.role === 'ADMIN_BORNE') {
      const borne = await prisma.borne.findFirst({
        where: { id: borneId, adminBorneId: req.user.sub }
      })
      if (!borne) {
        return res.status(403).json({ error: 'Accès refusé' })
      }
    }

    const canaux = await prisma.canal.findMany({
      where: { borneId },
      orderBy: { createdAt: 'desc' }
    })

    res.json(canaux.map(toPublicCanal))
  } catch (error) {
    console.error('Erreur lors de la récupération des canaux:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/canaux - Créer un nouveau canal
canauxRouter.post('/', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), checkBorneAccess, async (req, res) => {
  try {
    const data = canalSchema.parse(req.body)
    const canal = await prisma.canal.create({
      data
    })
    res.status(201).json(toPublicCanal(canal))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors })
    }
    console.error('Erreur lors de la création du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PUT /api/canaux/:id - Modifier un canal (mise à jour partielle supportée)
canauxRouter.put('/:id', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params
    const data = canalUpdateSchema.parse(req.body)

    // Vérifier que le canal existe et que l'utilisateur a accès
    const existingCanal = await prisma.canal.findFirst({
      where: { id },
      include: { borne: true }
    })

    if (!existingCanal) {
      return res.status(404).json({ error: 'Canal non trouvé' })
    }

    if (req.user.role === 'ADMIN_BORNE' && existingCanal.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    const incoherences = verifierModificationCanal(data, existingCanal)
    if (incoherences.length > 0) {
      return res.status(400).json({ error: 'Données invalides', details: incoherences })
    }

    const canal = await prisma.canal.update({
      where: { id },
      data
    })

    res.json(toPublicCanal(canal))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors })
    }
    console.error('Erreur lors de la modification du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/canaux/:id - Supprimer un canal
canauxRouter.delete('/:id', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params

    // Vérifier que le canal existe et que l'utilisateur a accès
    const existingCanal = await prisma.canal.findFirst({
      where: { id },
      include: { borne: true }
    })

    if (!existingCanal) {
      return res.status(404).json({ error: 'Canal non trouvé' })
    }

    if (req.user.role === 'ADMIN_BORNE' && existingCanal.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    await prisma.canal.delete({
      where: { id }
    })

    res.status(204).send()
  } catch (error) {
    console.error('Erreur lors de la suppression du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/canaux/:id/test - Tester la connexion I-CRM (ping sans envoyer de donnée)
// azure_ad     : OPTIONS {apiUrl}/api/customContacts (joignabilité, comportement historique)
// icrm_api_key : GET {apiUrl}/api/external/estimer-mes-aides/v1/ping (identifiants vérifiés)
canauxRouter.post('/:id/test', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params

  try {
    const canal = await prisma.canal.findFirst({
      where: { id },
      include: { borne: { select: { adminBorneId: true } } },
    })

    if (!canal) {
      return res.status(404).json({ error: 'Canal non trouvé' })
    }

    if (req.user.role === 'ADMIN_BORNE' && canal.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    if (estCanalCleApi(canal)) {
      return await testerCanalCleApi(canal, res)
    }

    if (!canal.apiUrl || !canal.token) {
      return res.status(400).json({
        success: false,
        error: 'Canal incomplet : URL API ou token manquant',
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10 * 1000)
    const startedAt = Date.now()

    let icrmResponse
    try {
      icrmResponse = await fetch(`${canal.apiUrl}/api/customContacts?lang=fr`, {
        method: 'OPTIONS',
        headers: {
          Authorization: `Bearer ${canal.token}`,
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const tokenExp = decodeTokenExp(canal.token)
    const tokenExpired = tokenExp ? new Date(tokenExp).getTime() < Date.now() : null

    return res.json({
      success: icrmResponse.ok || icrmResponse.status === 401 || icrmResponse.status === 405,
      reachable: true,
      httpStatus: icrmResponse.status,
      authValid: icrmResponse.status !== 401,
      tokenExpiresAt: tokenExp,
      tokenExpired,
      latencyMs: Date.now() - startedAt,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ success: false, reachable: false, error: 'Timeout après 10s' })
    }
    logger.warn({ message: '[CANAUX] Test connexion échoué', canalId: id, error: error.message })
    return res.status(502).json({
      success: false,
      reachable: false,
      error: error.message || 'Connexion impossible',
    })
  }
})