-- Migration: 20260503000000_performance_indexes
-- Description: Add performance indexes for dashboard queries and queue worker
--
-- Indexes added:
--   1. enregistrements.createdAt       — date range dashboard queries (task 27.1)
--   2. partage_jobs.(statut, prochain_essai) — queue worker fetch (task 27.2 — already in schema)
--   3. enregistrement_reponses.enregistrement_id — join performance (task 27.3 — already in schema)
--
-- Note: indexes 2 and 3 were already present in the schema from a prior migration.
-- This migration only adds the missing standalone createdAt index on enregistrements.
--
-- DOWN (rollback):
--   DROP INDEX IF EXISTS "enregistrements_created_at_idx";

-- ─── UP ───────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "enregistrements_created_at_idx"
  ON "enregistrements" ("createdAt");
