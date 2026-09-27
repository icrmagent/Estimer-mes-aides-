-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : entreprise (tenant) I-CRM destinataire, choisie borne par borne
-- Date : 2026-09-27
-- Pourquoi : chaque entreprise I-CRM (LENA, CAE España…) est enregistrée UNE fois
--            dans le back-office avec sa clé API ; chaque borne choisit ensuite
--            l'entreprise qui reçoit ses enregistrements (prioritaire sur les canaux).
--   entreprises_icrm                   entreprise I-CRM : URL API, clé « emak_… », secret,
--                                      entreprise / sous-type renvoyés par le ping I-CRM
--   bornes.entrepriseIcrmId            entreprise destinataire de la borne (NULL = canaux)
--   enregistrements.crmEntrepriseIcrmId entreprise qui a reçu l'enregistrement (traçabilité)
-- Additive et IDEMPOTENTE (rejouable) : aucune colonne existante modifiée, aucun
-- DROP. Les bornes existantes ont entrepriseIcrmId = NULL => comportement inchangé
-- (canaux puis variables d'environnement, comme avant).
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entreprises_icrm_deletedAt_idx" ON "entreprises_icrm"("deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bornes_entrepriseIcrmId_idx" ON "bornes"("entrepriseIcrmId");

-- AddForeignKey (PostgreSQL n'a pas de ADD CONSTRAINT IF NOT EXISTS : garde explicite)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bornes_entrepriseIcrmId_fkey') THEN
    ALTER TABLE "bornes" ADD CONSTRAINT "bornes_entrepriseIcrmId_fkey" FOREIGN KEY ("entrepriseIcrmId") REFERENCES "entreprises_icrm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enregistrements_crmEntrepriseIcrmId_fkey') THEN
    ALTER TABLE "enregistrements" ADD CONSTRAINT "enregistrements_crmEntrepriseIcrmId_fkey" FOREIGN KEY ("crmEntrepriseIcrmId") REFERENCES "entreprises_icrm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
