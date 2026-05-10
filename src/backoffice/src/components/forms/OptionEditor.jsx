import I18nTextInput from './I18nTextInput.jsx'

export default function OptionEditor({ options = [], onChange }) {
  function generateId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15)
  }

  function addOption() {
    onChange([...options, { id: generateId(), label: { fr: '', es: '', en: '' } }])
  }

  function updateOption(index, value) {
    const updated = [...options]
    const current = updated[index]
    const id = current.id || generateId()
    updated[index] = { id, label: value }
    onChange(updated)
  }

  function removeOption(index) {
    onChange(options.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Options de réponse</span>
        <button
          type="button"
          onClick={addOption}
          className="text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
          style={{ background: '#5B2D8E', minHeight: '36px' }}
        >
          + Ajouter une option
        </button>
      </div>

      {options.length === 0 && (
        <div className="text-sm text-gray-400 italic py-2">Aucune option définie.</div>
      )}

      {options.map((opt, index) => {
        const val = opt.label || opt
        const key = opt.id || index
        return (
          <div key={key} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-xs text-gray-400 font-medium mt-3 w-5 flex-shrink-0">{index + 1}.</span>
            <div className="flex-1">
              <I18nTextInput
                value={val}
                onChange={(newVal) => updateOption(index, newVal)}
                required={true}
              />
            </div>
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="mt-2 text-red-400 hover:text-red-600 transition-colors p-1 rounded"
              style={{ minHeight: '36px', minWidth: '36px' }}
              title="Supprimer cette option"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
