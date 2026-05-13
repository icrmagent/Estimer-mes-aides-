// Repair script: deeply unwraps nested-JSON nom values for catégories & sous-catégories.
// Run once after the i18n migration if values were re-saved through translation passes.
//
//   node scripts/fix-categories-nom.js          (dry-run)
//   node scripts/fix-categories-nom.js --apply  (write changes)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function deepParseNom(nom, depth = 0) {
  if (!nom || depth > 8) return typeof nom === 'string' ? { fr: nom, es: '', en: '' } : { fr: '', es: '', en: '' }
  if (typeof nom === 'string') {
    const t = nom.trim()
    if (t.startsWith('{') || t.startsWith('"')) {
      try { return deepParseNom(JSON.parse(t), depth + 1) } catch { return { fr: nom, es: '', en: '' } }
    }
    return { fr: nom, es: '', en: '' }
  }
  if (typeof nom !== 'object') return { fr: String(nom), es: '', en: '' }

  let fr = nom.fr ?? ''
  let es = nom.es ?? ''
  let en = nom.en ?? ''

  if (typeof fr === 'string' && fr.trim().startsWith('{')) {
    try {
      const inner = JSON.parse(fr)
      if (inner && typeof inner === 'object' && ('fr' in inner || 'es' in inner || 'en' in inner)) {
        const rec = deepParseNom(inner, depth + 1)
        return {
          fr: rec.fr || '',
          es: rec.es || es || '',
          en: rec.en || en || '',
        }
      }
    } catch { /* leave as-is */ }
  }

  return { fr: String(fr || ''), es: String(es || ''), en: String(en || '') }
}

async function fixTable(label, fetcher, updater) {
  const rows = await fetcher()
  let fixed = 0
  for (const row of rows) {
    const before = row.nom
    const cleaned = deepParseNom(before)
    const beforeStr = typeof before === 'string' ? before : JSON.stringify(before)
    const afterStr = JSON.stringify(cleaned)
    if (beforeStr !== afterStr) {
      console.log(`  [${label}] ${row.id}`)
      console.log(`    avant: ${beforeStr.slice(0, 120)}${beforeStr.length > 120 ? '…' : ''}`)
      console.log(`    après: ${afterStr}`)
      if (APPLY) await updater(row.id, cleaned)
      fixed++
    }
  }
  console.log(`  → ${fixed} ligne(s) ${APPLY ? 'corrigée(s)' : 'à corriger'} sur ${rows.length}`)
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}\n`)

  console.log('Catégories:')
  await fixTable(
    'cat',
    () => prisma.categorieQuestion.findMany({ select: { id: true, nom: true } }),
    (id, nom) => prisma.$executeRaw`
      UPDATE categories_question SET nom = ${JSON.stringify(nom)}::jsonb, "updatedAt" = NOW() WHERE id = ${id}
    `,
  )

  console.log('\nSous-catégories:')
  await fixTable(
    'sub',
    () => prisma.sousCategorieQuestion.findMany({ select: { id: true, nom: true } }),
    (id, nom) => prisma.$executeRaw`
      UPDATE sous_categories_question SET nom = ${JSON.stringify(nom)}::jsonb, "updatedAt" = NOW() WHERE id = ${id}
    `,
  )

  if (!APPLY) console.log('\n→ Relancer avec --apply pour appliquer les corrections.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
