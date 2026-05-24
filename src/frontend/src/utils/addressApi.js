// Auto-complétion d'adresse — approche hybride sans clé API.
// - FR : api-adresse.data.gouv.fr (Base Adresse Nationale, officielle INSEE)
// - Autres pays : Photon (komoot, basé OpenStreetMap)
// Toutes les réponses sont normalisées au format { id, label, adresse, codePostal, ville, countryCode }.

const BAN_URL = 'https://api-adresse.data.gouv.fr/search/'
const PHOTON_URL = 'https://photon.komoot.io/api/'

/**
 * Cherche des adresses pour `query`, filtrées par `countryCode` (ISO 3166-1 alpha-2).
 * Retourne au plus 5 suggestions normalisées.
 * En cas d'erreur réseau ou de timeout, retourne [] (fallback silencieux).
 */
export async function searchAddress(query, countryCode = 'FR', signal) {
  const q = (query || '').trim()
  if (q.length < 3) return []

  try {
    if (countryCode === 'FR') {
      return await searchBAN(q, signal)
    }
    return await searchPhoton(q, countryCode, signal)
  } catch {
    return []
  }
}

async function searchBAN(query, signal) {
  const url = `${BAN_URL}?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`
  const res = await fetch(url, { signal })
  if (!res.ok) return []

  const data = await res.json()
  const features = Array.isArray(data?.features) ? data.features : []

  return features.map((f, idx) => {
    const props = f.properties || {}
    return {
      id: props.id || `ban-${idx}`,
      label: props.label || '',
      adresse: props.name || [props.housenumber, props.street].filter(Boolean).join(' ').trim() || props.label || '',
      codePostal: props.postcode || '',
      ville: props.city || '',
      countryCode: 'FR',
    }
  }).filter(s => s.label)
}

async function searchPhoton(query, countryCode, signal) {
  // Photon ne supporte pas de filtre serveur par pays ; on demande plus de
  // résultats et on filtre côté client via properties.countrycode (ISO alpha-2).
  const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=15&lang=fr`
  const res = await fetch(url, { signal })
  if (!res.ok) return []

  const data = await res.json()
  const features = Array.isArray(data?.features) ? data.features : []
  const target = countryCode.toUpperCase()

  return features
    .filter(f => (f.properties?.countrycode || '').toUpperCase() === target)
    .slice(0, 5)
    .map((f, idx) => {
      const props = f.properties || {}
      const adresseParts = [props.housenumber, props.street || props.name].filter(Boolean)
      const adresse = adresseParts.join(' ').trim() || props.name || ''
      const ville = props.city || props.town || props.village || props.county || ''
      const codePostal = props.postcode || ''
      const labelParts = [adresse || props.name, [codePostal, ville].filter(Boolean).join(' ')].filter(Boolean)
      return {
        id: `photon-${props.osm_id || idx}`,
        label: labelParts.join(', '),
        adresse,
        codePostal,
        ville,
        countryCode: target,
      }
    })
    .filter(s => s.label)
}
