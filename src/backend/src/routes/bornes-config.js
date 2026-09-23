import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import { cacheService } from '../services/cacheService.js'

export const bornesConfigRouter = Router()

const CACHE_TTL_SECONDS = 60 * 60 // 1 hour

// Un écran désactivé, supprimé ou sans diapositive n'est pas envoyé : la borne
// n'a alors aucune veille. Le filtrage par dates de diffusion reste côté borne,
// car la config vit jusqu'à 24 h dans son cache local.
function toKioskEcranVeille(ecran) {
  if (!ecran || !ecran.actif || ecran.deletedAt || ecran.diapositives.length === 0) return null
  const { actif: _a, deletedAt: _d, ...rest } = ecran
  return rest
}

// ─── GET /api/bornes/:id/config ───────────────────────────────────────────────
// Auth: SuperAdmin (full access) or AdminBorne (ownership check)
// Returns full borne config + formulaire + questions sorted by orderPage
// Cache: key "borne-config:{id}" TTL 1h (task 26.6)
// Task 36.1 — SuperAdmin can access any borne config without ownership check

bornesConfigRouter.get('/:id/config', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const { id } = req.params

  try {
    // ── Cache check (task 26.6) ──────────────────────────────────────────
    const cacheKey = `borne-config:${id}`
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      // For ADMIN_BORNE: verify ownership from cached data before returning
      if (req.user.role === 'ADMIN_BORNE' && cached.borne?.adminBorneId) {
        if (cached.borne.adminBorneId !== req.user.sub) {
          return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Accès refusé' },
          })
        }
      }

      if (req.user.role === 'ADMIN_BORNE' && !cached.borne?.adminBorneId) {
        await cacheService.delete(cacheKey)
      } else {
        return res.json({ success: true, data: cached, fromCache: true })
      }
    }

    const borne = await prisma.borne.findUnique({
      where: { id },
      select: {
        id: true,
        idBorne: true,
        langueDefaut: true,
        pays: true,
        adresse: true,
        commercant: true,
        regie: true,
        installateur: true,
        statut: true,
        adminBorneId: true,
        formulaireId: true,
        ecranVeille: {
          select: {
            id: true,
            nom: true,
            actif: true,
            deletedAt: true,
            updatedAt: true,
            delaiActivation: true,
            transition: true,
            ordreAleatoire: true,
            afficherCta: true,
            texteCta: true,
            afficherLogo: true,
            afficherHorloge: true,
            heureDebut: true,
            heureFin: true,
            diapositives: {
              where: { actif: true },
              orderBy: { ordre: 'asc' },
              select: {
                id: true,
                type: true,
                duree: true,
                titre: true,
                sousTitre: true,
                contenu: true,
                style: true,
                dateDebut: true,
                dateFin: true,
              },
            },
          },
        },
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
              orderBy: [{ orderPage: 'asc' }, { ordreDansPage: 'asc' }],
              select: {
                id: true,
                libelleQuestion: true,
                typeOption: true,
                options: true,
                orderPage: true,
                ordreDansPage: true,
                obligatoire: true,
                paragrapheInfo: true,
                crmFieldIds: true,
                categorieId: true,
                sousCategorieId: true,
                categorie: true,
                sousCategorie: true,
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

    // For ADMIN_BORNE: verify ownership (R6.2)
    // For SUPER_ADMIN: skip ownership check (task 36.1)
    if (req.user.role === 'ADMIN_BORNE' && borne.adminBorneId !== req.user.sub) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Accès refusé' },
      })
    }

    // Borne must be actif (R1.2 critère 8) — enforced for AdminBorne only
    // SuperAdmin can view config of inactive bornes for management purposes
    if (req.user.role === 'ADMIN_BORNE' && borne.statut !== 'actif') {
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

    const { formulaire, statut, adminBorneId, formulaireId, ecranVeille, ...borneData } = borne

    const responseData = {
      borne: { ...borneData, adminBorneId }, // keep adminBorneId for cache ownership check
      formulaire,
      ecranVeille: toKioskEcranVeille(ecranVeille),
    }

    // ── Store in cache (task 26.6) ───────────────────────────────────────
    await cacheService.set(cacheKey, responseData, CACHE_TTL_SECONDS)

    // Return without adminBorneId in the public response
    const { adminBorneId: _omit, ...publicBorne } = responseData.borne

    return res.json({
      success: true,
      data: { borne: publicBorne, formulaire, ecranVeille: responseData.ecranVeille },
    })
  } catch (err) {
    console.error('[BORNES-CONFIG ERROR]', err)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})
