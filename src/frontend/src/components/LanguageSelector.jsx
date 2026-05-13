import { useEffect, useState } from 'react'
import { useBorne } from '../context/BorneContext.jsx'

const STORAGE_KEY = 'ema_langue'

/**
 * Sélecteur de langue FR/ES/EN avec menu déroulant et drapeaux.
 * Persiste la langue choisie dans localStorage.
 */
export default function LanguageSelector({ currentLang: propLang, onChange: propOnChange, buttonMarginRight = '25px' }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const context = typeof useBorne === 'function' ? useBorne() : {}
  const { langue: ctxLang, setLangue: ctxSetLang } = context || {}
  
  const currentLang = propLang || ctxLang || 'fr'
  const onChange = propOnChange || ctxSetLang

  const [isOpen, setIsOpen] = useState(false)
  const languages = [
    { code: 'fr', flagUrl: 'https://flagcdn.com/w40/fr.png', label: 'Français' },
    { code: 'es', flagUrl: 'https://flagcdn.com/w40/es.png', label: 'Español' },
    { code: 'en', flagUrl: 'https://flagcdn.com/w40/gb.png', label: 'English' },
  ]

  // Restaurer la langue depuis localStorage au montage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && ['fr', 'es', 'en'].includes(saved) && saved !== currentLang) {
      if (onChange) onChange(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentLanguage = languages.find(l => l.code === currentLang) || languages[0]

  const handleSelect = (code) => {
    if (onChange) onChange(code)
    localStorage.setItem(STORAGE_KEY, code)
    setIsOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Dropdown button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '8px',
          padding: '12px 14px',
          minHeight: '48px',
          cursor: 'pointer',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'all 0.2s',
          backdropFilter: 'blur(10px)',
          marginRight: buttonMarginRight,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.25)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
        }}
      >
        <img src={currentLanguage.flagUrl} alt={currentLanguage.label} style={{ width: '20px', height: 'auto', borderRadius: '2px', objectFit: 'cover' }} />
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path d="M12 6L8 10L4 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: 'rgba(15,15,40,0.95)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '10px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            overflow: 'hidden',
            minWidth: '180px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 50,
          }}
        >
          {languages.map((lang, idx) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 16px',
                minHeight: '52px',
                background: currentLang === lang.code ? 'rgba(99,102,241,0.3)' : 'transparent',
                border: 'none',
                borderBottom: idx < languages.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentLang === lang.code ? 'rgba(99,102,241,0.3)' : 'transparent'
              }}
            >
              <img src={lang.flagUrl} alt={lang.label} style={{ width: '20px', height: 'auto', borderRadius: '2px', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{lang.label}</div>
              </div>
              {currentLang === lang.code && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 3L6 12L2.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
