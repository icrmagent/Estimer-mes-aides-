import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const adminBornesRouter = Router()

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createAdminBorneSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  raisonSociale: z.string().min(1),
  siret: z.string().length(14),
})

const updateAdminBorneSchema = z.object({
  nom: z.string().min(1).optional(),
  prenom: z.string().min(1).optional(),
  email: z.string().email().optional(),
  raisonSociale: z.string().min(1).optional(),
  siret: z.string().length(14).optional(),
})

const updateStatutSchema = z.object({
  actif: z.boolean(),
})

const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
})

const listQuerySchema = z.object({
  actif: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Helper: strip passwordHash from response ─────────────────────────────────

function sanitize(adminBorne) {
  const { passwordHash, ...safe } = adminBorne
  return safe
}

function handlePrismaError(err, res) {
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE', message: 'Cette adresse email est déjà utilisée' },
    })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'AdminBorne introuvable' },
    })
  }
  logger.error({ message: '[ADMIN-BORNES ERROR]', error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

// ─── GET /api/admin-bornes ────────────────────────────────────────────────────

adminBornesRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { actif, search, page, limit } = parsed.data
  const where = {}
  if (actif !== undefined) where.actif = actif === 'true'
  if (search) {
    where.OR = [
      { nom: { contains: search, mode: 'insensitive' } },
      { prenom: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { raisonSociale: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [admins, total] = await Promise.all([
    prisma.adminBorne.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        raisonSociale: true,
        siret: true,
        actif: true,
        createdAt: true,
        updatedAt: true,
        bornes: { select: { id: true, idBorne: true, statut: true } },
      },
    }),
    prisma.adminBorne.count({ where }),
  ])

  return res.json({
    success: true,
    data: admins,
    meta: { page, limit, total },
  })
})

// ─── POST /api/admin-bornes ───────────────────────────────────────────────────

adminBornesRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createAdminBorneSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  const { password, ...rest } = parsed.data

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const admin = await prisma.adminBorne.create({
      data: { ...rest, passwordHash },
    })
    return res.status(201).json({ success: true, data: sanitize(admin) })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/admin-bornes/:id ────────────────────────────────────────────────

adminBornesRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const admin = await prisma.adminBorne.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        raisonSociale: true,
        siret: true,
        actif: true,
        createdAt: true,
        updatedAt: true,
        bornes: { select: { id: true, idBorne: true, adresse: true, statut: true } },
      },
    })
    return res.json({ success: true, data: admin })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PUT /api/admin-bornes/:id ────────────────────────────────────────────────

adminBornesRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateAdminBorneSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const admin = await prisma.adminBorne.update({
      where: { id: req.params.id },
      data: parsed.data,
    })
    return res.json({ success: true, data: sanitize(admin) })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/admin-bornes/:id/statut ──────────────────────────────────────

adminBornesRouter.patch('/:id/statut', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateStatutSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Statut invalide', details: parsed.error.flatten() },
    })
  }

  try {
    const admin = await prisma.adminBorne.update({
      where: { id: req.params.id },
      data: { actif: parsed.data.actif },
    })
    return res.json({ success: true, data: sanitize(admin) })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/admin-bornes/:id/password ────────────────────────────────────
// SuperAdmin sets a chosen password for an AdminBorne (vs. random reset below).

adminBornesRouter.patch('/:id/password', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Mot de passe invalide (min 8 caractères)', details: parsed.error.flatten() },
    })
  }

  try {
    await prisma.adminBorne.findUniqueOrThrow({ where: { id: req.params.id } })
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    await prisma.adminBorne.update({
      where: { id: req.params.id },
      data: { passwordHash },
    })
    return res.json({
      success: true,
      data: { message: 'Mot de passe mis à jour' },
    })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/admin-bornes/:id/reset-password ───────────────────────────────

adminBornesRouter.post('/:id/reset-password', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    // Verify the admin exists
    await prisma.adminBorne.findUniqueOrThrow({ where: { id: req.params.id } })

    // Generate a random temporary password (16 chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
    let tempPassword = ''
    for (let i = 0; i < 16; i++) {
      tempPassword += chars[Math.floor(Math.random() * chars.length)]
    }

    const passwordHash = await bcrypt.hash(tempPassword, 12)
    await prisma.adminBorne.update({
      where: { id: req.params.id },
      data: { passwordHash },
    })

    return res.json({
      success: true,
      data: {
        tempPassword,
        message: 'Mot de passe temporaire généré. Communiquez-le de manière sécurisée.',
      },
    })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/admin-bornes/:id ─────────────────────────────────────────────
// Autorisé si l'admin n'a aucune borne, ou si toutes ses bornes sont inactives.
// Les bornes inactives sont réassignées au SuperAdmin (adminBorneId = null).

adminBornesRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const admin = await prisma.adminBorne.findUnique({
      where: { id: req.params.id },
      include: { bornes: { select: { id: true, statut: true } } },
    })

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AdminBorne introuvable' },
      })
    }

    const bornesActives = admin.bornes.filter((b) => b.statut === 'actif')
    if (bornesActives.length > 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Impossible de supprimer un admin associé à ${bornesActives.length} borne(s) active(s). Désactivez-les d'abord.`,
          details: { bornesActivesCount: bornesActives.length },
        },
      })
    }

    const bornesReassignees = admin.bornes.length

    await prisma.$transaction(async (tx) => {
      if (bornesReassignees > 0) {
        await tx.borne.updateMany({
          where: { adminBorneId: admin.id },
          data: { adminBorneId: null },
        })
      }
      await tx.adminBorne.delete({ where: { id: admin.id } })
    })

    logger.info({
      message: '[ADMIN-BORNES DELETE]',
      adminId: admin.id,
      adminEmail: admin.email,
      bornesReassignees,
    })

    return res.json({
      success: true,
      message: bornesReassignees > 0
        ? `AdminBorne supprimé. ${bornesReassignees} borne(s) réassignée(s) au SuperAdmin.`
        : 'AdminBorne supprimé avec succès',
      data: { bornesReassignees },
    })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
