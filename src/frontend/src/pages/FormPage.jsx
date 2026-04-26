import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormConfig } from '../hooks/useFormConfig'
import { useForm } from '../context/FormContext'
import { submitForm } from '../services/api'
import { AppHeader } from '../components/AppHeader'
import { ProgressBar } from '../components/ProgressBar'
import { FieldRenderer, FIELD_ICONS } from '../components/FieldRenderer'
import { NavigationBar } from '../components/NavigationBar'
import { IconLoader } from '../components/Icons'

export function FormPage() {
  const navigate  = useNavigate()
  const { config, loading, error } = useFormConfig()
  const { currentSub, currentStep, values, config: ctxConfig, setConfig, setResult, setSubmitting, submitting } = useForm()

  useEffect(() => {
    if (config && !ctxConfig) setConfig(config)
  }, [config, ctxConfig])

  const handleSubmit = async () => {
    setSubmitting(true)
    const payload = Object.entries(values)
      .filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))
      .map(([fieldId, value]) => ({ fieldId: Number(fieldId), value }))

    const result = await submitForm(config.version, payload)
    setResult(result)
    setSubmitting(false)
    navigate('/confirmation')
  }

  if (loading || (!currentSub && !error)) {
    return (
      <div className="loading-screen">
        <IconLoader size={40} className="icon-spinner" />
        <p>Chargement du formulaire…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-screen">
        <p className="error-msg">Impossible de charger le formulaire.<br />Vérifiez votre connexion.</p>
        <button className="btn-primary" style={{ maxWidth: 220 }} onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    )
  }

  const isSingleQuestion = currentSub.fields.length === 1 && currentSub.fields[0].options?.length > 0
  const isGrid = currentSub.fields.length >= 6
  const QuestionIcon = isSingleQuestion ? FIELD_ICONS[currentSub.fields[0].id] : null

  return (
    <div className="form-page">
      <AppHeader />
      <ProgressBar />

      <div className="form-scrollable">
        <div className="step-content" key={currentStep}>
          {isSingleQuestion ? (
            <>
              {QuestionIcon && (
                <div className="question-icon-wrap">
                  <QuestionIcon size={32} className="question-icon" />
                </div>
              )}
              <h2 className="step-title step-title--question">{currentSub.fields[0].name}</h2>
            </>
          ) : (
            <h2 className="step-title">{currentSub.name}</h2>
          )}

          <div className={`fields-container${isGrid ? ' fields-container--grid' : ''}`}>
            {currentSub.fields.map(field => (
              <FieldRenderer
                key={field.id}
                field={isSingleQuestion ? { ...field, name: '' } : field}
              />
            ))}
          </div>
        </div>
      </div>

      {submitting && (
        <div className="loading-overlay">
          <IconLoader size={40} className="icon-spinner" />
        </div>
      )}

      <NavigationBar onSubmit={handleSubmit} />
    </div>
  )
}
