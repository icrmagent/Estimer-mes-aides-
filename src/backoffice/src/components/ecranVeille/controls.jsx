import { PRIMARY } from '../ui.jsx'

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      {label && <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>}
      {children}
      {error
        ? <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>
        : hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`} style={{ minHeight: '48px' }}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-700">{label}</span>
        {description && <span className="block text-xs text-gray-500 mt-0.5">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex flex-shrink-0 items-center rounded-full transition-colors mt-0.5"
        style={{ width: '44px', height: '26px', background: checked ? PRIMARY : '#d1d5db' }}
      >
        <span
          className="inline-block rounded-full bg-white shadow transition-transform"
          style={{ width: '20px', height: '20px', transform: `translateX(${checked ? '21px' : '3px'})` }}
        />
      </button>
    </label>
  )
}

/** Choix exclusif compact (remplace un <select> de 2 à 5 options). */
export function Segmented({ value, onChange, options, disabled = false, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`px-3 text-sm font-medium rounded-lg transition-colors ${active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            style={{ minHeight: '40px' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function TypeBadge({ type, types }) {
  const meta = types[type]
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${meta?.badge ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {meta?.label ?? type}
    </span>
  )
}

export const IcoPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
)

export const IcoGrip = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
)

export const IcoArrow = ({ dir = 'up' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: dir === 'down' ? 'rotate(180deg)' : undefined }}>
    <polyline points="6 15 12 9 18 15" />
  </svg>
)

export const IcoCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const IcoUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

export const IcoScreen = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M7 10l3-3 3 3 4-4" />
  </svg>
)
