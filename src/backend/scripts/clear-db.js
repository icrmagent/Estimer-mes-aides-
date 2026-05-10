import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');

  // V1
  await prisma.submissionValue.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.configuration.deleteMany();

  // Security & Jobs
  await prisma.partageJob.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.revokedToken.deleteMany();
  await prisma.refreshToken.deleteMany();

  // V2 Data
  await prisma.enregistrementReponse.deleteMany();
  await prisma.enregistrement.deleteMany();
  await prisma.question.deleteMany();
  await prisma.formulaireVersion.deleteMany();
  await prisma.borne.deleteMany();
  await prisma.formulaire.deleteMany();
  await prisma.adminBorne.deleteMany();
  
  // EXPLICITLY NOT DELETING SuperAdmin

  console.log('Database cleared (SuperAdmin preserved).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
