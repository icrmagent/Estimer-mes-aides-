import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

function StatusBadge({ statut }) {
  const styles = {
    actif: 'bg-green-100 text-green-700',
    inactif: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut}
    </span>
  )
}

export default function BornesListPage() {
  const [bornes, setBornes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  function fetchBornes(p = 1) {
    setLoading(true)
    api.get('/api/bornes', { params: { page: p, limit } })
      .then(res => {
        setBornes(res.data.bornes || res.data.data || res.data || [])
        setTotal(res.data.total || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchBornes(page) }, [page])

  async function toggleStatut(borne) {
    const newStatut = borne.statut === 'actif' ? 'inactif' : 'actif'
    try {
      await api.patch(`/api/bornes/${borne.id}/statut`, { statut: newStatut })
      setBornes(prev => prev.map(b => b.id === borne.id ? { ...b, statut: newStatut } : b))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour')
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bornes</h1>
            <p className="text-gray-500 text-sm mt-1">{total} borne{total !== 1 ? 's' : ''} au total</p>
          </div>
          <Link
            to="/superadmin/bornes/new"
            className="px-4 py-2.5 text-white font-semibold rounded-xl text-sm transition-opacity hover:opacity-90"
            style={{ background: '#5B2D8E', minHeight: '48px', display: 'flex', alignItems: 'center' }}
          >
            + Nouvelle borne
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : bornes.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucune borne trouvée</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Admin Borne</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bornes.map(borne => (
                  <tr key={borne.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{borne.idBorne}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{borne.adresse}</td>
                    <td className="px-4 py-3"><StatusBadge statut={borne.statut} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{borne.formulaire?.label || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {borne.adminBorne ? `${borne.adminBorne.nom} ${borne.adminBorne.prenom}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleStatut(borne)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                          style={{
                            minHeight: '36px',
                            borderColor: borne.statut === 'actif' ? '#d1d5db' : '#5B2D8E',
                            color: borne.statut === 'actif' ? '#6b7280' : '#5B2D8E',
                          }}
                        >
                          {borne.statut === 'actif' ? 'Désactiver' : 'Activer'}
                        </button>
                        <Link
                          to={`/superadmin/bornes/${borne.id}/edit`}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          style={{ minHeight: '36px', display: 'flex', alignItems: 'center' }}
                        >
                          Modifier
                        </Link>
                      </div>
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
