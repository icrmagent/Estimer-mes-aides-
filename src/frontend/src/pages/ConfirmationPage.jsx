import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { t } from '../utils/i18n.js'
import { useOfflineSync } from '../hooks/useOfflineSync.js'
import InactivityManager from '../components/InactivityManager.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * ConfirmationPage V2 — affiche page_fin_config dans la langue du visiteur.
 * Retour automatique à StartPage après duree_retour_accueil secondes (R3.7).
 * Synchronise les enregistrements offline au retour en ligne.
 */
export function ConfirmationPage() {
  const navigate = useNavigate()
  const { formulaire, langue, resetLangue } = useBorne()
  const { reset } = useForm()
  const { syncPending } = useOfflineSync()

  const config = formulaire?.pageFinConfig || {}
  const titre = t(config.titre, langue) || 'Merci pour votre demande !'
  const message = t(config.message, langue) || 'Un conseiller vous contactera dans les 48 heures.'
  const duree = formulaire?.dureeRetourAccueil || 10

  const [countdown, setCountdown] = useState(duree)

  // Countdown retour accueil automatique (R3.7 critère 35)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          handleRetour()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Synchroniser les enregistrements offline au retour en ligne
  useEffect(() => {
    const handleOnline = () => syncPending(API_URL)
    window.addEventListener('online', handleOnline)
    // Tenter une sync immédiate si déjà en ligne
    syncPending(API_URL)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPending])

  function handleRetour() {
    reset()
    resetLangue()
    navigate('/start', { replace: true })
  }

  const progress = ((duree - countdown) / duree) * 100

  return (
    <InactivityManager>
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
        style={{ background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)' }}
      >
        {/* Icône succès */}
        <div
          className="w-24 h-24 lg:w-32 lg:h-32 rounded-full flex items-center justify-center mb-8"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          <span className="text-5xl lg:text-6xl">✓</span>
        </div>

        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight max-w-sm md:max-w-lg text-center">
          {titre}
        </h1>

        <p className="text-white/80 text-lg md:text-xl mb-12 leading-relaxed max-w-sm md:max-w-md text-center">
          {message}
        </p>

        {/* Barre de progression countdown */}
        <div className="w-full max-w-xs mb-4">
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-white/60 text-sm mt-2">
            Retour dans {countdown}s
          </p>
        </div>

        <button
          onClick={handleRetour}
          className="mt-4 px-6 py-3 bg-white text-[#5B2D8E] font-semibold rounded-xl shadow-lg hover:bg-white/90 active:scale-[0.98] transition-all"
          style={{ minHeight: '52px', fontSize: '16px' }}
        >
          Retourner à l'accueil maintenant
        </button>
      </div>
    </InactivityManager>
  )
}
