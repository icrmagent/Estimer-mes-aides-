import { useForm } from '../context/FormContext'

export function NavigationBar({ onSubmit }) {
  const { currentStep, totalSteps, isStepValid, nextStep, prevStep, submitting } = useForm()
  const isFirst = currentStep === 0
  const isLast  = currentStep === totalSteps - 1

  return (
    <nav className="nav-bar">
      <button
        type="button"
        className="btn-secondary"
        onClick={prevStep}
        disabled={isFirst || submitting}
        aria-label="Étape précédente"
      >
        ← Précédent
      </button>

      {isLast ? (
        <button
          type="button"
          className="btn-primary"
          onClick={onSubmit}
          disabled={!isStepValid || submitting}
          aria-label="Envoyer le formulaire"
        >
          {submitting ? 'Envoi…' : 'Envoyer ✓'}
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary"
          onClick={nextStep}
          disabled={!isStepValid || submitting}
          aria-label="Étape suivante"
        >
          Suivant →
        </button>
      )}
    </nav>
  )
}
