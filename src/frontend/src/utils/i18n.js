/**
 * Résout un texte trilingue { fr, es, en } dans la langue demandée.
 * Fallback vers FR si la langue demandée est vide ou absente.
 *
 * @param {object|string|null} texteI18n - { fr: "...", es: "...", en: "..." } ou string brut
 * @param {string} langue - 'fr' | 'es' | 'en'
 * @param {string} fallback - langue de repli (défaut: 'fr')
 * @returns {string}
 */
export function t(texteI18n, langue = 'fr', fallback = 'fr') {
  if (!texteI18n) return ''
  if (typeof texteI18n === 'string') return texteI18n
  if (typeof texteI18n !== 'object') return ''

  const val = texteI18n[langue]
  if (val && typeof val === 'string' && val.trim() !== '') return val

  const fallbackVal = texteI18n[fallback]
  if (fallbackVal && typeof fallbackVal === 'string' && fallbackVal.trim() !== '') return fallbackVal

  for (const key of ['fr', 'es', 'en']) {
    if (texteI18n[key] && texteI18n[key].trim() !== '') return texteI18n[key]
  }

  return ''
}

/**
 * Résout les options d'une question dans la langue demandée.
 * @param {Array} options - [{ id, label: { fr, es, en } }]
 * @param {string} langue
 * @returns {Array} - [{ id, label: string }]
 */
export function tOptions(options, langue = 'fr') {
  if (!Array.isArray(options)) return []
  return options.map(opt => ({
    ...opt,
    label: t(opt.label, langue),
  }))
}
