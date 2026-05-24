import { t, tOptions } from '../utils/i18n.js'
import { PhoneInput } from './PhoneInput'
import AddressAutocomplete from './AddressAutocomplete.jsx'

const CheckIcon = () => (
  <svg className="pf-option-check-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8" fill="rgba(255,255,255,0.2)" />
    <path d="M6.5 10l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Capitalisation : UPPERCASE complet sur tous les champs texte.
// Cohérent avec l'usage administratif français (CERFA, etc.).
const toUpper = (v) => (typeof v === 'string' ? v.toUpperCase() : v)

// Le label "adresse" déclenche l'auto-complétion (cross-field via onAddressSelected).
// Exclut "adresse email" / "adresse e-mail" / "correo" / "mail" qui ne sont pas des adresses postales.
function isAdresseField(normalizedLabel) {
  if (!normalizedLabel) return false
  if (/(email|e-mail|mail|correo)/.test(normalizedLabel)) return false
  return /(^|\s)(adresse|direccion|address|rue)(\s|$)/.test(normalizedLabel)
}

export default function FieldRenderer({ question, value, onChange, onAddressSelected, countryCode, langue }) {
  const { typeOption, options } = question
  const translatedOptions = tOptions(options, langue)
  const useCompactTwoColumns = translatedOptions.length > 0 && translatedOptions.length <= 4

  const fieldLabel = t(question.libelleQuestion, langue)
  const normalizedLabel = fieldLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  const renderFrame = (control) => (
    <div className="grad-border">
      <div className="grad-border-inner">
        {control}
      </div>
    </div>
  )

  switch (typeOption) {
    case 'texte_court': {
      // Auto-complétion d'adresse si le label correspond
      if (isAdresseField(normalizedLabel) && onAddressSelected) {
        return renderFrame(
          <AddressAutocomplete
            value={value || ''}
            onChange={v => onChange(toUpper(v))}
            onSelect={onAddressSelected}
            countryCode={countryCode}
            ariaLabel={fieldLabel}
          />
        )
      }
      return renderFrame(
        <input
          type="text"
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(toUpper(e.target.value))}
          className="pf-input"
          autoCapitalize="characters"
          style={{ textTransform: 'uppercase' }}
        />
      )
    }

    case 'texte_long':
      return renderFrame(
        <textarea
          aria-label={fieldLabel}
          value={value || ''}
          onChange={e => onChange(toUpper(e.target.value))}
          rows={4}
          className="pf-input pf-textarea"
          autoCapitalize="characters"
          style={{ textTransform: 'uppercase' }}
        />
      )

    case 'telephone':
      return renderFrame(
        <PhoneInput onChange={onChange} />
      )

    case 'email':
      // Convention email = lowercase (la casse n'a pas de sens sémantique côté serveurs SMTP).
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
              <option value="" disabled>{langue === 'es' ? 'Seleccionar...' : langue === 'en' ? 'Select...' : 'Sélectionner...'}</option>
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
                <span>{opt.label}</span>
                {selected && <CheckIcon />}
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
                <span>{opt.label}</span>
                {isSelected && <CheckIcon />}
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
          onChange={e => onChange(toUpper(e.target.value))}
          className="pf-input"
          autoCapitalize="characters"
          style={{ textTransform: 'uppercase' }}
        />
      )
  }
}
