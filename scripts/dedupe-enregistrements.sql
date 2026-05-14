-- ─────────────────────────────────────────────────────────────────────────────
-- Dédoublonnage des enregistrements créés par le bug "syncPending re-post"
-- (FormPage.jsx, InactivityManager.jsx : saveOffline sans markSynced).
--
-- DÉFINITION D'UN DOUBLON :
--   Deux enregistrements depuis la MÊME borne, sur le MÊME formulaire, avec
--   EXACTEMENT le même contenu de réponses, créés dans une fenêtre ≤ 10 min.
--
-- STRATÉGIE : on garde le plus ancien (premier POST direct = en DB d'abord),
-- on soft-delete les copies (deletedAt = NOW()). Pas de DELETE physique :
-- les EnregistrementReponse et PartageJob restent traçables.
--
-- ⚠️  PARTAGE I-CRM EXTERNE
-- Si statutPartage = 'envoye' sur un doublon, un contact a déjà été créé côté
-- I-CRM externe. Le soft-delete ici ne le supprime PAS — il faudra nettoyer
-- manuellement côté I-CRM (chercher les contacts créés à la même seconde).
-- La requête (1c) liste ces cas pour audit.
--
-- USAGE Supabase :
--   1. Lancer (1) en DRY-RUN pour identifier
--   2. Vérifier (1b) le détail
--   3. Vérifier (1c) les doublons déjà partagés au CRM (action manuelle requise)
--   4. Exécuter (2) la SOFT-DELETE dans une transaction
-- ─────────────────────────────────────────────────────────────────────────────


-- (1) DRY-RUN — Lister les groupes de doublons
-- ─────────────────────────────────────────────────────────────────────────────
WITH signatures AS (
  SELECT
    e.id,
    e."borneId",
    e."formulaireId",
    e."createdAt",
    e."statutPartage",
    e."deletedAt",
    -- Signature stable : concatène (questionId|valeur) trié alphabétiquement
    COALESCE(
      string_agg(r."questionId" || '|' || r.valeur, '||' ORDER BY r."questionId", r.valeur),
      ''
    ) AS sig
  FROM enregistrements e
  LEFT JOIN enregistrement_reponses r ON r."enregistrementId" = e.id
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id
),
groups AS (
  SELECT
    "borneId",
    "formulaireId",
    sig,
    COUNT(*)                                                            AS nb,
    MIN("createdAt")                                                    AS first_at,
    MAX("createdAt")                                                    AS last_at,
    EXTRACT(EPOCH FROM (MAX("createdAt") - MIN("createdAt")))::int      AS delta_sec
  FROM signatures
  WHERE sig <> ''  -- ignore les enregistrements vides (handleManualAbandon avec 0 réponse)
  GROUP BY "borneId", "formulaireId", sig
  HAVING COUNT(*) > 1
     AND EXTRACT(EPOCH FROM (MAX("createdAt") - MIN("createdAt"))) <= 600
)
SELECT
  "borneId",
  "formulaireId",
  nb              AS nb_doublons,
  first_at,
  last_at,
  delta_sec       AS ecart_secondes
FROM groups
ORDER BY first_at DESC;


-- (1b) DÉTAIL — Tous les enregistrements concernés, avec marquage "à conserver"
-- ─────────────────────────────────────────────────────────────────────────────
WITH signatures AS (
  SELECT
    e.id,
    e."borneId",
    e."formulaireId",
    e."createdAt",
    e."statutPartage",
    COALESCE(
      string_agg(r."questionId" || '|' || r.valeur, '||' ORDER BY r."questionId", r.valeur),
      ''
    ) AS sig
  FROM enregistrements e
  LEFT JOIN enregistrement_reponses r ON r."enregistrementId" = e.id
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id
),
ranked AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY s."borneId", s."formulaireId", s.sig
      ORDER BY s."createdAt" ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_size,
    MAX(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_last_at,
    MIN(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_first_at
  FROM signatures s
  WHERE s.sig <> ''
)
SELECT
  id,
  "borneId",
  "formulaireId",
  "createdAt",
  "statutPartage",
  CASE WHEN rn = 1 THEN 'KEEP' ELSE 'SOFT-DELETE' END AS action
FROM ranked
WHERE group_size > 1
  AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
ORDER BY "borneId", "formulaireId", "createdAt";


-- (1c) AUDIT — Doublons déjà partagés au CRM (nécessite action manuelle CRM)
-- ─────────────────────────────────────────────────────────────────────────────
WITH signatures AS (
  SELECT
    e.id, e."borneId", e."formulaireId", e."createdAt", e."statutPartage",
    COALESCE(string_agg(r."questionId" || '|' || r.valeur, '||' ORDER BY r."questionId", r.valeur), '') AS sig
  FROM enregistrements e
  LEFT JOIN enregistrement_reponses r ON r."enregistrementId" = e.id
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id
),
ranked AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (PARTITION BY s."borneId", s."formulaireId", s.sig ORDER BY s."createdAt" ASC) AS rn,
    COUNT(*) OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_size,
    MAX(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_last_at,
    MIN(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_first_at
  FROM signatures s
  WHERE s.sig <> ''
)
SELECT
  id              AS enregistrement_id,
  "borneId",
  "createdAt",
  "statutPartage"
FROM ranked
WHERE group_size > 1
  AND rn > 1                  -- doublons (pas l'original conservé)
  AND "statutPartage" = 'envoye'
  AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
ORDER BY "createdAt" DESC;


-- (2) SOFT-DELETE — Exécution réelle (à lancer après validation des dry-runs)
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

WITH signatures AS (
  SELECT
    e.id, e."borneId", e."formulaireId", e."createdAt",
    COALESCE(string_agg(r."questionId" || '|' || r.valeur, '||' ORDER BY r."questionId", r.valeur), '') AS sig
  FROM enregistrements e
  LEFT JOIN enregistrement_reponses r ON r."enregistrementId" = e.id
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id
),
ranked AS (
  SELECT
    s.id,
    ROW_NUMBER() OVER (PARTITION BY s."borneId", s."formulaireId", s.sig ORDER BY s."createdAt" ASC) AS rn,
    COUNT(*)     OVER (PARTITION BY s."borneId", s."formulaireId", s.sig)                            AS group_size,
    MAX(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_last_at,
    MIN(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_first_at
  FROM signatures s
  WHERE s.sig <> ''
),
to_delete AS (
  SELECT id
  FROM ranked
  WHERE group_size > 1
    AND rn > 1
    AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
)
UPDATE enregistrements
SET "deletedAt" = NOW(),
    "updatedAt" = NOW()
WHERE id IN (SELECT id FROM to_delete)
  AND "deletedAt" IS NULL
RETURNING id, "borneId", "createdAt";

-- Vérifier le compte attendu vs effectif, puis :
-- COMMIT;
-- ou ROLLBACK; si quelque chose cloche.
