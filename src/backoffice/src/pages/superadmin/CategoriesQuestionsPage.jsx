import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import {
  PRIMARY,
  IcoPlus, IcoPencil, IcoTrash, IcoCheck, IcoX, IcoChevron, IcoRefresh,
  Toast, ErrorBanner, ConfirmModal,
} from '../../components/ui.jsx'

const EMPTY_NOM = { fr: '', es: '', en: '' }

const LANGS = [
  { code: 'fr', flag: '🇫🇷', label: 'FR', placeholder: 'Nom en français', required: true },
  { code: 'es', flag: '🇪🇸', label: 'ES', placeholder: 'Nombre en español' },
  { code: 'en', flag: '🇬🇧', label: 'EN', placeholder: 'Name in English' },
]

function parseNom(nom) {
  if (!nom) return {}
  if (typeof nom === 'string') {
    try { return JSON.parse(nom) } catch { return { fr: nom } }
  }
  return nom
}

function displayNom(nom) {
  const obj = parseNom(nom)
  return obj.fr || obj.es || obj.en || ''
}

function NomFields({ value, onChange, compact = false }) {
  const inputH = compact ? '36px' : '44px'
  return (
    <div className="space-y-1.5">
      {LANGS.map(({ code, flag, label, placeholder, required }) => (
        <div key={code} className="flex items-center gap-2">
          <span className="text-base flex-shrink-0 w-6 text-center">{flag}</span>
          <span className="text-xs font-semibold text-gray-400 w-6 flex-shrink-0">{label}</span>
          <input
            type="text"
            value={value[code] || ''}
            onChange={(e) => onChange({ ...value, [code]: e.target.value })}
            placeholder={placeholder}
            required={required}
            className="flex-1 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ minHeight: inputH, fontSize: '16px', borderColor: required && !value[code]?.trim() ? undefined : undefined }}
          />
        </div>
      ))}
    </div>
  )
}

function unwrap(res) {
  return res.data.data || res.data.categories || res.data || []
}

function SkeletonRow() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
        <div className="h-4 rounded bg-gray-200 animate-pulse flex-1" style={{ maxWidth: '220px' }} />
        <div className="h-5 w-8 rounded-full bg-gray-100 animate-pulse ml-auto" />
      </div>
    </div>
  )
}

export default function CategoriesQuestionsPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [newCategorie, setNewCategorie] = useState({ ...EMPTY_NOM })
  const [newSousCategorie, setNewSousCategorie] = useState({ categorieId: '', nom: { ...EMPTY_NOM } })
  const [editing, setEditing] = useState({})
  const [expanded, setExpanded] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)

  const totalSousCategories = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.sousCategories?.length || 0), 0),
    [categories]
  )

  useEffect(() => { loadCategories() }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
  }

  async function loadCategories() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/categories-questions')
      const data = unwrap(res)
      const list = Array.isArray(data) ? data : []
      setCategories(list)
      if (list.length <= 6) {
        const exp = {}
        list.forEach((c) => { exp[c.id] = true })
        setExpanded(exp)
      }
      setNewSousCategorie((prev) => ({
        ...prev,
        categorieId: prev.categorieId || list?.[0]?.id || '',
      }))
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors du chargement des catégories')
    } finally {
      setLoading(false)
    }
  }

  async function createCategorie() {
    if (!newCategorie.fr?.trim()) return
    setSaving(true)
    try {
      await api.post('/api/categories-questions', { nom: newCategorie })
      setNewCategorie({ ...EMPTY_NOM })
      await loadCategories()
      showToast('Catégorie créée avec succès')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function createSousCategorie() {
    if (!newSousCategorie.nom.fr?.trim() || !newSousCategorie.categorieId) return
    setSaving(true)
    try {
      await api.post('/api/categories-questions/sous-categories', {
        categorieId: newSousCategorie.categorieId,
        nom: newSousCategorie.nom,
      })
      setNewSousCategorie((prev) => ({ ...prev, nom: { ...EMPTY_NOM } }))
      await loadCategories()
      showToast('Sous-catégorie créée avec succès')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function saveCategorie(id) {
    const nom = editing[`cat:${id}`]
    if (!nom?.fr?.trim()) return
    setSaving(true)
    try {
      await api.put(`/api/categories-questions/${id}`, { nom })
      setEditing((prev) => { const n = { ...prev }; delete n[`cat:${id}`]; return n })
      await loadCategories()
      showToast('Catégorie enregistrée')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function saveSousCategorie(id) {
    const nom = editing[`sub:${id}`]
    if (!nom?.fr?.trim()) return
    setSaving(true)
    try {
      await api.put(`/api/categories-questions/sous-categories/${id}`, { nom })
      setEditing((prev) => { const n = { ...prev }; delete n[`sub:${id}`]; return n })
      await loadCategories()
      showToast('Sous-catégorie enregistrée')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function deleteResource() {
    if (!confirmDelete) return
    setSaving(true)
    try {
      const url =
        confirmDelete.type === 'category'
          ? `/api/categories-questions/${confirmDelete.id}`
          : `/api/categories-questions/sous-categories/${confirmDelete.id}`
      await api.delete(url)
      setConfirmDelete(null)
      await loadCategories()
      showToast('Supprimé avec succès')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Suppression impossible')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(key, nom) {
    const obj = parseNom(nom)
    setEditing((prev) => ({ ...prev, [key]: { fr: obj.fr || '', es: obj.es || '', en: obj.en || '' } }))
  }

  function cancelEdit(key) {
    setEditing((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <AppLayout>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Catégories de questions</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                style={{ background: '#F3EEF9', color: PRIMARY, borderColor: '#D9C8F0' }}
              >
                {categories.length} catégorie{categories.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                {totalSousCategories} sous-catégorie{totalSousCategories !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadCategories}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            style={{ minHeight: '40px' }}
          >
            <IcoRefresh />
            Actualiser
          </button>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        {/* Add forms */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Nouvelle catégorie */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: PRIMARY }}>
                <IcoPlus />
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Nouvelle catégorie</h2>
            </div>
            <div className="space-y-3">
              <NomFields value={newCategorie} onChange={setNewCategorie} />
              <button
                type="button"
                onClick={createCategorie}
                disabled={saving || !newCategorie.fr?.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                style={{ background: PRIMARY, minHeight: '44px' }}
              >
                <IcoPlus />
                Créer
              </button>
            </div>
          </section>

          {/* Nouvelle sous-catégorie */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: PRIMARY }}>
                <IcoPlus />
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Nouvelle sous-catégorie</h2>
            </div>
            <div className="space-y-3">
              <select
                value={newSousCategorie.categorieId}
                onChange={(e) => setNewSousCategorie((prev) => ({ ...prev, categorieId: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                style={{ minHeight: '44px', fontSize: '16px' }}
              >
                <option value="">Choisir une catégorie…</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{displayNom(cat.nom)}</option>
                ))}
              </select>
              <NomFields
                value={newSousCategorie.nom}
                onChange={(v) => setNewSousCategorie((prev) => ({ ...prev, nom: v }))}
              />
              <button
                type="button"
                onClick={createSousCategorie}
                disabled={saving || !newSousCategorie.categorieId || !newSousCategorie.nom.fr?.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                style={{ background: PRIMARY, minHeight: '44px' }}
              >
                <IcoPlus />
                Créer la sous-catégorie
              </button>
            </div>
          </section>
        </div>

        {/* Category list */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h16M3 6v13h16V6M3 6l2.5-4h13L21 6" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">Aucune catégorie</p>
            <p className="text-xs text-gray-400 mt-1">Créez votre première catégorie ci-dessus</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat, idx) => {
              const catKey = `cat:${cat.id}`
              const isEditingCat = catKey in editing
              const isExpanded = !!expanded[cat.id]
              const subs = cat.sousCategories || []

              return (
                <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3.5">
                    {isEditingCat ? (
                      <div className="flex items-start gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-1"
                          style={{ background: PRIMARY }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <NomFields
                            value={editing[catKey] || EMPTY_NOM}
                            onChange={(v) => setEditing((prev) => ({ ...prev, [catKey]: v }))}
                          />
                        </div>
                        <button
                          onClick={() => saveCategorie(cat.id)}
                          disabled={saving || !editing[catKey]?.fr?.trim()}
                          className="p-2 text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors flex-shrink-0 mt-1"
                          title="Enregistrer"
                        >
                          <IcoCheck />
                        </button>
                        <button
                          onClick={() => cancelEdit(catKey)}
                          className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 mt-1"
                          title="Annuler"
                        >
                          <IcoX />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: PRIMARY }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 truncate block">{displayNom(cat.nom)}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {['es', 'en'].map((lang) => {
                              const obj = parseNom(cat.nom)
                              const val = obj[lang]
                              return val ? (
                                <span key={lang} className="text-xs text-gray-400 truncate max-w-[120px]">
                                  {lang === 'es' ? '🇪🇸' : '🇬🇧'} {val}
                                </span>
                              ) : null
                            })}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 font-medium px-2 py-0.5 rounded-full bg-gray-100 flex-shrink-0 border border-gray-200">
                          {cat._count?.questions || 0}&nbsp;q
                        </span>
                        <button
                          onClick={() => startEdit(catKey, cat.nom)}
                          className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                          title="Modifier"
                        >
                          <IcoPencil />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'category', id: cat.id, label: displayNom(cat.nom) })}
                          className="p-2 text-red-400 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                          title="Supprimer"
                        >
                          <IcoTrash />
                        </button>
                        <button
                          onClick={() => toggleExpand(cat.id)}
                          className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                        >
                          <IcoChevron open={isExpanded} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && !isEditingCat && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-1.5 bg-gray-50/60">
                      {subs.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">
                          Aucune sous-catégorie — utilisez le formulaire ci-dessus pour en ajouter
                        </p>
                      )}
                      {subs.map((sub) => {
                        const subKey = `sub:${sub.id}`
                        const isEditingSub = subKey in editing
                        return (
                          <div key={sub.id} className="bg-white rounded-xl border border-gray-100 px-3 py-2">
                            {isEditingSub ? (
                              <div className="flex items-start gap-2">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0 mt-2">
                                  <path d="M2 2v6h8"/>
                                </svg>
                                <div className="flex-1">
                                  <NomFields
                                    value={editing[subKey] || EMPTY_NOM}
                                    onChange={(v) => setEditing((prev) => ({ ...prev, [subKey]: v }))}
                                    compact
                                  />
                                </div>
                                <button
                                  onClick={() => saveSousCategorie(sub.id)}
                                  disabled={saving || !editing[subKey]?.fr?.trim()}
                                  className="p-1.5 text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors flex-shrink-0 mt-1"
                                >
                                  <IcoCheck />
                                </button>
                                <button
                                  onClick={() => cancelEdit(subKey)}
                                  className="p-1.5 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 mt-1"
                                >
                                  <IcoX />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0">
                                  <path d="M2 2v6h8"/>
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-gray-600 truncate block">{displayNom(sub.nom)}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {['es', 'en'].map((lang) => {
                                      const obj = parseNom(sub.nom)
                                      const val = obj[lang]
                                      return val ? (
                                        <span key={lang} className="text-xs text-gray-400 truncate max-w-[100px]">
                                          {lang === 'es' ? '🇪🇸' : '🇬🇧'} {val}
                                        </span>
                                      ) : null
                                    })}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 flex-shrink-0">
                                  {sub._count?.questions || 0}&nbsp;q
                                </span>
                                <button
                                  onClick={() => startEdit(subKey, sub.nom)}
                                  className="p-1.5 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                                >
                                  <IcoPencil />
                                </button>
                                <button
                                  onClick={() => setConfirmDelete({ type: 'subcategory', id: sub.id, label: displayNom(sub.nom) })}
                                  className="p-1.5 text-red-400 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                                >
                                  <IcoTrash />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Confirmer la suppression"
          message={`« ${confirmDelete.label} » sera définitivement supprimé. Cette action sera refusée si des questions l'utilisent encore.`}
          confirmLabel="Supprimer"
          onConfirm={deleteResource}
          onCancel={() => setConfirmDelete(null)}
          saving={saving}
          danger
        />
      )}
    </AppLayout>
  )
}
