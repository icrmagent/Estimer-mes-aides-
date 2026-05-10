import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const bornes = await prisma.borne.findMany({
      where: { deletedAt: null },
      skip: 0,
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        adminBorne: { select: { id: true, nom: true, prenom: true, email: true } },
        formulaire: { select: { id: true, label: true, version: true, statut: true } },
      },
    });
    console.log("Success", bornes);
  } catch (err) {
    console.error("Prisma error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
