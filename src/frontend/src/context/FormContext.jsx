import { createContext, useContext } from 'react'

/**
 * FormContext — objet de contexte + hook d'accès.
 * Le provider vit dans `FormProvider.jsx` (contrainte Fast Refresh :
 * un module ne doit exporter que des composants).
 */
export const FormContext = createContext(null)

export function useForm() {
  const ctx = useContext(FormContext)
  if (!ctx) throw new Error('useForm must be inside FormProvider')
  return ctx
}
