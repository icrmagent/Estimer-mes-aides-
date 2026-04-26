import { useState, useEffect } from 'react'
import { useForm } from '../context/FormContext'
import {
  IconUser, IconMapPin, IconPhone, IconMail,
  IconEuro, IconHome, IconCalendar, IconRuler,
  IconFlame, IconWrench, IconClipboard, IconLoader,
} from './Icons'

export const FIELD_ICONS = {
  2262: IconUser,    2087: IconUser,     2088: IconUser,
  2217: IconMapPin,  2089: IconMapPin,   2090: IconMapPin,
  2015: IconPhone,   2016: IconMail,
  2294: IconEuro,    2293: IconHome,
  2292: IconHome,    2306: IconCalendar, 2307: IconRuler,
  2296: IconHome,    2298: IconWrench,   2300: IconWrench,
  2301: IconFlame,   2302: IconWrench,
  2297: IconWrench,  2299: IconWrench,
  2303: IconWrench,  2304: IconCalendar, 2305: IconClipboard,
}

function Label({ field, htmlFor }) {
  if (!field.name) return null
  const Icon = FIELD_ICONS[field.id]
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {Icon && <Icon size={13} className="field-label-icon" />}
      {field.name}
      {field.required && <span className="required-star"> *</span>}
    </label>
  )
}

/* ── Civilité — select déroulant ─────────────────────── */
const CIVILITE_OPTIONS = ['M.', 'Mme', 'M. et Mme', 'Autre']

function SelectField({ field }) {
  const { values, setValue } = useForm()
  return (
    <div className="field-group">
      <Label field={field} htmlFor={`f-${field.id}`} />
      <div className="select-wrap">
        <select
          id={`f-${field.id}`}
          className="field-select"
          value={values[field.id] ?? ''}
          onChange={e => setValue(field.id, e.target.value)}
        >
          <option value="">— Sélectionner —</option>
          {CIVILITE_OPTIONS.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/* ── Téléphone — indicatif + numéro ─────────────────── */
const DIAL_CODES = [
  { code: '+33',  flag: '🇫🇷', label: '+33'  },
  { code: '+32',  flag: '🇧🇪', label: '+32'  },
  { code: '+41',  flag: '🇨🇭', label: '+41'  },
  { code: '+352', flag: '🇱🇺', label: '+352' },
  { code: '+212', flag: '🇲🇦', label: '+212' },
  { code: '+213', flag: '🇩🇿', label: '+213' },
  { code: '+216', flag: '🇹🇳', label: '+216' },
  { code: '+1',   flag: '🇨🇦', label: '+1'   },
]

function TelSplitField({ field }) {
  const { values, setValue } = useForm()
  const raw = values[field.id] ?? ''

  const [dialCode, setDialCode] = useState(() => {
    for (const d of DIAL_CODES) {
      if (raw.startsWith(d.code + ' ')) return d.code
    }
    return '+33'
  })
  const [number, setNumber] = useState(() => {
    for (const d of DIAL_CODES) {
      if (raw.startsWith(d.code + ' ')) return raw.slice(d.code.length + 1)
    }
    return raw
  })

  const update = (dc, nb) => setValue(field.id, nb ? `${dc} ${nb}` : '')

  return (
    <div className="field-group">
      <Label field={field} htmlFor="f-tel-num" />
      <div className="tel-row">
        <div className="tel-dial-wrap">
          <select
            className="tel-dial-select"
            value={dialCode}
            onChange={e => { setDialCode(e.target.value); update(e.target.value, number) }}
          >
            {DIAL_CODES.map(d => (
              <option key={d.code} value={d.code}>{d.flag} {d.label}</option>
            ))}
          </select>
        </div>
        <input
          id="f-tel-num"
          type="tel"
          className="field-input"
          value={number}
          placeholder="06 00 00 00 00"
          onChange={e => { setNumber(e.target.value); update(dialCode, e.target.value) }}
        />
      </div>
    </div>
  )
}

/* ── Code postal — auto-complétion ville ─────────────── */
function PostalCodeField({ field }) {
  const { values, setValue } = useForm()
  const [cities, setCities]       = useState([])
  const [loadingCity, setLoading] = useState(false)
  const cp = values[field.id] ?? ''

  useEffect(() => {
    if (!/^\d{5}$/.test(cp)) {
      setCities([])
      if (cp.length < 5) setValue(2090, '')
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom&limit=15`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setCities(data)
        if (data.length >= 1) setValue(2090, data[0].nom.toUpperCase())
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cp])

  const selectedCity = values[2090] ?? ''

  return (
    <div className="field-group">
      <Label field={field} htmlFor={`f-${field.id}`} />
      <div className="cp-input-wrap">
        <input
          id={`f-${field.id}`}
          type="text"
          inputMode="numeric"
          maxLength={5}
          className="field-input"
          value={cp}
          placeholder="75000"
          onChange={e => setValue(field.id, e.target.value.replace(/\D/g, ''))}
        />
        {loadingCity && <IconLoader size={16} className="icon-spinner cp-spinner" />}
      </div>
      {cities.length > 1 && (
        <div className="cp-city-list">
          {cities.map(c => (
            <button
              key={c.code ?? c.nom}
              type="button"
              className={`cp-city-btn${selectedCity === c.nom.toUpperCase() ? ' cp-city-btn--on' : ''}`}
              onClick={() => setValue(2090, c.nom.toUpperCase())}
            >
              {c.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Champs génériques ───────────────────────────────── */
function TextField({ field }) {
  const { values, setValue } = useForm()
  return (
    <div className="field-group">
      <Label field={field} htmlFor={`f-${field.id}`} />
      <input
        id={`f-${field.id}`}
        type="text"
        className="field-input"
        value={values[field.id] ?? ''}
        placeholder={field.name}
        autoComplete="off"
        onChange={e => setValue(field.id, field.uppercase ? e.target.value.toUpperCase() : e.target.value)}
      />
    </div>
  )
}

function TelField({ field }) {
  const { values, setValue } = useForm()
  return (
    <div className="field-group">
      <Label field={field} htmlFor={`f-${field.id}`} />
      <input
        id={`f-${field.id}`}
        type="tel"
        className="field-input"
        value={values[field.id] ?? ''}
        placeholder="06 00 00 00 00"
        onChange={e => setValue(field.id, e.target.value)}
      />
    </div>
  )
}

function TextareaField({ field }) {
  const { values, setValue } = useForm()
  return (
    <div className="field-group">
      <Label field={field} htmlFor={`f-${field.id}`} />
      <textarea
        id={`f-${field.id}`}
        className="field-input field-textarea"
        value={values[field.id] ?? ''}
        placeholder={field.name}
        rows={4}
        onChange={e => setValue(field.id, e.target.value)}
      />
    </div>
  )
}

function RadioField({ field }) {
  const { values, setValue } = useForm()
  const selected = values[field.id] ?? ''
  return (
    <div className="field-group">
      <Label field={field} />
      <div className="option-grid">
        {field.options?.map(opt => (
          <button
            key={opt.id}
            type="button"
            className={`option-card${selected === opt.id ? ' option-card--on' : ''}`}
            onClick={() => setValue(field.id, opt.id)}
          >
            {opt.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function CheckboxField({ field }) {
  const { values, setValue } = useForm()
  const raw = values[field.id]
  const selected = Array.isArray(raw) ? raw : raw ? [raw] : []

  const toggle = id => {
    const next = selected.includes(id)
      ? selected.filter(v => v !== id)
      : [...selected, id]
    setValue(field.id, next)
  }

  return (
    <div className="field-group">
      <Label field={field} />
      <div className="option-grid">
        {field.options?.map(opt => (
          <button
            key={opt.id}
            type="button"
            className={`option-card${selected.includes(opt.id) ? ' option-card--checkbox-on' : ''}`}
            onClick={() => toggle(opt.id)}
          >
            {opt.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Dispatcher ──────────────────────────────────────── */
export function FieldRenderer({ field }) {
  if (field.id === 2262) return <SelectField    field={field} />
  if (field.id === 2015) return <TelSplitField  field={field} />
  if (field.id === 2089) return <PostalCodeField field={field} />

  switch (field.fieldtype_id) {
    case 1:  return <TextField     field={field} />
    case 2:  return <TextareaField field={field} />
    case 4:  return <CheckboxField field={field} />
    case 5:  return <RadioField    field={field} />
    case 6:  return <TelField      field={field} />
    case 50: return <RadioField    field={field} />
    default: return <TextField     field={field} />
  }
}
