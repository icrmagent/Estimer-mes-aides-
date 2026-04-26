import { useNavigate } from 'react-router-dom'
import { useForm } from '../context/FormContext'
import { AppHeader } from '../components/AppHeader'
import { IconHome, IconClipboard, IconBolt, IconShield, IconArrowRight } from '../components/Icons'

export function WelcomePage() {
  const navigate = useNavigate()
  const { reset } = useForm()

  const start = () => {
    reset()
    navigate('/form')
  }

  return (
    <div className="welcome-page">
      <AppHeader />

      <div className="welcome-body">
        {/* Icône hero */}
        <div className="welcome-hero-icon">
          <IconHome size={52} className="welcome-home-icon" />
        </div>

        <div className="welcome-text">
          <h2 className="welcome-title">Estimez vos aides en 5 minutes</h2>
          <p className="welcome-subtitle">
            Découvrez les aides auxquelles vous avez droit pour financer vos travaux de rénovation énergétique.
          </p>
        </div>

        {/* Badges stats avec icônes SVG */}
        <div className="welcome-stats">
          <div className="stat-badge">
            <IconClipboard size={16} className="stat-icon" />
            <span>15 questions</span>
          </div>
          <div className="stat-badge">
            <IconBolt size={16} className="stat-icon" />
            <span>5 minutes</span>
          </div>
          <div className="stat-badge">
            <IconShield size={16} className="stat-icon" />
            <span>100 % gratuit</span>
          </div>
        </div>

        <button className="btn-primary btn-start" onClick={start}>
          Commencer
          <IconArrowRight size={18} className="btn-icon-right" />
        </button>

        <p className="welcome-legal">
          Vos données sont traitées confidentiellement et ne sont jamais revendues.
        </p>
      </div>
    </div>
  )
}
