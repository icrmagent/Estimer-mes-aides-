import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const questionsRouter = Router({ mergeParams: true })

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const questionSchema = z.object({
  libelleQuestion: z.object({
    fr: z.string().min(1),
    es: z.string().optional(),
    en: z.string().optional(),
  }),
  typeOption: z.enum(['texte_court', 'texte_long', 'option_unique', 'options_multiples', 'telephone', 'email']),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.object({
          fr: z.string(),
          es: z.string().optional(),
          en: z.string().optional(),
        }),
      })
    )
    .optional()
    .nullable(),
  orderPage: z.number().int().min(1),
  obligatoire: z.boolean().default(false),
  paragrapheInfo: z
    .object({
      fr: z.string().nullable().optional(),
      es: z.string().nullable().optional(),
      en: z.string().nullable().optional(),
    })
    .optional()
    .nullable(),
})

const reorderSchema = z.object({
  order: z.array(
    z.object({
      id: z.string().uuid(),
      orderPage: z.number().int().min(1),
    })
  ),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function handlePrismaError(err, res) {
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ressource introuvable' },
    })
  }
  console.error('[QUESTIONS ERROR]', err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

async function getFormulaireOrFail(formulaireId, res) {
  const formulaire = await prisma.formulaire.findUnique({ where: { id: formulaireId } })
  if (!formulaire) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Formulaire introuvable' },
    })
    return null
  }
  return formulaire
}

// ─── GET /api/formulaires/:id/questions ──────────────────────────────────────

questionsRouter.get('/:id/questions', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const formulaire = await getFormulaireOrFail(req.params.id, res)
  if (!formulaire) return

  const questions = await prisma.question.findMany({
    where: { formulaireId: req.params.id },
    orderBy: { orderPage: 'asc' },
  })

  return res.json({ success: true, data: questions })
})

// ─── POST /api/formulaires/:id/questions ─────────────────────────────────────

questionsRouter.post('/:id/questions', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const formulaire = await getFormulaireOrFail(req.params.id, res)
  if (!formulaire) return

  const parsed = questionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const question = await prisma.question.create({
      data: { ...parsed.data, formulaireId: req.params.id },
    })
    return res.status(201).json({ success: true, data: question })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PUT /api/formulaires/:id/questions/:qid ─────────────────────────────────

questionsRouter.put('/:id/questions/:qid', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const formulaire = await getFormulaireOrFail(req.params.id, res)
  if (!formulaire) return

  const parsed = questionSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const question = await prisma.question.update({
      where: { id: req.params.qid, formulaireId: req.params.id },
      data: parsed.data,
    })
    return res.json({ success: true, data: question })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/formulaires/:id/questions/:qid ───────────────────────────────
// Warn if formulaire is publie — require ?force=true to proceed

questionsRouter.delete('/:id/questions/:qid', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const formulaire = await getFormulaireOrFail(req.params.id, res)
  if (!formulaire) return

  // If formulaire is published, require explicit force=true (R1.4 critère 19)
  if (formulaire.statut === 'publie' && req.query.force !== 'true') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'FORMULAIRE_PUBLIE',
        message:
          'Ce formulaire est publié. La suppression de questions peut affecter les bornes actives. Ajoutez ?force=true pour confirmer.',
      },
    })
  }

  try {
    await prisma.question.delete({
      where: { id: req.params.qid, formulaireId: req.params.id },
    })
    return res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/formulaires/:id/questions/reorder ────────────────────────────

questionsRouter.patch('/:id/questions/reorder', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const formulaire = await getFormulaireOrFail(req.params.id, res)
  if (!formulaire) return

  const parsed = reorderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    // Update all questions in a single transaction
    await prisma.$transaction(
      parsed.data.order.map(({ id, orderPage }) =>
        prisma.question.update({
          where: { id, formulaireId: req.params.id },
          data: { orderPage },
        })
      )
    )

    const questions = await prisma.question.findMany({
      where: { formulaireId: req.params.id },
      orderBy: { orderPage: 'asc' },
    })

    return res.json({ success: true, data: questions })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
