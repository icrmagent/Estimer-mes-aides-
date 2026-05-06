import { useState } from 'react'

const LANGS = [
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
]

export default function I18nTextInput({ value = {}, onChange, label, multiline = false, required = false }) {
  const [activeLang, setActiveLang] = useState('fr')

  const currentValue = value[activeLang] || ''

  function handleChange(e) {
    onChange({ ...value, [activeLang]: e.target.value })
  }

  const inputProps = {
    value: currentValue,
    onChange: handleChange,
    required: required && activeLang === 'fr',
    className: 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent',
    style: { minHeight: '48px', fontSize: '16px' },
    placeholder: activeLang === 'fr' ? (required ? 'Requis en français' : 'Texte en français') : `Texte en ${activeLang.toUpperCase()} (optionnel)`,
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Language tabs */}
      <div className="flex gap-1 mb-2">
        {LANGS.map(lang => (
          <button
            key={lang.code}
            type="button"
            onClick={() => setActiveLang(lang.code)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeLang === lang.code
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeLang === lang.code ? { background: '#5B2D8E' } : {}}
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
            {lang.code === 'fr' && required && !value?.fr && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-1" />
            )}
          </button>
        ))}
      </div>

      {/* Input */}
      {multiline ? (
        <textarea
          {...inputProps}
          rows={3}
          style={{ ...inputProps.style, minHeight: '80px', resize: 'vertical' }}
        />
      ) : (
        <input type="text" {...inputProps} />
      )}
    </div>
  )
}
