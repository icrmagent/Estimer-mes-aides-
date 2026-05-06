// Verifies that an ADMIN_BORNE has access to the requested borne
// SUPER_ADMIN bypasses this check
// Reads borneId from req.params.id or req.params.borneId

import { prisma } from '../lib/prisma.js'

export async function checkBorneOwnership(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  // SuperAdmin has access to everything
  if (req.user.role === 'SUPER_ADMIN') {
    return next()
  }
  // AdminBorne: check ownership
  const borneId = req.params.id || req.params.borneId
  if (!borneId) {
    return res.status(400).json({ error: 'borneId manquant' })
  }
  try {
    const borne = await prisma.borne.findFirst({
      where: { id: borneId, adminBorneId: req.user.sub },
    })
    if (!borne) {
      // Return 403 without revealing if resource exists (R6.2)
      return res.status(403).json({ error: 'Accès refusé' })
    }
    req.borne = borne
    next()
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
