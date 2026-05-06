import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

const JWT_SECRET = () => process.env.JWT_SECRET

/**
 * Authenticate a user (SuperAdmin or AdminBorne) and return a signed JWT.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {'backoffice'|'borne'} [params.context='backoffice']
 * @returns {Promise<{token: string, role: string, expiresIn: string}|null>}
 */
export async function loginUser({ email, password, context = 'backoffice' }) {
  // 1. Try SuperAdmin first
  const superAdmin = await prisma.superAdmin.findUnique({ where: { email } })
  if (superAdmin) {
    const valid = await bcrypt.compare(password, superAdmin.passwordHash)
    if (!valid) return null

    const expiresIn = '8h'
    const token = jwt.sign(
      { sub: superAdmin.id, role: 'SUPER_ADMIN' },
      JWT_SECRET(),
      { expiresIn }
    )
    return { token, role: 'SUPER_ADMIN', expiresIn }
  }

  // 2. Try AdminBorne
  const adminBorne = await prisma.adminBorne.findUnique({ where: { email } })
  if (adminBorne) {
    // Reject disabled accounts
    if (!adminBorne.actif) return null

    const valid = await bcrypt.compare(password, adminBorne.passwordHash)
    if (!valid) return null

    // Back-office sessions: 8h — borne sessions: 24h (R6.4)
    const expiresIn = context === 'borne' ? '24h' : '8h'
    const token = jwt.sign(
      { sub: adminBorne.id, role: 'ADMIN_BORNE' },
      JWT_SECRET(),
      { expiresIn }
    )
    return { token, role: 'ADMIN_BORNE', expiresIn }
  }

  // User not found
  return null
}
