/**
 * Cache hors ligne des médias de l'écran de veille (règle 2 : offline-capable).
 *
 * Stockage : Cache API, disponible car l'APK sert l'app depuis une origine
 * sécurisée (https://appassets.androidplatform.net). Les médias Supabase sont
 * publics et servis avec CORS : la réponse est lisible et peut être rejouée en
 * blob. Un hôte sans CORS n'est simplement pas mis en cache (lecture réseau).
 *
 * Lecture : les images viennent du cache dès qu'elles y sont (affichage
 * instantané, zéro réseau) ; les vidéos, lourdes, ne sont lues depuis le cache
 * que hors ligne, pour ne pas charger 50 Mo en mémoire à chaque mise en veille.
 */

const CACHE_NAME = 'ema-ecran-veille-v1'

function cacheAvailable() {
  return typeof caches !== 'undefined' && typeof caches.open === 'function'
}

let syncing = null

/**
 * Télécharge les médias manquants et purge ceux qui ne servent plus.
 * Séquentiel : une borne en 4G ne doit pas saturer sa bande passante.
 *
 * @param {string[]} urls
 * @returns {Promise<{ cached: number, failed: string[] }>}
 */
export async function syncMediaCache(urls) {
  if (!cacheAvailable()) return { cached: 0, failed: [] }
  // Une seule synchro à la fois : la suivante attend la fin de la précédente.
  const previous = syncing ?? Promise.resolve()
  const run = previous.catch(() => {}).then(async () => {
    const cache = await caches.open(CACHE_NAME)
    const wanted = new Set(urls)
    const failed = []
    let cached = 0

    for (const request of await cache.keys()) {
      if (!wanted.has(request.url)) await cache.delete(request)
    }

    for (const url of wanted) {
      if (await cache.match(url)) {
        cached += 1
        continue
      }
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await cache.put(url, res)
        cached += 1
      } catch (err) {
        failed.push(url)
        console.debug('[mediaCache] Préchargement impossible :', url, err?.message ?? err)
      }
    }
    return { cached, failed }
  })
  syncing = run
  try {
    return await run
  } finally {
    if (syncing === run) syncing = null
  }
}

function isVideo(url) {
  return /\.(mp4|webm)(\?|$)/i.test(url)
}

/**
 * URL à donner à <img>/<video> : une URL blob: si le média est en cache et doit
 * en être lu, sinon l'URL réseau. L'appelant révoque les URLs blob obtenues.
 *
 * @param {string} url
 * @param {{ online?: boolean }} [options]
 * @returns {Promise<{ src: string, revoke: (() => void) | null }>}
 */
export async function resolveMediaUrl(url, { online = navigator.onLine } = {}) {
  if (!url || !cacheAvailable() || (online && isVideo(url))) return { src: url, revoke: null }
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (!hit) return { src: url, revoke: null }
    const objectUrl = URL.createObjectURL(await hit.blob())
    return { src: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) }
  } catch {
    return { src: url, revoke: null }
  }
}

export const MEDIA_CACHE_NAME = CACHE_NAME
