import { useEffect, useRef, useCallback } from 'react'

const ACTIVITY_EVENTS = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'keydown', 'scroll', 'click']

/**
 * Hook useInactivity — surveille l'inactivité et déclenche des callbacks.
 *
 * @param {object} params
 * @param {number} params.delaiAnnulation - annulation_inactivite en secondes (annule la session active)
 * @param {number} params.delaiRetourAccueil - duree_retour_accueil en secondes (retour page de début sans session)
 * @param {function} params.onAnnulation - callback : annuler la session en cours
 * @param {function} params.onRetourAccueil - callback : retour page de début
 * @param {boolean} params.sessionActive - true si une session visiteur est en cours
 * @param {boolean} params.actif - activer/désactiver la surveillance (défaut: true)
 */
export function useInactivity({
  delaiAnnulation = 120,
  delaiRetourAccueil = 30,
  onAnnulation,
  onRetourAccueil,
  sessionActive = true,
  actif = true,
}) {
  const timerRef = useRef(null)

  const resetTimer = useCallback(() => {
    if (!actif) return
    clearTimeout(timerRef.current)

    const delai = sessionActive ? delaiAnnulation : delaiRetourAccueil
    const callback = sessionActive ? onAnnulation : onRetourAccueil

    if (!callback || delai <= 0) return

    timerRef.current = setTimeout(() => {
      callback()
    }, delai * 1000)
  }, [actif, sessionActive, delaiAnnulation, delaiRetourAccueil, onAnnulation, onRetourAccueil])

  useEffect(() => {
    if (!actif) {
      clearTimeout(timerRef.current)
      return
    }

    // Démarrer le timer initial
    resetTimer()

    // Réinitialiser sur toute activité tactile/souris
    ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true })
    })

    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, resetTimer)
      })
    }
  }, [actif, resetTimer])

  return { resetTimer }
}
