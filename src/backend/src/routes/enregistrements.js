import { Router } from 'express'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import { publishEvent } from '../services/pusherService.js'
import logger from '../lib/logger.js'

export const enregistrementsRouter = Router()

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createEnregistrementSchema = z.object({
  borneId: z.string().uuid(),
  formulaireId: z.string().uuid(),
  langueUtilisee: z.enum(['fr', 'es', 'en']).default('fr'),
  reponses: z.array(
    z.object({
      questionId: z.string().uuid(),
      valeur: z.string(),
    })
  ),
})

// Task 36.3 — Schema for updating an enregistrement
const updateEnregistrementSchema = z.object({
  langueUtilisee: z.enum(['fr', 'es', 'en']).optional(),
})

const listQuerySchema = z.object({
  id: z.string().uuid().optional(),
  ids: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.split(',').every((s) => /^[0-9a-f-]{36}$/i.test(s.trim())),
      { message: 'ids doit être une liste d\'UUID séparés par des virgules' }
    ),
  borneId: z.string().uuid().optional(),
  formulaireId: z.string().uuid().optional(),
  dateDebut: z.string().datetime({ offset: true }).optional(),
  dateFin: z.string().datetime({ offset: true }).optional(),
  statutPartage: z
    .enum(['en_attente', 'en_cours', 'partage', 'echec_temporaire', 'echec_definitif'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function handlePrismaError(err, res) {
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Enregistrement introuvable' },
    })
  }
  logger.error({ message: '[ENREGISTREMENTS ERROR]', error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

/**
 * Build the Prisma `where` clause based on role and query filters.
 * AdminBorne can only see enregistrements for their own bornes.
 */
async function buildWhereClause(user, filters) {
  const where = { deletedAt: null }

  if (filters.id) where.id = filters.id
  if (filters.ids) {
    const idArray = filters.ids.split(',').map((s) => s.trim()).filter(Boolean)
    if (idArray.length > 0) where.id = { in: idArray }
  }
  if (filters.borneId) where.borneId = filters.borneId
  if (filters.formulaireId) where.formulaireId = filters.formulaireId
  if (filters.statutPartage) where.statutPartage = filters.statutPartage

  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {}
    if (filters.dateDebut) where.createdAt.gte = new Date(filters.dateDebut)
    if (filters.dateFin) where.createdAt.lte = new Date(filters.dateFin)
  }

  // AdminBorne: restrict to their bornes
  if (user.role === 'ADMIN_BORNE') {
    const bornes = await prisma.borne.findMany({
      where: { adminBorneId: user.sub },
      select: { id: true },
    })
    const borneIds = bornes.map((b) => b.id)

    if (filters.borneId) {
      // Verify the requested borneId belongs to this admin
      if (!borneIds.includes(filters.borneId)) {
        return null // signals 403
      }
    } else {
      where.borneId = { in: borneIds }
    }
  }

  return where
}

// ─── POST /api/enregistrements ────────────────────────────────────────────────

enregistrementsRouter.post('/', jwtAuthV2, requireRole('ADMIN_BORNE'), async (req, res) => {
  const parsed = createEnregistrementSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  const { borneId, formulaireId, langueUtilisee, reponses } = parsed.data

  // Verify the AdminBorne owns this borne
  const borne = await prisma.borne.findUnique({ where: { id: borneId } })
  if (!borne || borne.adminBorneId !== req.user.sub) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès refusé à cette borne' },
    })
  }

  try {
    // Task 37.8 — Stamp formulaireVersion at submission time (ADR-5)
    const formulaire = await prisma.formulaire.findUnique({
      where: { id: formulaireId },
      select: { version: true },
    })

    const enregistrement = await prisma.enregistrement.create({
      data: {
        borneId,
        formulaireId,
        langueUtilisee,
        formulaireVersion: formulaire?.version ?? '1.0.0',
        reponses: {
          create: reponses.map(({ questionId, valeur }) => ({ questionId, valeur })),
        },
      },
      include: { reponses: true },
    })

    // Create a PartageJob with statut en_attente (R7.1 critère 1)
    await prisma.partageJob.create({
      data: { enregistrementId: enregistrement.id },
    })

    // Task 13b.1 — Publish Pusher event after successful creation (ADR-5)
    try {
      await publishEvent('admin-notifications', 'new-enregistrement', {
        enregistrementId: enregistrement.id,
        borneId: enregistrement.borneId,
        formulaireId: enregistrement.formulaireId,
        createdAt: enregistrement.createdAt,
      })
    } catch (_pusherErr) {
      // Pusher failure must not affect the 201 response
    }

    return res.status(201).json({ success: true, data: enregistrement })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/enregistrements/export ─────────────────────────────────────────
// Must be defined BEFORE /:id to avoid route conflict

enregistrementsRouter.get('/export', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const parsed = listQuerySchema.omit({ page: true, limit: true }).safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const where = await buildWhereClause(req.user, parsed.data)
  if (where === null) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès refusé' },
    })
  }

  try {
    const enregistrements = await prisma.enregistrement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        borne: { select: { idBorne: true } },
        formulaire: { select: { label: true } },
        reponses: {
          include: {
            question: { select: { libelleQuestion: true, orderPage: true } },
          },
          orderBy: { question: { orderPage: 'asc' } },
        },
      },
    })

    // Collect all unique question labels (FR) across all enregistrements
    const questionMap = new Map()
    for (const enr of enregistrements) {
      for (const rep of enr.reponses) {
        if (!questionMap.has(rep.questionId)) {
          const libelle = rep.question?.libelleQuestion
          const label =
            libelle && typeof libelle === 'object' && libelle.fr
              ? libelle.fr
              : `Question ${rep.questionId.slice(0, 8)}`
          questionMap.set(rep.questionId, label)
        }
      }
    }

    const questionIds = [...questionMap.keys()]

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Enregistrements')

    // Header row
    const baseColumns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Borne', key: 'borneId', width: 20 },
      { header: 'Formulaire', key: 'formulaireId', width: 36 },
      { header: 'Langue', key: 'langueUtilisee', width: 10 },
      { header: 'Statut partage', key: 'statutPartage', width: 20 },
      { header: 'Date création', key: 'createdAt', width: 22 },
    ]

    const questionColumns = questionIds.map((qid) => ({
      header: questionMap.get(qid),
      key: `q_${qid}`,
      width: 30,
    }))

    sheet.columns = [...baseColumns, ...questionColumns]

    // Data rows
    for (const enr of enregistrements) {
      const repMap = {}
      for (const rep of enr.reponses) {
        // Task 36.6 — Handle options_multiples: convert JSON array string to comma-separated
        let valeur = rep.valeur
        if (valeur && valeur.startsWith('[')) {
          try {
            const parsedVal = JSON.parse(valeur)
            if (Array.isArray(parsedVal)) {
              valeur = parsedVal.join(', ')
            }
          } catch (_e) {
            // Not valid JSON — keep original value
          }
        }
        repMap[rep.questionId] = valeur
      }

      const row = {
        id: enr.id,
        borneId: enr.borne?.idBorne ?? enr.borneId,
        formulaireId: enr.formulaire?.label ?? enr.formulaireId,
        langueUtilisee: enr.langueUtilisee,
        statutPartage: enr.statutPartage,
        createdAt: enr.createdAt.toISOString(),
      }

      for (const qid of questionIds) {
        row[`q_${qid}`] = repMap[qid] ?? ''
      }

      sheet.addRow(row)
    }

    // Style header row
    sheet.getRow(1).font = { bold: true }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="enregistrements-${new Date().toISOString().slice(0, 10)}.xlsx"`
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (err) {
    logger.error({ message: '[EXPORT ERROR]', error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la génération du fichier Excel' },
    })
  }
})

// ─── GET /api/enregistrements ─────────────────────────────────────────────────

enregistrementsRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { page, limit, ...filters } = parsed.data
  const where = await buildWhereClause(req.user, filters)

  if (where === null) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès refusé' },
    })
  }

  try {
    const enregistrementsRaw = await prisma.enregistrement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        borne: { select: { id: true, idBorne: true, adresse: true } },
        formulaire: { select: { id: true, label: true, version: true } },
      },
    })
    const hasMore = enregistrementsRaw.length > limit
    const enregistrements = hasMore ? enregistrementsRaw.slice(0, limit) : enregistrementsRaw
    const total = hasMore ? (page * limit) + 1 : ((page - 1) * limit) + enregistrements.length

    // Load candidate contact answers and let the frontend resolve initials from labels.
    const enregistrementIds = enregistrements.map((e) => e.id)
    const contactReponses = enregistrementIds.length
      ? await prisma.enregistrementReponse.findMany({
          where: {
            enregistrementId: { in: enregistrementIds },
          },
          select: {
            enregistrementId: true,
            valeur: true,
            question: {
              select: { libelleQuestion: true },
            },
          },
        })
      : []

    const reponsesByEnregistrement = new Map()
    for (const rep of contactReponses) {
      const list = reponsesByEnregistrement.get(rep.enregistrementId) || []
      list.push(rep)
      reponsesByEnregistrement.set(rep.enregistrementId, list)
    }

    const enregistrementsWithContact = enregistrements.map((enregistrement) => ({
      ...enregistrement,
      reponses: reponsesByEnregistrement.get(enregistrement.id) || [],
    }))

    return res.json({
      success: true,
      data: enregistrementsWithContact,
      meta: { page, limit, total },
    })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/enregistrements/:id ────────────────────────────────────────────

enregistrementsRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  try {
    const enregistrement = await prisma.enregistrement.findUniqueOrThrow({
      where: { id: req.params.id, deletedAt: null },
      include: {
        borne: { select: { id: true, idBorne: true, adresse: true, adminBorneId: true } },
        formulaire: { select: { id: true, label: true, version: true } },
        reponses: {
          include: {
            question: { select: { libelleQuestion: true, typeOption: true, options: true, orderPage: true } },
          },
          orderBy: { question: { orderPage: 'asc' } },
        },
      },
    })

    // AdminBorne: verify ownership
    if (req.user.role === 'ADMIN_BORNE' && enregistrement.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Accès refusé' },
      })
    }

    return res.json({ success: true, data: enregistrement })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PUT /api/enregistrements/:id ─────────────────────────────────────────────
// Task 36.3 — Modify enregistrement (SuperAdmin only)

enregistrementsRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateEnregistrementSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const enregistrement = await prisma.enregistrement.update({
      where: { id: req.params.id, deletedAt: null },
      data: parsed.data,
    })
    return res.json({ success: true, data: enregistrement })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/enregistrements/bulk-delete ────────────────────────────────────
// Soft delete plusieurs enregistrements en une seule requête — SuperAdmin only

enregistrementsRouter.post('/bulk-delete', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = bulkDeleteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const [, result] = await prisma.$transaction([
      // Hard delete des jobs de partage associés — un enregistrement supprimé
      // ne doit plus jamais être traité par le worker
      prisma.partageJob.deleteMany({
        where: { enregistrementId: { in: parsed.data.ids } },
      }),
      prisma.enregistrement.updateMany({
        where: { id: { in: parsed.data.ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    ])
    return res.json({ success: true, data: { count: result.count } })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/enregistrements/:id ──────────────────────────────────────────
// Task 36.2 — Soft delete (set deletedAt) — SuperAdmin only

enregistrementsRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const [, enregistrement] = await prisma.$transaction([
      // Hard delete des jobs de partage associés — un enregistrement supprimé
      // ne doit plus jamais être traité par le worker
      prisma.partageJob.deleteMany({
        where: { enregistrementId: req.params.id },
      }),
      prisma.enregistrement.update({
        where: { id: req.params.id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    ])
    return res.json({ success: true, data: enregistrement })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
