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
        {/* Left — panneau décoratif (tablet landscape) / top (mobile) */}
        <div className="welcome-hero-panel">
          <div className="welcome-hero-icon">
            <IconHome size={56} className="welcome-home-icon" />
          </div>
          <div className="welcome-stats">
            <div className="stat-badge">
              <IconClipboard size={15} className="stat-icon" />
              <span>15 questions</span>
            </div>
            <div className="stat-badge">
              <IconBolt size={15} className="stat-icon" />
              <span>5 minutes</span>
            </div>
            <div className="stat-badge">
              <IconShield size={15} className="stat-icon" />
              <span>100 % gratuit</span>
            </div>
          </div>
        </div>

        {/* Right — contenu principal */}
        <div className="welcome-content">
          <div className="welcome-text">
            <h2 className="welcome-title">Estimez vos aides en 5 minutes</h2>
            <p className="welcome-subtitle">
              Découvrez les aides auxquelles vous avez droit pour financer
              vos travaux de rénovation énergétique.
            </p>
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
    </div>
  )
}
