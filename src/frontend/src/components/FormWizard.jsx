import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { useOfflineSync } from '../hooks/useOfflineSync.js'
import StepRenderer from './StepRenderer.jsx'
import StepBadge from './StepBadge.jsx'
import LanguageSelector from './LanguageSelector.jsx'
import ExitButton from './ExitButton.jsx'
import ilaLogo from '../assets/logo.png'
import { API_URL } from '../services/api.js'

/**
 * FormWizard — gère la navigation multi-étapes du formulaire borne.
 * Encapsule la logique de progression sur les N étapes (15 par défaut).
 * Délègue le rendu de chaque étape à StepRenderer.
 *
 * Règles :
 * - Touch targets ≥ 48px (minHeight: '52px')
 * - Font-size inputs ≥ 16px (géré dans StepRenderer/FieldRenderer)
 * - Couleur primaire #5B2D8E
 * - Pas de window.open(), alert(), confirm()
 */
export default function FormWizard() {
  const navigate = useNavigate()
  const { borne, formulaire, questions, langue } = useBorne()
  const {
    values,
    setValue,
    currentStep,
    nextStep,
    prevStep,
    setResult,
    setSubmitting,
    submitting,
  } = useForm()
  const { saveOffline } = useOfflineSync()

  const totalSteps = questions.length
  const currentQuestion = questions[currentStep] || null

  // Validation de l'étape courante
  const isStepValid = useCallback(() => {
    if (!currentQuestion) return true
    if (!currentQuestion.obligatoire) return true
    const val = values[currentQuestion.id]
    if (val === undefined || val === null || val === '') return false
    if (Array.isArray(val) && val.length === 0) return false
    return true
  }, [currentQuestion, values])

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      nextStep()
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    const reponses = Object.entries(values)
      .filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))
      .map(([questionId, valeur]) => ({
        questionId,
        valeur: Array.isArray(valeur) ? valeur.join(', ') : String(valeur),
      }))

    const enregistrement = {
      borneId: borne?.id,
      formulaireId: formulaire?.id,
      langueUtilisee: langue,
      reponses,
    }

    // Offline-first : sauvegarder en IndexedDB avant l'envoi API
    await saveOffline(enregistrement)

    try {
      const token = localStorage.getItem('borne_token')
      const res = await fetch(`${API_URL}/api/enregistrements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(enregistrement),
      })

      if (res.ok) {
        const data = await res.json()
        setResult({ ok: true, data: data.data })
      } else {
        setResult({ ok: true, offline: true })
      }
    } catch {
      setResult({ ok: true, offline: true })
    }

    setSubmitting(false)
    navigate('/confirmation')
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement du formulaire...</p>
      </div>
    )
  }

  const isLast = currentStep === totalSteps - 1

  return (
    <div className="form-wizard min-h-screen flex flex-col">
      {/* Barre info borne */}
      <BorneInfoBar />

      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-white font-bold">ila26</span>
          <LanguageSelector />
        </div>
      </header>

      {/* Badge étape */}
      <StepBadge current={currentStep + 1} total={totalSteps} />

      {/* Rendu de l'étape courante */}
      <div className="form-wizard-scroll">
        <div className="form-wizard-panel">
          <StepRenderer
            question={currentQuestion}
            value={values[currentQuestion.id]}
            onChange={(val) => setValue(currentQuestion.id, val)}
            langue={langue}
            stepIndex={currentStep}
            totalSteps={totalSteps}
          />
        </div>
      </div>

      {/* Barre de navigation */}
      <div
        className="form-wizard-nav"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {currentStep > 0 && (
          <button
            onClick={prevStep}
            className="form-wizard-back"
            aria-label="Question précédente"
          >
            ‹
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={!isStepValid() || submitting}
          className="form-wizard-next"
        >
          {submitting ? 'Envoi...' : isLast ? 'Terminer' : 'Suivant →'}
        </button>
      </div>
    </div>
  )
}

function BorneInfoBar() {
  const { borne, langue } = useBorne()
  if (!borne) return null
  const labels = {
    fr: { master: 'Master Filiale', regie: 'Régie', installateur: 'Installateur' },
    es: { master: 'Filial Master', regie: 'Agencia', installateur: 'Instalador' },
    en: { master: 'Master Branch', regie: 'Agency', installateur: 'Installer' },
  }
  const l = labels[langue] || labels.fr
  return (
    <div
      className="flex items-center justify-between px-10 py-2 text-xs font-bold uppercase tracking-wide w-full"
      style={{ backgroundColor: 'rgb(120, 89, 173)', color: 'white', minHeight: '40px' }}
    >
      {/* Logo — top left */}
      <div className="flex items-center" style={{ width: '120px' }}>
        <img src={ilaLogo} alt="ila 26" style={{ height: '24px', width: 'auto', objectFit: 'contain', marginLeft: '25px' }} />
      </div>

      {/* Center: Info Parts */}
      <div className="flex-1 min-w-0 text-center text-[10px] sm:text-[11px] md:text-[13px] tracking-wider text-white flex justify-center items-center gap-2 sm:gap-4 md:gap-6 px-2 overflow-hidden">
        {borne.commercant && <span className="truncate max-w-[100px] sm:max-w-none">{l.master}: {borne.commercant}</span>}
        {borne.regie && <span className="truncate max-w-[100px] sm:max-w-none">{l.regie}: {borne.regie}</span>}
        {borne.installateur && <span className="truncate max-w-[100px] sm:max-w-none">{l.installateur}: {borne.installateur}</span>}
      </div>

      {/* Right: ExitButton */}
      <div className="flex items-center justify-end flex-shrink-0">
        <ExitButton
          className="text-white hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer flex items-center justify-center"
          aria-label="Quitter le mode kiosque"
          style={{ minHeight: '48px', minWidth: '48px', padding: '8px' }}
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </ExitButton>
      </div>
    </div>
  )
}
