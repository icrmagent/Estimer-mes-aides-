/**
 * Script de création du SuperAdmin initial en production.
 * Usage : node scripts/create-superadmin.js
 *
 * Variables d'environnement requises :
 *   DATABASE_URL, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD_TEMP
 *
 * Ce script est idempotent : si le SuperAdmin existe déjà, il met à jour le mot de passe.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD_TEMP

  if (!email || !password) {
    console.error('❌ SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD_TEMP sont requis dans .env')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('❌ Le mot de passe doit faire au moins 8 caractères')
    process.exit(1)
  }

  console.log(`🔐 Création/mise à jour du SuperAdmin : ${email}`)

  const passwordHash = await bcrypt.hash(password, 12)

  const superAdmin = await prisma.superAdmin.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  })

  console.log(`✅ SuperAdmin créé/mis à jour : ${superAdmin.email} (id: ${superAdmin.id})`)
  console.log('⚠️  Changez le mot de passe temporaire dès la première connexion !')
}

main()
  .catch(err => {
    console.error('❌ Erreur :', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
