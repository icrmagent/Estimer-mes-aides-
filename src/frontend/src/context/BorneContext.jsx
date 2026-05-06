import { createContext, useContext, useReducer, useMemo } from 'react'

/**
 * BorneContext — gère la config borne V2, la langue active et le formulaire dynamique.
 * Remplace useFormConfig pour le front-office borne V2.
 *
 * Structure config borne (depuis GET /api/bornes/:id/config) :
 * {
 *   borne: { id, idBorne, langueDefaut, adresse, commercant, regie, installateur },
 *   formulaire: { id, label, version, dureeRetourAccueil, annulationInactivite,
 *                 pageDebutConfig, pageFinConfig, questions: [...] }
 * }
 */

const BorneContext = createContext(null)

const initial = {
  borne: null,          // données de la borne
  formulaire: null,     // formulaire actif
  questions: [],        // questions triées par orderPage
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

  const ctx = useMemo(() => ({
    ...state,
    setConfig: (borne, formulaire) => dispatch({ type: 'SET_CONFIG', borne, formulaire }),
    setLangue: (langue) => dispatch({ type: 'SET_LANGUE', langue }),
    setError: (error) => dispatch({ type: 'SET_ERROR', error }),
    resetLangue: () => dispatch({ type: 'RESET_LANGUE' }),
  }), [state])

  return <BorneContext.Provider value={ctx}>{children}</BorneContext.Provider>
}

export function useBorne() {
  const ctx = useContext(BorneContext)
  if (!ctx) throw new Error('useBorne must be inside BorneProvider')
  return ctx
}
