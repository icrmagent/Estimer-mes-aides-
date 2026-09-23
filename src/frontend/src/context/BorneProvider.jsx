import { useReducer, useMemo, useState, useEffect } from 'react'
import { BorneContext } from './BorneContext.jsx'

/**
 * BorneProvider — gère la config borne V2, la langue active, le formulaire
 * dynamique et le statut de connexion réseau (online/offline).
 * Remplace useFormConfig pour le front-office borne V2.
 */

const initial = {
  borne: null,          // données de la borne
  formulaire: null,     // formulaire actif
  questions: [],        // questions triées par orderPage
  ecranVeille: null,    // diaporama de veille (null = pas de veille)
  langue: 'fr',         // langue active du visiteur (réinitialisée à chaque session)
  configLoaded: false,
  configError: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONFIG':
      return {
        ...state,
        borne: action.borne,
        formulaire: action.formulaire,
        questions: [...(action.formulaire?.questions || [])].sort(
          (a, b) => (a.orderPage || 0) - (b.orderPage || 0)
        ),
        langue: action.borne?.langueDefaut || 'fr',
        configLoaded: true,
        configError: null,
      }
    case 'SET_ECRAN_VEILLE':
      // Action séparée de SET_CONFIG : une mise à jour de la veille poussée en
      // temps réel ne doit ni changer de formulaire ni réinitialiser la langue
      // d'un visiteur en pleine saisie.
      return { ...state, ecranVeille: action.ecranVeille ?? null }
    case 'SET_LANGUE':
      return { ...state, langue: action.langue }
    case 'SET_ERROR':
      return { ...state, configError: action.error, configLoaded: false }
    case 'RESET_LANGUE':
      // Réinitialise la langue à la langue par défaut de la borne (nouvelle session visiteur)
      return { ...state, langue: state.borne?.langueDefaut || 'fr' }
    default:
      return state
  }
}

export function BorneProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)

  // Suivi du statut réseau (online/offline)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const ctx = useMemo(() => ({
    ...state,
    isOnline,
    setConfig: (borne, formulaire) => dispatch({ type: 'SET_CONFIG', borne, formulaire }),
    setEcranVeille: (ecranVeille) => dispatch({ type: 'SET_ECRAN_VEILLE', ecranVeille }),
    setLangue: (langue) => dispatch({ type: 'SET_LANGUE', langue }),
    setError: (error) => dispatch({ type: 'SET_ERROR', error }),
    resetLangue: () => dispatch({ type: 'RESET_LANGUE' }),
  }), [state, isOnline])

  return <BorneContext.Provider value={ctx}>{children}</BorneContext.Provider>
}
