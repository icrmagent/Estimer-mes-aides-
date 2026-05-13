import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const partageRouter = Router()

// ─── GET /api/partage/jobs ────────────────────────────────────────────────────

const JOB_STATUTS = ['en_attente', 'en_cours', 'succes', 'echec_temporaire', 'echec_definitif']

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
            borne: { select: { id: true, idBorne: true, adresse: true, canalTransmission: true } },
          },
        },
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

partageRouter.post('/bornes/:borneId/lancer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { borneId } = req.params

  try {
    const borne = await prisma.borne.findUnique({
      where: { id: borneId, deletedAt: null },
      select: {
        id: true,
        idBorne: true,
        canalTransmission: true,
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

    if (!borne.canaux || borne.canaux.length === 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NO_ACTIVE_CHANNEL',
          message: 'Aucun canal I-CRM actif n\'est configuré pour cette borne. Créez et activez un canal avant de lancer la transmission.',
        },
      })
    }

    if (borne.canalTransmission && !borne.canaux.some((c) => c.label === borne.canalTransmission)) {
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
        data: { borneId, canalTransmission: borne.canalTransmission, queued: 0, created: 0, relaunched: 0 },
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

    const operations = [
      prisma.enregistrement.updateMany({
        where: { id: { in: enregistrementIds } },
        data: { statutPartage: 'en_attente', derniereErreur: null, tentatives: 0 },
      }),
    ]

    let created = 0
    let relaunched = 0
    for (const enregistrement of enregistrements) {
      const existingJob = latestJobByEnregistrement.get(enregistrement.id)
      if (existingJob) {
        relaunched += 1
        operations.push(prisma.partageJob.update({
          where: { id: existingJob.id },
          data: {
            statut: 'en_attente',
            tentatives: 0,
            erreur: null,
            prochainEssai: null,
          },
        }))
      } else {
        created += 1
        operations.push(prisma.partageJob.create({
          data: { enregistrementId: enregistrement.id },
        }))
      }
    }

    await prisma.$transaction(operations)

    return res.json({
      success: true,
      data: {
        borneId,
        canalTransmission: borne.canalTransmission,
        queued: enregistrements.length,
        created,
        relaunched,
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
    const job = await prisma.partageJob.findUniqueOrThrow({ where: { id } })

    // Un job 'en_cours' peut être bloqué (crash worker). On l'autorise au relancer
    // s'il n'a pas été touché depuis 5 minutes.
    const STALE_EN_COURS_MS = 5 * 60 * 1000
    const isStale = job.statut === 'en_cours'
      && job.updatedAt
      && (Date.now() - new Date(job.updatedAt).getTime()) > STALE_EN_COURS_MS

    const isRelaunchable =
      ['echec_definitif', 'echec_temporaire'].includes(job.statut) || isStale

    if (!isRelaunchable) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Impossible de relancer un job avec le statut "${job.statut}"`,
        },
      })
    }

    // Remettre en attente pour le prochain cycle du worker
    const updated = await prisma.partageJob.update({
      where: { id },
      data: {
        statut: 'en_attente',
        tentatives: 0,
        erreur: null,
        prochainEssai: null,
      },
    })

    // Remettre l'enregistrement en attente aussi
    await prisma.enregistrement.update({
      where: { id: job.enregistrementId },
      data: { statutPartage: 'en_attente', derniereErreur: null, tentatives: 0 },
    })

    return res.json({ success: true, data: updated })
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
