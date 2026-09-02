import { createContext, useContext } from 'react'

/**
 * AuthContext — objet de contexte + hook d'accès.
 *
 * Le provider vit dans `AuthProvider.jsx` : un module ne doit exporter que des
 * composants pour que le Fast Refresh de Vite fonctionne, d'où la séparation
 * contexte/hook (ici) et composant (là-bas).
 */
export const AuthContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
