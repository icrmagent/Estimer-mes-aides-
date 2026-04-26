import { useForm } from '../context/FormContext'

export function ProgressBar() {
  const { currentStep, totalSteps, currentSub } = useForm()
  if (!currentSub) return null

  return (
    <>
      <div className="step-indicator">
        <div className="step-badge">{currentStep + 1}</div>
        <span className="step-name">{currentSub.categoryName}</span>
      </div>
      <div className="step-line" />
      <div className="step-progress-row">
        <span className="step-counter">étape {currentStep + 1} / {totalSteps}</span>
      </div>
    </>
  )
}
