-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : écran de veille des bornes (diaporama configurable)
-- Date : 2026-09-23
-- Pourquoi : la borne bascule sur un diaporama après une période d'inactivité
--            sur l'écran d'accueil ; le diaporama est édité depuis le back-office
--            et affecté borne par borne (Borne.ecranVeilleId).
-- Additive uniquement : aucune colonne existante modifiée.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "bornes" ADD COLUMN     "ecranVeilleId" TEXT;

-- CreateTable
CREATE TABLE "ecrans_veille" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "delaiActivation" INTEGER NOT NULL DEFAULT 60,
    "transition" TEXT NOT NULL DEFAULT 'fondu',
    "ordreAleatoire" BOOLEAN NOT NULL DEFAULT false,
    "afficherCta" BOOLEAN NOT NULL DEFAULT true,
    "texteCta" JSONB,
    "afficherLogo" BOOLEAN NOT NULL DEFAULT true,
    "afficherHorloge" BOOLEAN NOT NULL DEFAULT false,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ecrans_veille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diapositives_veille" (
    "id" TEXT NOT NULL,
    "ecranVeilleId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "duree" INTEGER NOT NULL DEFAULT 8,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "titre" JSONB,
    "sousTitre" JSONB,
    "contenu" JSONB NOT NULL,
    "style" JSONB,
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diapositives_veille_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecrans_veille_deletedAt_idx" ON "ecrans_veille"("deletedAt");

-- CreateIndex
CREATE INDEX "diapositives_veille_ecranVeilleId_ordre_idx" ON "diapositives_veille"("ecranVeilleId", "ordre");

-- CreateIndex
CREATE INDEX "bornes_ecranVeilleId_idx" ON "bornes"("ecranVeilleId");

-- AddForeignKey
ALTER TABLE "bornes" ADD CONSTRAINT "bornes_ecranVeilleId_fkey" FOREIGN KEY ("ecranVeilleId") REFERENCES "ecrans_veille"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diapositives_veille" ADD CONSTRAINT "diapositives_veille_ecranVeilleId_fkey" FOREIGN KEY ("ecranVeilleId") REFERENCES "ecrans_veille"("id") ON DELETE CASCADE ON UPDATE CASCADE;

