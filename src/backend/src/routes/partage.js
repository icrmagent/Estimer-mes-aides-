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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

partageRouter.get('/jobs', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
    })
  }

  const { statut, page, limit } = parsed.data
  const where = statut ? { statut } : {}

  const [jobs, total] = await Promise.all([
    prisma.partageJob.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.partageJob.count({ where }),
  ])

  return res.json({
    success: true,
    data: jobs,
    meta: { page, limit, total },
  })
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
