import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const prisma = new PrismaClient()

// To resolve path for frontend .env update
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendEnvPath = path.resolve(__dirname, '../../../frontend/.env')

async function main() {
  console.log('🔄 Création d\'un AdminBorne et d\'une Borne...')

  // Get the form we created previously
  const form = await prisma.formulaire.findFirst({
    orderBy: { createdAt: 'desc' }
  })

  if (!form) {
    console.error('❌ Aucun formulaire trouvé dans la base de données.')
    process.exit(1)
  }

  // Create an AdminBorne
  const passwordHash = await bcrypt.hash('password123', 12)
  const adminBorne = await prisma.adminBorne.create({
    data: {
      nom: 'Admin',
      prenom: 'Test',
      email: 'admin.borne@example.com',
      passwordHash,
      raisonSociale: 'Ma Société',
      siret: '12345678901234',
      actif: true,
    }
  })

  console.log(`✅ AdminBorne créé : ${adminBorne.email} (mdp: password123)`)

  // Create a Borne linked to the AdminBorne and the Formulaire
  const borne = await prisma.borne.create({
    data: {
      idBorne: 'BORNE-TEST-01',
      langueDefaut: 'fr',
      adresse: '123 Rue de Test, 75000 Paris',
      commercant: 'Boutique Test',
      statut: 'actif',
      adminBorneId: adminBorne.id,
      formulaireId: form.id,
    }
  })

  console.log(`✅ Borne créée avec l'UUID : ${borne.id}`)

  // Mettre à jour le fichier .env du frontend
  if (fs.existsSync(frontendEnvPath)) {
    let envContent = fs.readFileSync(frontendEnvPath, 'utf8')
    // Remplacer ou ajouter VITE_BORNE_ID
    if (envContent.includes('VITE_BORNE_ID=')) {
      envContent = envContent.replace(/VITE_BORNE_ID=.*/, `VITE_BORNE_ID=${borne.id}`)
    } else {
      envContent += `\nVITE_BORNE_ID=${borne.id}\n`
    }
    fs.writeFileSync(frontendEnvPath, envContent)
    console.log(`✅ Fichier src/frontend/.env mis à jour avec le nouvel ID de borne.`)
  } else {
    console.log(`⚠️ Fichier .env du frontend non trouvé à ${frontendEnvPath}. Veuillez le mettre à jour manuellement avec : VITE_BORNE_ID=${borne.id}`)
  }
}

main()
  .catch(err => {
    console.error('❌ Erreur :', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
