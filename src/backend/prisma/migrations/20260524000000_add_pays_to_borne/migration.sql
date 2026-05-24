-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : ajout du champ `pays` au modèle Borne
-- Date : 2026-05-24
-- Pourquoi : permettre de filtrer l'auto-complétion d'adresse par pays
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "bornes"
  ADD COLUMN "pays" TEXT NOT NULL DEFAULT 'FR';
