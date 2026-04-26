import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useForm } from '../context/FormContext'
import { AppHeader } from '../components/AppHeader'
import { IconCheckCircle, IconXCircle, IconRefresh, IconHome } from '../components/Icons'

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

          {/* Icône SVG */}
          <div className={`confirmation-icon ${isSuccess ? 'confirmation-icon--ok' : 'confirmation-icon--err'}`}>
            {isSuccess
              ? <IconCheckCircle size={52} className="conf-icon-ok"  />
              : <IconXCircle     size={52} className="conf-icon-err" />
            }
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

          {isSuccess ? (
            <button className="btn-primary btn-start" onClick={() => navigate('/')}>
              <IconHome size={18} />
              Retour à l'accueil
            </button>
          ) : (
            <button className="btn-primary btn-start" onClick={() => navigate(-1)}>
              <IconRefresh size={18} />
              Réessayer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
