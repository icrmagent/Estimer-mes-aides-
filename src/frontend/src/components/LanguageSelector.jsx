import { useBorne } from '../context/BorneContext.jsx'

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
]

/**
 * Sélecteur de langue FR/ES/EN avec drapeaux (R4.2, R4.3).
 * Affiché dans le header en haut à droite.
 * Touch targets ≥ 48px.
 */
export default function LanguageSelector() {
  const { langue, setLangue } = useBorne()

  return (
    <div className="flex items-center gap-1">
      {LANGUAGES.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => setLangue(code)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold text-sm transition-all"
          style={{
            minHeight: '48px',
            minWidth: '48px',
            background: langue === code ? 'rgba(255,255,255,0.25)' : 'transparent',
            border: langue === code ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
            color: 'white',
            fontSize: '14px',
          }}
          aria-label={`Langue ${label}`}
          aria-pressed={langue === code}
        >
          <span className="text-lg">{flag}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
