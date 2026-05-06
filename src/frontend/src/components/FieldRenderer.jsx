import { useBorne } from '../context/BorneContext.jsx'
import { t, tOptions } from '../utils/i18n.js'

/**
 * FieldRenderer V2 — rendu dynamique par typeOption.
 * Supporte : texte_court, texte_long, option_unique, options_multiples, telephone, email.
 * Touch targets ≥ 48px, font-size ≥ 16px.
 */
export default function FieldRenderer({ question, value, onChange, langue }) {
  const { typeOption, options } = question
  const translatedOptions = tOptions(options, langue)

  const inputStyle = {
    width: '100%',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    padding: '14px 16px',
    fontSize: '16px',
    fontFamily: 'inherit',
    outline: 'none',
    minHeight: '52px',
    transition: 'border-color 0.15s',
  }

  switch (typeOption) {
    case 'texte_court':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          className="focus:border-purple-600"
        />
      )

    case 'texte_long':
      return (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={4}
          style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
          className="focus:border-purple-600"
        />
      )

    case 'telephone':
      return (
        <input
          type="tel"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          className="focus:border-purple-600"
          inputMode="tel"
        />
      )

    case 'email':
      return (
        <input
          type="email"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          className="focus:border-purple-600"
          inputMode="email"
          autoCapitalize="none"
        />
      )

    case 'option_unique':
      return (
        <div className="flex flex-wrap gap-3 justify-center">
          {translatedOptions.map(opt => {
            const selected = value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className="transition-all active:scale-95"
                style={{
                  minHeight: '52px',
                  minWidth: '140px',
                  padding: '12px 20px',
                  borderRadius: '50px',
                  border: `2px solid #5B2D8E`,
                  background: selected ? '#5B2D8E' : 'white',
                  color: selected ? 'white' : '#5B2D8E',
                  fontWeight: '700',
                  fontSize: '15px',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'center',
                  lineHeight: '1.4',
                }}
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
        <div className="flex flex-wrap gap-3 justify-center">
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
                className="transition-all active:scale-95"
                style={{
                  minHeight: '52px',
                  minWidth: '140px',
                  padding: '12px 20px',
                  borderRadius: '50px',
                  border: `2px solid ${isSelected ? '#27c4e2' : '#5B2D8E'}`,
                  background: isSelected ? '#27c4e2' : 'white',
                  color: isSelected ? 'white' : '#5B2D8E',
                  fontWeight: '700',
                  fontSize: '15px',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'center',
                  lineHeight: '1.4',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )
    }

    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )
  }
}
