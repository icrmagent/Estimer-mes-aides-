import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { searchAddress } from '../utils/addressApi.js'

/**
 * Input texte avec dropdown de suggestions d'adresses.
 * - Debounce 300ms sur la saisie.
 * - Filtrage serveur (FR/BAN) ou client (autres/Photon) par `countryCode`.
 * - Au clic sur une suggestion : appelle onSelect({ adresse, codePostal, ville }).
 * - Dropdown rendu via React Portal pour éviter le clipping par `overflow: hidden`
 *   du parent (`.grad-border-inner`).
 * - Mode offline / erreur réseau : fallback silencieux en input texte simple.
 *
 * Props :
 * - value : valeur courante du champ adresse (string)
 * - onChange : (string) => void — toujours appelé pour le champ adresse seul
 * - onSelect : ({ adresse, codePostal, ville }) => void — appelé sur sélection
 * - countryCode : ISO 3166-1 alpha-2 (ex. "FR", "ES")
 * - ariaLabel : libellé pour l'a11y
 * - placeholder : optionnel
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCode = 'FR',
  ariaLabel,
  placeholder,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)
  const justSelectedRef = useRef(false)

  // Recalcule la position du dropdown (portail) en fonction de l'input.
  function updateDropdownPos() {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }

  // Ferme le dropdown sur clic extérieur
  useEffect(() => {
    function handleClickOutside(e) {
      if (inputRef.current && !inputRef.current.contains(e.target) && !e.target.closest('[data-address-dropdown]')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Met à jour la position au scroll / resize
  useEffect(() => {
    if (!open) return
    updateDropdownPos()
    const handler = () => updateDropdownPos()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  // Debounce + appel API
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const q = (value || '').trim()
    if (q.length < 3) {
      setSuggestions([])
      setOpen(false)
      setLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      const results = await searchAddress(q, countryCode, controller.signal)
      if (!controller.signal.aborted) {
        setSuggestions(results)
        setOpen(results.length > 0)
        setActiveIdx(-1)
        setLoading(false)
        if (results.length > 0) updateDropdownPos()
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, countryCode])

  function handleSelect(suggestion) {
    justSelectedRef.current = true
    onSelect?.({
      adresse: suggestion.adresse || suggestion.label,
      codePostal: suggestion.codePostal || '',
      ville: suggestion.ville || '',
    })
    setOpen(false)
    setSuggestions([])
    setActiveIdx(-1)
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(idx => Math.min(idx + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(idx => Math.max(idx - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const dropdown = open && suggestions.length > 0 ? (
    <ul
      data-address-dropdown
      role="listbox"
      style={{
        position: 'fixed',
        top: `${dropdownPos.top}px`,
        left: `${dropdownPos.left}px`,
        width: `${dropdownPos.width}px`,
        zIndex: 9999,
        maxHeight: '280px',
        overflowY: 'auto',
        background: '#fff',
        border: '1.5px solid #5B2D8E',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(91, 45, 142, 0.18)',
        padding: '4px',
        listStyle: 'none',
        margin: 0,
      }}
    >
      {suggestions.map((s, idx) => (
        <li
          key={s.id}
          role="option"
          aria-selected={idx === activeIdx}
          onMouseDown={e => {
            e.preventDefault()
            handleSelect(s)
          }}
          onMouseEnter={() => setActiveIdx(idx)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 1.4vw, 16px)',
            color: '#1A1A2E',
            background: idx === activeIdx ? 'rgba(91, 45, 142, 0.08)' : 'transparent',
            lineHeight: 1.3,
          }}
        >
          {s.label}
        </li>
      ))}
    </ul>
  ) : null

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
        autoCapitalize="characters"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        className="pf-input"
        placeholder={placeholder}
        style={{ textTransform: 'uppercase' }}
      />

      {loading && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: '#5B2D8E',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          …
        </span>
      )}

      {dropdown && createPortal(dropdown, document.body)}
    </>
  )
}
