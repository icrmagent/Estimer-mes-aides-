import { useState, useEffect } from 'react'
import { useForm } from '../context/FormContext'
import { PhoneInput } from './PhoneInput'
import {
  IconUser, IconMapPin, IconPhone, IconMail,
  IconEuro, IconHome, IconCalendar, IconRuler,
  IconFlame, IconWrench, IconClipboard, IconLoader,
  IconBuilding, IconDroplet, IconWind, IconMoon,
  IconThermometer, IconTree, IconSun, IconBolt,
  IconCheckCircle, IconXCircle,
  IconKey, IconHelpCircle, IconSunrise, IconClock, IconUsers,
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
  // Type de logement : Appartement / Maison
  2292: [IconBuilding,    IconHome],
  // Statut occupant : Propriétaire occupant / Bailleur / Résidence secondaire / Locataire
  2293: [IconHome,        IconKey,          IconSun,        IconUsers],
  // Revenu fiscal : tranches (4×Euro avec contexte croissant)
  2294: [IconEuro,        IconEuro,         IconEuro,       IconEuro],
  // Travaux déjà réalisés : Non / Oui
  2296: [IconXCircle,     IconCheckCircle],
  // Isolation : Combles / Murs / Plancher / Je ne sais pas
  2297: [IconHome,        IconBuilding,     IconRuler,      IconHelpCircle],
  // Chauffage actuel : Bois / Fioul / Gaz / Électrique / Je ne sais pas
  2298: [IconTree,        IconDroplet,      IconFlame,      IconBolt,       IconHelpCircle],
  // Ventilation : Sans VMC / Avec VMC
  2299: [IconWind,        IconCheckCircle],
  // Chaudière ancienne : Non / Oui
  2300: [IconXCircle,     IconCheckCircle],
  // Énergie de remplacement : Bois/Pellet / Pompe eau / Pompe air / Thermodynamique / Solaire
  2301: [IconTree,        IconDroplet,      IconWind,       IconThermometer, IconSun],
  // Système envisagé : Chaudière / Poêle / PAC / Solaire / Isolation seule
  2303: [IconFlame,       IconTree,         IconWind,       IconSun,        IconHome],
  // Disponibilité : Matin / Après-midi / Soir / Indifférent
  2304: [IconSunrise,     IconSun,          IconMoon,       IconClock],
  // Année travaux : Cette année / Année prochaine
  2306: [IconCalendar,    IconCalendar],
  // Surface : < 50m² / 50-100 / 100-150 / > 150
  2307: [IconRuler,       IconRuler,        IconRuler,      IconRuler],
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

/* ── Téléphone — PhoneInput ──────────────────────────── */
function TelSplitField({ field }) {
  const { setValue } = useForm()
  return (
    <div className="field-group">
      <Label field={field} htmlFor="f-tel-num" />
      <PhoneInput
        inputId="f-tel-num"
        defaultCountry="FR"
        placeholder="06 00 00 00 00"
        onChange={full => setValue(field.id, full)}
      />
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
