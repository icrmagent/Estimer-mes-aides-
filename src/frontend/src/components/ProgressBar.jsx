import { useForm } from '../context/FormContext'
import { IconUser, IconMapPin, IconWrench } from './Icons'

const CATEGORY_ICONS = {
  'Informations Personnelles': IconUser,
  'Le Lieu des Travaux':       IconMapPin,
  'Vos Besoins':               IconWrench,
}

export function ProgressBar() {
  const { currentStep, totalSteps, currentSub } = useForm()
  if (!currentSub) return null

  const Icon = CATEGORY_ICONS[currentSub.categoryName] ?? IconUser
  const subIdx  = currentSub.order + 1
  const catTotal = currentSub.totalInCat

  return (
    <div className="step-bar">
      <div className="step-label">
        <div className="step-badge">{currentStep + 1}</div>
        <Icon size={18} className="step-icon" />
        <span className="step-name">{currentSub.categoryName}</span>
      </div>
      <div className="step-counter-row">
        <span className="step-counter">
          {subIdx}/{catTotal} · étape {currentStep + 1}/{totalSteps}
        </span>
        <div className="step-dots">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`step-dot${i === currentStep ? ' step-dot--on' : i < currentStep ? ' step-dot--done' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
