/**
 * Entreprises (tenants) I-CRM — /api/entreprises-icrm
 *
 * Une entreprise I-CRM (LENA, CAE España…) est enregistrée UNE fois avec la clé
 * API émise par I-CRM pour ce tenant (identifiant « emak_… » + secret), puis
 * choisie borne par borne (PUT /api/bornes/:id { entrepriseIcrmId }). Le worker
 * envoie alors les enregistrements de la borne à cette entreprise, en priorité
 * sur les canaux (voir services/queueWorker.js).
 *
 * Lecture : SuperAdmin (toutes) et AdminBorne (celles de ses bornes uniquement).
 * Écriture et test de connexion : SuperAdmin seulement.
 *
 * Le secret (`token`) est en ÉCRITURE SEULE : jamais renvoyé, jamais journalisé.
 * La projection publique expose `apiKeyId` (identifiant de clé, public par
 * construction) et `hasToken`.
 */
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'
import {
  ICRM_API_KEY_ID_REGEX,
  ICRM_API_SECRET_REGEX,
  MESSAGE_CLE_API_INVALIDE,
  MESSAGE_SECRET_INVALIDE,
  MESSAGE_URL_HTTPS,
  normaliserUrlApiIcrm,
  urlApiIcrmAcceptable,
} from '../lib/icrmApiKey.js'
import { pingerIcrm, resultatEchecReseauPing } from '../services/icrmPingService.js'

export const entreprisesIcrmRouter = Router()

// ─── Validation ───────────────────────────────────────────────────────────────

const NOM_MAX = 120
const LONGUEUR_MAX_INFO_ICRM = 255

const champNom = z.string({ required_error: 'Le nom est requis', invalid_type_error: 'Le nom est requis' })
  .trim()
  .min(1, 'Le nom est requis')
  .max(NOM_MAX, `Le nom ne doit pas dépasser ${NOM_MAX} caractères`)

const champApiUrl = z.string({ required_error: "L'URL API I-CRM est requise", invalid_type_error: "L'URL API I-CRM est requise" })
  .trim()
  .url('URL API invalide')
  .refine(urlApiIcrmAcceptable, MESSAGE_URL_HTTPS)

const champApiKey = z.string({ required_error: 'La clé API (X-Api-Key) est requise', invalid_type_error: MESSAGE_CLE_API_INVALIDE })
  .trim()
  .regex(ICRM_API_KEY_ID_REGEX, MESSAGE_CLE_API_INVALIDE)

const champToken = z.string({ required_error: 'Le secret (X-Api-Secret) est requis', invalid_type_error: MESSAGE_SECRET_INVALIDE })
  .trim()
  .regex(ICRM_API_SECRET_REGEX, MESSAGE_SECRET_INVALIDE)

// Les champs calculés (nomIcrm, sousTypeIcrm, dernierStatut…) ne sont jamais
// acceptés du client : zod retire les clés inconnues.
const createSchema = z.object({
  nom: champNom,
  apiUrl: champApiUrl,
  apiKey: champApiKey,
  token: champToken,
  actif: z.boolean().optional().default(true),
})

const updateSchema = z.object({
  nom: champNom.optional(),
  apiUrl: champApiUrl.optional(),
  apiKey: champApiKey.optional(),
  token: champToken.optional(),
  actif: z.boolean().optional(),
})

const listQuerySchema = z.object({
  actif: z.enum(['true', 'false']).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Projection publique : JAMAIS le secret ; l'identifiant de clé seulement s'il en a le format. */
export function versEntreprisePublique(entreprise) {
  if (!entreprise) return null
  const { apiKey, token, deletedAt: _deletedAt, _count, bornes, ...rest } = entreprise
  return {
    ...rest,
    apiKeyId: ICRM_API_KEY_ID_REGEX.test(apiKey || '') ? apiKey : null,
    hasToken: Boolean(token),
    ...(_count ? { nbBornes: _count.bornes ?? 0 } : {}),
    ...(Array.isArray(bornes)
      ? { bornes: bornes.map(({ adminBorneId: _omit, ...b }) => b) }
      : {}),
  }
}

function erreurValidation(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: error.issues?.[0]?.message || 'Données invalides',
      details: error.flatten(),
    },
  })
}

function introuvable(res) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Entreprise I-CRM introuvable' },
  })
}

function erreurServeur(res, err, contexte) {
  logger.error({ message: `[ENTREPRISES-ICRM] ${contexte}`, error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

/** Refuse un nom déjà porté par une autre entreprise (non supprimée), casse ignorée. */
async function nomDejaPris(nom, saufId = null) {
  const doublon = await prisma.entrepriseIcrm.findFirst({
    where: {
      deletedAt: null,
      nom: { equals: nom, mode: 'insensitive' },
      ...(saufId ? { id: { not: saufId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(doublon)
}

function doublonNom(res) {
  return res.status(409).json({
    success: false,
    error: { code: 'DUPLICATE', message: 'Une entreprise I-CRM porte déjà ce nom' },
  })
}

const texteInfoIcrm = (v) => (typeof v === 'string' && v.trim() !== ''
  ? v.trim().slice(0, LONGUEUR_MAX_INFO_ICRM)
  : null)

// ─── GET /api/entreprises-icrm ────────────────────────────────────────────────
// SuperAdmin : toutes (nombre de bornes affectées inclus). AdminBorne : lecture
// seule des entreprises affectées à SES bornes.

entreprisesIcrmRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return erreurValidation(res, parsed.error)

  const estAdminBorne = req.user.role === 'ADMIN_BORNE'
  const where = { deletedAt: null }
  if (parsed.data.actif) where.actif = parsed.data.actif === 'true'
  if (estAdminBorne) where.bornes = { some: { deletedAt: null, adminBorneId: req.user.sub } }

  try {
    const entreprises = await prisma.entrepriseIcrm.findMany({
      where,
      orderBy: { nom: 'asc' },
      ...(estAdminBorne
        ? {}
        : { include: { _count: { select: { bornes: { where: { deletedAt: null } } } } } }),
    })
    return res.json({ success: true, data: entreprises.map(versEntreprisePublique) })
  } catch (err) {
    return erreurServeur(res, err, 'Liste')
  }
})

// ─── GET /api/entreprises-icrm/:id ────────────────────────────────────────────

entreprisesIcrmRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  try {
    const entreprise = await prisma.entrepriseIcrm.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        bornes: {
          where: { deletedAt: null },
          select: { id: true, idBorne: true, adresse: true, pays: true, adminBorneId: true },
          orderBy: { idBorne: 'asc' },
        },
      },
    })
    if (!entreprise) return introuvable(res)

    if (req.user.role === 'ADMIN_BORNE') {
      const siennes = entreprise.bornes.filter((b) => b.adminBorneId === req.user.sub)
      if (siennes.length === 0) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
      }
      return res.json({ success: true, data: versEntreprisePublique({ ...entreprise, bornes: siennes }) })
    }

    return res.json({ success: true, data: versEntreprisePublique(entreprise) })
  } catch (err) {
    return erreurServeur(res, err, 'Détail')
  }
})

// ─── POST /api/entreprises-icrm ───────────────────────────────────────────────

entreprisesIcrmRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return erreurValidation(res, parsed.error)

  try {
    if (await nomDejaPris(parsed.data.nom)) return doublonNom(res)

    const entreprise = await prisma.entrepriseIcrm.create({
      data: { ...parsed.data, apiUrl: normaliserUrlApiIcrm(parsed.data.apiUrl) },
    })
    logger.info({ message: '[ENTREPRISES-ICRM] Entreprise créée', entrepriseIcrmId: entreprise.id, nom: entreprise.nom })
    return res.status(201).json({ success: true, data: versEntreprisePublique(entreprise) })
  } catch (err) {
    return erreurServeur(res, err, 'Création')
  }
})

// ─── PUT /api/entreprises-icrm/:id ────────────────────────────────────────────
// Modification partielle. Un champ absent n'est pas modifié (le secret, jamais
// renvoyé au client, n'est donc changé que s'il est saisi). Une NOUVELLE clé
// impose son secret : I-CRM émet toujours une clé avec un nouveau secret (même
// règle que les canaux). Changer l'URL ou la clé efface l'entreprise / le
// sous-type vérifiés (à retester) ; changer le secret seul efface le statut.

entreprisesIcrmRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return erreurValidation(res, parsed.error)

  const { id } = req.params
  const patch = { ...parsed.data }

  try {
    const existante = await prisma.entrepriseIcrm.findFirst({ where: { id, deletedAt: null } })
    if (!existante) return introuvable(res)

    const nouvelleCle = patch.apiKey !== undefined && patch.apiKey !== existante.apiKey
    if (nouvelleCle && patch.token === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Nouvelle clé API : le secret émis avec cette clé par I-CRM doit être saisi',
          details: { formErrors: [], fieldErrors: { token: ['Nouvelle clé API : le secret émis avec cette clé par I-CRM doit être saisi'] } },
        },
      })
    }

    if (patch.nom !== undefined && patch.nom.toLowerCase() !== existante.nom.toLowerCase()
      && await nomDejaPris(patch.nom, id)) {
      return doublonNom(res)
    }

    if (patch.apiUrl !== undefined) patch.apiUrl = normaliserUrlApiIcrm(patch.apiUrl)
    const nouvelleUrl = patch.apiUrl !== undefined
      && patch.apiUrl !== normaliserUrlApiIcrm(existante.apiUrl)
    const nouveauSecret = patch.token !== undefined && patch.token !== existante.token

    if (nouvelleUrl || nouvelleCle) {
      // Autre point d'accès ou autre clé : peut-être un autre tenant
      Object.assign(patch, { nomIcrm: null, sousTypeIcrm: null, derniereVerification: null, dernierStatut: null })
    } else if (nouveauSecret) {
      // Même clé (même tenant), secret à revérifier
      Object.assign(patch, { derniereVerification: null, dernierStatut: null })
    }

    const entreprise = await prisma.entrepriseIcrm.update({ where: { id }, data: patch })
    logger.info({
      message: '[ENTREPRISES-ICRM] Entreprise modifiée',
      entrepriseIcrmId: id,
      champs: Object.keys(parsed.data),
    })
    return res.json({ success: true, data: versEntreprisePublique(entreprise) })
  } catch (err) {
    return erreurServeur(res, err, 'Modification')
  }
})

// ─── DELETE /api/entreprises-icrm/:id[?force=true] ────────────────────────────
// Suppression logique. Si des bornes l'ont pour destination : 409 avec la liste
// des bornes, sauf `?force=true` qui les désaffecte (elles reviennent à leurs
// canaux) dans la même transaction.

entreprisesIcrmRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params
  const force = req.query.force === 'true'

  try {
    const existante = await prisma.entrepriseIcrm.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nom: true,
        bornes: { where: { deletedAt: null }, select: { id: true, idBorne: true, adresse: true }, orderBy: { idBorne: 'asc' } },
      },
    })
    if (!existante) return introuvable(res)

    if (existante.bornes.length > 0 && !force) {
      const n = existante.bornes.length
      return res.status(409).json({
        success: false,
        error: {
          code: 'ENTREPRISE_ICRM_EN_USAGE',
          message: `L'entreprise « ${existante.nom} » est la destination de ${n} borne${n > 1 ? 's' : ''}. `
            + 'Confirmez la suppression pour les désaffecter : elles repasseront sur leurs canaux I-CRM.',
          details: { bornes: existante.bornes },
        },
      })
    }

    const [desaffectation] = await prisma.$transaction([
      prisma.borne.updateMany({ where: { entrepriseIcrmId: id }, data: { entrepriseIcrmId: null } }),
      prisma.entrepriseIcrm.update({ where: { id }, data: { deletedAt: new Date(), actif: false } }),
    ])

    logger.info({
      message: '[ENTREPRISES-ICRM] Entreprise supprimée',
      entrepriseIcrmId: id,
      bornesDesaffectees: desaffectation?.count ?? 0,
    })
    return res.json({ success: true, data: { id, bornesDesaffectees: desaffectation?.count ?? 0 } })
  } catch (err) {
    return erreurServeur(res, err, 'Suppression')
  }
})

// ─── POST /api/entreprises-icrm/:id/test ──────────────────────────────────────
// Ping I-CRM avec la clé de l'entreprise (même logique que le test d'un canal
// icrm_api_key) ; mémorise l'entreprise et le sous-type renvoyés, la date et le
// résultat du test.

entreprisesIcrmRouter.post('/:id/test', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params

  let entreprise
  try {
    entreprise = await prisma.entrepriseIcrm.findFirst({ where: { id, deletedAt: null } })
  } catch (err) {
    return erreurServeur(res, err, 'Test (lecture)')
  }
  if (!entreprise) return introuvable(res)

  if (!normaliserUrlApiIcrm(entreprise.apiUrl) || !entreprise.apiKey || !entreprise.token) {
    return res.status(400).json({
      success: false,
      error: 'Entreprise I-CRM incomplète : URL API, clé ou secret manquant',
    })
  }

  let status = 200
  let corps
  let dernierStatut
  const verification = {}
  try {
    corps = await pingerIcrm(entreprise)
    if (corps.success) {
      dernierStatut = 'ok'
      verification.nomIcrm = texteInfoIcrm(corps.entreprise)
      verification.sousTypeIcrm = texteInfoIcrm(corps.subtype?.name)
    } else {
      dernierStatut = corps.code || `http_${corps.httpStatus}`
    }
  } catch (err) {
    const echec = resultatEchecReseauPing(err)
    status = echec.status
    corps = echec.body
    dernierStatut = echec.code
    logger.warn({ message: '[ENTREPRISES-ICRM] Test connexion échoué', entrepriseIcrmId: id, error: err.message })
  }

  try {
    const miseAJour = await prisma.entrepriseIcrm.update({
      where: { id },
      data: { ...verification, derniereVerification: new Date(), dernierStatut },
    })
    return res.status(status).json({ ...corps, entrepriseIcrm: versEntreprisePublique(miseAJour) })
  } catch (err) {
    return erreurServeur(res, err, 'Test (enregistrement du résultat)')
  }
})
