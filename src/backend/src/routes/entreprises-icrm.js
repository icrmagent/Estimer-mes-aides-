/**
 * Entreprises (tenants) I-CRM — /api/entreprises-icrm
 *
 * Une entreprise I-CRM (LENA, CAE España…) est enregistrée UNE fois avec la clé
 * API émise par I-CRM pour ce tenant (identifiant « emak_… » + secret), puis
 * choisie borne par borne (PUT /api/bornes/:id { entrepriseIcrmId }). Chaque job
 * de partage fige sa cible à sa création ; le worker n'envoie un job qu'à SA
 * cible (voir services/queueWorker.js et services/partageCibleService.js).
 *
 * SuperAdmin uniquement (lecture comme écriture) : l'AdminBorne voit l'entreprise
 * de ses bornes via /api/bornes (id, nom, nomIcrm, sousTypeIcrm, actif).
 *
 * Le secret (`token`) est en ÉCRITURE SEULE : jamais renvoyé, jamais journalisé.
 * La projection publique expose `apiKeyId` (identifiant de clé, public par
 * construction) et `hasToken`.
 *
 * Une entreprise NOUVELLE est « à tester » (verificationRequise) : elle ne reçoit
 * rien avant un test réussi (les captures de ses bornes naissent suspendues).
 *
 * Suspension / reprise des envois :
 * - désactivation, ou changement d'URL / de clé (entreprise à retester) → ses jobs
 *   en file passent au statut `suspendu` (hors de la file du worker) ;
 * - réactivation → reprise SEULEMENT si les identifiants n'ont pas changé dans la
 *   même requête ET si le dernier test des identifiants actuels a réussi ; sinon
 *   « testez l'entreprise pour reprendre les envois » ;
 * - test réussi (entreprise active) → reprise.
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
  MESSAGE_SECRET_NOUVEL_HOTE,
  STATUT_JOB_SUSPENDU,
  normaliserUrlApiIcrm,
  urlApiIcrmAcceptable,
  messageUrlApiIcrmRefusee,
  changementHoteApiIcrm,
  entrepriseIcrmUtilisable,
} from '../lib/icrmApiKey.js'
import { pingerIcrm, resultatEchecReseauPing } from '../services/icrmPingService.js'
import {
  STATUTS_JOB_NON_LIVRES,
  suspendreEnvoisEntreprise,
  reprendreEnvoisEntreprise,
  etatsEntreprises,
  planifierRedirection,
  appliquerRedirection,
  repartitionPlan,
  resumeRepartition,
} from '../services/partageCibleService.js'

export const entreprisesIcrmRouter = Router()

// ─── Validation ───────────────────────────────────────────────────────────────

const NOM_MAX = 120
const LONGUEUR_MAX_INFO_ICRM = 255

const MESSAGE_A_TESTER = "Testez l'entreprise pour reprendre les envois : ses identifiants n'ont pas encore été vérifiés."

const champNom = z.string({ required_error: 'Le nom est requis', invalid_type_error: 'Le nom est requis' })
  .trim()
  .min(1, 'Le nom est requis')
  .max(NOM_MAX, `Le nom ne doit pas dépasser ${NOM_MAX} caractères`)

const champApiUrl = z.string({ required_error: "L'URL API I-CRM est requise", invalid_type_error: "L'URL API I-CRM est requise" })
  .trim()
  .url('URL API invalide')
  .superRefine((url, ctx) => {
    if (!urlApiIcrmAcceptable(url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: messageUrlApiIcrmRefusee(url) })
    }
  })

const champApiKey = z.string({ required_error: 'La clé API (X-Api-Key) est requise', invalid_type_error: MESSAGE_CLE_API_INVALIDE })
  .trim()
  .regex(ICRM_API_KEY_ID_REGEX, MESSAGE_CLE_API_INVALIDE)

const champToken = z.string({ required_error: 'Le secret (X-Api-Secret) est requis', invalid_type_error: MESSAGE_SECRET_INVALIDE })
  .trim()
  .regex(ICRM_API_SECRET_REGEX, MESSAGE_SECRET_INVALIDE)

// Les champs calculés (nomIcrm, sousTypeIcrm, dernierStatut, verificationRequise…)
// ne sont jamais acceptés du client : zod retire les clés inconnues.
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

// Décomptes joints à la liste : bornes affectées, envois suspendus
const COMPTES = {
  _count: {
    select: {
      bornes: { where: { deletedAt: null } },
      partageJobs: { where: { statut: STATUT_JOB_SUSPENDU } },
    },
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Projection publique : JAMAIS le secret ; l'identifiant de clé seulement s'il en a le format. */
export function versEntreprisePublique(entreprise) {
  if (!entreprise) return null
  const { apiKey, token, deletedAt: _deletedAt, _count, bornes, ...rest } = entreprise
  return {
    ...rest,
    apiKeyId: ICRM_API_KEY_ID_REGEX.test(apiKey || '') ? apiKey : null,
    hasToken: Boolean(token),
    ...(_count
      ? { nbBornes: _count.bornes ?? 0, nbEnvoisSuspendus: _count.partageJobs ?? 0 }
      : {}),
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

function erreurChamp(res, champ, message) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message, details: { formErrors: [], fieldErrors: { [champ]: [message] } } },
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

entreprisesIcrmRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) return erreurValidation(res, parsed.error)

  const where = { deletedAt: null }
  if (parsed.data.actif) where.actif = parsed.data.actif === 'true'

  try {
    const entreprises = await prisma.entrepriseIcrm.findMany({ where, orderBy: { nom: 'asc' }, include: COMPTES })
    return res.json({ success: true, data: entreprises.map(versEntreprisePublique) })
  } catch (err) {
    return erreurServeur(res, err, 'Liste')
  }
})

// ─── GET /api/entreprises-icrm/:id ────────────────────────────────────────────

entreprisesIcrmRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const entreprise = await prisma.entrepriseIcrm.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...COMPTES,
        bornes: {
          where: { deletedAt: null },
          select: { id: true, idBorne: true, adresse: true, pays: true },
          orderBy: { idBorne: 'asc' },
        },
      },
    })
    if (!entreprise) return introuvable(res)
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

    // Nouvelle entreprise = identifiants jamais vérifiés : à tester avant tout envoi
    const entreprise = await prisma.entrepriseIcrm.create({
      data: { ...parsed.data, apiUrl: normaliserUrlApiIcrm(parsed.data.apiUrl), verificationRequise: true },
    })
    logger.info({ message: '[ENTREPRISES-ICRM] Entreprise créée', entrepriseIcrmId: entreprise.id, nom: entreprise.nom })
    return res.status(201).json({
      success: true,
      data: versEntreprisePublique(entreprise),
      avertissement: "Testez l'entreprise : elle ne recevra aucun enregistrement avant un test de connexion réussi.",
    })
  } catch (err) {
    return erreurServeur(res, err, 'Création')
  }
})

// ─── PUT /api/entreprises-icrm/:id ────────────────────────────────────────────
// Modification partielle. Un champ absent n'est pas modifié (le secret, jamais
// renvoyé au client, n'est donc changé que s'il est saisi). Une NOUVELLE clé, ou
// un NOUVEL HÔTE d'URL, impose le secret (le secret enregistré ne part jamais
// vers un hôte non confirmé ; I-CRM émet toujours une clé avec un nouveau secret).
// Nouvelle URL ou nouvelle clé = peut-être un autre tenant : entreprise et
// sous-type vérifiés effacés, `verificationRequise` → ses envois sont suspendus
// jusqu'à un test réussi. Secret seul : statut du dernier test effacé.

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
      return erreurChamp(res, 'token', 'Nouvelle clé API : le secret émis avec cette clé par I-CRM doit être saisi')
    }
    const nouvelHote = changementHoteApiIcrm(existante.apiUrl, patch.apiUrl)
    if (nouvelHote && patch.token === undefined) {
      return erreurChamp(res, 'token', MESSAGE_SECRET_NOUVEL_HOTE)
    }

    if (patch.nom !== undefined && patch.nom.toLowerCase() !== existante.nom.toLowerCase()
      && await nomDejaPris(patch.nom, id)) {
      return doublonNom(res)
    }

    if (patch.apiUrl !== undefined) patch.apiUrl = normaliserUrlApiIcrm(patch.apiUrl)
    const nouvelleUrl = patch.apiUrl !== undefined
      && patch.apiUrl !== normaliserUrlApiIcrm(existante.apiUrl)
    const nouveauSecret = patch.token !== undefined && patch.token !== existante.token
    const identifiantsModifies = nouvelleUrl || nouvelleCle || nouveauSecret

    if (nouvelleUrl || nouvelleCle) {
      // Autre point d'accès ou autre clé : peut-être un autre tenant → à retester
      Object.assign(patch, {
        nomIcrm: null, sousTypeIcrm: null, derniereVerification: null, dernierStatut: null, verificationRequise: true,
      })
    } else if (nouveauSecret) {
      // Même clé (même tenant), secret à revérifier
      Object.assign(patch, { derniereVerification: null, dernierStatut: null })
    }

    const entreprise = await prisma.entrepriseIcrm.update({ where: { id }, data: patch })

    // Envois : suspendus si l'entreprise n'est plus utilisable ; repris à la
    // réactivation seulement pour des identifiants inchangés et vérifiés.
    let jobsSuspendus = 0
    let jobsRepris = 0
    let avertissement = null
    const reactivation = existante.actif === false && entreprise.actif === true
    if (!entrepriseIcrmUtilisable(entreprise)) {
      jobsSuspendus = await suspendreEnvoisEntreprise(entreprise)
      if (reactivation) avertissement = MESSAGE_A_TESTER
    } else if (reactivation) {
      if (!identifiantsModifies && entreprise.dernierStatut === 'ok') {
        jobsRepris = await reprendreEnvoisEntreprise(id)
      } else {
        avertissement = MESSAGE_A_TESTER
      }
    }

    logger.info({
      message: '[ENTREPRISES-ICRM] Entreprise modifiée',
      entrepriseIcrmId: id,
      champs: Object.keys(parsed.data),
      ...(jobsSuspendus ? { jobsSuspendus } : {}),
      ...(jobsRepris ? { jobsRepris } : {}),
    })
    return res.json({
      success: true,
      data: versEntreprisePublique(entreprise),
      ...(jobsSuspendus ? { jobsSuspendus } : {}),
      ...(reactivation ? { jobsRepris } : {}),
      ...(avertissement ? { avertissement } : {}),
    })
  } catch (err) {
    return erreurServeur(res, err, 'Modification')
  }
})

// ─── DELETE /api/entreprises-icrm/:id[?force=true[&redirigerEnvoisEnAttente=true]] ─
// Suppression logique. Si des bornes l'ont pour destination OU si des envois non
// livrés la ciblent (en attente, suspendus, échecs définitifs) : 409 avec la liste
// des bornes, le nombre d'envois et la répartition qu'aurait une redirection
// (`details.redirection`, ex. « 3 → LENA, 1 → canaux »), sauf `?force=true`.
// Avec force : les bornes sont désaffectées (elles repassent sur leurs canaux pour
// les NOUVEAUX enregistrements) et les envois qui ciblaient l'entreprise restent
// SUSPENDUS (« entreprise supprimée ») — sauf `redirigerEnvoisEnAttente=true`,
// choix explicite qui envoie CHAQUE envoi vers la destination ACTUELLE de SA
// borne : son entreprise I-CRM si la borne a été réaffectée entre-temps, sinon
// ses canaux. Jamais vers les canaux d'une borne qui a une autre entreprise.

// Envois non livrés d'une entreprise, avec la destination actuelle de leur borne
function envoisNonLivresEntreprise(id) {
  return prisma.partageJob.findMany({
    where: { entrepriseIcrmId: id, statut: { in: [...STATUTS_JOB_NON_LIVRES] } },
    select: {
      id: true,
      enregistrementId: true,
      statut: true,
      entrepriseIcrmId: true,
      enregistrement: { select: { borne: { select: { entrepriseIcrmId: true } } } },
    },
  })
}

/**
 * Plan de redirection des envois d'une entreprise supprimée : chaque envoi va vers
 * la destination actuelle de sa borne (les bornes encore affectées à l'entreprise
 * supprimée repassent sur leurs canaux : NULL).
 */
async function planRedirectionSuppression(id, jobs) {
  const cibleDe = (job) => {
    const cible = job.enregistrement?.borne?.entrepriseIcrmId ?? null
    return cible === id ? null : cible
  }
  const etats = await etatsEntreprises(jobs.map(cibleDe))
  const plan = planifierRedirection(jobs, cibleDe, etats)
  return { plan, destinations: repartitionPlan(plan, etats) }
}

entreprisesIcrmRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params
  const force = req.query.force === 'true'
  const rediriger = req.query.redirigerEnvoisEnAttente === 'true' || req.body?.redirigerEnvoisEnAttente === true

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

    const envois = await envoisNonLivresEntreprise(id)
    const envoisEnAttente = envois.length

    if ((existante.bornes.length > 0 || envoisEnAttente > 0) && !force) {
      const n = existante.bornes.length
      const { destinations: redirection } = await planRedirectionSuppression(id, envois)
      return res.status(409).json({
        success: false,
        error: {
          code: 'ENTREPRISE_ICRM_EN_USAGE',
          message: `L'entreprise « ${existante.nom} » est la destination de ${n} borne${n > 1 ? 's' : ''}`
            + ` et de ${envoisEnAttente} envoi${envoisEnAttente > 1 ? 's' : ''} non livré${envoisEnAttente > 1 ? 's' : ''}. `
            + 'Confirmez la suppression : les bornes repasseront sur leurs canaux ; choisissez de garder '
            + 'les envois suspendus ou de les rediriger vers la destination actuelle de leur borne'
            + (redirection.length > 0 ? ` (${resumeRepartition(redirection)}).` : '.'),
          details: { bornes: existante.bornes, envoisEnAttente, redirection },
        },
      })
    }

    const maintenant = new Date()
    const [desaffectation] = await prisma.$transaction([
      prisma.borne.updateMany({ where: { entrepriseIcrmId: id }, data: { entrepriseIcrmId: null } }),
      prisma.entrepriseIcrm.update({ where: { id }, data: { deletedAt: maintenant, actif: false } }),
    ])

    let envoisRediriges = 0
    let envoisSuspendus = 0
    let destinations = []
    if (envoisEnAttente > 0) {
      if (rediriger) {
        // Choix explicite : chaque envoi → destination ACTUELLE de sa borne (relue
        // après la désaffectation) ; statuts selon cette cible (planifierRedirection)
        const { plan, destinations: repartition } = await planRedirectionSuppression(id, await envoisNonLivresEntreprise(id))
        envoisRediriges = await appliquerRedirection(plan)
        destinations = repartition
      } else {
        envoisSuspendus = await suspendreEnvoisEntreprise(
          { id, nom: existante.nom, actif: false, deletedAt: maintenant },
          { inclureSuspendus: true },
        )
      }
    }

    logger.info({
      message: '[ENTREPRISES-ICRM] Entreprise supprimée',
      entrepriseIcrmId: id,
      bornesDesaffectees: desaffectation?.count ?? 0,
      envoisRediriges,
      envoisSuspendus,
      ...(destinations.length > 0 ? { redirection: resumeRepartition(destinations) } : {}),
    })
    return res.json({
      success: true,
      data: {
        id,
        bornesDesaffectees: desaffectation?.count ?? 0,
        envoisRediriges,
        envoisSuspendus,
        ...(rediriger ? { destinations } : {}),
      },
    })
  } catch (err) {
    return erreurServeur(res, err, 'Suppression')
  }
})

// ─── POST /api/entreprises-icrm/:id/test ──────────────────────────────────────
// Ping I-CRM avec la clé de l'entreprise (même logique que le test d'un canal
// icrm_api_key). Le résultat (entreprise, sous-type, date, statut) n'est
// enregistré QUE si l'URL, la clé et le secret n'ont pas changé pendant le ping
// (écriture conditionnelle) : sinon il est renvoyé sans être enregistré. Un test
// réussi lève `verificationRequise` et, entreprise active, reprend ses envois
// suspendus.

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
      verification.verificationRequise = false
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
    // Écriture conditionnelle : identifiants identiques à ceux qui ont été testés
    const ecriture = await prisma.entrepriseIcrm.updateMany({
      where: {
        id,
        deletedAt: null,
        apiUrl: entreprise.apiUrl,
        apiKey: entreprise.apiKey,
        token: entreprise.token,
      },
      data: { ...verification, derniereVerification: new Date(), dernierStatut },
    })
    const actuelle = await prisma.entrepriseIcrm.findFirst({ where: { id }, include: COMPTES })

    if (!ecriture?.count) {
      logger.warn({ message: '[ENTREPRISES-ICRM] Résultat du test non enregistré — identifiants modifiés pendant le ping', entrepriseIcrmId: id })
      return res.status(status).json({
        ...corps,
        persiste: false,
        avertissement: "Les identifiants de l'entreprise ont été modifiés pendant le test : résultat non enregistré, relancez le test.",
        entrepriseIcrm: versEntreprisePublique(actuelle),
      })
    }

    let jobsRepris = 0
    if (dernierStatut === 'ok' && entrepriseIcrmUtilisable(actuelle)) {
      jobsRepris = await reprendreEnvoisEntreprise(id)
    }
    return res.status(status).json({
      ...corps,
      persiste: true,
      ...(jobsRepris ? { jobsRepris } : {}),
      entrepriseIcrm: versEntreprisePublique(
        jobsRepris && actuelle?._count ? { ...actuelle, _count: { ...actuelle._count, partageJobs: 0 } } : actuelle,
      ),
    })
  } catch (err) {
    return erreurServeur(res, err, 'Test (enregistrement du résultat)')
  }
})
