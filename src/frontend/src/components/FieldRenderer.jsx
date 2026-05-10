import { t, tOptions } from '../utils/i18n.js'

/**
 * FieldRenderer V2 — rendu dynamique par typeOption.
 * Supporte : texte_court, texte_long, option_unique, options_multiples, telephone, email.
 * Touch targets ≥ 48px, font-size ≥ 16px.
 */
export default function FieldRenderer({ question, value, onChange, langue }) {
  const { typeOption, options } = question
  const translatedOptions = tOptions(options, langue)
  const useCompactTwoColumns = translatedOptions.length > 0 && translatedOptions.length <= 4

  const fieldLabel = t(question.libelleQuestion, langue)
  const normalizedLabel = fieldLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const renderFrame = (control) => (
    <div className="grad-border">
      <div className="grad-border-inner">
        {control}
      </div>
    </div>
  )

  switch (typeOption) {
    case 'texte_court':
      return renderFrame(
        <input
          type="text"
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="pf-input"
        />
      )

    case 'texte_long':
      return renderFrame(
        <textarea
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className="pf-input pf-textarea"
        />
      )

    case 'telephone':
      return renderFrame(
        <input
          type="tel"
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="pf-input"
          inputMode="tel"
        />
      )

    case 'email':
      return renderFrame(
        <input
          type="email"
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="pf-input"
          inputMode="email"
          autoCapitalize="none"
        />
      )

    case 'option_unique':
      if (normalizedLabel === 'civilite') {
        return renderFrame(
          <div className="pf-select-wrap">
            <select
              aria-label={fieldLabel}
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              className="pf-select"
            >
              <option value="" disabled>Sélectionner...</option>
              {translatedOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pf-select-arrow" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6l4 4 4-4" stroke="url(#arrGradCivilite)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="arrGradCivilite" x1="4" y1="6" x2="12" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#7B5EA7" />
                    <stop offset="100%" stopColor="#3DBFA0" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </div>
        )
      }

      return (
        <div className={`pf-option-grid${useCompactTwoColumns ? ' pf-option-grid--compact-two' : ''}`}>
          {translatedOptions.map(opt => {
            const selected = value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className={`pf-option-card${selected ? ' is-selected' : ''}`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )

    case 'options_multiples': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className={`pf-option-grid${useCompactTwoColumns ? ' pf-option-grid--compact-two' : ''}`}>
          {translatedOptions.map(opt => {
            const isSelected = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onChange(selected.filter(id => id !== opt.id))
                  } else {
                    onChange([...selected, opt.id])
                  }
                }}
                className={`pf-option-card${isSelected ? ' is-selected' : ''}`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )
    }

    default:
      return renderFrame(
        <input
          type="text"
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="pf-input"
        />
      )
  }
}
