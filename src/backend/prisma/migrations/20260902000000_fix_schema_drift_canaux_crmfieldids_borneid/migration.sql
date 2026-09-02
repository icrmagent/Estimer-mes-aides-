-- Migration: fix_schema_drift_canaux_crmfieldids_borneid
--
-- Rattrape 5 ecarts prouves entre les migrations et prisma/schema.prisma.
-- Source de verite : `prisma migrate diff --from-url <db migree> --to-schema-datamodel prisma/schema.prisma`
--
--   1. submissions.borne_id  -> submissions."borneId"  (schema.prisma declare borneId SANS @map)
--      Symptome : POST /api/submissions -> 500 "The column submissions.borneId does not exist"
--   2. questions."crmFieldIds" JSONB manquante
--      Symptome : P2022 sur TOUTE lecture de questions (Prisma liste les colonnes explicitement),
--      dont bornes-config.js (config chargee au demarrage de la borne kiosque)
--   3. table "canaux" absente de toute migration
--      Symptome : P2021 sur routes/canaux.js, queueWorker.js, partage.js
--   4. index unique residuel categories_question_nom_key : la migration 20260513000000
--      a tente un DROP CONSTRAINT sur ce qui est un INDEX -> no-op silencieux.
--      Le schema ne declare aucun @unique sur nom (devenu JSONB i18n).
--   5. index enregistrements_created_at_idx -> enregistrements_createdAt_idx
--      (nom attendu par Prisma pour @@index([createdAt]))
--
-- Proprietes : IDEMPOTENTE (rejouable) et SURE sur une base de prod deja rattrapee
-- a la main via `db push`. AUCUN DROP de colonne ni de donnee.

-- ─── 1. submissions.borne_id -> submissions."borneId" ────────────────────────

-- Renommage SANS perte de donnees, uniquement si borne_id existe et borneId non.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'submissions'
      AND column_name = 'borne_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'submissions'
      AND column_name = 'borneId'
  ) THEN
    ALTER TABLE "submissions" RENAME COLUMN "borne_id" TO "borneId";
  END IF;
END
$$;

-- Filet de securite : base ou aucune des deux colonnes n'existe.
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "borneId" TEXT;

-- Renommage conditionnel de la contrainte FK correspondante.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_borne_id_fkey'
      AND conrelid = 'submissions'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_borneId_fkey'
      AND conrelid = 'submissions'::regclass
  ) THEN
    ALTER TABLE "submissions"
      RENAME CONSTRAINT "submissions_borne_id_fkey" TO "submissions_borneId_fkey";
  END IF;
END
$$;

-- Filet de securite : FK absente sous les deux noms.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_borneId_fkey'
      AND conrelid = 'submissions'::regclass
  ) THEN
    ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_borneId_fkey"
      FOREIGN KEY ("borneId") REFERENCES "bornes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ─── 2. questions."crmFieldIds" ──────────────────────────────────────────────

ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "crmFieldIds" JSONB;

-- ─── 3. table "canaux" ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "canaux" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "borneId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canaux_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "canaux_borneId_idx" ON "canaux"("borneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canaux_borneId_fkey'
      AND conrelid = 'canaux'::regclass
  ) THEN
    ALTER TABLE "canaux"
      ADD CONSTRAINT "canaux_borneId_fkey"
      FOREIGN KEY ("borneId") REFERENCES "bornes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ─── 4. index unique residuel sur categories_question.nom ────────────────────

DROP INDEX IF EXISTS "categories_question_nom_key";

-- ─── 5. enregistrements_created_at_idx -> enregistrements_createdAt_idx ──────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'enregistrements_created_at_idx'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'enregistrements_createdAt_idx'
  ) THEN
    ALTER INDEX "enregistrements_created_at_idx"
      RENAME TO "enregistrements_createdAt_idx";
  END IF;
END
$$;

-- Filet de securite : index absent sous les deux noms.
CREATE INDEX IF NOT EXISTS "enregistrements_createdAt_idx"
  ON "enregistrements"("createdAt");
