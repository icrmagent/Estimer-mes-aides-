// Verifies req.user.role matches one of the allowed roles
// Must be used AFTER jwtAuthV2

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' })
    }
    next()
  }
}
