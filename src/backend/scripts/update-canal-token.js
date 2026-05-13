import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const token = process.env.ICRM_TOKEN
if (!token) { console.error('ICRM_TOKEN manquant'); process.exit(1) }

const canaux = await prisma.canal.updateMany({
  where: { label: 'icrm-production' },
  data: { token, apiKey: token },
})
console.log(`✅ ${canaux.count} canal(x) mis à jour`)

const jobs = await prisma.partageJob.updateMany({
  where: { statut: { in: ['echec_temporaire', 'echec_definitif'] } },
  data: { statut: 'en_attente', tentatives: 0, erreur: null, prochainEssai: null },
})
console.log(`✅ ${jobs.count} job(s) remis en attente`)

await prisma.$disconnect()
