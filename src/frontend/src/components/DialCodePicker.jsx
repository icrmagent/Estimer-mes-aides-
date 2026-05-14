import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { COUNTRIES, flag } from '../data/countries'

export function DialCodePicker({ value, onChange }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos]       = useState({ top: 0, left: 0, width: 280 })
  const triggerRef          = useRef(null)
  const searchRef           = useRef(null)
  const dropRef             = useRef(null)

  const selected = COUNTRIES.find(c => c.dial === value) ?? COUNTRIES[0]

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search.replace(/\s/g, ''))
      )
    : COUNTRIES

  const openDropdown = () => {
    const rect      = triggerRef.current.getBoundingClientRect()
    const dropW     = Math.min(window.innerWidth - 16, Math.max(rect.width, 160))
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const dropH     = Math.min(340, window.innerHeight * 0.5)
    const top = spaceBelow >= Math.min(dropH, 200) || spaceBelow >= spaceAbove
      ? rect.bottom + 4
      : rect.top - dropH - 4
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8))
    setPos({ top, left, width: dropW })
    setOpen(true)
    setTimeout(() => searchRef.current?.focus(), 40)
  }

  const close = () => { setOpen(false); setSearch('') }

  const select = (country) => {
    onChange(country.dial)
    close()
  }

  /* Close on outside click */
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (
        triggerRef.current?.contains(e.target) ||
        dropRef.current?.contains(e.target)
      ) return
      close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className="dial-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`dial-trigger${open ? ' dial-trigger--open' : ''}`}
        onClick={() => open ? close() : openDropdown()}
        aria-label={`Indicatif téléphonique : ${selected.name} ${selected.dial}`}
        aria-expanded={open}
      >
        <span className="dial-flag-lg">{flag(selected.code)}</span>
        <span className="dial-iso">{selected.code}</span>
        <span className="dial-code-txt">{selected.dial}</span>
        <span className="dial-caret" aria-hidden="true">▾</span>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="dial-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          role="dialog"
          aria-label="Sélectionner un indicatif"
        >
          {/* Search */}
          <div className="dial-search-wrap">
            <svg className="dial-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              width="15" height="15">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              type="text"
              className="dial-search"
              placeholder="Rechercher un pays…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="dial-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* Country list */}
          <ul className="dial-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="dial-empty">Aucun résultat</li>
            ) : (
              filtered.map(c => (
                <li key={c.code} role="option" aria-selected={c.dial === value}>
                  <button
                    type="button"
                    className={`dial-option${c.dial === value ? ' dial-option--on' : ''}`}
                    onClick={() => select(c)}
                    title={c.name}
                  >
                    <span className="dial-flag-lg">{flag(c.code)}</span>
                    <span className="dial-iso">{c.code}</span>
                    <span className="dial-country-code">{c.dial}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
