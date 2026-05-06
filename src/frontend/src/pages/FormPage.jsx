import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { t, tOptions } from '../utils/i18n.js'
import LanguageSelector from '../components/LanguageSelector.jsx'
import StepBadge from '../components/StepBadge.jsx'
import FieldRenderer from '../components/FieldRenderer.jsx'
import ExitButton from '../components/ExitButton.jsx'
import InactivityManager from '../components/InactivityManager.jsx'
import { useOfflineSync } from '../hooks/useOfflineSync.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * FormPage V2 — formulaire dynamique avec questions depuis BorneContext.
 * Remplace le FormPage V1 hardcodé.
 */
export function FormPage() {
  const navigate = useNavigate()
  const { borne, formulaire, questions, langue } = useBorne()
  const { values, setValue, currentStep, nextStep, prevStep, reset, setResult, setSubmitting, submitting } = useForm()
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

    // Offline-first: sauvegarder en IndexedDB avant l'envoi API
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
        // Garder en offline, afficher la page de fin quand même
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

  const libelleQuestion = t(currentQuestion.libelleQuestion, langue)
  const paragrapheInfo = t(currentQuestion.paragrapheInfo, langue)
  const isLast = currentStep === totalSteps - 1

  return (
    <InactivityManager>
      <div className="form-page min-h-screen flex flex-col" style={{ background: '#f5f6fa' }}>
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

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-32">
          <div className="max-w-2xl mx-auto">
            <h2
              className="text-xl font-bold text-gray-900 mb-6 text-center leading-tight"
              style={{ fontSize: '20px' }}
            >
              {libelleQuestion}
            </h2>

            {paragrapheInfo && (
              <p
                className="text-center italic mb-6 text-sm"
                style={{ color: '#5B2D8E' }}
              >
                {paragrapheInfo}
              </p>
            )}

            <FieldRenderer
              question={currentQuestion}
              value={values[currentQuestion.id]}
              onChange={(val) => setValue(currentQuestion.id, val)}
              langue={langue}
            />
          </div>
        </div>

        {/* Navigation */}
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-4 bg-white border-t border-gray-200"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {currentStep > 0 && (
            <button
              onClick={prevStep}
              className="flex items-center justify-center rounded-2xl border-2 font-bold text-base transition-all active:scale-95"
              style={{
                minHeight: '52px',
                minWidth: '52px',
                borderColor: '#5B2D8E',
                color: '#5B2D8E',
                fontSize: '20px',
              }}
              aria-label="Question précédente"
            >
              ‹
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={!isStepValid() || submitting}
            className="flex-1 text-white font-bold rounded-2xl py-4 text-base transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: '#5B2D8E',
              minHeight: '52px',
              fontSize: '16px',
            }}
          >
            {submitting ? 'Envoi...' : isLast ? 'Terminer' : 'Suivant →'}
          </button>
        </div>

        <ExitButton />
      </div>
    </InactivityManager>
  )
}

function BorneInfoBar() {
  const { borne, langue } = useBorne()
  if (!borne) return null
  const labels = {
    fr: { master: 'Master Filiale', regie: 'régie', installateur: 'installateur' },
    es: { master: 'Filial Master', regie: 'agencia', installateur: 'instalador' },
    en: { master: 'Master Branch', regie: 'agency', installateur: 'installer' },
  }
  const l = labels[langue] || labels.fr
  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-white text-xs font-medium"
      style={{ background: '#1A1A2E', minHeight: '36px' }}
    >
      <span className="font-bold">ila26</span>
      <span className="truncate mx-4">
        {borne.commercant && `${l.master}: ${borne.commercant}`}
        {borne.regie && ` · ${l.regie}: ${borne.regie}`}
        {borne.installateur && ` · ${l.installateur}: ${borne.installateur}`}
      </span>
      <span className="text-white/60 shrink-0">{borne.adresse}</span>
    </div>
  )
}
