import { useState, useEffect } from 'react'
import { useBorne } from '../context/BorneContext.jsx'

const CACHE_KEY = 'ema_borne_config'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h en ms

/**
 * Charge la config borne depuis l'API ou le cache localStorage (TTL 24h).
 * Nécessite un JWT AdminBorne valide dans localStorage ('borne_token').
 *
 * @param {string} borneId - UUID de la borne
 * @param {string} apiUrl - base URL de l'API
 */
export function useBorneConfig(borneId, apiUrl) {
  const { setConfig, setError } = useBorne()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    if (!borneId) return

    async function load() {
      setLoading(true)
      setLoadError(null)

      // 1. Vérifier le cache localStorage
      try {
        const cached = localStorage.getItem(`${CACHE_KEY}_${borneId}`)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < CACHE_TTL) {
            setConfig(data.borne, data.formulaire)
            setLoading(false)
            // Recharger en arrière-plan pour mettre à jour le cache
            refreshInBackground(borneId, apiUrl)
            return
          }
        }
      } catch {
        // Cache corrompu — ignorer et charger depuis l'API
      }

      // 2. Charger depuis l'API
      await fetchFromApi(borneId, apiUrl)
    }

    load()
  }, [borneId, apiUrl])

  async function fetchFromApi(id, base) {
    const token = localStorage.getItem('borne_token')
    if (!token) {
      const err = 'Non authentifié — veuillez vous connecter'
      setError(err)
      setLoadError(err)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${base || ''}/api/bornes/${id}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        // Règle métier : la borne reste toujours connectée — ne pas supprimer le token.
        // Utiliser le cache existant si disponible.
        try {
          const cached = localStorage.getItem(`${CACHE_KEY}_${id}`)
          if (cached) {
            const { data } = JSON.parse(cached)
            setConfig(data.borne, data.formulaire)
            setLoading(false)
            return
          }
        } catch { /* ignore */ }
        const err = 'Configuration indisponible — veuillez contacter l\'administrateur'
        setError(err)
        setLoadError(err)
        setLoading(false)
        return
      }

      if (res.status === 403) {
        const err = 'Borne désactivée ou accès refusé'
        setError(err)
        setLoadError(err)
        setLoading(false)
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      const data = json.data || json

      // Mettre en cache
      localStorage.setItem(`${CACHE_KEY}_${id}`, JSON.stringify({
        data,
        timestamp: Date.now(),
      }))

      setConfig(data.borne, data.formulaire)
    } catch (err) {
      // Fallback sur le cache même expiré
      try {
        const cached = localStorage.getItem(`${CACHE_KEY}_${id}`)
        if (cached) {
          const { data } = JSON.parse(cached)
          setConfig(data.borne, data.formulaire)
          setLoadError('Mode hors ligne — configuration en cache')
          setLoading(false)
          return
        }
      } catch { /* ignore */ }

      const errMsg = 'Impossible de charger la configuration de la borne'
      setError(errMsg)
      setLoadError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  async function refreshInBackground(id, base) {
    const token = localStorage.getItem('borne_token')
    if (!token) return
    try {
      const res = await fetch(`${base || ''}/api/bornes/${id}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      const data = json.data || json
      localStorage.setItem(`${CACHE_KEY}_${id}`, JSON.stringify({
        data,
        timestamp: Date.now(),
      }))
      setConfig(data.borne, data.formulaire)
    } catch { /* silently ignore background refresh errors */ }
  }

  return { loading, loadError }
}
