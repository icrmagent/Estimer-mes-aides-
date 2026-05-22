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
import { groupQuestionsByPage as sharedGroupQuestionsByPage } from '../utils/groupQuestionsByPage.js'
import ilaLogo from '../assets/logo.png'
import homeEnv from '../assets/homeenv.png'

const sectionStyles = {
  wrapper: {
    width: "100%",
    padding: "0",
    boxSizing: "border-box",
    marginBottom: "20px",
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 18px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)",
    boxShadow: "0 4px 18px rgba(91, 45, 142, 0.22)",
    animation: "categoryIn 350ms cubic-bezier(0.22, 1, 0.36, 1) both",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  badge: {
    width: "34px",
    height: "34px",
    borderRadius: "9px",
    background: "rgba(255,255,255,0.16)",
    border: "1.5px solid rgba(255,255,255,0.3)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "800",
    fontSize: "15px",
    flexShrink: 0,
  },
  title: {
    fontSize: "13px",
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  counter: {
    fontSize: "11px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    background: "rgba(255,255,255,0.14)",
    padding: "4px 10px",
    borderRadius: "20px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
};

const SectionHeader = ({ number = 1, title = "", total = 1 }) => {
  return (
    <div style={sectionStyles.wrapper}>
      <div style={sectionStyles.banner}>
        <div style={sectionStyles.left}>
          <div style={sectionStyles.badge}>{number}</div>
          <span style={sectionStyles.title}>{title}</span>
        </div>
        {total > 1 && (
          <span style={sectionStyles.counter}>Cat. {number} / {total}</span>
        )}
      </div>
    </div>
  );
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Re-export pour compat tests existants — la logique vit dans utils/groupQuestionsByPage.js
export const groupQuestionsByPage = sharedGroupQuestionsByPage

/**
 * FormPage V2 — formulaire dynamique avec questions depuis BorneContext.
 * Remplace le FormPage V1 hardcodé.
 */
export function FormPage() {
  const navigate = useNavigate()
  const { borne, formulaire, questions, langue, configLoaded } = useBorne()
  const { values, setValue, currentStep, nextStep, prevStep, reset, setResult, setSubmitting, submitting } = useForm()
  const { saveOffline, markSynced } = useOfflineSync()

  const pages = groupQuestionsByPage(questions)
  const totalSteps = pages.length
  const currentPage = pages[currentStep] || null
  const currentQuestions = currentPage?.questions || []

  const config = formulaire?.pageDebutConfig || {}
  const defaultTexts = {
    titre: {
      fr: 'Estimez vos aides à la rénovation',
      en: 'Estimate your renovation grants',
      es: 'Calcula tus ayudas para la renovación',
    },
    sousTitre: {
      fr: 'Pour la rénovation énergétique de votre maison Répondez à quelques questions pour découvrir vos aides',
      en: 'For the energy renovation of your home. Answer a few questions to discover your grants',
      es: 'Para la renovación energética de tu hogar. Responde algunas preguntas para descubrir tus ayudas',
    },
  }
  const titre = t(config.titre, langue) || t(defaultTexts.titre, langue)
  const sousTitre = t(config.sousTitre, langue) || t(defaultTexts.sousTitre, langue)

  // Validation de l'étape courante
  const isStepValid = useCallback(() => {
    if (!currentPage) return true
    return currentQuestions.every((question) => {
      if (!question.obligatoire) return true
      const val = values[question.id]
      if (val === undefined || val === null || val === '') return false
      if (Array.isArray(val) && val.length === 0) return false
      return true
    })
  }, [currentPage, currentQuestions, values])

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
    const localId = await saveOffline(enregistrement)

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
        // Retirer l'entrée de la queue offline pour empêcher un re-post par syncPending().
        if (localId) await markSynced(localId)
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

  if (!currentPage) {
    if (configLoaded && (!formulaire || questions.length === 0)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: '#f5f6fa' }}>
          <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Oups !</h2>
            <p className="text-gray-600 mb-6">Pas de formulaire configuré sur cette borne.</p>
            <button 
              onClick={() => navigate('/login')}
              className="text-sm text-indigo-600 font-semibold hover:underline"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement du formulaire...</p>
      </div>
    )
  }

  const uniqueCategories = [...new Set(pages.map(p => t(p.categorie?.nom, langue)).filter(Boolean))]
  const pageTitle = t(currentPage.sousCategorie?.nom, langue) || (currentPage.categorie ? null : `Étape ${currentStep + 1}`)
  const isLast = currentStep === totalSteps - 1
  const isHalfWidthField = (question, label) => {
    const normalized = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    if (question.typeOption === 'texte_long' || question.typeOption === 'options_multiples') {
      return false
    }

    if (question.typeOption === 'option_unique' && normalized !== 'civilite') {
      return false
    }

    return true
  }

  const handleManualAbandon = async () => {
    if (currentStep > 0) {
      const reponses = Object.entries(values)
        .filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))
        .map(([questionId, valeur]) => ({
          questionId,
          valeur: Array.isArray(valeur) ? valeur.join(', ') : String(valeur),
        }))

      if (reponses.length > 0) {
        const enregistrement = {
          borneId: borne?.id,
          formulaireId: formulaire?.id,
          langueUtilisee: langue,
          reponses,
        }

        const localId = await saveOffline(enregistrement)

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
          if (res.ok && localId) await markSynced(localId)
        } catch {
          // Ignoré — l'entrée reste en queue et sera retentée par syncPending().
        }
      }
    }
    reset()
    navigate('/start')
  }

  return (
    <InactivityManager>
      <div className="form-page min-h-screen flex flex-col bg-white">
        {/* Barre info borne */}
        <BorneInfoBar />

        {/* Header */}
        <header className="relative bg-gradient-to-r from-[#5B2D8E] to-[#1A56A0] shadow-md">
          <div className="tablet-form-header w-full px-6 py-6 md:py-8 flex items-center justify-between relative z-10">
            {/* Logo ILA26 à gauche */}
            <div className="hero-icon tablet-home-zone">
              <button
                type="button"
                onClick={handleManualAbandon}
                aria-label="Retour à la page de démarrage"
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
              >
                <img alt="Maison" src={homeEnv} style={{ width: '90px', marginBottom: '5px', marginRight: '5px', marginTop: '5px', marginLeft: '5px' }} />
              </button>
            </div>
            
            {/* Titre et Sous-titre */}
            <div className="hero-text flex-1 text-center px-4">
              <h1
                className="hero-title font-extrabold text-white mb-1 break-words"
                style={{
                  fontSize: 'clamp(20px, 4vw, 40px)',
                  textShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 4px',
                }}
              >
                {titre}
              </h1>
              <p className="hero-subtitle text-white font-medium italic text-[14px] md:text-[18px]">
                {sousTitre}
              </p>
            </div>
            
            {/* Sélecteur de langue */}
            <div className="tablet-lang-zone flex items-center justify-end w-[120px]">
              <LanguageSelector buttonMarginRight="0px" />
            </div>
          </div>
        </header>

        {/* Badge étape */}
        <StepBadge current={currentStep + 1} total={totalSteps} />

        {/* Contenu */}
        <div className="tablet-form-content flex-1 overflow-y-auto px-4 py-8 pb-32 flex flex-col items-center justify-start">
          <div className="form-page-panel max-w-5xl mx-auto my-auto w-full" style={{ marginTop: '0px' }}>
            {currentPage.categorie && (
              <div className={pageTitle ? 'mb-4' : 'mb-8'}>
                <SectionHeader
                  number={uniqueCategories.indexOf(t(currentPage.categorie.nom, langue)) + 1}
                  title={t(currentPage.categorie.nom, langue)}
                  total={uniqueCategories.length}
                />
              </div>
            )}
            {pageTitle && (
              <h2 className="text-2xl md:text-[32px] font-extrabold text-[#1A1A2E] mb-8 text-center leading-snug">
                {pageTitle}
              </h2>
            )}

            <div className="form-fields-stack">
              {currentQuestions.map((question, index) => {
                const libelleQuestion = t(question.libelleQuestion, langue)
                const paragrapheInfo = t(question.paragrapheInfo, langue)

                return (
                  <div
                    key={question.id}
                    className={`w-full form-field-item${index === 0 ? ' form-field-item--first' : ''}${isHalfWidthField(question, libelleQuestion) ? ' form-field-item--half' : ''}`}
                  >
                    <label className="block text-lg md:text-xl font-bold text-[#1A1A2E] mb-2">
                      {libelleQuestion}
                      {question.obligatoire && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    <FieldRenderer
                      question={question}
                      value={values[question.id]}
                      onChange={(val) => setValue(question.id, val)}
                      langue={langue}
                    />

                    {paragrapheInfo && (
                      <p className="font-medium mt-2 text-[15px] md:text-[17px] break-words" style={{ color: '#1A56A0' }}>
                        {paragrapheInfo}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {isLast && (
              <div className="flex justify-center mt-12">
                <button
                  onClick={handleSubmit}
                  disabled={!isStepValid() || submitting}
                  className="text-white font-extrabold rounded-2xl py-4 px-12 text-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md"
                  style={{ background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)', minHeight: '64px', minWidth: '280px' }}
                >
                  {submitting ? 'Envoi...' : (langue === 'es' ? 'Terminar' : langue === 'en' ? 'Finish' : 'Terminer')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Flèches */}
        {currentStep > 0 && (
          <button
            onClick={prevStep}
            disabled={submitting}
            className="tablet-nav-prev fixed left-4 md:left-8 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-30 disabled:hover:bg-white"
            style={{ width: '64px', height: '64px', color: '#5B2D8E' }}
            aria-label="Précédent"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {!isLast && (
          <button
            onClick={handleNext}
            disabled={!isStepValid() || submitting}
            className="tablet-nav-next fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed"
            style={{ width: '64px', height: '64px', color: '#5B2D8E' }}
            aria-label="Suivant"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </InactivityManager>
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

  const infoParts = []
  if (borne.commercant) infoParts.push(`${l.master}: ${borne.commercant}`)
  if (borne.regie) infoParts.push(`${l.regie}: ${borne.regie}`)
  if (borne.installateur) infoParts.push(`${l.installateur}: ${borne.installateur}`)

  return (
    <div
      className="tablet-borne-info flex items-center justify-between px-2 sm:px-4 py-2 text-xs font-bold uppercase tracking-wide w-full"
      style={{ backgroundColor: 'rgb(120, 89, 173)', color: 'white', minHeight: '40px' }}
    >
      {/* Logo — top left */}
      <div className="flex items-center flex-shrink-0">
        <img src={ilaLogo} alt="ila 26" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* Center: Info Parts */}
      <div className="tablet-borne-text flex-1 min-w-0 text-center text-[10px] sm:text-[11px] md:text-[13px] tracking-wider text-white flex justify-center items-center gap-2 sm:gap-4 md:gap-6 px-2 overflow-hidden">
        {infoParts.map((part, idx) => (
          <span key={idx} className="truncate max-w-[min(140px,30vw)] sm:max-w-none">{part}</span>
        ))}
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
