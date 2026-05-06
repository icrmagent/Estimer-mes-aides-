import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

// NOTE: Data isolation is enforced server-side via the ADMIN_BORNE JWT role check.
// The backend automatically filters enregistrements to only those belonging to the
// authenticated AdminBorne's assigned bornes. No client-side filtering is needed.

function StatutBadge({ statut }) {
  const styles = {
    en_attente: 'bg-yellow-100 text-yellow-700',
    en_cours: 'bg-blue-100 text-blue-700',
    partage: 'bg-green-100 text-green-700',
    echec_temporaire: 'bg-orange-100 text-orange-700',
    echec_definitif: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut?.replace(/_/g, ' ')}
    </span>
  )
}

export default function ABEnregistrementsPage() {
  const [enregistrements, setEnregistrements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const [filters, setFilters] = useState({
    borneId: '',
    dateDebut: '',
    dateFin: '',
  })

  const fetchData = useCallback((p = 1, f = filters) => {
    setLoading(true)
    const params = { page: p, limit }
    if (f.borneId) params.borneId = f.borneId
    if (f.dateDebut) params.dateDebut = f.dateDebut
    if (f.dateFin) params.dateFin = f.dateFin

    api.get('/api/enregistrements', { params })
      .then(res => {
        setEnregistrements(res.data.enregistrements || res.data.data || res.data || [])
        setTotal(res.data.total || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { fetchData(page) }, [page])

  function handleFilterChange(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    fetchData(1, filters)
  }

  async function handleExport() {
    try {
      const params = new URLSearchParams()
      if (filters.borneId) params.set('borneId', filters.borneId)
      if (filters.dateDebut) params.set('dateDebut', filters.dateDebut)
      if (filters.dateFin) params.set('dateFin', filters.dateFin)

      const res = await api.get(`/api/enregistrements/export?${params.toString()}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `mes-enregistrements-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Erreur lors de l\'export')
    }
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Enregistrements</h1>
            <p className="text-gray-500 text-sm mt-1">{total} enregistrement{total !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2.5 text-sm font-semibold rounded-xl text-white"
            style={{ background: '#1A56A0', minHeight: '48px' }}
          >
            ↓ Exporter XLSX
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Filters */}
        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Borne</label>
              <input
                type="text"
                value={filters.borneId}
                onChange={e => handleFilterChange('borneId', e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Filtrer par borne"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date début</label>
              <input
                type="date"
                value={filters.dateDebut}
                onChange={e => handleFilterChange('dateDebut', e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date fin</label>
              <input
                type="date"
                value={filters.dateFin}
                onChange={e => handleFilterChange('dateFin', e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white"
              style={{ background: '#5B2D8E', minHeight: '40px' }}
            >
              Filtrer
            </button>
            <button
              type="button"
              onClick={() => {
                const reset = { borneId: '', dateDebut: '', dateFin: '' }
                setFilters(reset)
                setPage(1)
                fetchData(1, reset)
              }}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              style={{ minHeight: '40px' }}
            >
              Réinitialiser
            </button>
          </div>
        </form>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : enregistrements.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucun enregistrement trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Langue</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {enregistrements.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-700">{e.borne?.idBorne || e.borneId || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.formulaire?.label || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                        {e.langueUtilisee || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={e.statutPartage} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.createdAt ? new Date(e.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              style={{ minHeight: '40px' }}
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-500">Page {page} / {Math.ceil(total / limit)}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40"
              style={{ minHeight: '40px' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
