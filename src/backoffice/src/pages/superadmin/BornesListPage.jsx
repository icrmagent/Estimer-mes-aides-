import { useState, useEffect, useCallback, useRef } from 'react'
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

function BorneRowActions({ borne, toggleStatut }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"/>
          <circle cx="12" cy="5" r="1"/>
          <circle cx="12" cy="19" r="1"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          <div className="py-1">
            <button
              onClick={() => { setIsOpen(false); toggleStatut(borne); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {borne.statut === 'actif' ? (
                  <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>
                ) : (
                  <><path d="M12 2v10"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/></>
                )}
              </svg>
              {borne.statut === 'actif' ? 'Désactiver' : 'Activer'}
            </button>
            <Link
              to={`/superadmin/bornes/${borne.id}/edit`}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Modifier
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BornesListPage() {
  const [bornes, setBornes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const [filters, setFilters] = useState({
    search: '',
    statut: '',
  })

  const fetchBornes = useCallback((p = 1, f = filters) => {
    setLoading(true)
    const params = { page: p, limit }
    if (f.search) params.search = f.search
    if (f.statut) params.statut = f.statut

    api.get('/api/bornes', { params })
      .then(res => {
        setBornes(res.data.bornes || res.data.data || res.data || [])
        setTotal(res.data.total || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { fetchBornes(page) }, [page])

  function handleFilterChange(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    fetchBornes(1, filters)
  }

  function handleReset() {
    const reset = { search: '', statut: '' }
    setFilters(reset)
    setPage(1)
    fetchBornes(1, reset)
  }

  async function toggleStatut(borne) {
    const newStatut = borne.statut === 'actif' ? 'inactif' : 'actif'
    try {
      await api.patch(`/api/bornes/${borne.id}/statut`, { statut: newStatut })
      setBornes(prev => prev.map(b => b.id === borne.id ? { ...b, statut: newStatut } : b))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour')
    }
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }

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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Search & Filter */}
        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Recherche</label>
              <input
                type="text"
                value={filters.search}
                onChange={e => handleFilterChange('search', e.target.value)}
                className={inputClass + ' w-full'}
                style={inputStyle}
                placeholder="ID borne, adresse, commerçant..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
              <select
                value={filters.statut}
                onChange={e => handleFilterChange('statut', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Tous</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
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
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              style={{ minHeight: '40px' }}
            >
              Réinitialiser
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : bornes.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucune borne trouvée</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">ID Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Admin Borne</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Actions</th>
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
                    <td className="px-4 py-3 text-right">
                      <BorneRowActions
                        borne={borne}
                        toggleStatut={toggleStatut}
                      />
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
