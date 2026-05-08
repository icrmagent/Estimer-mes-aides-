import { useEffect } from 'react'
import { useBorne } from '../context/BorneContext.jsx'

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
]

const STORAGE_KEY = 'ema_langue'

/**
 * Sélecteur de langue FR/ES/EN avec drapeaux (R4.2, R4.3).
 * Affiché dans le header en haut à droite.
 * Touch targets ≥ 48px.
 * Persiste la langue choisie dans localStorage.
 */
export default function LanguageSelector() {
  const { langue, setLangue } = useBorne()

  // Restaurer la langue depuis localStorage au montage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && ['fr', 'es', 'en'].includes(saved) && saved !== langue) {
      setLangue(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelect = (code) => {
    setLangue(code)
    localStorage.setItem(STORAGE_KEY, code)
  }

  return (
    <div className="flex items-center gap-1">
      {LANGUAGES.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => handleSelect(code)}
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
