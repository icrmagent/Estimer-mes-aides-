import { useState, useRef } from 'react'

export default function QuestionEditor({ questions = [], onReorder, onDelete, onEdit }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const dragOverIndex = useRef(null)

  function handleDragStart(index) {
    setDragIndex(index)
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    dragOverIndex.current = index
  }

  function handleDrop() {
    if (dragIndex === null || dragOverIndex.current === null) return
    if (dragIndex === dragOverIndex.current) {
      setDragIndex(null)
      return
    }
    const newOrder = [...questions]
    const [moved] = newOrder.splice(dragIndex, 1)
    newOrder.splice(dragOverIndex.current, 0, moved)
    onReorder(newOrder)
    setDragIndex(null)
    dragOverIndex.current = null
  }

  function handleDragEnd() {
    setDragIndex(null)
    dragOverIndex.current = null
  }

  const TYPE_LABELS = {
    texte_court: 'Texte court',
    texte_long: 'Texte long',
    option_unique: 'Option unique',
    options_multiples: 'Options multiples',
    telephone: 'Téléphone',
    email: 'Email',
  }

  return (
    <div className="space-y-2">
      {questions.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Aucune question. Cliquez sur « Ajouter une question » pour commencer.
        </div>
      )}
      {questions.map((q, index) => (
        <div
          key={q.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 transition-opacity ${
            dragIndex === index ? 'opacity-40' : 'opacity-100'
          }`}
          style={{ cursor: 'grab' }}
        >
          {/* Drag handle */}
          <span className="text-gray-400 text-lg select-none" title="Glisser pour réordonner">⠿</span>

          {/* Order badge */}
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: '#5B2D8E' }}
          >
            {q.orderPage || index + 1}
          </span>

          {/* Question info */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">
              {q.libelleQuestion?.fr || q.libelleQuestion || <span className="text-red-400 italic">Libellé FR manquant</span>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {TYPE_LABELS[q.typeOption] || q.typeOption}
              {q.obligatoire && <span className="ml-2 text-red-500">• Obligatoire</span>}
            </div>
          </div>

          {/* Actions — onMouseDown stops the parent draggable from consuming the click */}
          <div
            className="flex items-center gap-2 flex-shrink-0"
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onEdit(q)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '36px', cursor: 'pointer' }}
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => onDelete(q.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              style={{ minHeight: '36px', cursor: 'pointer' }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
