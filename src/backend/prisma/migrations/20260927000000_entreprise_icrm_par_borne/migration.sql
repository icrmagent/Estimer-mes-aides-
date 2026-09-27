-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : entreprise (tenant) I-CRM destinataire, choisie borne par borne
-- Date : 2026-09-27 (révisée après deux revues le même jour ; jamais appliquée sur une
--        base partagée — seulement sur des bases locales jetables — d'où la modification en place)
-- Pourquoi : chaque entreprise I-CRM (LENA, CAE España…) est enregistrée UNE fois
--            dans le back-office avec sa clé API ; chaque borne choisit ensuite
--            l'entreprise qui reçoit ses enregistrements.
--   entreprises_icrm                     entreprise I-CRM : URL API, clé « emak_… », secret,
--                                        entreprise / sous-type renvoyés par le ping I-CRM,
--                                        verificationRequise (à tester : nouvelle entreprise,
--                                        URL ou clé changée ; DEFAULT true)
--   bornes.entrepriseIcrmId              entreprise destinataire de la borne (NULL = canaux)
--   partage_jobs.entrepriseIcrmId        cible FIGÉE à la création du job (NULL = canaux) :
--                                        un job n'est envoyé qu'à cette cible
--   enregistrements.crmEntrepriseIcrmId  entreprise qui a reçu l'enregistrement
--   enregistrements.crmDestination       instantané de la destination à la livraison (sans secret)
-- Additive et IDEMPOTENTE (rejouable) : aucune colonne existante modifiée, aucun
-- DROP. Les lignes existantes ont les nouvelles colonnes à NULL => comportement
-- inchangé (canaux puis variables d'environnement, comme avant).
-- Verrous : Prisma exécute ce fichier en UNE transaction ; chaque ALTER TABLE y
-- prend un verrou ACCESS EXCLUSIVE sur bornes / enregistrements / partage_jobs,
-- gardé jusqu'au COMMIT (NOT VALID puis VALIDATE n'y change donc rien : la
-- validation est instantanée, toutes les nouvelles colonnes étant NULL). Le
-- lock_timeout ci-dessous borne l'ATTENTE de ces verrous : si une transaction
-- longue tient l'une de ces tables, la migration échoue au bout de 5 s (rien
-- n'est appliqué, `prisma migrate deploy` peut être relancé) au lieu de bloquer
-- toutes les requêtes de l'application derrière elle. SET LOCAL : limité à la
-- transaction de la migration.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

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
    "verificationRequise" BOOLEAN NOT NULL DEFAULT true,
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
-- NOT VALID puis VALIDATE : gardé pour un rejeu manuel hors transaction (psql), où la
-- validation ne prend qu'un verrou SHARE UPDATE EXCLUSIVE ; sous Prisma (une seule
-- transaction), voir l'en-tête : aucun gain, lock_timeout borne l'attente.
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
