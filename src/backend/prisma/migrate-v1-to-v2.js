/**
 * src/backend/prisma/migrate-v1-to-v2.js
 *
 * V1 → V2 Data Migration Script (ADR-7)
 *
 * Migrates V1 Submission + SubmissionValue records to V2 Enregistrement + EnregistrementReponse.
 *
 * ADR-7 — Relaxed validation for V1 data:
 *   - Do NOT reject V1 records based on fieldId
 *   - Tag records with non-approved fieldIds as legacyFieldId: true
 *   - Log a warning per tagged record
 *   - Generate migration-report.json after migration
 *
 * Idempotency:
 *   The script checks for a Borne with idBorne === 'MIGRATION-V1-DEFAULT'.
 *   If found, migration has already run — all records are skipped.
 *
 * Usage:
 *   node src/backend/prisma/migrate-v1-to-v2.js
 *
 * Backup:
 *   A JSON backup of all V1 data is written to
 *   src/backend/prisma/backups/v1-backup-{timestamp}.json before any changes.
 *
 * Report:
 *   migration-report.json is written to the project root after migration.
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { VALID_CRM_FIELD_IDS } from '../src/lib/crmFieldIds.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const prisma = new PrismaClient()

// ─── Constants ────────────────────────────────────────────────────────────────

const MIGRATION_BORNE_ID = 'MIGRATION-V1-DEFAULT'
const MIGRATION_FORMULAIRE_LABEL = 'Formulaire V1 (migration)'
const MIGRATION_FORMULAIRE_VERSION = '1.0.0'
const MIGRATION_QUESTION_ID_PREFIX = 'v1-field-'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a stable synthetic questionId for a given V1 fieldId.
 * These are placeholder question IDs used only for migrated records.
 * They are NOT real Question rows — EnregistrementReponse.questionId is a
 * foreign key, so we create stub Question rows in the migration formulaire.
 */
function syntheticQuestionId(fieldId) {
  return `${MIGRATION_QUESTION_ID_PREFIX}${fieldId}`
}

/**
 * Logs a timestamped message to stdout.
 */
function log(msg) {
  console.log(`[migrate-v1-to-v2] ${new Date().toISOString()} — ${msg}`)
}

/**
 * Logs a warning to stdout.
 */
function warn(msg) {
  console.warn(`[migrate-v1-to-v2] ⚠️  ${msg}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Starting V1 → V2 migration...')

  // ── 1. Idempotency check ────────────────────────────────────────────────────
  const existingMigrationBorne = await prisma.borne.findFirst({
    where: { idBorne: MIGRATION_BORNE_ID },
  })

  if (existingMigrationBorne) {
    log('Migration marker found — migration has already run. Checking for new unprocessed submissions...')
    // Still process any new V1 submissions added after the first migration run
    await migrateSubmissions(existingMigrationBorne, true)
    log('Incremental migration complete.')
    return
  }

  // ── 2. Load all V1 data ─────────────────────────────────────────────────────
  log('Loading V1 submissions and values...')
  const submissions = await prisma.submission.findMany({
    include: { values: true },
    orderBy: { createdAt: 'asc' },
  })

  log(`Found ${submissions.length} V1 submissions to process.`)

  // ── 3. Create backup ────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupsDir = join(__dirname, 'backups')
  mkdirSync(backupsDir, { recursive: true })
  const backupPath = join(backupsDir, `v1-backup-${timestamp}.json`)

  const backupData = {
    exportedAt: new Date().toISOString(),
    totalSubmissions: submissions.length,
    totalValues: submissions.reduce((sum, s) => sum + s.values.length, 0),
    submissions: submissions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      configVersion: s.configVersion,
      synced: s.synced,
      syncedAt: s.syncedAt,
      crmProjectId: s.crmProjectId,
      borneId: s.borneId,
      values: s.values.map((v) => ({
        id: v.id,
        fieldId: v.fieldId,
        value: v.value,
      })),
    })),
  }

  writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8')
  log(`Backup written to ${backupPath}`)

  // ── 4. Create default Borne for V1 submissions ──────────────────────────────
  log('Creating default Borne for V1 submissions...')
  const migrationBorne = await prisma.borne.create({
    data: {
      idBorne: MIGRATION_BORNE_ID,
      langueDefaut: 'fr',
      adresse: 'Migration V1 — adresse inconnue',
      commercant: null,
      regie: null,
      installateur: null,
      statut: 'inactif',
    },
  })
  log(`Default Borne created: id=${migrationBorne.id}, idBorne=${migrationBorne.idBorne}`)

  // ── 5. Create default Formulaire matching V1 configuration ─────────────────
  log('Creating default Formulaire for V1 migration...')
  const migrationFormulaire = await prisma.formulaire.create({
    data: {
      label: MIGRATION_FORMULAIRE_LABEL,
      version: MIGRATION_FORMULAIRE_VERSION,
      statut: 'archive',
      dureeRetourAccueil: 30,
      annulationInactivite: 120,
      pageDebutConfig: {
        titre: { fr: 'Formulaire V1 (migration)' },
        couleurPrimaire: '#5B2D8E',
      },
      pageFinConfig: {
        titre: { fr: 'Merci' },
        couleurPrimaire: '#5B2D8E',
      },
    },
  })
  log(`Default Formulaire created: id=${migrationFormulaire.id}`)

  // ── 6. Collect all unique fieldIds from V1 values ───────────────────────────
  const allFieldIds = new Set()
  for (const submission of submissions) {
    for (const value of submission.values) {
      allFieldIds.add(value.fieldId)
    }
  }

  // ── 7. Create stub Question rows for each unique fieldId ────────────────────
  log(`Creating ${allFieldIds.size} stub Question rows for V1 field IDs...`)
  const questionIdMap = new Map() // fieldId → Question.id

  for (const fieldId of allFieldIds) {
    const isLegacy = !VALID_CRM_FIELD_IDS.includes(fieldId)
    const question = await prisma.question.create({
      data: {
        id: syntheticQuestionId(fieldId),
        formulaireId: migrationFormulaire.id,
        libelleQuestion: {
          fr: `Champ V1 #${fieldId}${isLegacy ? ' (legacy)' : ''}`,
        },
        typeOption: 'text',
        orderPage: fieldId,
        obligatoire: false,
      },
    })
    questionIdMap.set(fieldId, question.id)
  }

  // ── 8. Link Borne to Formulaire ─────────────────────────────────────────────
  await prisma.borne.update({
    where: { id: migrationBorne.id },
    data: { formulaireId: migrationFormulaire.id },
  })

  // ── 9. Migrate submissions ──────────────────────────────────────────────────
  log(`Migrating ${submissions.length} submissions...`)
  const stats = await migrateSubmissions(migrationBorne, false, submissions, questionIdMap, migrationFormulaire)

  // ── 10. Generate migration-report.json ──────────────────────────────────────
  const reportPath = join(__dirname, '..', 'migration-report.json')
  const report = {
    migratedAt: new Date().toISOString(),
    totalSubmissions: submissions.length,
    totalMigrated: stats.migrated,
    totalSkipped: stats.skipped,
    legacyFieldIds: stats.legacyFieldIds,
    totalLegacyTagged: stats.totalLegacyTagged,
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  log(`Migration report written to ${reportPath}`)

  // ── 11. Final summary ───────────────────────────────────────────────────────
  log(
    `Migration complete: ${stats.migrated} records migrated, ${stats.totalLegacyTagged} legacy fieldIds tagged`
  )

  const legacyCount = Object.keys(stats.legacyFieldIds).length
  if (legacyCount > 0) {
    warn(
      `${legacyCount} distinct legacy fieldId(s) found. See migration-report.json for details.`
    )
  }
}

// ─── migrateSubmissions ───────────────────────────────────────────────────────

/**
 * Migrates V1 Submission records to V2 Enregistrement + EnregistrementReponse.
 *
 * @param {object}  migrationBorne     - The default Borne created for V1 submissions
 * @param {boolean} incrementalMode    - If true, only process submissions not yet migrated
 * @param {Array}   [submissions]      - Pre-loaded submissions (optional, loaded from DB if not provided)
 * @param {Map}     [questionIdMap]    - fieldId → Question.id map (optional, built if not provided)
 * @param {object}  [migrationFormulaire] - The migration Formulaire (optional, loaded if not provided)
 * @returns {{ migrated, skipped, legacyFieldIds, totalLegacyTagged }}
 */
async function migrateSubmissions(
  migrationBorne,
  incrementalMode = false,
  submissions = null,
  questionIdMap = null,
  migrationFormulaire = null
) {
  // Load data if not provided (incremental mode)
  if (!submissions) {
    submissions = await prisma.submission.findMany({
      include: { values: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  if (!migrationFormulaire) {
    migrationFormulaire = await prisma.formulaire.findFirst({
      where: { label: MIGRATION_FORMULAIRE_LABEL },
    })
    if (!migrationFormulaire) {
      throw new Error('Migration formulaire not found — run full migration first.')
    }
  }

  if (!questionIdMap) {
    // Rebuild questionIdMap from existing stub questions
    const existingQuestions = await prisma.question.findMany({
      where: { formulaireId: migrationFormulaire.id },
    })
    questionIdMap = new Map()
    for (const q of existingQuestions) {
      // Extract fieldId from synthetic ID: "v1-field-{fieldId}"
      const match = q.id.match(/^v1-field-(\d+)$/)
      if (match) {
        questionIdMap.set(parseInt(match[1], 10), q.id)
      }
    }
  }

  let migrated = 0
  let skipped = 0
  const legacyFieldIds = {} // { [fieldId]: count }
  let totalLegacyTagged = 0

  for (const submission of submissions) {
    // ── Idempotency: skip already migrated submissions ──────────────────────
    const existing = await prisma.enregistrement.findFirst({
      where: { submissionId: submission.id },
    })

    if (existing) {
      skipped++
      continue
    }

    // ── Determine borneId ───────────────────────────────────────────────────
    // Use the submission's borneId if set, otherwise use the migration default borne
    const borneId = submission.borneId ?? migrationBorne.id

    // ── Create Enregistrement ───────────────────────────────────────────────
    const enregistrement = await prisma.enregistrement.create({
      data: {
        borneId,
        formulaireId: migrationFormulaire.id,
        formulaireVersion: MIGRATION_FORMULAIRE_VERSION,
        langueUtilisee: 'fr',
        statutPartage: submission.synced ? 'partage' : 'en_attente',
        tentatives: 0,
        derniereErreur: null,
        partageAt: submission.syncedAt ?? null,
        submissionId: submission.id,
        createdAt: submission.createdAt,
      },
    })

    // ── Migrate each SubmissionValue → EnregistrementReponse ───────────────
    for (const value of submission.values) {
      const isLegacy = !VALID_CRM_FIELD_IDS.includes(value.fieldId)

      if (isLegacy) {
        // ADR-7: log warning per tagged record
        warn(
          `Legacy fieldId ${value.fieldId} not in approved CRM list — manual review required (submissionId=${submission.id})`
        )
        legacyFieldIds[value.fieldId] = (legacyFieldIds[value.fieldId] ?? 0) + 1
        totalLegacyTagged++
      }

      // Ensure a stub Question exists for this fieldId
      let questionId = questionIdMap.get(value.fieldId)
      if (!questionId) {
        // Create stub question on-the-fly (incremental mode may encounter new fieldIds)
        const newQuestion = await prisma.question.create({
          data: {
            id: syntheticQuestionId(value.fieldId),
            formulaireId: migrationFormulaire.id,
            libelleQuestion: {
              fr: `Champ V1 #${value.fieldId}${isLegacy ? ' (legacy)' : ''}`,
            },
            typeOption: 'text',
            orderPage: value.fieldId,
            obligatoire: false,
          },
        })
        questionId = newQuestion.id
        questionIdMap.set(value.fieldId, questionId)
      }

      // ADR-7: do NOT reject V1 records based on fieldId — migrate as-is
      await prisma.enregistrementReponse.create({
        data: {
          enregistrementId: enregistrement.id,
          questionId,
          valeur: value.value,
          legacyFieldId: isLegacy,
        },
      })
    }

    migrated++

    if (migrated % 50 === 0) {
      log(`Progress: ${migrated} submissions migrated so far...`)
    }
  }

  return { migrated, skipped, legacyFieldIds, totalLegacyTagged }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('[migrate-v1-to-v2] Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
