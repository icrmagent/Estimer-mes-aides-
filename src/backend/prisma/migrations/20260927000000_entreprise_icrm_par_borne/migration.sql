-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : entreprise (tenant) I-CRM destinataire, choisie borne par borne
-- Date : 2026-09-27 (révisée après revue le même jour, avant toute mise en production)
-- Pourquoi : chaque entreprise I-CRM (LENA, CAE España…) est enregistrée UNE fois
--            dans le back-office avec sa clé API ; chaque borne choisit ensuite
--            l'entreprise qui reçoit ses enregistrements.
--   entreprises_icrm                     entreprise I-CRM : URL API, clé « emak_… », secret,
--                                        entreprise / sous-type renvoyés par le ping I-CRM,
--                                        verificationRequise (URL ou clé changée, à retester)
--   bornes.entrepriseIcrmId              entreprise destinataire de la borne (NULL = canaux)
--   partage_jobs.entrepriseIcrmId        cible FIGÉE à la création du job (NULL = canaux) :
--                                        un job n'est envoyé qu'à cette cible
--   enregistrements.crmEntrepriseIcrmId  entreprise qui a reçu l'enregistrement
--   enregistrements.crmDestination       instantané de la destination à la livraison (sans secret)
-- Additive et IDEMPOTENTE (rejouable) : aucune colonne existante modifiée, aucun
-- DROP. Les lignes existantes ont les nouvelles colonnes à NULL => comportement
-- inchangé (canaux puis variables d'environnement, comme avant).
-- Clés étrangères posées NOT VALID puis validées : pas de verrou long sur les
-- tables existantes pendant la vérification (toutes les valeurs sont NULL).
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "entreprises_icrm" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nomIcrm" TEXT,
    "sousTypeIcrm" TEXT,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "verificationRequise" BOOLEAN NOT NULL DEFAULT false,
    "derniereVerification" TIMESTAMP(3),
    "dernierStatut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "entreprises_icrm_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "bornes" ADD COLUMN IF NOT EXISTS "entrepriseIcrmId" TEXT;

-- AlterTable
ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmEntrepriseIcrmId" TEXT;
ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmDestination" JSONB;

-- AlterTable
ALTER TABLE "partage_jobs" ADD COLUMN IF NOT EXISTS "entrepriseIcrmId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entreprises_icrm_deletedAt_idx" ON "entreprises_icrm"("deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bornes_entrepriseIcrmId_idx" ON "bornes"("entrepriseIcrmId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enregistrements_crmEntrepriseIcrmId_idx" ON "enregistrements"("crmEntrepriseIcrmId");

-- CreateIndex (jobs d'une entreprise par statut : suspension / reprise / décomptes)
CREATE INDEX IF NOT EXISTS "partage_jobs_entrepriseIcrmId_statut_idx" ON "partage_jobs"("entrepriseIcrmId", "statut");

-- AddForeignKey — PostgreSQL n'a pas de ADD CONSTRAINT IF NOT EXISTS : garde explicite.
-- NOT VALID (aucun parcours de la table), puis VALIDATE (verrou léger SHARE UPDATE EXCLUSIVE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bornes_entrepriseIcrmId_fkey') THEN
    ALTER TABLE "bornes" ADD CONSTRAINT "bornes_entrepriseIcrmId_fkey" FOREIGN KEY ("entrepriseIcrmId") REFERENCES "entreprises_icrm"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE "bornes" VALIDATE CONSTRAINT "bornes_entrepriseIcrmId_fkey";

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enregistrements_crmEntrepriseIcrmId_fkey') THEN
    ALTER TABLE "enregistrements" ADD CONSTRAINT "enregistrements_crmEntrepriseIcrmId_fkey" FOREIGN KEY ("crmEntrepriseIcrmId") REFERENCES "entreprises_icrm"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE "enregistrements" VALIDATE CONSTRAINT "enregistrements_crmEntrepriseIcrmId_fkey";

-- AddForeignKey — RESTRICT : un job ciblant une entreprise ne doit jamais devenir un job
-- « canal » (NULL) si la ligne de l'entreprise était supprimée physiquement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partage_jobs_entrepriseIcrmId_fkey') THEN
    ALTER TABLE "partage_jobs" ADD CONSTRAINT "partage_jobs_entrepriseIcrmId_fkey" FOREIGN KEY ("entrepriseIcrmId") REFERENCES "entreprises_icrm"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE "partage_jobs" VALIDATE CONSTRAINT "partage_jobs_entrepriseIcrmId_fkey";
