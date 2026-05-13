import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import { checkBorneOwnership } from '../middleware/borneOwnership.js'
import logger from '../lib/logger.js'
import { cacheService } from '../services/cacheService.js'
import { publishEvent } from '../services/pusherService.js'
import * as authService from '../services/authService.js'

export const bornesRouter = Router()

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createBorneSchema = z.object({
  idBorne: z.string().min(1).optional(),
  langueDefaut: z.enum(['fr', 'es', 'en']).default('fr'),
  adresse: z.string().min(1),
  commercant: z.string().optional(),
  regie: z.string().optional(),
  installateur: z.string().optional(),
  canalTransmission: z.string().trim().max(120).optional().nullable(),
  formulaireId: z.string().uuid().optional(),
  adminBorneId: z.string().uuid().optional(),
})

const updateBorneSchema = createBorneSchema.omit({ idBorne: true }).partial()

const updateStatutSchema = z.object({
  statut: z.enum(['actif', 'inactif']),
})

const updateConnexionSchema = z.object({
  estConnectee: z.boolean(),
})

const remoteActionSchema = z.object({
  action: z.enum(['login', 'logout']),
  password: z.string().min(1, 'Mot de passe requis'),
})

const listQuerySchema = z.object({
  statut: z.enum(['actif', 'inactif']).optional(),
  adminBorneId: z.string().uuid().optional(),
  formulaireId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function handlePrismaError(err, res) {
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE',
        message: "L'identifiant de borne est déjà utilisé",
      },
    })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
    })
  }
  logger.error({ message: '[BORNES ERROR]', error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

async function generateUniqueIdBorne() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const idBorne = `BORNE-${randomUUID().slice(0, 8).toUpperCase()}`
    const existing = await prisma.borne.findUnique({ where: { idBorne } })
    if (!existing) return idBorne
  }

  return `BORNE-${randomUUID().toUpperCase()}`
}

// ─── GET /api/bornes ──────────────────────────────────────────────────────────

bornesRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { statut, adminBorneId, formulaireId, page, limit } = parsed.data
  const where = { deletedAt: null }
  if (statut) where.statut = statut
  if (req.user.role === 'ADMIN_BORNE') {
    // AdminBorne can only list their assigned bornes.
    where.adminBorneId = req.user.sub
  } else if (adminBorneId) {
    where.adminBorneId = adminBorneId
  }
  if (formulaireId) where.formulaireId = formulaireId

  try {
    const [bornes, total] = await Promise.all([
      prisma.borne.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          adminBorne: { select: { id: true, nom: true, prenom: true, email: true } },
          formulaire: { select: { id: true, label: true, version: true, statut: true } },
        },
      }),
      prisma.borne.count({ where }),
    ])

    return res.json({
      success: true,
      data: bornes,
      meta: { page, limit, total },
    })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/bornes ─────────────────────────────────────────────────────────

bornesRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createBorneSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  try {
    const data = {
      ...parsed.data,
      idBorne: parsed.data.idBorne || await generateUniqueIdBorne(),
    }
    const borne = await prisma.borne.create({ data })
    return res.status(201).json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── GET /api/bornes/:id ──────────────────────────────────────────────────────

bornesRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), checkBorneOwnership, async (req, res) => {
  const { id } = req.params

  try {
    const borne = await prisma.borne.findUniqueOrThrow({
      where: { id, deletedAt: null },
      include: {
        adminBorne: { select: { id: true, nom: true, prenom: true, email: true } },
        formulaire: { select: { id: true, label: true, version: true, statut: true } },
      },
    })

    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PUT /api/bornes/:id ──────────────────────────────────────────────────────
// Task 26.7 — Invalidate cache on PUT
// Task 36.9 — Validate formulaire is "publie" before allowing borne assignment

bornesRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), checkBorneOwnership, async (req, res) => {
  const parsed = updateBorneSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  // Task 36.9 — If formulaireId is being set, verify the formulaire is published
  if (parsed.data.formulaireId) {
    const formulaire = await prisma.formulaire.findUnique({
      where: { id: parsed.data.formulaireId },
      select: { id: true, statut: true },
    })
    if (!formulaire || formulaire.statut !== 'publie') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FORMULAIRE_NOT_PUBLIE',
          message: 'Le formulaire doit être publié pour être assigné à une borne',
        },
      })
    }
  }

  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: parsed.data,
    })

    // Invalidate borne config cache (task 26.7)
    await cacheService.delete(`borne-config:${req.params.id}`)

    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/bornes/:id/statut ─────────────────────────────────────────────
// Task 26.7 — Invalidate cache on PATCH statut

bornesRouter.patch('/:id/statut', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateStatutSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Statut invalide', details: parsed.error.flatten() },
    })
  }

  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: { statut: parsed.data.statut },
    })

    // Invalidate borne config cache (task 26.7)
    await cacheService.delete(`borne-config:${req.params.id}`)

    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── PATCH /api/bornes/:id/connexion ─────────────────────────────────────────

bornesRouter.patch('/:id/connexion', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateConnexionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Valeur invalide', details: parsed.error.flatten() },
    })
  }

  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: { estConnectee: parsed.data.estConnectee },
    })
    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/bornes/:id/session ─────────────────────────────────────────────
// Appelé par la borne elle-même juste après le login direct (LoginPage) pour
// synchroniser estConnectee = true en DB. Auth : JWT AdminBorne propriétaire.

bornesRouter.post('/:id/session', jwtAuthV2, requireRole('ADMIN_BORNE'), checkBorneOwnership, async (req, res) => {
  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: { estConnectee: true },
    })
    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/bornes/:id/session ───────────────────────────────────────────
// Appelé par la borne juste avant l'exit kiosque (ExitButton) pour
// synchroniser estConnectee = false. Auth : JWT AdminBorne propriétaire.

bornesRouter.delete('/:id/session', jwtAuthV2, requireRole('ADMIN_BORNE'), checkBorneOwnership, async (req, res) => {
  try {
    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: { estConnectee: false },
    })
    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── POST /api/bornes/:id/remote-action ───────────────────────────────────────
// Remote login / logout déclenché depuis le back-office.
// Re-auth obligatoire de l'acteur (SuperAdmin ou AdminBorne propriétaire) par mot de passe.
// AdminBorne : ne peut agir que sur ses propres bornes.
// SuperAdmin : peut agir sur n'importe quelle borne (impersonation de l'AdminBorne propriétaire pour login).
// Publie un événement Pusher sur le canal borne-{id} pour piloter la borne en temps réel.

bornesRouter.post('/:id/remote-action', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const parsed = remoteActionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: parsed.error.flatten() },
    })
  }

  const { action, password } = parsed.data
  const { sub: actorId, role: actorRole } = req.user

  try {
    // 1. Charger la borne cible (non supprimée)
    const borne = await prisma.borne.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true, idBorne: true, adminBorneId: true, estConnectee: true },
    })
    if (!borne) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Borne introuvable' } })
    }

    // 2. AdminBorne ne peut agir que sur ses propres bornes
    if (actorRole === 'ADMIN_BORNE' && borne.adminBorneId !== actorId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
    }

    // 3. Re-validation du mot de passe de l'acteur (sensitive operation)
    let actorPasswordHash = null
    let actorEmail = null
    if (actorRole === 'SUPER_ADMIN') {
      const sa = await prisma.superAdmin.findUnique({ where: { id: actorId } })
      if (sa) { actorPasswordHash = sa.passwordHash; actorEmail = sa.email }
    } else {
      const ab = await prisma.adminBorne.findUnique({ where: { id: actorId } })
      if (ab && ab.actif) { actorPasswordHash = ab.passwordHash; actorEmail = ab.email }
    }
    if (!actorPasswordHash) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Acteur introuvable' } })
    }
    const passwordValid = await bcrypt.compare(password, actorPasswordHash)
    if (!passwordValid) {
      logger.warn({ message: '[REMOTE_ACTION AUTH_FAILED]', actorId, actorRole, borneId: borne.id, action })
      return res.status(401).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect' } })
    }

    // 4. Exécuter l'action
    if (action === 'login') {
      // Refuser si déjà connectée — évite d'écraser une session active sans en informer l'opérateur
      if (borne.estConnectee) {
        return res.status(409).json({
          success: false,
          error: { code: 'ALREADY_CONNECTED', message: 'La borne est déjà connectée. Déconnectez-la d\'abord.' },
        })
      }
      // La borne doit avoir un AdminBorne propriétaire pour qu'on puisse générer un token
      if (!borne.adminBorneId) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_OWNER', message: 'Cette borne n\'a pas d\'AdminBorne assigné' },
        })
      }
      const issued = await authService.issueBorneTokenForAdminBorne(borne.adminBorneId)
      if (!issued) {
        return res.status(400).json({
          success: false,
          error: { code: 'OWNER_INACTIVE', message: 'L\'AdminBorne propriétaire est inactif' },
        })
      }

      await prisma.borne.update({ where: { id: borne.id }, data: { estConnectee: true } })

      await publishEvent(`borne-${borne.id}`, 'force-login', {
        token: issued.token,
        borneId: borne.id,
        email: issued.email,
        expiresIn: issued.expiresIn,
      })

      logger.info({ message: '[REMOTE_ACTION LOGIN]', actorId, actorRole, actorEmail, borneId: borne.id, idBorne: borne.idBorne })
      return res.json({ success: true, data: { action, estConnectee: true } })
    }

    // action === 'logout'
    await prisma.borne.update({ where: { id: borne.id }, data: { estConnectee: false } })

    await publishEvent(`borne-${borne.id}`, 'force-logout', {
      borneId: borne.id,
      reason: 'remote-logout',
    })

    logger.info({ message: '[REMOTE_ACTION LOGOUT]', actorId, actorRole, actorEmail, borneId: borne.id, idBorne: borne.idBorne })
    return res.json({ success: true, data: { action, estConnectee: false } })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})

// ─── DELETE /api/bornes/:id ───────────────────────────────────────────────────
// Task 10.11 — Soft delete: set deletedAt instead of prisma.delete()
// Règle métier : seule une borne inactive peut être supprimée. Les enregistrements
// liés conservent leurs données (pas de cascade, deletedAt indépendant).

bornesRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.borne.findUnique({
      where: { id: req.params.id },
      select: { id: true, statut: true, deletedAt: true },
    })

    if (!existing || existing.deletedAt !== null) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
      })
    }

    if (existing.statut !== 'inactif') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Impossible de supprimer une borne active. Désactivez-la d\'abord.',
          details: { statut: existing.statut },
        },
      })
    }

    const borne = await prisma.borne.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    })

    await cacheService.delete(`borne-config:${req.params.id}`)

    logger.info({
      message: '[BORNES DELETE]',
      borneId: borne.id,
      idBorne: borne.idBorne,
    })

    return res.json({ success: true, data: borne })
  } catch (err) {
    return handlePrismaError(err, res)
  }
})
