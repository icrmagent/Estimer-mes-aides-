import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const dashboardRouter = Router()

// ─── GET /api/dashboard/superadmin ───────────────────────────────────────────

dashboardRouter.get('/superadmin', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [bornesActives, enregistrements30j, enAttenteCRM, adminBornesActifs] = await Promise.all([
      prisma.borne.count({ where: { statut: 'actif' } }),
      prisma.enregistrement.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.enregistrement.count({ where: { statutPartage: 'en_attente' } }),
      prisma.adminBorne.count({ where: { actif: true } }),
    ])

    // Build daily counts for the last 30 days
    const enregistrementsRaw = await prisma.enregistrement.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate by date (YYYY-MM-DD)
    const countByDate = {}
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo)
      d.setDate(d.getDate() + i)
      countByDate[d.toISOString().slice(0, 10)] = 0
    }
    for (const enr of enregistrementsRaw) {
      const dateKey = enr.createdAt.toISOString().slice(0, 10)
      if (dateKey in countByDate) {
        countByDate[dateKey]++
      }
    }

    const graphique = Object.entries(countByDate).map(([date, count]) => ({ date, count }))

    return res.json({
      success: true,
      data: {
        bornesActives,
        enregistrements30j,
        enAttenteCRM,
        adminBornesActifs,
        graphique,
      },
    })
  } catch (err) {
    console.error('[DASHBOARD SUPERADMIN ERROR]', err)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})

// ─── GET /api/dashboard/adminborne ───────────────────────────────────────────

dashboardRouter.get('/adminborne', jwtAuthV2, requireRole('ADMIN_BORNE'), async (req, res) => {
  try {
    const adminBorneId = req.user.sub

    // Get all bornes for this admin
    const bornes = await prisma.borne.findMany({
      where: { adminBorneId },
      select: { id: true, idBorne: true, adresse: true, statut: true },
    })

    // If no bornes assigned, return empty metrics (R2.1 critère 3)
    if (bornes.length === 0) {
      return res.json({
        success: true,
        data: { bornes: [], enAttenteCRM: 0 },
      })
    }

    const borneIds = bornes.map((b) => b.id)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Count enregistrements per borne in last 7 days
    const enregistrements7jRaw = await prisma.enregistrement.groupBy({
      by: ['borneId'],
      where: {
        borneId: { in: borneIds },
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { id: true },
    })

    const countByBorne = {}
    for (const row of enregistrements7jRaw) {
      countByBorne[row.borneId] = row._count.id
    }

    const bornesWithStats = bornes.map((b) => ({
      ...b,
      enregistrements7j: countByBorne[b.id] ?? 0,
    }))

    // Count en_attente for all their bornes
    const enAttenteCRM = await prisma.enregistrement.count({
      where: {
        borneId: { in: borneIds },
        statutPartage: 'en_attente',
      },
    })

    return res.json({
      success: true,
      data: {
        bornes: bornesWithStats,
        enAttenteCRM,
      },
    })
  } catch (err) {
    console.error('[DASHBOARD ADMINBORNE ERROR]', err)
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})
