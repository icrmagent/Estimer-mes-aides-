import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useForm } from '../context/FormContext'
import { AppHeader } from '../components/AppHeader'
import { IconCheckCircle, IconXCircle, IconRefresh, IconHome } from '../components/Icons'

const REDIRECT_DELAY = 10

export function ConfirmationPage() {
  const navigate = useNavigate()
  const { result } = useForm()
  const [countdown, setCountdown] = useState(REDIRECT_DELAY)

  useEffect(() => {
    if (!result) navigate('/')
  }, [result])

  useEffect(() => {
    if (!result?.ok) return
    if (countdown === 0) {
      navigate('/')
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [result?.ok, countdown, navigate])

  if (!result) return null

  const isSuccess = result.ok

  return (
    <div className="confirmation-page">
      <AppHeader />

      <div className="confirmation-body">
        <div className="confirmation-card">

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

          {isSuccess && (
            <div className="countdown-wrap">
              <div className="countdown-bar">
                <div
                  className="countdown-fill"
                  style={{ width: `${(countdown / REDIRECT_DELAY) * 100}%` }}
                />
              </div>
              <p className="countdown-label">
                Retour automatique dans {countdown} seconde{countdown !== 1 ? 's' : ''}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
