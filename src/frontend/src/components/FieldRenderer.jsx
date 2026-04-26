import { useForm } from '../context/FormContext'

function Label({ field, htmlFor }) {
  if (!field.name) return null
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {field.name}
      {field.required && <span className="required-star"> *</span>}
    </label>
  )
}

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

// fieldtype_id 4 & 50 → single-select card buttons (centered, no dot)
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

// fieldtype_id 5 → multi-select (teal when selected)
function CheckboxField({ field }) {
  const { values, setValue } = useForm()
  const raw = values[field.id]
  const selected = Array.isArray(raw) ? raw : raw ? [raw] : []

  const toggle = id => {
    const next = selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id]
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

export function FieldRenderer({ field }) {
  switch (field.fieldtype_id) {
    case 1:  return <TextField     field={field} />
    case 2:  return <TextareaField field={field} />
    case 4:  return <RadioField    field={field} />
    case 5:  return <CheckboxField field={field} />
    case 6:  return <TelField      field={field} />
    case 50: return <RadioField    field={field} />
    default: return <TextField     field={field} />
  }
}
