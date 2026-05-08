-- Migration: 20260505000000_legacy_field_id
-- Description: Add legacyFieldId Boolean field to EnregistrementReponse model (ADR-7)
--
-- Purpose:
--   V1 SubmissionValue records may reference fieldId values not in the approved CRM list.
--   The migration script tags such records with legacyFieldId = true for manual review.
--   New records created after migration are still subject to strict CRM field ID validation.
--
-- Field added:
--   enregistrement_reponses.legacyFieldId  BOOLEAN NOT NULL DEFAULT false
--     true  = fieldId was not in VALID_CRM_FIELD_IDS at migration time (ADR-7)
--     false = fieldId is in the approved CRM list (default for all new records)
--
-- DOWN (rollback):
--   ALTER TABLE "enregistrement_reponses" DROP COLUMN "legacyFieldId";

-- ─── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE "enregistrement_reponses"
  ADD COLUMN "legacyFieldId" BOOLEAN NOT NULL DEFAULT false;
