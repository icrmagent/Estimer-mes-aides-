# Skill — Créer une page back-office V2

## Quand utiliser ce skill
Quand tu dois ajouter une nouvelle page au back-office (src/backoffice/).

## Template page SuperAdmin

### 1. Page avec liste + filtres (src/backoffice/src/pages/superadmin/MaListePage.jsx)
```jsx
import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

export default function MaListePage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchItems()
  }, [page])

  async function fetchItems() {
    try {
      setLoading(true)
      const res = await api.get('/api/mon-endpoint', { params: { page, limit: 20 } })
      setItems(res.data.data)
      setTotal(res.data.meta.total)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <AppLayout><div className="p-6">Chargement...</div></AppLayout>
  if (error) return <AppLayout><div className="p-6 text-red-600">{error}</div></AppLayout>

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ma Liste</h1>
          <a
            href="/superadmin/mon-endpoint/new"
            className="px-4 py-3 bg-[#5B2D8E] text-white rounded-lg hover:bg-[#4a2475] text-base font-medium"
            style={{ minHeight: '48px', display: 'flex', alignItems: 'center' }}
          >
            + Nouveau
          </a>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Colonne 1</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Colonne 2</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{item.champ1}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.champ2}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/superadmin/mon-endpoint/${item.id}/edit`}
                      className="text-[#5B2D8E] hover:underline text-sm font-medium"
                    >
                      Modifier
                    </a>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    Aucun élément
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded disabled:opacity-50"
              style={{ minHeight: '48px' }}
            >
              Précédent
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {page} / {Math.ceil(total / 20)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="px-4 py-2 border rounded disabled:opacity-50"
              style={{ minHeight: '48px' }}
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
```

### 2. Page formulaire create/edit
```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

export default function MonFormPage() {
  const { id } = useParams()  // undefined si création
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({ champ1: '', champ2: '' })
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isEdit) {
      api.get(`/api/mon-endpoint/${id}`)
        .then(res => { setForm(res.data.data); setLoading(false) })
        .catch(() => { setError('Erreur de chargement'); setLoading(false) })
    }
  }, [id])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.put(`/api/mon-endpoint/${id}`, form)
      } else {
        await api.post('/api/mon-endpoint', form)
      }
      navigate('/superadmin/mon-endpoint')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <AppLayout><div className="p-6">Chargement...</div></AppLayout>

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isEdit ? 'Modifier' : 'Créer'}
        </h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Champ 1 *
            </label>
            <input
              type="text"
              value={form.champ1}
              onChange={e => setForm(f => ({ ...f, champ1: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#5B2D8E]"
              style={{ minHeight: '48px', fontSize: '16px' }}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-[#5B2D8E] text-white rounded-lg hover:bg-[#4a2475] disabled:opacity-50 font-medium"
              style={{ minHeight: '48px' }}
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              style={{ minHeight: '48px' }}
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
```

## Règles back-office
- Couleur primaire : `#5B2D8E` (jamais #5C2DD3)
- Touch targets : `minHeight: '48px'` sur tous les boutons et inputs
- Font-size inputs : `fontSize: '16px'` minimum
- Pas de `window.open()`, `alert()`, `confirm()` — utiliser des états React pour les erreurs
- Toujours wrapper dans `<AppLayout>` pour avoir Sidebar + TopBar
- Gestion d'erreur : afficher inline, pas de modal bloquante
- Loading state : afficher "Chargement..." pendant les requêtes
- Après save : `navigate(-1)` ou vers la liste

## Ajouter la route dans App.jsx
```jsx
// src/backoffice/src/App.jsx
// Dans la section /superadmin/* :
<Route path="mon-endpoint" element={<MaListePage />} />
<Route path="mon-endpoint/new" element={<MonFormPage />} />
<Route path="mon-endpoint/:id/edit" element={<MonFormPage />} />
```
