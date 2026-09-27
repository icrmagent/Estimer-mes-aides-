import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'
import { STATUT_JOB_SUSPENDU } from '../lib/icrmApiKey.js'
import {
  SELECT_ETAT_ENTREPRISE,
  DESTINATION_CANAL,
  statutPourCible,
  etatsEntreprises,
  descripteurCible,
  repartitionParCible,
  resumeRepartition,
} from '../services/partageCibleService.js'

export const partageRouter = Router()

// ─── GET /api/partage/jobs ────────────────────────────────────────────────────

// `suspendu` : entreprise I-CRM cible désactivée, supprimée ou à retester — catégorie
// à part (ni en file, ni en échec).
const JOB_STATUTS = ['en_attente', 'en_cours', 'succes', 'echec_temporaire', 'echec_definitif', STATUT_JOB_SUSPENDU]

/** Avertissement d'une destination entreprise suspendue (lancer / relancer). */
function avertissementSuspension(entreprise) {
  const etat = entreprise?.deletedAt ? 'supprimée'
    : entreprise?.actif === false ? 'désactivée'
      : 'à tester (identifiants non vérifiés)'
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

// ─── POST /api/partage/bornes/:borneId/lancer[?simulation=true] ─────────────
// Action EXPLICITE de l'opérateur : « envoyer les enregistrements non partagés de
// cette borne vers sa destination actuelle » (son entreprise I-CRM, sinon ses
// canaux). Cible de chaque job :
//   - job CRÉÉ ici → destination actuelle de la borne ;
//   - job existant sans cible (NULL : ère des canaux, aucune entreprise n'avait été
//     choisie) sur une borne qui A une entreprise → cette entreprise (jamais les
//     canaux ni l'environnement d'une borne affectée à une entreprise) ;
//   - job existant ciblant une AUTRE entreprise → il la garde, sauf
//     `redirigerEnvoisEnAttente: true` dans le corps (tout vers la destination
//     actuelle, suspendus compris) ;
//   - cible = entreprise inutilisable (désactivée, supprimée, à tester) → mis en
//     file au statut `suspendu` + avertissement ; jamais de repli sur les canaux.
// Réponse : répartition par destination (`destinations: [{ type, nom, total,
// suspendus }]`) ; `destination` n'est renseignée que si UNE seule s'applique.
// `?simulation=true` : même réponse, rien n'est écrit (confirmation du back-office).

const lancerQuerySchema = z.object({
  simulation: z.enum(['true', 'false']).optional(),
})

const lancerBodySchema = z.object({
  redirigerEnvoisEnAttente: z.boolean().optional(),
})

partageRouter.post('/bornes/:borneId/lancer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { borneId } = req.params
  const query = lancerQuerySchema.safeParse(req.query)
  const corps = lancerBodySchema.safeParse(req.body ?? {})
  if (!query.success || !corps.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: (query.error ?? corps.error).issues[0].message },
    })
  }
  const simulation = query.data.simulation === 'true'
  const rediriger = corps.data.redirigerEnvoisEnAttente === true

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
      },
    })

    if (!borne) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
      })
    }

    const destinationActuelle = borne.entrepriseIcrmId ?? null

    const enregistrements = await prisma.enregistrement.findMany({
      where: {
        borneId,
        deletedAt: null,
        // Suspendus : seulement sur redirection explicite (sinon ils attendent leur entreprise)
        statutPartage: {
          in: rediriger
            ? ['en_attente', 'echec_temporaire', 'echec_definitif', STATUT_JOB_SUSPENDU]
            : ['en_attente', 'echec_temporaire', 'echec_definitif'],
        },
      },
      select: { id: true },
    })

    const enregistrementIds = enregistrements.map((enregistrement) => enregistrement.id)
    const existingJobs = enregistrementIds.length > 0
      ? await prisma.partageJob.findMany({
          where: { enregistrementId: { in: enregistrementIds } },
          orderBy: { createdAt: 'desc' },
        })
      : []

    const latestJobByEnregistrement = new Map()
    for (const job of existingJobs) {
      if (!latestJobByEnregistrement.has(job.enregistrementId)) {
        latestJobByEnregistrement.set(job.enregistrementId, job)
      }
    }

    // Cible de chaque enregistrement (règles ci-dessus)
    const cibleDe = (existant) => {
      if (!existant) return destinationActuelle
      const cible = existant.entrepriseIcrmId ?? null
      if (cible === null || cible === destinationActuelle) return destinationActuelle
      return rediriger ? destinationActuelle : cible
    }
    // Un job en cours d'envoi par le worker n'est pas touché : le remettre en file
    // (et le recibler) pendant l'envoi fausserait la trace de sa destination.
    const tous = enregistrements.map((enregistrement) => {
      const existant = latestJobByEnregistrement.get(enregistrement.id) ?? null
      return { enregistrement, existant, cible: cibleDe(existant) }
    })
    const plan = tous.filter((p) => p.existant?.statut !== 'en_cours')
    const enCours = tous.length - plan.length

    // Canaux requis seulement si des envois partent vers eux (ou s'il n'y a rien et
    // que la borne n'a pas d'entreprise : message historique)
    const versCanaux = plan.some((p) => p.cible === null) || (plan.length === 0 && destinationActuelle === null)
    if (versCanaux && (!borne.canaux || borne.canaux.length === 0)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NO_ACTIVE_CHANNEL',
          message: 'Aucun canal I-CRM actif n\'est configuré pour cette borne. Créez et activez un canal avant de lancer la transmission.',
        },
      })
    }
    if (versCanaux && borne.canalTransmission && !borne.canaux.some((c) => c.label === borne.canalTransmission)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CHANNEL_LABEL_MISMATCH',
          message: `Le canal de transmission "${borne.canalTransmission}" ne correspond à aucun canal actif. Corrigez l'affectation depuis la liste des canaux.`,
        },
      })
    }

    const etats = await etatsEntreprises([destinationActuelle, ...plan.map((p) => p.cible)])
    for (const p of plan) Object.assign(p, statutPourCible(p.cible, etats.get(p.cible)))

    const avecLabel = (d) => (d.type === DESTINATION_CANAL ? { ...d, label: borne.canalTransmission ?? null } : d)
    const destinations = repartitionParCible(
      plan.map((p) => ({ cible: p.cible, suspendu: p.statut === STATUT_JOB_SUSPENDU })),
      etats,
    ).map(avecLabel)
    const destinationBorne = avecLabel(descripteurCible(destinationActuelle, etats))
    // Une seule destination annoncée si, et seulement si, une seule s'applique
    const destination = destinations.length === 1
      ? destinations[0]
      : destinations.length === 0 ? destinationBorne : null

    const created = plan.filter((p) => !p.existant).length
    const relaunched = plan.length - created
    const suspendus = plan.filter((p) => p.statut === STATUT_JOB_SUSPENDU).length
    const jobsRecibles = plan.filter((p) => p.existant && (p.existant.entrepriseIcrmId ?? null) !== p.cible).length
    const autresCibles = plan.filter((p) => p.cible !== destinationActuelle).length

    const avertissements = []
    if (destinations.length > 1) avertissements.push(`Plusieurs destinations : ${resumeRepartition(destinations)}`)
    for (const d of destinations.filter((x) => x.suspendus > 0)) {
      avertissements.push(`${d.suspendus} envoi(s) resteront suspendus — ${avertissementSuspension(etats.get(d.entrepriseIcrmId) ?? { nom: d.nom, deletedAt: true })}`)
    }
    const avertissement = avertissements.length > 0 ? avertissements.join(' — ') : null

    const reponse = {
      borneId,
      canalTransmission: borne.canalTransmission,
      destinationActuelle: destinationBorne,
      destination,
      destinations,
      ...(avertissement ? { avertissement } : {}),
      queued: plan.length,
      created,
      relaunched,
      suspendus,
      jobsRecibles,
      autresCibles,
      ...(enCours > 0 ? { enCours } : {}),
      ...(simulation ? { simulation: true } : {}),
    }

    if (simulation || plan.length === 0) {
      return res.json({ success: true, data: reponse })
    }

    const operations = []
    const enAttente = []
    const suspendusParMotif = new Map()
    for (const p of plan) {
      if (p.statut === STATUT_JOB_SUSPENDU) {
        suspendusParMotif.set(p.erreur, [...(suspendusParMotif.get(p.erreur) ?? []), p.enregistrement.id])
      } else {
        enAttente.push(p.enregistrement.id)
      }
      if (p.existant) {
        operations.push(prisma.partageJob.update({
          where: { id: p.existant.id },
          data: {
            statut: p.statut,
            tentatives: 0,
            erreur: p.erreur,
            prochainEssai: null,
            entrepriseIcrmId: p.cible,
          },
        }))
      } else {
        operations.push(prisma.partageJob.create({
          data: {
            enregistrementId: p.enregistrement.id,
            ...(p.cible ? { entrepriseIcrmId: p.cible } : {}),
            ...(p.statut === STATUT_JOB_SUSPENDU ? { statut: p.statut, erreur: p.erreur } : {}),
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

    logger.info({
      message: '[PARTAGE] Transmission lancée',
      borneId,
      queued: plan.length,
      suspendus,
      jobsRecibles,
      destinations: resumeRepartition(destinations),
    })

    return res.json({ success: true, data: reponse })
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
      include: {
        entrepriseIcrm: { select: SELECT_ETAT_ENTREPRISE },
        enregistrement: { select: { borneId: true } },
      },
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
            + "Réactivez ou testez l'entreprise, ou utilisez « Rediriger les envois » dans la fiche de la borne "
            + '(vers sa destination actuelle).',
          details: {
            borneId: job.enregistrement?.borneId ?? null,
            action: job.enregistrement?.borneId
              ? `POST /api/bornes/${job.enregistrement.borneId}/rediriger-envois`
              : null,
          },
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
