-- Migration V2 — Estimer Mes Aides
-- Adds all V2 models while preserving V1 tables

-- AddColumn borneId to submissions (retrocompat)
ALTER TABLE "submissions" ADD COLUMN "borne_id" TEXT;

-- CreateTable super_admins
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable admin_bornes
CREATE TABLE "admin_bornes" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_bornes_pkey" PRIMARY KEY ("id")
);

-- CreateTable bornes
CREATE TABLE "bornes" (
    "id" TEXT NOT NULL,
    "idBorne" TEXT NOT NULL,
    "langueDefaut" TEXT NOT NULL DEFAULT 'fr',
    "adresse" TEXT NOT NULL,
    "commercant" TEXT,
    "regie" TEXT,
    "installateur" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'actif',
    "formulaireId" TEXT,
    "adminBorneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bornes_pkey" PRIMARY KEY ("id")
);

-- CreateTable formulaires
CREATE TABLE "formulaires" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "dureeRetourAccueil" INTEGER NOT NULL DEFAULT 30,
    "annulationInactivite" INTEGER NOT NULL DEFAULT 120,
    "pageDebutConfig" JSONB NOT NULL,
    "pageFinConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "formulaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable questions
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "formulaireId" TEXT NOT NULL,
    "libelleQuestion" JSONB NOT NULL,
    "typeOption" TEXT NOT NULL,
    "options" JSONB,
    "orderPage" INTEGER NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT false,
    "paragrapheInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable enregistrements
CREATE TABLE "enregistrements" (
    "id" TEXT NOT NULL,
    "borneId" TEXT NOT NULL,
    "formulaireId" TEXT NOT NULL,
    "langueUtilisee" TEXT NOT NULL DEFAULT 'fr',
    "statutPartage" TEXT NOT NULL DEFAULT 'en_attente',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "derniereErreur" TEXT,
    "partageAt" TIMESTAMP(3),
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enregistrements_pkey" PRIMARY KEY ("id")
);

-- CreateTable enregistrement_reponses
CREATE TABLE "enregistrement_reponses" (
    "id" SERIAL NOT NULL,
    "enregistrementId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    CONSTRAINT "enregistrement_reponses_pkey" PRIMARY KEY ("id")
);

-- CreateTable partage_jobs
CREATE TABLE "partage_jobs" (
    "id" TEXT NOT NULL,
    "enregistrementId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prochainEssai" TIMESTAMP(3),
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partage_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_bornes_email_key" ON "admin_bornes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bornes_idBorne_key" ON "bornes"("idBorne");

-- CreateIndex
CREATE INDEX "bornes_statut_idx" ON "bornes"("statut");

-- CreateIndex
CREATE INDEX "bornes_adminBorneId_idx" ON "bornes"("adminBorneId");

-- CreateIndex
CREATE INDEX "formulaires_statut_idx" ON "formulaires"("statut");

-- CreateIndex
CREATE INDEX "questions_formulaireId_orderPage_idx" ON "questions"("formulaireId", "orderPage");

-- CreateIndex
CREATE UNIQUE INDEX "enregistrements_submissionId_key" ON "enregistrements"("submissionId");

-- CreateIndex
CREATE INDEX "enregistrements_borneId_createdAt_idx" ON "enregistrements"("borneId", "createdAt");

-- CreateIndex
CREATE INDEX "enregistrements_statutPartage_idx" ON "enregistrements"("statutPartage");

-- CreateIndex
CREATE INDEX "enregistrement_reponses_enregistrementId_idx" ON "enregistrement_reponses"("enregistrementId");

-- CreateIndex
CREATE INDEX "partage_jobs_statut_prochainEssai_idx" ON "partage_jobs"("statut", "prochainEssai");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_borne_id_fkey" FOREIGN KEY ("borne_id") REFERENCES "bornes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bornes" ADD CONSTRAINT "bornes_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "formulaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bornes" ADD CONSTRAINT "bornes_adminBorneId_fkey" FOREIGN KEY ("adminBorneId") REFERENCES "admin_bornes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "formulaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enregistrements" ADD CONSTRAINT "enregistrements_borneId_fkey" FOREIGN KEY ("borneId") REFERENCES "bornes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enregistrements" ADD CONSTRAINT "enregistrements_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "formulaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enregistrements" ADD CONSTRAINT "enregistrements_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enregistrement_reponses" ADD CONSTRAINT "enregistrement_reponses_enregistrementId_fkey" FOREIGN KEY ("enregistrementId") REFERENCES "enregistrements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enregistrement_reponses" ADD CONSTRAINT "enregistrement_reponses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
