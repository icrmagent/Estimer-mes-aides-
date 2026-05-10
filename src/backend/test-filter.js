import { prisma } from './src/lib/prisma.js';

async function main() {
  const all = await prisma.enregistrement.findMany({ include: { borne: true } });
  console.log('All Enregistrements:', all.length);
  if (all.length > 0) {
    console.log('First record borneId:', all[0].borneId, all[0].borne.idBorne);
    const filtered = await prisma.enregistrement.findMany({
      where: { borneId: all[0].borneId }
    });
    console.log('Filtered by borneId:', filtered.length);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
