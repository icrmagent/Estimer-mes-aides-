import { useState, useEffect } from 'react'
import { useForm } from '../context/FormContext'
import { DialCodePicker } from './DialCodePicker'
import {
  IconUser, IconMapPin, IconPhone, IconMail,
  IconEuro, IconHome, IconCalendar, IconRuler,
  IconFlame, IconWrench, IconClipboard, IconLoader,
  IconBuilding, IconDroplet, IconWind, IconMoon,
  IconThermometer, IconTree, IconSun, IconBolt,
  IconCheckCircle, IconXCircle,
} from './Icons'

/* ── Field label icons ───────────────────────────────── */
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

/* ── Option illustrative icons ───────────────────────── */
export const OPTION_ICONS = {
  2292: [IconBuilding,  IconHome],
  2293: [IconHome,      IconHome,        IconHome,      IconUser],
  2294: [IconEuro,      IconEuro,        IconEuro,      IconEuro],
  2296: [IconHome,      IconWrench],
  2297: [IconWrench,    IconWrench,      IconWrench,    IconWrench],
  2298: [IconTree,      IconWrench,      IconWrench,    IconWrench,    IconWrench],
  2299: [IconWrench,    IconWind],
  2300: [IconXCircle,   IconCheckCircle],
  2301: [IconTree,      IconDroplet,     IconFlame,     IconThermometer, IconBolt],
  2303: [IconWrench,    IconFlame,       IconWind,      IconSun,       IconHome],
  2304: [IconSun,       IconSun,         IconMoon,      IconCalendar],
  2306: [IconCalendar,  IconCalendar],
  2307: [IconRuler,     IconRuler,       IconRuler,     IconRuler],
}

/* ── Label with contextual icon ─────────────────────── */
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

/* ── Téléphone — indicatif pays + numéro ────────────── */
function TelSplitField({ field }) {
  const { values, setValue } = useForm()
  const raw = values[field.id] ?? ''

  const parseDialCode = r => {
    for (const n of ['+1869', '+1868', '+1876', '+1809', '+1784', '+1758', '+1473', '+1268', '+1246', '+1242']) {
      if (r.startsWith(n + ' ')) return n
    }
    const m = r.match(/^(\+\d{1,4}) /)
    return m ? m[1] : '+33'
  }

  const [dialCode, setDialCode] = useState(() => parseDialCode(raw))
  const [number,   setNumber]   = useState(() => {
    const dc = parseDialCode(raw)
    return raw.startsWith(dc + ' ') ? raw.slice(dc.length + 1) : raw
  })

  const update = (dc, nb) => setValue(field.id, nb ? `${dc} ${nb}` : '')

  return (
    <div className="field-group">
      <Label field={field} htmlFor="f-tel-num" />
      <div className="tel-row">
        <DialCodePicker
          value={dialCode}
          onChange={dc => { setDialCode(dc); update(dc, number) }}
        />
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
  const icons    = OPTION_ICONS[field.id] ?? []

  return (
    <div className="field-group">
      <Label field={field} />
      <div className="option-grid">
        {field.options?.map((opt, idx) => {
          const Icon = icons[idx]
          return (
            <button
              key={opt.id}
              type="button"
              className={`option-card${Icon ? ' option-card--icon' : ''}${selected === opt.id ? ' option-card--on' : ''}`}
              onClick={() => setValue(field.id, opt.id)}
            >
              {Icon && <Icon size={22} className="option-icon" />}
              <span className="option-label">{opt.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CheckboxField({ field }) {
  const { values, setValue } = useForm()
  const raw      = values[field.id]
  const selected = Array.isArray(raw) ? raw : raw ? [raw] : []
  const icons    = OPTION_ICONS[field.id] ?? []

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
        {field.options?.map((opt, idx) => {
          const Icon = icons[idx]
          return (
            <button
              key={opt.id}
              type="button"
              className={`option-card${Icon ? ' option-card--icon' : ''}${selected.includes(opt.id) ? ' option-card--checkbox-on' : ''}`}
              onClick={() => toggle(opt.id)}
            >
              {Icon && <Icon size={22} className="option-icon" />}
              <span className="option-label">{opt.name}</span>
            </button>
          )
        })}
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
