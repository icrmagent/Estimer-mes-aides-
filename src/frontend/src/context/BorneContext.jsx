import { createContext, useContext } from 'react'

/**
 * BorneContext — objet de contexte + hook d'accès.
 *
 * Le provider vit dans `BorneProvider.jsx` : un module ne doit exporter que des
 * composants pour que le Fast Refresh de Vite fonctionne, d'où la séparation
 * contexte/hook (ici) et composant (là-bas).
 *
 * Structure config borne (depuis GET /api/bornes/:id/config) :
 * {
 *   borne: { id, idBorne, langueDefaut, adresse, commercant, regie, installateur },
 *   formulaire: { id, label, version, dureeRetourAccueil, annulationInactivite,
 *                 pageDebutConfig, pageFinConfig, questions: [...] },
 *   ecranVeille: { id, delaiActivation, transition, ..., diapositives: [...] } | null
 * }
 */
export const BorneContext = createContext(null)

export function useBorne() {
  const ctx = useContext(BorneContext)
  if (!ctx) throw new Error('useBorne must be inside BorneProvider')
  return ctx
}
