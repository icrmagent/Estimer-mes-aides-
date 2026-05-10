import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

const PRIMARY = '#5B2D8E'

function unwrap(res) {
  return res.data.data || res.data.categories || res.data || []
}

export default function CategoriesQuestionsPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [newCategorie, setNewCategorie] = useState('')
  const [newSousCategorie, setNewSousCategorie] = useState({ categorieId: '', nom: '' })
  const [editing, setEditing] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)

  const totalSousCategories = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.sousCategories?.length || 0), 0),
    [categories]
  )

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/categories-questions')
      const data = unwrap(res)
      setCategories(Array.isArray(data) ? data : [])
      setNewSousCategorie((prev) => ({
        ...prev,
        categorieId: prev.categorieId || data?.[0]?.id || '',
      }))
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors du chargement des catégories')
    } finally {
      setLoading(false)
    }
  }

  async function createCategorie() {
    if (!newCategorie.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/api/categories-questions', { nom: newCategorie.trim() })
      setNewCategorie('')
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function createSousCategorie() {
    if (!newSousCategorie.nom.trim() || !newSousCategorie.categorieId) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/api/categories-questions/sous-categories', {
        categorieId: newSousCategorie.categorieId,
        nom: newSousCategorie.nom.trim(),
      })
      setNewSousCategorie((prev) => ({ ...prev, nom: '' }))
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function saveCategorie(id) {
    const nom = editing[`cat:${id}`]?.trim()
    if (!nom) return
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/categories-questions/${id}`, { nom })
      setEditing((prev) => ({ ...prev, [`cat:${id}`]: undefined }))
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function saveSousCategorie(id) {
    const nom = editing[`sub:${id}`]?.trim()
    if (!nom) return
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/categories-questions/sous-categories/${id}`, { nom })
      setEditing((prev) => ({ ...prev, [`sub:${id}`]: undefined }))
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function deleteResource() {
    if (!confirmDelete) return
    setSaving(true)
    setError(null)
    try {
      const url = confirmDelete.type === 'category'
        ? `/api/categories-questions/${confirmDelete.id}`
        : `/api/categories-questions/sous-categories/${confirmDelete.id}`
      await api.delete(url)
      setConfirmDelete(null)
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Suppression impossible')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent'
  const buttonClass = 'px-4 py-3 text-sm font-semibold rounded-xl disabled:opacity-60'

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Catégories de questions</h1>
            <p className="text-gray-500 text-sm mt-1">
              {categories.length} catégorie{categories.length !== 1 ? 's' : ''} · {totalSousCategories} sous-catégorie{totalSousCategories !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={loadCategories}
            className={`${buttonClass} border border-gray-200 text-gray-700 bg-white`}
            style={{ minHeight: '48px' }}
          >
            Actualiser
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-500 font-semibold">Fermer</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Ajouter une catégorie</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newCategorie}
                onChange={(e) => setNewCategorie(e.target.value)}
                className={inputClass}
                style={{ minHeight: '48px', fontSize: '16px' }}
                placeholder="Ex. Informations Personnelles"
              />
              <button
                type="button"
                onClick={createCategorie}
                disabled={saving || !newCategorie.trim()}
                className={`${buttonClass} text-white`}
                style={{ background: PRIMARY, minHeight: '48px' }}
              >
                Ajouter
              </button>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Ajouter une sous-catégorie</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={newSousCategorie.categorieId}
                onChange={(e) => setNewSousCategorie((prev) => ({ ...prev, categorieId: e.target.value }))}
                className={inputClass}
                style={{ minHeight: '48px', fontSize: '16px' }}
              >
                <option value="">Choisir une catégorie</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nom}</option>
                ))}
              </select>
              <input
                type="text"
                value={newSousCategorie.nom}
                onChange={(e) => setNewSousCategorie((prev) => ({ ...prev, nom: e.target.value }))}
                className={inputClass}
                style={{ minHeight: '48px', fontSize: '16px' }}
                placeholder="Ex. Vos Besoins 1/5"
              />
            </div>
            <button
              type="button"
              onClick={createSousCategorie}
              disabled={saving || !newSousCategorie.categorieId || !newSousCategorie.nom.trim()}
              className={`${buttonClass} text-white`}
              style={{ background: PRIMARY, minHeight: '48px' }}
            >
              Ajouter la sous-catégorie
            </button>
          </section>
        </div>

        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Chargement...</div>
          ) : categories.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucune catégorie</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <div key={cat.id} className="p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Catégorie</label>
                      <input
                        type="text"
                        value={editing[`cat:${cat.id}`] ?? cat.nom}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [`cat:${cat.id}`]: e.target.value }))}
                        className={inputClass}
                        style={{ minHeight: '48px', fontSize: '16px' }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 px-3 py-2 rounded-full bg-gray-100">
                        {cat._count?.questions || 0} question(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => saveCategorie(cat.id)}
                        disabled={saving || (editing[`cat:${cat.id}`] ?? cat.nom) === cat.nom}
                        className={`${buttonClass} text-white`}
                        style={{ background: PRIMARY, minHeight: '48px' }}
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ type: 'category', id: cat.id, label: cat.nom })}
                        className={`${buttonClass} border border-red-200 text-red-600 bg-red-50`}
                        style={{ minHeight: '48px' }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <div className="pl-0 md:pl-6 space-y-3">
                    {(cat.sousCategories || []).map((sub) => (
                      <div key={sub.id} className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl bg-gray-50 p-3">
                        <input
                          type="text"
                          value={editing[`sub:${sub.id}`] ?? sub.nom}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [`sub:${sub.id}`]: e.target.value }))}
                          className={inputClass}
                          style={{ minHeight: '48px', fontSize: '16px' }}
                        />
                        <span className="text-xs text-gray-500 px-3 py-2 rounded-full bg-white">
                          {sub._count?.questions || 0} question(s)
                        </span>
                        <button
                          type="button"
                          onClick={() => saveSousCategorie(sub.id)}
                          disabled={saving || (editing[`sub:${sub.id}`] ?? sub.nom) === sub.nom}
                          className={`${buttonClass} text-white`}
                          style={{ background: PRIMARY, minHeight: '48px' }}
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ type: 'subcategory', id: sub.id, label: sub.nom })}
                          className={`${buttonClass} border border-red-200 text-red-600 bg-white`}
                          style={{ minHeight: '48px' }}
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {confirmDelete && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Confirmer la suppression</h2>
              <p className="text-sm text-gray-600">
                Supprimer « {confirmDelete.label} » ? La suppression sera refusée si des questions l’utilisent.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className={`${buttonClass} border border-gray-200 text-gray-700 bg-white`}
                  style={{ minHeight: '48px' }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={deleteResource}
                  disabled={saving}
                  className={`${buttonClass} text-white bg-red-600`}
                  style={{ minHeight: '48px' }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
