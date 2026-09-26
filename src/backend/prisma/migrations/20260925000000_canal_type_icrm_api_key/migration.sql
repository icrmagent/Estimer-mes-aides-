-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : canal I-CRM authentifié par clé API + traçabilité de l'opportunité
-- Date : 2026-09-25
-- Pourquoi : un canal peut désormais s'authentifier auprès d'I-CRM par une clé
--            API (X-Api-Key / X-Api-Secret) au lieu d'un jeton Azure AD, et le
--            worker conserve l'id et la référence de l'opportunité créée.
--   canaux.type                  'azure_ad' (défaut, lignes existantes) | 'icrm_api_key'
--   enregistrements.crmProjetId  id de l'opportunité I-CRM (projet_id)
--   enregistrements.crmProjetRef référence de l'opportunité I-CRM (projet_ref)
-- Additive et IDEMPOTENTE (rejouable) : aucune colonne existante modifiée, aucun
-- DROP. Les canaux existants restent 'azure_ad' => comportement inchangé.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "canaux" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'azure_ad';

ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmProjetId" TEXT;
ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmProjetRef" TEXT;
