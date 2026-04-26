import { useForm } from '../context/FormContext'

export function ProgressBar() {
  const { currentStep, totalSteps, currentSub } = useForm()
  if (!currentSub) return null

  const pct      = Math.round(((currentStep + 1) / totalSteps) * 100)
  const stepInCat = (currentSub.order ?? 0) + 1

  return (
    <div className="progress-header">
      <div className="progress-info">
        <span className="progress-category">{currentSub.categoryName}</span>
        <span className="progress-step">{stepInCat}/{currentSub.totalInCat}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
