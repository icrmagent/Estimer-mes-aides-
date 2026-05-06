import { useNavigate, useLocation } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { useInactivity } from '../hooks/useInactivity.js'

/**
 * InactivityManager — intègre useInactivity dans le cycle de vie de la session.
 * Doit envelopper les pages FormPage et StartPage.
 *
 * - Sur FormPage : annule la session après annulation_inactivite secondes
 * - Sur StartPage/ConfirmationPage : retour accueil après duree_retour_accueil secondes
 */
export default function InactivityManager({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { formulaire, resetLangue } = useBorne()
  const { reset } = useForm()

  const isFormPage = location.pathname === '/form'
  const isConfirmationPage = location.pathname === '/confirmation'
  const sessionActive = isFormPage

  const delaiAnnulation = formulaire?.annulationInactivite || 120
  const delaiRetourAccueil = formulaire?.dureeRetourAccueil || 30

  function handleAnnulation() {
    // Annuler la session : effacer les réponses et retourner à la page de début
    reset()
    resetLangue()
    navigate('/start', { replace: true })
  }

  function handleRetourAccueil() {
    // Retour à la page de début dans la langue par défaut de la borne
    resetLangue()
    navigate('/start', { replace: true })
  }

  useInactivity({
    delaiAnnulation,
    delaiRetourAccueil,
    onAnnulation: handleAnnulation,
    onRetourAccueil: handleRetourAccueil,
    sessionActive,
    actif: isFormPage || isConfirmationPage,
  })

  return children
}
