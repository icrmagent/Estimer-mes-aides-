import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const formulairesRouter = Router()

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createFormulaireSchema = z.object({
  label: z.string().min(1),
  version: z.string().optional().default('1.0.0'),
  dureeRetourAccueil: z.number().int().min(1).optional().default(30),
  annulationInactivite: z.number().int().min(1).optional().default(120),
  pageDebutConfig: z.record(z.any()).optional().default({}),
  pageFinConfig: z.record(z.any()).optional().default({}),
})

const updateFormulaireSchema = z.object({
  label: z.string().min(1).optional(),
  version: z.string().optional(),
  dureeRetourAccueil: z.number().int().min(1).optional(),
  annulationInactivite: z.number().int().min(1).optional(),
  pageDebutConfig: z.record(z.any()).optional(),
  pageFinConfig: z.record(z.any()).optional(),
})

const updateStatutSchema = z.object({
  statut: z.enum(['brouillon', 'publie', 'archive']),
})

const listQuerySchema = z.object({
  statut: z.enum(['brouillon', 'publie', 'archive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function handlePrismaError(err, res) {
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Formulaire introuvable' },
    })
  }
  console.error('[FORMULAIRES ERROR]', err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

// ─── GET /api/formulaires ─────────────────────────────────────────────────────

formulairesRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { statut, page, limit } = parsed.data
  const where = {}
  if (statut) where.statut = statut

  const [formulaires, total] = await Promise.all([
    prisma.formulaire.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, bornes: true } },
      },
    }),
    prisma.formulaire.count({ where }),
  ])

  return res.json({
    success: true,
    data: formulaires,
    meta: { page, limit, total },
  })
})

// ─── POST /api/formulaires ────────────────────────────────────────────────────

formulairesRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createFormulaireSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const formulaire = await prisma.formulaire.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/formulaires/:id ─────────────────────────────────────────────────

formulairesRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const formulaire = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        questions: {
          orderBy: { orderPage: 'asc' },
        },
      },
    })
    return res.json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PUT /api/formulaires/:id ─────────────────────────────────────────────────

formulairesRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateFormulaireSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const formulaire = await prisma.formulaire.update({
      where: { id: req.params.id },
      data: parsed.data,
    })
    return res.json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/formulaires/:id/statut ───────────────────────────────────────
// Task 3.5: Publication validation — all questions must have libelleQuestion.fr

formulairesRouter.patch('/:id/statut', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateStatutSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Statut invalide', details: parsed.error.flatten() },
    })
  }

  const { statut } = parsed.data

  try {
    // Verify formulaire exists
    const formulaire = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { questions: true },
    })

    // Publication validation (R1.4 critère 22, R4.6)
    if (statut === 'publie') {
      const invalidQuestions = formulaire.questions.filter((q) => {
        const libelle = q.libelleQuestion
        if (!libelle || typeof libelle !== 'object') return true
        const fr = libelle.fr
        return !fr || (typeof fr === 'string' && fr.trim() === '')
      })

      if (invalidQuestions.length > 0) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_PUBLICATION',
            message: "Certaines questions n'ont pas de libellé en français",
            details: invalidQuestions.map((q) => q.id),
          },
        })
      }
    }

    const updated = await prisma.formulaire.update({
      where: { id: req.params.id },
      data: { statut },
    })
    return res.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/formulaires/:id/dupliquer ─────────────────────────────────────

formulairesRouter.post('/:id/dupliquer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const source = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { questions: true },
    })

    // Create new formulaire as brouillon
    const newFormulaire = await prisma.formulaire.create({
      data: {
        label: `${source.label} (copie)`,
        version: source.version,
        statut: 'brouillon',
        dureeRetourAccueil: source.dureeRetourAccueil,
        annulationInactivite: source.annulationInactivite,
        pageDebutConfig: source.pageDebutConfig,
        pageFinConfig: source.pageFinConfig,
        questions: {
          create: source.questions.map((q) => ({
            libelleQuestion: q.libelleQuestion,
            typeOption: q.typeOption,
            options: q.options,
            orderPage: q.orderPage,
            obligatoire: q.obligatoire,
            paragrapheInfo: q.paragrapheInfo,
          })),
        },
      },
      include: { questions: { orderBy: { orderPage: 'asc' } } },
    })

    return res.status(201).json({ success: true, data: newFormulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
