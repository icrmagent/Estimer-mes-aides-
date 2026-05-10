import { useNavigate, useLocation } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { useInactivity } from '../hooks/useInactivity.js'
import { useOfflineSync } from '../hooks/useOfflineSync.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
  const { borne, formulaire, langue, resetLangue } = useBorne()
  const { values, currentStep, reset } = useForm()
  const { saveOffline } = useOfflineSync()

  const isFormPage = location.pathname === '/form'
  const isConfirmationPage = location.pathname === '/confirmation'
  const sessionActive = isFormPage

  const delaiAnnulation = formulaire?.annulationInactivite || 120
  const delaiRetourAccueil = formulaire?.dureeRetourAccueil || 30

  async function handleAnnulation() {
    if (currentStep > 0) {
      const reponses = Object.entries(values)
        .filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))
        .map(([questionId, valeur]) => ({
          questionId,
          valeur: Array.isArray(valeur) ? valeur.join(', ') : String(valeur),
        }))

      if (reponses.length > 0) {
        const enregistrement = {
          borneId: borne?.id,
          formulaireId: formulaire?.id,
          langueUtilisee: langue,
          reponses,
        }

        await saveOffline(enregistrement)

        try {
          const token = localStorage.getItem('borne_token')
          await fetch(`${API_URL}/api/enregistrements`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(enregistrement),
          })
        } catch {
          // Failure handled by offline queue
        }
      }
    }

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
