import { useNavigate } from 'react-router-dom'
import { useForm } from '../context/FormContext'

export function WelcomePage() {
  const navigate = useNavigate()
  const { reset } = useForm()

  const start = () => {
    reset()
    navigate('/form')
  }

  return (
    <div className="welcome-page">
      <div className="welcome-card">
        <div className="welcome-logo">🏠</div>

        <div className="welcome-text">
          <h1 className="welcome-title">Estimer Mes Aides</h1>
          <p className="welcome-subtitle">
            Découvrez les aides auxquelles vous avez droit pour financer vos travaux de rénovation énergétique.
          </p>
        </div>

        <div className="welcome-stats">
          <div className="stat-badge">
            <span className="stat-icon">📋</span>
            <span>15 questions</span>
          </div>
          <div className="stat-badge">
            <span className="stat-icon">⚡</span>
            <span>5 minutes</span>
          </div>
          <div className="stat-badge">
            <span className="stat-icon">🔒</span>
            <span>100 % gratuit</span>
          </div>
        </div>

        <button className="btn-primary btn-start" onClick={start}>
          Commencer →
        </button>

        <p className="welcome-legal">
          Vos données sont traitées confidentiellement et ne sont jamais revendues.
        </p>
      </div>
    </div>
  )
}
