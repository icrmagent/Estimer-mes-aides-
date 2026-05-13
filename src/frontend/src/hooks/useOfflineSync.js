import { useCallback } from 'react'
import { get, set, del } from 'idb-keyval'

const QUEUE_KEY = 'ema_v2_offline_queue'

// Verrou en mémoire pour empêcher syncPending() concurrent (StrictMode / event "online" rapides).
let syncInFlight = false

/**
 * Hook useOfflineSync — stockage offline-first des enregistrements V2 via IndexedDB.
 * Sauvegarde avant l'envoi API, synchronise au retour en ligne (R3.7, R7.3).
 */
export function useOfflineSync() {
  /**
   * Sauvegarde un enregistrement en IndexedDB avant l'envoi API.
   * Retourne le `_id` local généré, à passer ensuite à markSynced() après un POST direct
   * réussi pour éviter qu'un sync ultérieur ne reposte le même enregistrement.
   * @param {object} enregistrement - { borneId, formulaireId, langueUtilisee, reponses }
   * @returns {Promise<string|null>} _id local, ou null en cas d'échec IndexedDB
   */
  const saveOffline = useCallback(async (enregistrement) => {
    try {
      const queue = (await get(QUEUE_KEY)) || []
      const entry = {
        ...enregistrement,
        _id: crypto.randomUUID(),
        _savedAt: new Date().toISOString(),
        _synced: false,
      }
      queue.push(entry)
      await set(QUEUE_KEY, queue)
      return entry._id
    } catch (err) {
      console.warn('[useOfflineSync] Failed to save offline:', err)
      return null
    }
  }, [])

  /**
   * Marque un enregistrement comme synchronisé et le retire de la queue.
   * @param {string} localId - _id de l'entrée locale
   */
  const markSynced = useCallback(async (localId) => {
    try {
      const queue = (await get(QUEUE_KEY)) || []
      const updated = queue.filter(e => e._id !== localId)
      await set(QUEUE_KEY, updated)
    } catch (err) {
      console.warn('[useOfflineSync] Failed to mark synced:', err)
    }
  }, [])

  /**
   * Récupère tous les enregistrements non synchronisés.
   * @returns {Promise<Array>}
   */
  const getPendingQueue = useCallback(async () => {
    try {
      const queue = (await get(QUEUE_KEY)) || []
      return queue.filter(e => !e._synced)
    } catch {
      return []
    }
  }, [])

  /**
   * Synchronise automatiquement les enregistrements en attente quand la connexion revient.
   * @param {string} apiUrl - base URL de l'API
   */
  const syncPending = useCallback(async (apiUrl) => {
    if (!navigator.onLine) return
    if (syncInFlight) return // verrou anti-concurrent (StrictMode, événements online rapprochés)
    syncInFlight = true

    try {
      const pending = await getPendingQueue()
      if (pending.length === 0) return

      const token = localStorage.getItem('borne_token')
      if (!token) return

      for (const entry of pending) {
        try {
          const { _id, _savedAt, _synced, ...enregistrement } = entry
          const res = await fetch(`${apiUrl}/api/enregistrements`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(enregistrement),
          })

          if (res.ok) {
            await markSynced(_id)
          }
        } catch {
          // Garder en queue pour la prochaine tentative
        }
      }
    } finally {
      syncInFlight = false
    }
  }, [getPendingQueue, markSynced])

  return { saveOffline, markSynced, getPendingQueue, syncPending }
}
