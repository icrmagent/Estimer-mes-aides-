import { useNavigate } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { useForm } from '../context/FormContext.jsx'
import { t } from '../utils/i18n.js'
import LanguageSelector from '../components/LanguageSelector.jsx'
import StepBadge from '../components/StepBadge.jsx'
import FieldRenderer from '../components/FieldRenderer.jsx'
import ExitButton from '../components/ExitButton.jsx'
import InactivityManager from '../components/InactivityManager.jsx'
import { useOfflineSync } from '../hooks/useOfflineSync.js'
import { groupQuestionsByPage } from '../utils/groupQuestionsByPage.js'
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

  const isStepValid = !currentPage || currentQuestions.every((question) => {
    if (!question.obligatoire) return true
    const val = values[question.id]
    if (val === undefined || val === null || val === '') return false
    if (Array.isArray(val) && val.length === 0) return false
    return true
  })

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

  // Identifie les question IDs adresse / code postal / ville dans TOUT le formulaire
  // (pas seulement la page courante) car Adresse, CP et Ville peuvent être sur des pages
  // différentes — l'auto-complétion les pré-remplit toutes en une fois.
  const normalize = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

  const matchLabel = (libelle, candidates, excludes = []) => {
    if (!libelle) return false
    const values = typeof libelle === 'string' ? [libelle] : Object.values(libelle)
    return values.some(v => {
      const n = normalize(v)
      if (excludes.some(ex => n.includes(ex))) return false
      return candidates.some(c => n === c || n.startsWith(c + ' ') || n.endsWith(' ' + c))
    })
  }

  const adresseQuestionId = questions.find(q =>
    matchLabel(q.libelleQuestion, ['adresse', 'adresse postale', 'direccion', 'address', 'rue'], ['email', 'mail', 'correo'])
  )?.id
  const codePostalQuestionId = questions.find(q =>
    matchLabel(q.libelleQuestion, ['code postal', 'codigo postal', 'postal code', 'cp', 'code post'])
  )?.id
  const villeQuestionId = questions.find(q =>
    matchLabel(q.libelleQuestion, ['ville', 'ciudad', 'city', 'commune'])
  )?.id

  const handleAddressSelected = ({ adresse, codePostal, ville }) => {
    if (adresseQuestionId && adresse) setValue(adresseQuestionId, adresse.toUpperCase())
    if (codePostalQuestionId && codePostal) setValue(codePostalQuestionId, codePostal.toUpperCase())
    if (villeQuestionId && ville) setValue(villeQuestionId, ville.toUpperCase())
  }

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
      <div className="form-page flex flex-col bg-white" style={{ height: '100dvh', overflow: 'hidden' }}>
        {/* Barre info borne */}
        <BorneInfoBar />

        {/* Header */}
        <header className="relative bg-gradient-to-r from-[#5B2D8E] to-[#1A56A0] shadow-md">
          <div className="tablet-form-header w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 md:py-6 lg:py-8 flex items-center justify-between gap-3 sm:gap-4 relative z-10">
            {/* Icône maison à gauche */}
            <div className="hero-icon tablet-home-zone flex-shrink-0">
              <button
                type="button"
                onClick={handleManualAbandon}
                aria-label="Retour à la page de démarrage"
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'block' }}
              >
                <img
                  alt="Maison"
                  src={homeEnv}
                  style={{
                    width: 'clamp(48px, 7vw, 80px)',
                    height: 'auto',
                    display: 'block',
                    margin: '5px 0 5px 5px',
                  }}
                />
              </button>
            </div>

            {/* Titre et Sous-titre */}
            <div className="hero-text flex-1 min-w-0 text-center px-2">
              <h1
                className="hero-title font-extrabold text-white mb-1 break-words"
                style={{
                  fontSize: 'clamp(18px, 3.6vw, 36px)',
                  lineHeight: 1.2,
                  textShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 4px',
                }}
              >
                {titre}
              </h1>
              <p
                className="hero-subtitle text-white font-medium italic"
                style={{ fontSize: 'clamp(12px, 1.6vw, 17px)' }}
              >
                {sousTitre}
              </p>
            </div>

            {/* Sélecteur de langue */}
            <div
              className="tablet-lang-zone flex items-center justify-end flex-shrink-0"
              style={{ minWidth: 'clamp(64px, 9vw, 120px)' }}
            >
              <LanguageSelector buttonMarginRight="10px" />
            </div>
          </div>
        </header>

        {/* Badge étape */}
        <StepBadge current={currentStep + 1} total={totalSteps} />

        {/* Contenu */}
        <div
          className="tablet-form-content flex-1 px-4 flex flex-col items-center justify-start"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
            paddingTop: '16px',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
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
                      onAddressSelected={handleAddressSelected}
                      countryCode={borne?.pays || 'FR'}
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

            <div
              className="flex flex-wrap justify-end items-center gap-4 px-4"
              style={{ marginTop: '48px', marginBottom: '24px' }}
            >
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  disabled={submitting}
                  className="group inline-flex items-center justify-center gap-2.5 font-bold rounded-full bg-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed tracking-wide focus:outline-none focus:ring-4 focus:ring-purple-300/50"
                  style={{
                    color: '#5B2D8E',
                    border: '2px solid #5B2D8E',
                    minHeight: '56px',
                    padding: '0 26px',
                    fontSize: 'clamp(15px, 1.8vw, 18px)',
                    boxShadow: '0 4px 14px rgba(91, 45, 142, 0.15)',
                  }}
                  aria-label={langue === 'es' ? 'Anterior' : langue === 'en' ? 'Previous' : 'Précédent'}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:-translate-x-1 shrink-0"
                  >
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="whitespace-nowrap">
                    {langue === 'es' ? 'Anterior' : langue === 'en' ? 'Previous' : 'Précédent'}
                  </span>
                </button>
              )}

              {isLast ? (
                <button
                  onClick={handleSubmit}
                  disabled={!isStepValid || submitting}
                  className="group inline-flex items-center justify-center gap-2.5 text-white font-extrabold rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed tracking-wide focus:outline-none focus:ring-4 focus:ring-purple-300/50"
                  style={{
                    background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)',
                    minHeight: '56px',
                    minWidth: '200px',
                    padding: '0 32px',
                    fontSize: 'clamp(15px, 1.8vw, 18px)',
                    boxShadow: '0 10px 28px rgba(91, 45, 142, 0.35), 0 3px 8px rgba(0,0,0,0.1)',
                  }}
                  aria-label={langue === 'es' ? 'Terminar' : langue === 'en' ? 'Finish' : 'Terminer'}
                >
                  <span className="whitespace-nowrap">
                    {submitting ? 'Envoi...' : (langue === 'es' ? 'Terminar' : langue === 'en' ? 'Finish' : 'Terminer')}
                  </span>
                  {!submitting && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="transition-transform duration-300 group-hover:scale-110 shrink-0"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={!isStepValid || submitting}
                  className="group inline-flex items-center justify-center gap-2.5 text-white font-extrabold rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed tracking-wide focus:outline-none focus:ring-4 focus:ring-purple-300/50"
                  style={{
                    background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)',
                    minHeight: '56px',
                    minWidth: '200px',
                    padding: '0 32px',
                    fontSize: 'clamp(15px, 1.8vw, 18px)',
                    boxShadow: '0 10px 28px rgba(91, 45, 142, 0.35), 0 3px 8px rgba(0,0,0,0.1)',
                  }}
                  aria-label={langue === 'es' ? 'Siguiente' : langue === 'en' ? 'Next' : 'Suivant'}
                >
                  <span className="whitespace-nowrap">
                    {langue === 'es' ? 'Siguiente' : langue === 'en' ? 'Next' : 'Suivant'}
                  </span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:translate-x-1 shrink-0"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </InactivityManager>
  )
}

function BorneInfoBar() {
  const { borne, langue } = useBorne()
  if (!borne) return null
  const labels = {
    fr: { master: 'Commerçant', regie: 'Régie', installateur: 'Installateur', idBorne: 'ID', adresse: 'Adresse' },
    es: { master: 'Comerciante', regie: 'Agencia', installateur: 'Instalador', idBorne: 'ID', adresse: 'Dirección' },
    en: { master: 'Merchant', regie: 'Agency', installateur: 'Installer', idBorne: 'ID', adresse: 'Address' },
  }
  const l = labels[langue] || labels.fr

  const infoParts = []
  if (borne.commercant) infoParts.push({ label: l.master, value: borne.commercant })
  if (borne.regie) infoParts.push({ label: l.regie, value: borne.regie })
  if (borne.installateur) infoParts.push({ label: l.installateur, value: borne.installateur })
  if (borne.idBorne) infoParts.push({ label: l.idBorne, value: borne.idBorne })
  if (borne.adresse) infoParts.push({ label: l.adresse, value: borne.adresse })

  return (
    <div
      className="tablet-borne-info flex items-center justify-between px-3 sm:px-4 md:px-5 lg:px-6 py-2 gap-2 text-xs font-bold uppercase tracking-wide w-full overflow-hidden"
      style={{ backgroundColor: 'rgb(120, 89, 173)', color: 'white', minHeight: '48px' }}
    >
      {/* Logo — top left */}
      <div className="flex items-center flex-shrink-0">
        <img
          src={ilaLogo}
          alt="ila 26"
          style={{
            height: 'clamp(28px, 3.2vw, 38px)',
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            marginLeft: '10px',
          }}
        />
      </div>

      {/* Center: Info Parts — wrap autorisé sur tablette si dépassement */}
      <div
        className="tablet-borne-text flex-1 min-w-0 text-white flex flex-wrap justify-center items-center px-2"
        style={{
          fontSize: 'clamp(9px, 0.95vw, 12px)',
          columnGap: 'clamp(8px, 1.4vw, 18px)',
          rowGap: '2px',
          lineHeight: 1.25,
        }}
      >
        {infoParts.map((part, idx) => (
          <span
            key={idx}
            className="truncate"
            title={`${part.label}: ${part.value}`}
            style={{ maxWidth: 'clamp(110px, 16vw, 240px)' }}
          >
            <span style={{ opacity: 0.75, marginRight: '4px' }}>{part.label}:</span>
            <span style={{ fontWeight: 800 }}>{part.value}</span>
          </span>
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
