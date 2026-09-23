import { useState, useEffect, useRef } from 'react'
import { useBorne } from '../context/BorneContext.jsx'

const CACHE_KEY = 'ema_borne_config'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h en ms

// Événement émis quand le back-office signale une mise à jour de l'écran de veille
// (Pusher `ecran-veille.maj`, cf. App.jsx). Découple le canal temps réel du hook.
const ECRAN_VEILLE_REFRESH_EVENT = 'ema:ecran-veille-refresh'

/** Demande au hook monté de recharger l'écran de veille depuis l'API. */
export function requestEcranVeilleRefresh() {
  window.dispatchEvent(new Event(ECRAN_VEILLE_REFRESH_EVENT))
}

// L'API dort après 15 min d'inactivité (hébergement free) et met ~50 s à répondre
// au premier appel. Le timeout laisse la marge du réveil sans figer la borne
// indéfiniment ; `wakingUp` permet d'en informer l'utilisateur au-delà de quelques
// secondes plutôt que de laisser un écran de chargement muet.
const REQUEST_TIMEOUT_MS = 60_000
const WAKE_HINT_MS = 4_000

/**
 * Charge la config borne depuis l'API ou le cache localStorage (TTL 24h).
 * Nécessite un JWT AdminBorne valide dans localStorage ('borne_token').
 *
 * @param {string} borneId - UUID de la borne
 * @param {string} apiUrl - base URL de l'API
 * @returns {{ loading: boolean, loadError: string|null, wakingUp: boolean }}
 */
export function useBorneConfig(borneId, apiUrl) {
  const { setConfig, setError, setEcranVeille } = useBorne()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [wakingUp, setWakingUp] = useState(false)

  // Les actions du contexte borne sont recréées à chaque changement d'état du
  // provider. On les lit via une ref pour que le chargement ne dépende que de
  // (borneId, apiUrl) et ne se relance pas en boucle sur son propre setConfig.
  const borneActionsRef = useRef({ setConfig, setError, setEcranVeille })
  useEffect(() => {
    borneActionsRef.current = { setConfig, setError, setEcranVeille }
  })

  useEffect(() => {
    if (!borneId) return

    let cancelled = false
    let wakeTimer = null
    const pending = new Set()

    function startWakeHint() {
      clearTimeout(wakeTimer)
      wakeTimer = setTimeout(() => {
        if (!cancelled) setWakingUp(true)
      }, WAKE_HINT_MS)
    }

    function stopWakeHint() {
      clearTimeout(wakeTimer)
      wakeTimer = null
      if (!cancelled) setWakingUp(false)
    }

    /** fetch borné dans le temps : sans AbortController un réveil bloqué fige l'écran. */
    async function timedFetch(url, options) {
      const controller = new AbortController()
      pending.add(controller)
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        return await fetch(url, { ...options, signal: controller.signal })
      } finally {
        clearTimeout(timer)
        pending.delete(controller)
      }
    }

    function applyCache(id) {
      const cached = localStorage.getItem(`${CACHE_KEY}_${id}`)
      if (!cached) return false
      const { data } = JSON.parse(cached)
      applyData(data)
      return true
    }

    // Un cache antérieur à l'écran de veille n'a pas la clé : pas de veille, pas d'erreur.
    function applyData(data) {
      borneActionsRef.current.setConfig(data.borne, data.formulaire)
      borneActionsRef.current.setEcranVeille?.(data.ecranVeille ?? null)
    }

    function fail(message) {
      borneActionsRef.current.setError(message)
      setLoadError(message)
      setLoading(false)
    }

    async function fetchFromApi(id, base) {
      const token = localStorage.getItem('borne_token')
      if (!token) {
        fail('Non authentifié — veuillez vous connecter')
        return
      }

      startWakeHint()
      try {
        const res = await timedFetch(`${base || ''}/api/bornes/${id}/config`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return

        if (res.status === 401) {
          // Règle métier : la borne reste toujours connectée — ne pas supprimer le token.
          // Utiliser le cache existant si disponible.
          try {
            if (applyCache(id)) {
              setLoading(false)
              return
            }
          } catch (cacheErr) {
            console.warn('[useBorneConfig] Cache illisible après 401 :', cacheErr?.message ?? cacheErr)
          }
          fail('Configuration indisponible — veuillez contacter l\'administrateur')
          return
        }

        if (res.status === 403) {
          fail('Borne désactivée ou accès refusé')
          return
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()
        if (cancelled) return
        const data = json.data || json

        // Mettre en cache
        localStorage.setItem(`${CACHE_KEY}_${id}`, JSON.stringify({
          data,
          timestamp: Date.now(),
        }))

        applyData(data)
      } catch (err) {
        if (cancelled) return
        const timedOut = err?.name === 'AbortError'
        console.warn('[useBorneConfig] Chargement API échoué :', err?.message ?? err)

        // Fallback sur le cache même expiré
        try {
          if (applyCache(id)) {
            setLoadError('Mode hors ligne — configuration en cache')
            setLoading(false)
            return
          }
        } catch (cacheErr) {
          console.warn('[useBorneConfig] Cache de secours illisible :', cacheErr?.message ?? cacheErr)
        }

        fail(timedOut
          ? 'Le serveur ne répond pas (délai dépassé). Vérifiez la connexion de la borne, puis réessayez.'
          : 'Impossible de charger la configuration de la borne')
      } finally {
        stopWakeHint()
        if (!cancelled) setLoading(false)
      }
    }

    async function refreshInBackground(id, base, { ecranVeilleOnly = false } = {}) {
      const token = localStorage.getItem('borne_token')
      if (!token) return
      try {
        const res = await timedFetch(`${base || ''}/api/bornes/${id}/config`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        const data = json.data || json
        localStorage.setItem(`${CACHE_KEY}_${id}`, JSON.stringify({
          data,
          timestamp: Date.now(),
        }))
        if (ecranVeilleOnly) borneActionsRef.current.setEcranVeille?.(data.ecranVeille ?? null)
        else applyData(data)
      } catch (err) {
        // Rafraîchissement opportuniste : la config en cache reste valide.
        console.debug('[useBorneConfig] Rafraîchissement en arrière-plan échoué :', err?.message ?? err)
      }
    }

    async function load() {
      setLoading(true)
      setLoadError(null)
      setWakingUp(false)

      // 1. Vérifier le cache localStorage
      try {
        const cached = localStorage.getItem(`${CACHE_KEY}_${borneId}`)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < CACHE_TTL) {
            applyData(data)
            setLoading(false)
            // Recharger en arrière-plan pour mettre à jour le cache
            refreshInBackground(borneId, apiUrl)
            return
          }
        }
      } catch (cacheErr) {
        console.warn('[useBorneConfig] Cache corrompu, rechargement depuis l\'API :', cacheErr?.message ?? cacheErr)
      }

      // 2. Charger depuis l'API
      await fetchFromApi(borneId, apiUrl)
    }

    load()

    const onEcranVeilleRefresh = () => refreshInBackground(borneId, apiUrl, { ecranVeilleOnly: true })
    window.addEventListener(ECRAN_VEILLE_REFRESH_EVENT, onEcranVeilleRefresh)

    return () => {
      window.removeEventListener(ECRAN_VEILLE_REFRESH_EVENT, onEcranVeilleRefresh)
      cancelled = true
      clearTimeout(wakeTimer)
      pending.forEach((controller) => controller.abort())
      pending.clear()
    }
  }, [borneId, apiUrl])

  return { loading, loadError, wakingUp }
}
