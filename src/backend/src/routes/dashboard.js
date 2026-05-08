import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import { cacheService } from '../services/cacheService.js'
import logger from '../lib/logger.js'

export const dashboardRouter = Router()

const DASHBOARD_TTL_SECONDS = 5 * 60 // 5 minutes

// Task 36.7-36.8 — Query schema for superadmin dashboard with pagination and date range
const superadminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

// ─── GET /api/dashboard/superadmin ───────────────────────────────────────────
// Tasks 36.7-36.8 — Added pagination (page, limit) and date range (startDate, endDate)
// Cache: key "dashboard:sa:{date}" TTL 5min (task 26.8)
// Note: cache is bypassed when custom filters are provided

dashboardRouter.get('/superadmin', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = superadminQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.flatten() },
    })
  }

  const { page, limit, startDate, endDate } = parsed.data
  const hasCustomFilters = startDate || endDate || page > 1

  try {
    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `dashboard:sa:${today}`

    // ── Cache check (task 26.8) — only use cache for default (no custom filters) ──
    if (!hasCustomFilters) {
      const cached = await cacheService.get(cacheKey)
      if (cached) {
        return res.json({ success: true, data: cached, fromCache: true })
      }
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Task 36.8 — Use custom date range if provided, otherwise default to last 30 days
    const rangeStart = startDate ? new Date(startDate) : thirtyDaysAgo
    const rangeEnd = endDate ? new Date(endDate) : now

    const dateFilter = { gte: rangeStart, lte: rangeEnd }

    const [bornesActives, enregistrementsInRange, enAttenteCRM, adminBornesActifs] = await Promise.all([
      prisma.borne.count({ where: { statut: 'actif' } }),
      prisma.enregistrement.count({ where: { createdAt: dateFilter } }),
      prisma.enregistrement.count({ where: { statutPartage: 'en_attente' } }),
      prisma.adminBorne.count({ where: { actif: true } }),
    ])

    // Build daily counts for the selected range
    const enregistrementsRaw = await prisma.enregistrement.findMany({
      where: { createdAt: dateFilter },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate by date (YYYY-MM-DD)
    const countByDate = {}
    const diffDays = Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24))
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(rangeStart)
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

    // Task 36.7 — Paginated recent enregistrements list
    const [recentEnregistrements, totalEnregistrements] = await Promise.all([
      prisma.enregistrement.findMany({
        where: { createdAt: dateFilter },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          borneId: true,
          formulaireId: true,
          langueUtilisee: true,
          statutPartage: true,
          createdAt: true,
          borne: { select: { idBorne: true } },
          formulaire: { select: { label: true } },
        },
      }),
      prisma.enregistrement.count({ where: { createdAt: dateFilter } }),
    ])

    const responseData = {
      bornesActives,
      enregistrements30j: enregistrementsInRange,
      enAttenteCRM,
      adminBornesActifs,
      graphique,
      recentEnregistrements,
      meta: { page, limit, total: totalEnregistrements },
    }

    // ── Store in cache (task 26.8) — only cache default view ────────────
    if (!hasCustomFilters) {
      await cacheService.set(cacheKey, responseData, DASHBOARD_TTL_SECONDS)
    }

    return res.json({ success: true, data: responseData })
  } catch (err) {
    logger.error({ message: '[DASHBOARD SUPERADMIN ERROR]', error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})

// ─── GET /api/dashboard/adminborne ───────────────────────────────────────────
// Cache: key "dashboard:ab:{userId}:{date}" TTL 5min (task 26.9)

dashboardRouter.get('/adminborne', jwtAuthV2, requireRole('ADMIN_BORNE'), async (req, res) => {
  try {
    const adminBorneId = req.user.sub
    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `dashboard:ab:${adminBorneId}:${today}`

    // ── Cache check (task 26.9) ──────────────────────────────────────────
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      return res.json({ success: true, data: cached, fromCache: true })
    }

    // Get all bornes for this admin
    const bornes = await prisma.borne.findMany({
      where: { adminBorneId },
      select: { id: true, idBorne: true, adresse: true, statut: true },
    })

    // If no bornes assigned, return empty metrics (R2.1 critère 3)
    if (bornes.length === 0) {
      const emptyData = { bornes: [], enAttenteCRM: 0 }
      await cacheService.set(cacheKey, emptyData, DASHBOARD_TTL_SECONDS)
      return res.json({ success: true, data: emptyData })
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

    const responseData = {
      bornes: bornesWithStats,
      enAttenteCRM,
    }

    // ── Store in cache (task 26.9) ───────────────────────────────────────
    await cacheService.set(cacheKey, responseData, DASHBOARD_TTL_SECONDS)

    return res.json({ success: true, data: responseData })
  } catch (err) {
    logger.error({ message: '[DASHBOARD ADMINBORNE ERROR]', error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
    })
  }
})
