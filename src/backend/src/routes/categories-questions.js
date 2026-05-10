import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const categoriesQuestionsRouter = Router()

const nomSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire'),
})

const sousCategorieSchema = nomSchema.extend({
  categorieId: z.string().uuid('categorieId invalide'),
})

function handleError(err, res) {
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE', message: 'Ce nom existe deja' },
    })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ressource introuvable' },
    })
  }
  if (err.code === 'P2003') {
    return res.status(409).json({
      success: false,
      error: { code: 'IN_USE', message: 'Cette ressource est utilisee par des questions' },
    })
  }

  logger.error({ message: '[CATEGORIES QUESTIONS ERROR]', error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

categoriesQuestionsRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const categories = await prisma.categorieQuestion.findMany({
      orderBy: { nom: 'asc' },
      include: {
        sousCategories: {
          orderBy: { nom: 'asc' },
          include: {
            _count: { select: { questions: true } },
          },
        },
        _count: { select: { questions: true, sousCategories: true } },
      },
    })

    return res.json({ success: true, data: categories })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = nomSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const categorie = await prisma.categorieQuestion.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: categorie })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = nomSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const categorie = await prisma.categorieQuestion.update({
      where: { id: req.params.id },
      data: parsed.data,
    })
    return res.json({ success: true, data: categorie })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    await prisma.categorieQuestion.delete({ where: { id: req.params.id } })
    return res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.post('/sous-categories', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = sousCategorieSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const exists = await prisma.sousCategorieQuestion.findFirst({
      where: {
        nom: parsed.data.nom,
        categorieId: parsed.data.categorieId,
      },
    })

    if (exists) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Cette sous-categorie existe deja dans cette categorie' },
      })
    }

    const sousCategorie = await prisma.sousCategorieQuestion.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: sousCategorie })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.put('/sous-categories/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = sousCategorieSchema.partial({ categorieId: true }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const sousCategorie = await prisma.sousCategorieQuestion.update({
      where: { id: req.params.id },
      data: parsed.data,
    })
    return res.json({ success: true, data: sousCategorie })
  } catch (err) {
    return handleError(err, res)
  }
})

categoriesQuestionsRouter.delete('/sous-categories/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    await prisma.sousCategorieQuestion.delete({ where: { id: req.params.id } })
    return res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    return handleError(err, res)
  }
})
