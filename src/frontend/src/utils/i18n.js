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

  // Si c'est une string JSON (double-encodée en DB), on la parse d'abord
  if (typeof texteI18n === 'string') {
    const trimmed = texteI18n.trim()
    if (trimmed.startsWith('{')) {
      try { return t(JSON.parse(trimmed), langue, fallback) } catch { /* pas du JSON valide */ }
    }
    return texteI18n
  }

  if (typeof texteI18n !== 'object') return ''

  // Normalise les clés en minuscules pour accepter FR/ES/EN et fr/es/en
  const norm = Object.fromEntries(Object.entries(texteI18n).map(([k, v]) => [k.toLowerCase(), v]))

  const val = norm[langue]
  if (val && typeof val === 'string' && val.trim() !== '') return val

  const fallbackVal = norm[fallback]
  if (fallbackVal && typeof fallbackVal === 'string' && fallbackVal.trim() !== '') return fallbackVal

  for (const key of ['fr', 'es', 'en']) {
    if (norm[key] && norm[key].trim() !== '') return norm[key]
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
