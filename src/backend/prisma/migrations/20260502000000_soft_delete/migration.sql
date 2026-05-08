-- Migration: soft_delete
-- Adds deletedAt DateTime? to Formulaire, Borne, Enregistrement
-- Adds formulaireVersion String to Enregistrement (stamped at submission time — ADR-5)
-- Adds @@index([deletedAt]) to each updated model

-- ─── Formulaire ───────────────────────────────────────────────────────────────

ALTER TABLE "formulaires"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "formulaires_deletedAt_idx" ON "formulaires"("deletedAt");

-- ─── Borne ────────────────────────────────────────────────────────────────────

ALTER TABLE "bornes"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "bornes_deletedAt_idx" ON "bornes"("deletedAt");

-- ─── Enregistrement ───────────────────────────────────────────────────────────

ALTER TABLE "enregistrements"
  ADD COLUMN "deletedAt"           TIMESTAMP(3),
  ADD COLUMN "formulaireVersion"   TEXT NOT NULL DEFAULT '1.0.0';

CREATE INDEX "enregistrements_deletedAt_idx" ON "enregistrements"("deletedAt");

-- ─── DOWN (rollback) ──────────────────────────────────────────────────────────
-- Run these statements to reverse this migration:
--
-- DROP INDEX "formulaires_deletedAt_idx";
-- ALTER TABLE "formulaires" DROP COLUMN "deletedAt";
--
-- DROP INDEX "bornes_deletedAt_idx";
-- ALTER TABLE "bornes" DROP COLUMN "deletedAt";
--
-- DROP INDEX "enregistrements_deletedAt_idx";
-- ALTER TABLE "enregistrements" DROP COLUMN "deletedAt";
-- ALTER TABLE "enregistrements" DROP COLUMN "formulaireVersion";
