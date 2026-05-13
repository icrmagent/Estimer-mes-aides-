-- Migration: categories_nom_i18n
-- Convert nom column from text to jsonb in both category tables
-- Existing string values are migrated as { "fr": "<value>", "es": "", "en": "" }

-- CategorieQuestion: drop unique constraint then convert to jsonb
ALTER TABLE "categories_question"
  DROP CONSTRAINT IF EXISTS "categories_question_nom_key";

ALTER TABLE "categories_question"
  ALTER COLUMN "nom" TYPE JSONB
  USING jsonb_build_object('fr', "nom"::text, 'es', '', 'en', '');

-- SousCategorieQuestion: convert to jsonb
ALTER TABLE "sous_categories_question"
  ALTER COLUMN "nom" TYPE JSONB
  USING jsonb_build_object('fr', "nom"::text, 'es', '', 'en', '');
