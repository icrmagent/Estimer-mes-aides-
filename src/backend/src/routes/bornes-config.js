import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const bornesConfigRouter = Router()

// ─── GET /api/bornes/:id/config ───────────────────────────────────────────────
// Auth: AdminBorne JWT (borne context)
// Returns full borne config + formulaire + questions sorted by orderPage

bornesConfigRouter.get('/:id/config', jwtAuthV2, requireRole('ADMIN_BORNE'), async (req, res) => {
  const { id } = req.params

  try {
    const borne = await prisma.borne.findUnique({
      where: { id },
      select: {
        id: true,
        idBorne: true,
        langueDefaut: true,
        adresse: true,
        commercant: true,
        regie: true,
        installateur: true,
        statut: true,
        adminBorneId: true,
        formulaireId: true,
        formulaire: {
          select: {
            id: true,
            label: true,
            version: true,
            dureeRetourAccueil: true,
            annulationInactivite: true,
            pageDebutConfig: true,
            pageFinConfig: true,
            questions: {
              orderBy: { orderPage: 'asc' },
              select: {
                id: true,
                libelleQuestion: true,
                typeOption: true,
                options: true,
                orderPage: true,
                obligatoire: true,
                paragrapheInfo: true,
              },
            },
          },
        },
      },
    })

    if (!borne) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Borne introuvable' },
      })
    }

    // Verify the AdminBorne owns this borne (R6.2)
    if (borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Accès refusé' },
      })
    }

    // Borne must be actif (R1.2 critère 8)
    if (borne.statut !== 'actif') {
      return res.status(403).json({
        success: false,
        error: { code: 'BORNE_INACTIVE', message: 'Cette borne est désactivée' },
      })
    }

    // Borne must have a formulaire assigned
    if (!borne.formulaire) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_FORMULAIRE', message: 'Aucun formulaire assigné à cette borne' },
      })
    }

    const { formulaire, statut, adminBorneId, formulaireId, ...borneData } = borne

    return res.json({
      success: true,
      data: {
        borne: borneData,
        formulaire,
      },
    })
  } catch (err) {
    console.error('[BORNES-CONFIG ERROR]', err)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})
