import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'

export const canauxRouter = express.Router()

// Schéma de validation pour créer/modifier un canal
const canalSchema = z.object({
  label: z.string().min(1, 'Le label est requis'),
  apiUrl: z.string().url('URL API invalide'),
  apiKey: z.string().min(1, 'La clé API est requise'),
  token: z.string().min(1, 'Le token est requis'),
  borneId: z.string().uuid('ID de borne invalide'),
  actif: z.boolean().optional().default(true)
})

// Middleware pour vérifier l'accès à la borne
const checkBorneAccess = async (req, res, next) => {
  const { borneId } = req.body.borneId ? req.body : req.params

  if (req.user.role === 'SUPER_ADMIN') {
    return next()
  }

  if (req.user.role !== 'ADMIN_BORNE') {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  try {
    const borne = await prisma.borne.findFirst({
      where: { id: borneId, adminBorneId: req.user.sub }
    })

    if (!borne) {
      return res.status(403).json({ error: 'Accès refusé à cette borne' })
    }

    req.borne = borne
    next()
  } catch (error) {
    console.error('Erreur lors de la vérification d\'accès à la borne:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

// GET /api/canaux?borneId=... - Lister les canaux d'une borne
canauxRouter.get('/', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { borneId } = req.query

    if (!borneId) {
      return res.status(400).json({ error: 'borneId requis' })
    }

    // Vérifier l'accès à la borne
    if (req.user.role === 'ADMIN_BORNE') {
      const borne = await prisma.borne.findFirst({
        where: { id: borneId, adminBorneId: req.user.sub }
      })
      if (!borne) {
        return res.status(403).json({ error: 'Accès refusé' })
      }
    }

    const canaux = await prisma.canal.findMany({
      where: { borneId },
      orderBy: { createdAt: 'desc' }
    })

    res.json(canaux)
  } catch (error) {
    console.error('Erreur lors de la récupération des canaux:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/canaux - Créer un nouveau canal
canauxRouter.post('/', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), checkBorneAccess, async (req, res) => {
  try {
    const data = canalSchema.parse(req.body)
    const canal = await prisma.canal.create({
      data
    })
    res.status(201).json(canal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors })
    }
    console.error('Erreur lors de la création du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PUT /api/canaux/:id - Modifier un canal
canauxRouter.put('/:id', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params
    const data = canalSchema.omit({ borneId: true }).parse(req.body)

    // Vérifier que le canal existe et que l'utilisateur a accès
    const existingCanal = await prisma.canal.findFirst({
      where: { id },
      include: { borne: true }
    })

    if (!existingCanal) {
      return res.status(404).json({ error: 'Canal non trouvé' })
    }

    if (req.user.role === 'ADMIN_BORNE' && existingCanal.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    const canal = await prisma.canal.update({
      where: { id },
      data
    })

    res.json(canal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors })
    }
    console.error('Erreur lors de la modification du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/canaux/:id - Supprimer un canal
canauxRouter.delete('/:id', jwtAuthV2, requireRole('ADMIN_BORNE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params

    // Vérifier que le canal existe et que l'utilisateur a accès
    const existingCanal = await prisma.canal.findFirst({
      where: { id },
      include: { borne: true }
    })

    if (!existingCanal) {
      return res.status(404).json({ error: 'Canal non trouvé' })
    }

    if (req.user.role === 'ADMIN_BORNE' && existingCanal.borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    await prisma.canal.delete({
      where: { id }
    })

    res.status(204).send()
  } catch (error) {
    console.error('Erreur lors de la suppression du canal:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})