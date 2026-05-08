import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import { validatePrimaryColor } from '../lib/validationService.js'
import { publishEvent } from '../services/pusherService.js'
import logger from '../lib/logger.js'

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
  logger.error({ message: '[FORMULAIRES ERROR]', error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

/**
 * Checks couleurPrimaire in pageDebutConfig and pageFinConfig against
 * ALLOWED_PRIMARY_COLOR. Returns a 400 response if invalid, null otherwise.
 * (Tasks 9.3, 9.4, 9.5 — P15)
 */
function checkPrimaryColors(pageDebutConfig, pageFinConfig, res) {
  const debutColor = pageDebutConfig?.couleurPrimaire
  const finColor = pageFinConfig?.couleurPrimaire

  if (debutColor !== undefined && !validatePrimaryColor(debutColor)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PRIMARY_COLOR',
        message: `couleurPrimaire invalide dans pageDebutConfig. Valeur attendue : ${process.env.PRIMARY_COLOR ?? '#5B2D8E'}`,
      },
    })
  }

  if (finColor !== undefined && !validatePrimaryColor(finColor)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PRIMARY_COLOR',
        message: `couleurPrimaire invalide dans pageFinConfig. Valeur attendue : ${process.env.PRIMARY_COLOR ?? '#5B2D8E'}`,
      },
    })
  }

  return null
}

/**
 * Task 37.3-37.6 — Increment semver version string.
 * @param {string} version - Current semver string e.g. "1.2.3"
 * @param {'major'|'minor'|'patch'} type - Which part to increment
 * @returns {string} New semver string
 */
export function incrementVersion(version, type) {
  const parts = (version ?? '1.0.0').split('.')
  const major = parseInt(parts[0], 10) || 0
  const minor = parseInt(parts[1], 10) || 0
  const patch = parseInt(parts[2], 10) || 0

  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}` // patch
}

/**
 * Create a FormulaireVersion snapshot record.
 * @param {string} formulaireId
 * @param {object} formulaire - Full formulaire object to snapshot
 * @param {string} changedBy - SuperAdmin ID
 */
async function createVersionSnapshot(formulaireId, formulaire, changedBy) {
  await prisma.formulaireVersion.create({
    data: {
      formulaireId,
      version: formulaire.version,
      snapshot: formulaire,
      changedBy,
    },
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
  const where = { deletedAt: null }
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

  // Task 9.3 — Validate couleurPrimaire in pageDebutConfig and pageFinConfig (P15)
  const colorError = checkPrimaryColors(parsed.data.pageDebutConfig, parsed.data.pageFinConfig, res)
  if (colorError) return colorError

  try {
    const formulaire = await prisma.formulaire.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/formulaires/deleted ───────────────────────────────────────────
// Task 10.12 — SuperAdmin only: list soft-deleted formulaires
// MUST be registered BEFORE /:id to avoid route conflict

formulairesRouter.get('/deleted', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { page, limit } = parsed.data

  const [formulaires, total] = await Promise.all([
    prisma.formulaire.findMany({
      where: { deletedAt: { not: null } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { deletedAt: 'desc' },
      include: {
        _count: { select: { questions: true, bornes: true } },
      },
    }),
    prisma.formulaire.count({ where: { deletedAt: { not: null } } }),
  ])

  return res.json({
    success: true,
    data: formulaires,
    meta: { page, limit, total },
  })
})

// ─── GET /api/formulaires/:id ─────────────────────────────────────────────────

formulairesRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const formulaire = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id, deletedAt: null },
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
// Task 37.3 — Increment patch version and create FormulaireVersion snapshot

formulairesRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateFormulaireSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  // Task 9.4 — Validate couleurPrimaire in pageDebutConfig and pageFinConfig (P15)
  const colorError = checkPrimaryColors(parsed.data.pageDebutConfig, parsed.data.pageFinConfig, res)
  if (colorError) return colorError

  try {
    // Fetch current formulaire to get current version
    const current = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { questions: { orderBy: { orderPage: 'asc' } } },
    })

    // Task 37.3 — Increment patch version (unless caller explicitly sets version)
    const newVersion = parsed.data.version ?? incrementVersion(current.version, 'patch')

    const formulaire = await prisma.formulaire.update({
      where: { id: req.params.id },
      data: { ...parsed.data, version: newVersion },
      include: { questions: { orderBy: { orderPage: 'asc' } } },
    })

    // Task 37.3 — Create version snapshot
    await createVersionSnapshot(formulaire.id, formulaire, req.user.sub)

    // Task 13b.3 — Publish formulaire.updated event with new version (ADR-5)
    publishEvent('admin-notifications', 'formulaire.updated', {
      formulaireId: formulaire.id,
      version: formulaire.version,
      updatedAt: formulaire.updatedAt,
    }).catch(() => {}) // Pusher failure must not affect the response

    return res.json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/formulaires/:id/statut ───────────────────────────────────────
// Task 3.5: Publication validation — all questions must have libelleQuestion.fr
// Task 37.4 — Increment major version on brouillon → publie transition

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

    // Task 37.4 — Increment major version on brouillon → publie transition
    let newVersion = formulaire.version
    if (formulaire.statut === 'brouillon' && statut === 'publie') {
      newVersion = incrementVersion(formulaire.version, 'major')
    }

    const updated = await prisma.formulaire.update({
      where: { id: req.params.id },
      data: { statut, version: newVersion },
      include: { questions: { orderBy: { orderPage: 'asc' } } },
    })

    // Task 37.4 — Create version snapshot on publication
    if (formulaire.statut === 'brouillon' && statut === 'publie') {
      await createVersionSnapshot(updated.id, updated, req.user.sub)
    }

    return res.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/formulaires/:id ────────────────────────────────────────────
// Task 10.10 — Soft delete: set deletedAt instead of prisma.delete()

formulairesRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const formulaire = await prisma.formulaire.update({
      where: { id: req.params.id, deletedAt: null },
      data: { deletedAt: new Date() },
    })

    // Task 13b.4 — Publish formulaire.archived event (ADR-5)
    publishEvent('admin-notifications', 'formulaire.archived', {
      formulaireId: formulaire.id,
      archivedAt: formulaire.deletedAt,
    }).catch(() => {}) // Pusher failure must not affect the response

    return res.json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/formulaires/:id/restore ───────────────────────────────────────
// Task 10.13 — SuperAdmin only: restore a soft-deleted formulaire

formulairesRouter.post('/:id/restore', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    // Verify the formulaire exists and IS soft-deleted
    const existing = await prisma.formulaire.findUnique({ where: { id: req.params.id } })
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Formulaire introuvable' },
      })
    }
    if (existing.deletedAt === null) {
      return res.status(409).json({
        success: false,
        error: { code: 'NOT_DELETED', message: 'Ce formulaire n\'est pas supprimé' },
      })
    }

    const formulaire = await prisma.formulaire.update({
      where: { id: req.params.id },
      data: { deletedAt: null },
    })
    return res.json({ success: true, data: formulaire })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/formulaires/:id/dupliquer ─────────────────────────────────────
// Task 36.5 — Correctly copy all questions including options (Json field with options_multiples arrays)

formulairesRouter.post('/:id/dupliquer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const source = await prisma.formulaire.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { questions: { orderBy: { orderPage: 'asc' } } },
    })

    // Create new formulaire as brouillon, reset version to 1.0.0
    const newFormulaire = await prisma.formulaire.create({
      data: {
        label: `${source.label} (copie)`,
        version: '1.0.0',
        statut: 'brouillon',
        dureeRetourAccueil: source.dureeRetourAccueil,
        annulationInactivite: source.annulationInactivite,
        pageDebutConfig: source.pageDebutConfig,
        pageFinConfig: source.pageFinConfig,
        questions: {
          create: source.questions.map((q) => ({
            libelleQuestion: q.libelleQuestion,
            typeOption: q.typeOption,
            options: q.options,           // Task 36.5 — includes options_multiples arrays
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

// ─── GET /api/formulaires/:id/versions ───────────────────────────────────────
// Tasks 36.4 + 37.7 — Version history for a formulaire (SuperAdmin only)

formulairesRouter.get('/:id/versions', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    // Verify formulaire exists
    const formulaire = await prisma.formulaire.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!formulaire) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Formulaire introuvable' },
      })
    }

    const versions = await prisma.formulaireVersion.findMany({
      where: { formulaireId: req.params.id },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ success: true, data: versions })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
