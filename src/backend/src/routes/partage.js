import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'
import { STATUT_JOB_SUSPENDU, entrepriseIcrmUtilisable } from '../lib/icrmApiKey.js'
import { SELECT_ETAT_ENTREPRISE, statutPourCible, etatsEntreprises } from '../services/partageCibleService.js'

export const partageRouter = Router()

// ─── GET /api/partage/jobs ────────────────────────────────────────────────────

// `suspendu` : entreprise I-CRM cible désactivée, supprimée ou à retester — catégorie
// à part (ni en file, ni en échec).
const JOB_STATUTS = ['en_attente', 'en_cours', 'succes', 'echec_temporaire', 'echec_definitif', STATUT_JOB_SUSPENDU]

/** Avertissement d'une destination entreprise suspendue (lancer / relancer). */
function avertissementSuspension(entreprise) {
  const etat = entreprise?.deletedAt ? 'supprimée'
    : entreprise?.actif === false ? 'désactivée'
      : 'à retester (URL ou clé modifiée)'
  return `Entreprise I-CRM « ${entreprise?.nom ?? '?'} » ${etat} : les envois sont suspendus `
    + "jusqu'à sa réactivation ou un test réussi (aucun envoi vers les canaux)"
}

const listQuerySchema = z.object({
  statut: z.enum(JOB_STATUTS).optional(),
  borneId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const statsQuerySchema = z.object({
  borneId: z.string().uuid().optional(),
})

const updateCanalSchema = z.object({
  canalTransmission: z.string().trim().max(120).optional().nullable(),
})

partageRouter.get('/jobs', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
    })
  }

  const { statut, borneId, page, limit } = parsed.data
  const where = {}
  if (statut) where.statut = statut
  if (borneId) where.enregistrement = { borneId }

  const [jobs, total] = await Promise.all([
    prisma.partageJob.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        enregistrement: {
          select: {
            id: true,
            borneId: true,
            statutPartage: true,
            createdAt: true,
            // Livraison par entreprise : entreprise qui l'a reçu + instantané de la destination
            // (nom, entreprise / sous-type I-CRM, hôte, identifiant de clé — jamais le secret)
            crmEntrepriseIcrm: { select: { id: true, nom: true } },
            crmDestination: true,
            borne: {
              select: {
                id: true,
                idBorne: true,
                adresse: true,
                canalTransmission: true,
                entrepriseIcrm: { select: { id: true, nom: true, actif: true } },
              },
            },
          },
        },
        // Cible figée du job (NULL = canaux)
        entrepriseIcrm: { select: { id: true, nom: true, actif: true, deletedAt: true, verificationRequise: true } },
      },
    }),
    prisma.partageJob.count({ where }),
  ])

  return res.json({
    success: true,
    data: jobs,
    meta: { page, limit, total },
  })
})

// ─── GET /api/partage/stats ──────────────────────────────────────────────────
// Compteurs par statut + succès/échecs des dernières 24h (R1.6 — supervision)

partageRouter.get('/stats', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = statsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
    })
  }

  const { borneId } = parsed.data
  const where = borneId ? { enregistrement: { borneId } } : {}
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  try {
    const [byStatutRaw, succes24h, echecs24h] = await Promise.all([
      prisma.partageJob.groupBy({
        by: ['statut'],
        where,
        _count: { _all: true },
      }),
      prisma.partageJob.count({
        where: { ...where, statut: 'succes', updatedAt: { gte: last24h } },
      }),
      prisma.partageJob.count({
        where: {
          ...where,
          statut: { in: ['echec_temporaire', 'echec_definitif'] },
          updatedAt: { gte: last24h },
        },
      }),
    ])

    const byStatut = Object.fromEntries(JOB_STATUTS.map((s) => [s, 0]))
    for (const row of byStatutRaw) byStatut[row.statut] = row._count._all

    const total24h = succes24h + echecs24h
    const tauxSucces24h = total24h > 0 ? Math.round((succes24h / total24h) * 100) : null

    return res.json({
      success: true,
      data: { byStatut, succes24h, echecs24h, tauxSucces24h },
    })
  } catch (err) {
    logger.error({ message: '[PARTAGE] Erreur stats', error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})

// ─── PUT /api/partage/bornes/:borneId/canal ─────────────────────────────────
// Configure le canal I-CRM utilisé pour les enregistrements d'une borne.

partageRouter.put('/bornes/:borneId/canal', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateCanalSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
    })
  }

  const canalTransmission = parsed.data.canalTransmission || null

  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.borneId, deletedAt: null },
      data: { canalTransmission },
      select: { id: true, idBorne: true, adresse: true, canalTransmission: true },
    })

    return res.json({ success: true, data: borne })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
      })
    }
    logger.error({ message: '[PARTAGE] Erreur canal borne', error: err.message, borneId: req.params.borneId })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})

// ─── POST /api/partage/bornes/:borneId/lancer ────────────────────────────────
// Prépare ou relance les jobs des enregistrements non partagés d'une borne.
// Cible de chaque job (même règle que le worker) : un job EXISTANT garde sa cible
// (figée à sa création) ; un job CRÉÉ ici prend la destination actuelle de la borne
// (son entreprise I-CRM, sinon ses canaux). Cible = entreprise inutilisable
// (désactivée, supprimée, à retester) : le job est mis en file au statut
// `suspendu` (hors de la file du worker) + avertissement ; jamais de repli sur
// les canaux. Les enregistrements déjà suspendus ne sont pas relancés ici : ils
// reprennent à la réactivation de leur entreprise ou par redirection explicite.

partageRouter.post('/bornes/:borneId/lancer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { borneId } = req.params

  try {
    const borne = await prisma.borne.findUnique({
      where: { id: borneId, deletedAt: null },
      select: {
        id: true,
        idBorne: true,
        canalTransmission: true,
        entrepriseIcrmId: true,
        canaux: {
          where: { actif: true },
          select: { id: true, label: true },
        },
        entrepriseIcrm: { select: SELECT_ETAT_ENTREPRISE },
      },
    })

    if (!borne) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
      })
    }

    const entreprise = borne.entrepriseIcrm
    const versEntreprise = Boolean(entreprise)
    const suspendu = versEntreprise && !entrepriseIcrmUtilisable(entreprise)
    const destination = versEntreprise
      ? {
          type: 'entreprise_icrm',
          entrepriseIcrmId: entreprise.id,
          nom: entreprise.nom,
          ...(suspendu ? { suspendu: true } : {}),
        }
      : { type: 'canal', label: borne.canalTransmission ?? null }
    const avertissement = suspendu ? avertissementSuspension(entreprise) : null
    const extra = avertissement ? { avertissement } : {}

    if (!versEntreprise && (!borne.canaux || borne.canaux.length === 0)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NO_ACTIVE_CHANNEL',
          message: 'Aucun canal I-CRM actif n\'est configuré pour cette borne. Créez et activez un canal avant de lancer la transmission.',
        },
      })
    }

    if (!versEntreprise && borne.canalTransmission && !borne.canaux.some((c) => c.label === borne.canalTransmission)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CHANNEL_LABEL_MISMATCH',
          message: `Le canal de transmission "${borne.canalTransmission}" ne correspond à aucun canal actif. Corrigez l'affectation depuis la liste des canaux.`,
        },
      })
    }

    const enregistrements = await prisma.enregistrement.findMany({
      where: {
        borneId,
        deletedAt: null,
        statutPartage: { in: ['en_attente', 'echec_temporaire', 'echec_definitif'] },
      },
      select: { id: true },
    })

    if (enregistrements.length === 0) {
      return res.json({
        success: true,
        data: { borneId, canalTransmission: borne.canalTransmission, destination, ...extra, queued: 0, created: 0, relaunched: 0, suspendus: 0 },
      })
    }

    const enregistrementIds = enregistrements.map((enregistrement) => enregistrement.id)
    const existingJobs = await prisma.partageJob.findMany({
      where: { enregistrementId: { in: enregistrementIds } },
      orderBy: { createdAt: 'desc' },
    })

    const latestJobByEnregistrement = new Map()
    for (const job of existingJobs) {
      if (!latestJobByEnregistrement.has(job.enregistrementId)) {
        latestJobByEnregistrement.set(job.enregistrementId, job)
      }
    }

    // Cible de chaque job : la sienne s'il existe, sinon la destination actuelle de la borne
    const cibleDe = (enr) => {
      const existant = latestJobByEnregistrement.get(enr.id)
      return existant ? (existant.entrepriseIcrmId ?? null) : (borne.entrepriseIcrmId ?? null)
    }
    const etats = await etatsEntreprises(enregistrements.map(cibleDe))

    const operations = []
    const enAttente = []
    const suspendusParMotif = new Map()
    let created = 0
    let relaunched = 0
    for (const enregistrement of enregistrements) {
      const existingJob = latestJobByEnregistrement.get(enregistrement.id)
      const cible = cibleDe(enregistrement)
      const { statut, erreur } = statutPourCible(cible, etats.get(cible))
      if (statut === STATUT_JOB_SUSPENDU) {
        suspendusParMotif.set(erreur, [...(suspendusParMotif.get(erreur) ?? []), enregistrement.id])
      } else {
        enAttente.push(enregistrement.id)
      }
      if (existingJob) {
        relaunched += 1
        operations.push(prisma.partageJob.update({
          where: { id: existingJob.id },
          data: {
            statut,
            tentatives: 0,
            erreur,
            prochainEssai: null,
          },
        }))
      } else {
        created += 1
        operations.push(prisma.partageJob.create({
          data: {
            enregistrementId: enregistrement.id,
            ...(cible ? { entrepriseIcrmId: cible } : {}),
            ...(statut === STATUT_JOB_SUSPENDU ? { statut, erreur } : {}),
          },
        }))
      }
    }

    if (enAttente.length > 0) {
      operations.unshift(prisma.enregistrement.updateMany({
        where: { id: { in: enAttente } },
        data: { statutPartage: 'en_attente', derniereErreur: null, tentatives: 0 },
      }))
    }
    for (const [motif, ids] of suspendusParMotif) {
      operations.unshift(prisma.enregistrement.updateMany({
        where: { id: { in: ids } },
        data: { statutPartage: STATUT_JOB_SUSPENDU, derniereErreur: motif, tentatives: 0 },
      }))
    }

    await prisma.$transaction(operations)

    const suspendus = enregistrements.length - enAttente.length
    const avertissementFinal = avertissement
      ?? (suspendus > 0
        ? `${suspendus} envoi(s) suspendu(s) : leur entreprise I-CRM cible est désactivée, supprimée ou à retester`
        : null)

    return res.json({
      success: true,
      data: {
        borneId,
        canalTransmission: borne.canalTransmission,
        destination,
        ...(avertissementFinal ? { avertissement: avertissementFinal } : {}),
        queued: enregistrements.length,
        created,
        relaunched,
        suspendus,
      },
    })
  } catch (err) {
    logger.error({ message: '[PARTAGE] Erreur lancement borne', error: err.message, borneId })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})

// ─── POST /api/partage/jobs/:id/relancer ─────────────────────────────────────
// Relance manuelle d'un job en échec (R1.6 critère 32)

partageRouter.post('/jobs/:id/relancer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params

  try {
    const job = await prisma.partageJob.findUniqueOrThrow({
      where: { id },
      include: { entrepriseIcrm: { select: SELECT_ETAT_ENTREPRISE } },
    })

    // Un job 'en_cours' peut être bloqué (crash worker). On l'autorise au relancer
    // s'il n'a pas été touché depuis 5 minutes.
    const STALE_EN_COURS_MS = 5 * 60 * 1000
    const isStale = job.statut === 'en_cours'
      && job.updatedAt
      && (Date.now() - new Date(job.updatedAt).getTime()) > STALE_EN_COURS_MS

    const isRelaunchable =
      ['echec_definitif', 'echec_temporaire', STATUT_JOB_SUSPENDU].includes(job.statut) || isStale

    if (!isRelaunchable) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Impossible de relancer un job avec le statut "${job.statut}"`,
        },
      })
    }

    // Le job garde SA cible (figée à sa création) : entreprise inutilisable → il reste
    // (ou redevient) suspendu, jamais redirigé implicitement vers un canal.
    const { statut, erreur } = statutPourCible(job.entrepriseIcrmId, job.entrepriseIcrm)
    if (statut === STATUT_JOB_SUSPENDU && job.statut === STATUT_JOB_SUSPENDU) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ENVOI_SUSPENDU',
          message: `${avertissementSuspension(job.entrepriseIcrm)}. `
            + "Réactivez ou testez l'entreprise, ou redirigez les envois depuis la fiche de la borne.",
        },
      })
    }

    // Remettre en attente pour le prochain cycle du worker (ou suspendre)
    const updated = await prisma.partageJob.update({
      where: { id },
      data: {
        statut,
        tentatives: 0,
        erreur,
        prochainEssai: null,
      },
    })

    // Refléter sur l'enregistrement
    await prisma.enregistrement.update({
      where: { id: job.enregistrementId },
      data: { statutPartage: statut, derniereErreur: erreur, tentatives: 0 },
    })

    return res.json({
      success: true,
      data: updated,
      ...(statut === STATUT_JOB_SUSPENDU ? { avertissement: avertissementSuspension(job.entrepriseIcrm) } : {}),
    })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Job introuvable' },
      })
    }
    logger.error({ message: '[PARTAGE] Erreur relancer', error: err.message, jobId: id })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})
