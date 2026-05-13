import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import ConfirmCredentialsModal from '../../components/ConfirmCredentialsModal.jsx'
import {
  PRIMARY,
  IcoMore, IcoPlus,
  Toast, ErrorBanner, ConfirmModal, SkeletonTableRows, EmptyState, BadgeBorneStatut,
} from '../../components/ui.jsx'

function BorneRowActions({ borne, toggleStatut, openCredentialsForToggle, onDelete }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(prev => !prev) }}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
      >
        <IcoMore />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          <div className="py-1">
            <button
              onClick={() => { setIsOpen(false); toggleStatut(borne) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {borne.statut === 'actif'
                  ? <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>
                  : <><path d="M12 2v10"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/></>}
              </svg>
              {borne.statut === 'actif' ? 'Désactiver' : 'Activer'}
            </button>
            <button
              onClick={() => { setIsOpen(false); openCredentialsForToggle(borne) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${borne.estConnectee ? 'bg-red-500' : 'bg-green-500'}`} />
              {borne.estConnectee ? 'Déconnecter' : 'Connecter'}
            </button>
            <Link
              to={`/superadmin/bornes/${borne.id}/edit`}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Modifier
            </Link>
            {borne.statut === 'inactif' && (
              <button
                onClick={() => { setIsOpen(false); onDelete(borne) }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Supprimer
              </button>
            )}
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
  const [toast, setToast] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const [filters, setFilters] = useState({ search: '', statut: '' })
  const filtersRef = useRef(filters)
  const searchTimer = useRef(null)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, borne: null })
  const [credModal, setCredModal] = useState({ isOpen: false, borne: null, action: null })

  function doFetch(p, f) {
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
  }

  useEffect(() => { doFetch(1, filtersRef.current) }, [])

  function goToPage(newPage) {
    setPage(newPage)
    doFetch(newPage, filtersRef.current)
  }

  function handleSearchChange(value) {
    const f = { ...filtersRef.current, search: value }
    filtersRef.current = f
    setFilters(f)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); doFetch(1, f) }, 350)
  }

  function handleStatutChange(value) {
    const f = { ...filtersRef.current, statut: value }
    filtersRef.current = f
    setFilters(f)
    setPage(1)
    doFetch(1, f)
  }

  function handleReset() {
    const f = { search: '', statut: '' }
    filtersRef.current = f
    setFilters(f)
    setPage(1)
    clearTimeout(searchTimer.current)
    doFetch(1, f)
  }

  async function toggleStatut(borne) {
    const newStatut = borne.statut === 'actif' ? 'inactif' : 'actif'
    try {
      await api.patch(`/api/bornes/${borne.id}/statut`, { statut: newStatut })
      setBornes(prev => prev.map(b => b.id === borne.id ? { ...b, statut: newStatut } : b))
      setToast({ message: `Borne ${newStatut === 'actif' ? 'activée' : 'désactivée'}` })
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour')
    }
  }

  function openCredentialsForToggle(borne) {
    setCredModal({ isOpen: true, borne, action: borne.estConnectee ? 'logout' : 'login' })
  }

  function handleRemoteActionSuccess(result) {
    const { borne, action } = credModal
    const newVal = action === 'login'
    setBornes(prev => prev.map(b => b.id === borne.id ? { ...b, estConnectee: newVal } : b))
    setToast({ message: `Borne ${newVal ? 'connectée à distance' : 'déconnectée à distance'}` })
    setCredModal({ isOpen: false, borne: null, action: null })
  }

  async function confirmDelete() {
    const borne = deleteModal.borne
    setDeleteModal({ isOpen: false, borne: null })
    if (!borne) return
    try {
      await api.delete(`/api/bornes/${borne.id}`)
      setBornes(prev => prev.filter(b => b.id !== borne.id))
      setTotal(prev => Math.max(0, prev - 1))
      setToast({ message: 'Borne supprimée — les enregistrements liés sont conservés' })
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la suppression'))
    }
  }

  const inputClass = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const totalPages = Math.ceil(total / limit)

  return (
    <AppLayout>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bornes</h1>
            <p className="text-gray-500 text-sm mt-1">{total} borne{total !== 1 ? 's' : ''} au total</p>
          </div>
          <Link
            to="/superadmin/bornes/new"
            className="flex items-center gap-1.5 px-4 py-2.5 text-white font-semibold rounded-xl text-sm transition-opacity hover:opacity-90"
            style={{ background: PRIMARY, minHeight: '40px' }}
          >
            <IcoPlus />
            Nouvelle borne
          </Link>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Recherche</label>
              <input
                type="text"
                value={filters.search}
                onChange={e => handleSearchChange(e.target.value)}
                className={inputClass + ' w-full'}
                style={inputStyle}
                placeholder="ID borne, adresse, commerçant..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
              <select
                value={filters.statut}
                onChange={e => handleStatutChange(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Tous</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
            </div>
            {(filters.search || filters.statut) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ minHeight: '40px' }}
              >
                Effacer les filtres
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">ID Borne</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Connexion</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Admin Borne</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={6} rows={4} />
              ) : bornes.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
                      title="Aucune borne trouvée"
                      description={filters.search || filters.statut ? 'Essayez de modifier vos filtres' : undefined}
                    />
                  </td>
                </tr>
              ) : (
                bornes.map(borne => (
                  <tr key={borne.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{borne.idBorne}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${borne.estConnectee ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`text-xs font-medium ${borne.estConnectee ? 'text-green-700' : 'text-red-600'}`}>
                          {borne.estConnectee ? 'Connectée' : 'Déconnectée'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{borne.adresse}</td>
                    <td className="px-4 py-3"><BadgeBorneStatut statut={borne.statut} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{borne.formulaire?.label || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {borne.adminBorne ? `${borne.adminBorne.nom} ${borne.adminBorne.prenom}` : <span className="italic">Géré par SuperAdmin</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BorneRowActions
                        borne={borne}
                        toggleStatut={toggleStatut}
                        openCredentialsForToggle={openCredentialsForToggle}
                        onDelete={(b) => setDeleteModal({ isOpen: true, borne: b })}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '40px' }}
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 text-sm rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '40px' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {deleteModal.isOpen && (
        <ConfirmModal
          title="Supprimer la borne"
          message={`Êtes-vous sûr de vouloir supprimer la borne ${deleteModal.borne?.idBorne} (${deleteModal.borne?.adresse}) ? Les enregistrements liés à cette borne seront conservés.`}
          confirmLabel="Supprimer définitivement"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteModal({ isOpen: false, borne: null })}
          danger
        />
      )}

      {credModal.isOpen && credModal.borne && (
        <ConfirmCredentialsModal
          borne={credModal.borne}
          action={credModal.action}
          onSuccess={handleRemoteActionSuccess}
          onCancel={() => setCredModal({ isOpen: false, borne: null, action: null })}
        />
      )}
    </AppLayout>
  )
}
