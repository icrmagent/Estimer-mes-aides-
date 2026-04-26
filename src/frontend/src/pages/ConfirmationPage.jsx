import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useForm } from '../context/FormContext'
import { AppHeader } from '../components/AppHeader'

export function ConfirmationPage() {
  const navigate = useNavigate()
  const { result } = useForm()

  useEffect(() => {
    if (!result) navigate('/')
  }, [result])

  if (!result) return null

  const isSuccess = result.ok

  return (
    <div className="confirmation-page">
      <AppHeader />

      <div className="confirmation-body">
        <div className="confirmation-card">
          <div className={`confirmation-icon ${isSuccess ? 'confirmation-icon--ok' : 'confirmation-icon--err'}`}>
            {isSuccess ? '✓' : '✕'}
          </div>

          {isSuccess ? (
            <>
              <h1 className="confirmation-title">Demande envoyée !</h1>
              {result.offline ? (
                <p className="confirmation-text">
                  Votre demande a été <strong>sauvegardée hors-ligne</strong>. Elle sera transmise automatiquement dès que vous retrouverez une connexion.
                </p>
              ) : (
                <p className="confirmation-text">
                  Votre dossier a bien été enregistré. Un conseiller vous contactera dans les <strong>48 heures</strong> pour vous présenter les aides disponibles.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="confirmation-title">Une erreur est survenue</h1>
              <p className="confirmation-text">
                Impossible d'envoyer votre demande. Vérifiez votre connexion et réessayez.
              </p>
            </>
          )}

          <button className="btn-primary btn-start" onClick={() => navigate('/')}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  )
}
