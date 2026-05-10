import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const partageRouter = Router()

// ─── GET /api/partage/jobs ────────────────────────────────────────────────────

const listQuerySchema = z.object({
  statut: z.enum(['en_attente', 'en_cours', 'succes', 'echec_temporaire', 'echec_definitif']).optional(),
  borneId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
      select: { id: true, idBorne: true, canalTransmission: true },
    })

    if (!borne) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
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

    if (!['echec_definitif', 'echec_temporaire'].includes(job.statut)) {
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
