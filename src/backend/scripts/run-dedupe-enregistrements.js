// One-shot : detecte + soft-delete les doublons d'enregistrements crees par le
// bug syncPending re-post. Lance via : node scripts/run-dedupe-enregistrements.js
// Ajoute --execute pour appliquer le UPDATE (sinon dry-run seulement).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

const SIGNATURES_CTE = `
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
    COUNT(*)     OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_size,
    MAX(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_last_at,
    MIN(s."createdAt") OVER (PARTITION BY s."borneId", s."formulaireId", s.sig) AS group_first_at
  FROM signatures s
  WHERE s.sig <> ''
)
`

async function main() {
  console.log(`\n[dedupe] mode = ${EXECUTE ? 'EXECUTE (UPDATE)' : 'DRY-RUN'}\n`)

  // (1) Groupes de doublons
  const groups = await prisma.$queryRawUnsafe(`
    ${SIGNATURES_CTE}
    SELECT
      "borneId",
      "formulaireId",
      group_size                                                        AS nb,
      MIN("createdAt") OVER (PARTITION BY "borneId", "formulaireId", sig) AS first_at,
      MAX("createdAt") OVER (PARTITION BY "borneId", "formulaireId", sig) AS last_at,
      EXTRACT(EPOCH FROM (group_last_at - group_first_at))::int          AS delta_sec
    FROM ranked
    WHERE group_size > 1
      AND rn = 1
      AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
    ORDER BY first_at DESC
  `)
  console.log(`[dedupe] (1) Groupes de doublons : ${groups.length}`)
  if (groups.length === 0) {
    console.log('[dedupe] Aucun doublon detecte. Rien a faire.\n')
    return
  }
  console.table(groups.map((g) => ({
    borneId: g.borneId.slice(0, 8) + '…',
    formId: g.formulaireId.slice(0, 8) + '…',
    nb: Number(g.nb),
    first_at: g.first_at.toISOString().slice(0, 19),
    delta_s: g.delta_sec,
  })))

  // (1c) Doublons deja partages au CRM (action manuelle requise)
  const sharedDups = await prisma.$queryRawUnsafe(`
    ${SIGNATURES_CTE}
    SELECT id, "borneId", "createdAt", "statutPartage"
    FROM ranked
    WHERE group_size > 1
      AND rn > 1
      AND "statutPartage" = 'envoye'
      AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
    ORDER BY "createdAt" DESC
  `)
  console.log(`\n[dedupe] (1c) Doublons deja partages a I-CRM : ${sharedDups.length}`)
  if (sharedDups.length > 0) {
    console.log('       /!\\ Ces contacts existent en double cote CRM externe — cleanup manuel requis.')
    console.table(sharedDups.map((r) => ({
      id: r.id.slice(0, 8) + '…',
      borneId: r.borneId.slice(0, 8) + '…',
      createdAt: r.createdAt.toISOString().slice(0, 19),
      statut: r.statutPartage,
    })))
  }

  // Compter combien de lignes seront soft-deleted
  const toDelete = await prisma.$queryRawUnsafe(`
    ${SIGNATURES_CTE}
    SELECT COUNT(*)::int AS n
    FROM ranked
    WHERE group_size > 1
      AND rn > 1
      AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
  `)
  const nbToDelete = toDelete[0].n
  console.log(`\n[dedupe] Total enregistrements a soft-delete : ${nbToDelete}`)

  if (!EXECUTE) {
    console.log('[dedupe] Dry-run termine. Relance avec --execute pour appliquer.\n')
    return
  }

  // (2) SOFT-DELETE
  console.log('\n[dedupe] (2) Execution UPDATE deletedAt = NOW() ...')
  const updated = await prisma.$queryRawUnsafe(`
    ${SIGNATURES_CTE},
    to_delete AS (
      SELECT id
      FROM ranked
      WHERE group_size > 1 AND rn > 1
        AND EXTRACT(EPOCH FROM (group_last_at - group_first_at)) <= 600
    )
    UPDATE enregistrements
    SET "deletedAt" = NOW(), "updatedAt" = NOW()
    WHERE id IN (SELECT id FROM to_delete) AND "deletedAt" IS NULL
    RETURNING id
  `)
  console.log(`[dedupe] OK — ${updated.length} ligne(s) soft-deleted.\n`)
}

main()
  .catch((err) => { console.error('[dedupe] ERREUR :', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
