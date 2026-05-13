import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const categoriesQuestionsRouter = Router()

const i18nNomSchema = z.object({
  fr: z.string().trim().min(1, 'Le nom en français est obligatoire'),
  es: z.string().trim().optional().default(''),
  en: z.string().trim().optional().default(''),
})

const nomSchema = z.object({
  nom: i18nNomSchema,
})

const sousCategorieSchema = nomSchema.extend({
  categorieId: z.string().uuid('categorieId invalide'),
})

function handleError(err, res) {
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

function parseNom(nom) {
  if (!nom) return { fr: '', es: '', en: '' }
  if (typeof nom === 'string') {
    try { return JSON.parse(nom) } catch { return { fr: nom, es: '', en: '' } }
  }
  return nom
}

function sortByNomFr(items) {
  return [...items].sort((a, b) => {
    const fa = (parseNom(a.nom).fr || '').toLowerCase()
    const fb = (parseNom(b.nom).fr || '').toLowerCase()
    return fa.localeCompare(fb)
  })
}

// ─── GET ────────────────────────────────────────────────────────────────────

categoriesQuestionsRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const categories = await prisma.categorieQuestion.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        sousCategories: {
          orderBy: { createdAt: 'asc' },
          include: { _count: { select: { questions: true } } },
        },
        _count: { select: { questions: true, sousCategories: true } },
      },
    })

    const sorted = sortByNomFr(categories).map((cat) => ({
      ...cat,
      nom: parseNom(cat.nom),
      sousCategories: sortByNomFr(cat.sousCategories).map((sub) => ({
        ...sub,
        nom: parseNom(sub.nom),
      })),
    }))

    return res.json({ success: true, data: sorted })
  } catch (err) {
    return handleError(err, res)
  }
})

// ─── CATÉGORIES ──────────────────────────────────────────────────────────────

categoriesQuestionsRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = nomSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const dupRows = await prisma.$queryRaw`
      SELECT id FROM categories_question WHERE nom->>'fr' = ${parsed.data.nom.fr} LIMIT 1
    `
    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Ce nom existe deja' },
      })
    }

    const nomJson = JSON.stringify(parsed.data.nom)
    const rows = await prisma.$queryRaw`
      INSERT INTO categories_question (id, nom, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${nomJson}::jsonb, NOW(), NOW())
      RETURNING id, nom, "createdAt", "updatedAt"
    `
    const categorie = { ...rows[0], nom: parseNom(rows[0].nom) }
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
    const nomJson = JSON.stringify(parsed.data.nom)
    const rows = await prisma.$queryRaw`
      UPDATE categories_question
      SET nom = ${nomJson}::jsonb, "updatedAt" = NOW()
      WHERE id = ${req.params.id}
      RETURNING id, nom, "createdAt", "updatedAt"
    `
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } })
    }
    return res.json({ success: true, data: { ...rows[0], nom: parseNom(rows[0].nom) } })
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

// ─── SOUS-CATÉGORIES ─────────────────────────────────────────────────────────

categoriesQuestionsRouter.post('/sous-categories', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = sousCategorieSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const dupRows = await prisma.$queryRaw`
      SELECT id FROM sous_categories_question
      WHERE "categorieId" = ${parsed.data.categorieId}
      AND nom->>'fr' = ${parsed.data.nom.fr}
      LIMIT 1
    `
    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Cette sous-categorie existe deja dans cette categorie' },
      })
    }

    const nomJson = JSON.stringify(parsed.data.nom)
    const rows = await prisma.$queryRaw`
      INSERT INTO sous_categories_question (id, nom, "categorieId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${nomJson}::jsonb, ${parsed.data.categorieId}, NOW(), NOW())
      RETURNING id, nom, "categorieId", "createdAt", "updatedAt"
    `
    const sousCategorie = { ...rows[0], nom: parseNom(rows[0].nom) }
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
    const nomJson = JSON.stringify(parsed.data.nom)
    const rows = await prisma.$queryRaw`
      UPDATE sous_categories_question
      SET nom = ${nomJson}::jsonb, "updatedAt" = NOW()
      WHERE id = ${req.params.id}
      RETURNING id, nom, "categorieId", "createdAt", "updatedAt"
    `
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } })
    }
    return res.json({ success: true, data: { ...rows[0], nom: parseNom(rows[0].nom) } })
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
