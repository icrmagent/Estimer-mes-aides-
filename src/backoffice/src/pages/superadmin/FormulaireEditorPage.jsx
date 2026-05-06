import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import I18nTextInput from '../../components/forms/I18nTextInput.jsx'
import QuestionEditor from '../../components/forms/QuestionEditor.jsx'
import OptionEditor from '../../components/forms/OptionEditor.jsx'
import api from '../../services/api.js'

const TYPE_OPTIONS = [
  { value: 'texte_court', label: 'Texte court' },
  { value: 'texte_long', label: 'Texte long' },
  { value: 'option_unique', label: 'Option unique' },
  { value: 'options_multiples', label: 'Options multiples' },
  { value: 'telephone', label: 'Téléphone' },
  { value: 'email', label: 'Email' },
]

const NEEDS_OPTIONS = ['option_unique', 'options_multiples']

function StatutBadge({ statut }) {
  const styles = {
    publie: 'bg-blue-100 text-blue-700',
    brouillon: 'bg-yellow-100 text-yellow-700',
    archive: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut}
    </span>
  )
}

const emptyQuestion = () => ({
  libelleQuestion: { fr: '', es: '', en: '' },
  typeOption: 'option_unique',
  options: [],
  paragrapheInfo: { fr: '', es: '', en: '' },
  obligatoire: true,
  orderPage: 1,
})

export default function FormulaireEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [formulaire, setFormulaire] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [showAddQuestion, setShowAddQuestion] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null) // question being edited
  const [newQuestion, setNewQuestion] = useState(emptyQuestion())

  // Formulaire metadata
  const [meta, setMeta] = useState({
    label: '',
    dureeRetourAccueil: 30,
    annulationInactivite: 60,
    pageDebutConfig: { titre: { fr: '', es: '', en: '' }, sousTitre: { fr: '', es: '', en: '' }, labelBouton: { fr: '', es: '', en: '' } },
    pageFinConfig: { titre: { fr: '', es: '', en: '' }, message: { fr: '', es: '', en: '' } },
  })

  useEffect(() => {
    Promise.all([
      api.get(`/api/formulaires/${id}`),
      api.get(`/api/formulaires/${id}/questions`),
    ])
      .then(([fRes, qRes]) => {
        const f = fRes.data.formulaire || fRes.data
        setFormulaire(f)
        setMeta({
          label: f.label || '',
          dureeRetourAccueil: f.dureeRetourAccueil || 30,
          annulationInactivite: f.annulationInactivite || 60,
          pageDebutConfig: f.pageDebutConfig || { titre: {}, sousTitre: {}, labelBouton: {} },
          pageFinConfig: f.pageFinConfig || { titre: {}, message: {} },
        })
        const qs = qRes.data.questions || qRes.data.data || qRes.data || []
        setQuestions(qs.sort((a, b) => (a.orderPage || 0) - (b.orderPage || 0)))
      })
      .catch(() => setError('Formulaire introuvable'))
      .finally(() => setLoading(false))
  }, [id])

  async function saveMeta() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/formulaires/${id}`, meta)
      setFormulaire(prev => ({ ...prev, ...meta }))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangeStatut(newStatut) {
    setValidationErrors([])
    try {
      await api.patch(`/api/formulaires/${id}/statut`, { statut: newStatut })
      setFormulaire(prev => ({ ...prev, statut: newStatut }))
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 422 && data?.errors) {
        setValidationErrors(data.errors)
      } else {
        setError(data?.error || 'Erreur lors du changement de statut')
      }
    }
  }

  async function handleReorder(newOrder) {
    const reordered = newOrder.map((q, i) => ({ ...q, orderPage: i + 1 }))
    setQuestions(reordered)
    try {
      await api.patch(`/api/formulaires/${id}/questions/reorder`, {
        order: reordered.map(q => ({ id: q.id, orderPage: q.orderPage })),
      })
    } catch {
      // Revert on error
      setQuestions(questions)
    }
  }

  async function handleDeleteQuestion(questionId) {
    try {
      await api.delete(`/api/formulaires/${id}/questions/${questionId}`)
      setQuestions(prev => prev.filter(q => q.id !== questionId))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  function handleEditQuestion(q) {
    setEditingQuestion({ ...q })
    setShowAddQuestion(false)
  }

  async function handleSaveEditQuestion() {
    if (!editingQuestion) return
    setSaving(true)
    try {
      const res = await api.put(`/api/formulaires/${id}/questions/${editingQuestion.id}`, editingQuestion)
      const updated = res.data.question || res.data
      setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? updated : q))
      setEditingQuestion(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddQuestion() {
    setSaving(true)
    try {
      const payload = {
        ...newQuestion,
        orderPage: questions.length + 1,
      }
      const res = await api.post(`/api/formulaires/${id}/questions`, payload)
      const created = res.data.question || res.data
      setQuestions(prev => [...prev, created])
      setNewQuestion(emptyQuestion())
      setShowAddQuestion(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'ajout')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '48px', fontSize: '16px' }

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64 text-gray-400">Chargement...</div>
    </AppLayout>
  )

  if (error && !formulaire) return (
    <AppLayout>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{formulaire?.label || 'Éditeur de formulaire'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatutBadge statut={formulaire?.statut} />
              <span className="text-gray-400 text-sm">v{formulaire?.version}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {formulaire?.statut === 'brouillon' && (
              <button
                onClick={() => handleChangeStatut('publie')}
                className="px-4 py-2.5 text-sm font-semibold rounded-xl text-white"
                style={{ background: '#1A56A0', minHeight: '48px' }}
              >
                Publier
              </button>
            )}
            {formulaire?.statut === 'publie' && (
              <button
                onClick={() => handleChangeStatut('archive')}
                className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                style={{ minHeight: '48px' }}
              >
                Archiver
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Validation errors (422) */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-semibold text-sm mb-2">
              Impossible de publier — libellés FR manquants :
            </p>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-red-600 text-sm">{e.message || e}</li>
              ))}
            </ul>
            <button
              onClick={() => setValidationErrors([])}
              className="mt-3 text-red-400 hover:text-red-600 text-xs"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Metadata section */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Paramètres généraux</h2>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Label du formulaire <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={meta.label}
              onChange={e => setMeta(m => ({ ...m, label: e.target.value }))}
              className={inputClass}
              style={inputStyle}
              placeholder="Formulaire V2 — Rénovation énergétique"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Durée retour accueil (s)</label>
              <input
                type="number"
                value={meta.dureeRetourAccueil}
                onChange={e => setMeta(m => ({ ...m, dureeRetourAccueil: parseInt(e.target.value) || 30 }))}
                className={inputClass}
                style={inputStyle}
                min={5}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Annulation inactivité (s)</label>
              <input
                type="number"
                value={meta.annulationInactivite}
                onChange={e => setMeta(m => ({ ...m, annulationInactivite: parseInt(e.target.value) || 60 }))}
                className={inputClass}
                style={inputStyle}
                min={10}
              />
            </div>
          </div>

          {/* Page début config */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Page de début</h3>
            <div className="space-y-4">
              <I18nTextInput
                label="Titre"
                value={meta.pageDebutConfig?.titre || {}}
                onChange={v => setMeta(m => ({ ...m, pageDebutConfig: { ...m.pageDebutConfig, titre: v } }))}
                required
              />
              <I18nTextInput
                label="Sous-titre"
                value={meta.pageDebutConfig?.sousTitre || {}}
                onChange={v => setMeta(m => ({ ...m, pageDebutConfig: { ...m.pageDebutConfig, sousTitre: v } }))}
                multiline
              />
              <I18nTextInput
                label="Label du bouton"
                value={meta.pageDebutConfig?.labelBouton || {}}
                onChange={v => setMeta(m => ({ ...m, pageDebutConfig: { ...m.pageDebutConfig, labelBouton: v } }))}
                required
              />
            </div>
          </div>

          {/* Page fin config */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Page de fin</h3>
            <div className="space-y-4">
              <I18nTextInput
                label="Titre"
                value={meta.pageFinConfig?.titre || {}}
                onChange={v => setMeta(m => ({ ...m, pageFinConfig: { ...m.pageFinConfig, titre: v } }))}
                required
              />
              <I18nTextInput
                label="Message"
                value={meta.pageFinConfig?.message || {}}
                onChange={v => setMeta(m => ({ ...m, pageFinConfig: { ...m.pageFinConfig, message: v } }))}
                multiline
                required
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={saveMeta}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-60"
              style={{ background: '#5B2D8E', minHeight: '48px' }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </div>
        </div>

        {/* Questions section */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              Questions ({questions.length})
            </h2>
            <button
              onClick={() => { setShowAddQuestion(true); setEditingQuestion(null) }}
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white"
              style={{ background: '#5B2D8E', minHeight: '40px' }}
            >
              + Ajouter une question
            </button>
          </div>

          <QuestionEditor
            questions={questions}
            onReorder={handleReorder}
            onDelete={handleDeleteQuestion}
            onEdit={handleEditQuestion}
          />

          {/* Add question inline form */}
          {showAddQuestion && (
            <QuestionForm
              question={newQuestion}
              onChange={setNewQuestion}
              onSave={handleAddQuestion}
              onCancel={() => setShowAddQuestion(false)}
              saving={saving}
              title="Nouvelle question"
            />
          )}

          {/* Edit question inline form */}
          {editingQuestion && (
            <QuestionForm
              question={editingQuestion}
              onChange={setEditingQuestion}
              onSave={handleSaveEditQuestion}
              onCancel={() => setEditingQuestion(null)}
              saving={saving}
              title="Modifier la question"
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}

function QuestionForm({ question, onChange, onSave, onCancel, saving, title }) {
  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '48px', fontSize: '16px' }
  const needsOptions = NEEDS_OPTIONS.includes(question.typeOption)

  return (
    <div className="border-2 border-dashed rounded-2xl p-5 space-y-4" style={{ borderColor: '#5B2D8E' }}>
      <h3 className="text-sm font-semibold" style={{ color: '#5B2D8E' }}>{title}</h3>

      <I18nTextInput
        label="Libellé de la question"
        value={question.libelleQuestion || {}}
        onChange={v => onChange(q => ({ ...q, libelleQuestion: v }))}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Type de réponse</label>
          <select
            value={question.typeOption}
            onChange={e => onChange(q => ({ ...q, typeOption: e.target.value, options: [] }))}
            className={inputClass}
            style={inputStyle}
          >
            {TYPE_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Ordre</label>
          <input
            type="number"
            value={question.orderPage || 1}
            onChange={e => onChange(q => ({ ...q, orderPage: parseInt(e.target.value) || 1 }))}
            className={inputClass}
            style={inputStyle}
            min={1}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="obligatoire"
          checked={question.obligatoire ?? true}
          onChange={e => onChange(q => ({ ...q, obligatoire: e.target.checked }))}
          className="w-5 h-5 rounded"
          style={{ accentColor: '#5B2D8E' }}
        />
        <label htmlFor="obligatoire" className="text-sm font-medium text-gray-700">Question obligatoire</label>
      </div>

      <I18nTextInput
        label="Paragraphe d'information (optionnel)"
        value={question.paragrapheInfo || {}}
        onChange={v => onChange(q => ({ ...q, paragrapheInfo: v }))}
        multiline
      />

      {needsOptions && (
        <OptionEditor
          options={question.options || []}
          onChange={opts => onChange(q => ({ ...q, options: opts }))}
        />
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
          style={{ minHeight: '44px' }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-60"
          style={{ background: '#5B2D8E', minHeight: '44px' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
