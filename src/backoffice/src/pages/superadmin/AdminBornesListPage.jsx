import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import {
  PRIMARY,
  IcoMore, IcoPlus,
  Toast, ErrorBanner, ConfirmModal, SkeletonTableRows, BadgeActif,
} from '../../components/ui.jsx'

function AdminRowActions({ admin, onResetPassword, onToggleActif, onDelete }) {
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
              onClick={() => { setIsOpen(false); onResetPassword(admin) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Réinit. MDP
            </button>
            <button
              onClick={() => { setIsOpen(false); onToggleActif(admin) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {admin.actif
                  ? <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>
                  : <><path d="M12 2v10"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/></>}
              </svg>
              {admin.actif ? 'Désactiver' : 'Activer'}
            </button>
            <Link
              to={`/superadmin/admin-bornes/${admin.id}/edit`}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Modifier
            </Link>
            {(!admin.bornes || admin.bornes.length === 0) && (
              <button
                onClick={() => { setIsOpen(false); onDelete(admin) }}
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

export default function AdminBornesListPage() {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [tempPasswordAlert, setTempPasswordAlert] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, admin: null })
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, admin: null })

  const [filters, setFilters] = useState({ search: '', actif: '' })

  const fetchAdmins = useCallback((f = filters) => {
    setLoading(true)
    const params = {}
    if (f.search) params.search = f.search
    if (f.actif !== '') params.actif = f.actif

    api.get('/api/admin-bornes', { params })
      .then(res => setAdmins(res.data.adminBornes || res.data.data || res.data || []))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => {
    const timer = setTimeout(() => fetchAdmins(), 300)
    return () => clearTimeout(timer)
  }, [fetchAdmins])

  function handleFilterChange(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  function handleReset() {
    setFilters({ search: '', actif: '' })
  }

  async function toggleActif(admin) {
    const newActif = !admin.actif
    try {
      await api.patch(`/api/admin-bornes/${admin.id}/statut`, { actif: newActif })
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, actif: newActif } : a))
      setToast({ message: `Admin ${newActif ? 'activé' : 'désactivé'}` })
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour')
    }
  }

  async function confirmDelete() {
    const admin = deleteModal.admin
    setDeleteModal({ isOpen: false, admin: null })
    if (!admin) return
    try {
      await api.delete(`/api/admin-bornes/${admin.id}`)
      setAdmins(prev => prev.filter(a => a.id !== admin.id))
      setToast({ message: 'Administrateur supprimé' })
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la suppression'))
    }
  }

  async function confirmResetPassword() {
    const admin = confirmModal.admin
    setConfirmModal({ isOpen: false, admin: null })
    if (!admin) return
    try {
      const res = await api.post(`/api/admin-bornes/${admin.id}/reset-password`)
      setTempPasswordAlert({
        adminId: admin.id,
        adminName: `${admin.nom} ${admin.prenom}`,
        password: res.data.data?.tempPassword || res.data.temporaryPassword || res.data.password || res.data.motDePasseTemporaire,
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la réinitialisation')
    }
  }

  const inputClass = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }

  return (
    <AppLayout>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Bornes</h1>
            <p className="text-gray-500 text-sm mt-1">{admins.length} administrateur{admins.length !== 1 ? 's' : ''}</p>
          </div>
          <Link
            to="/superadmin/admin-bornes/new"
            className="flex items-center gap-1.5 px-4 py-2.5 text-white font-semibold rounded-xl text-sm transition-opacity hover:opacity-90"
            style={{ background: PRIMARY, minHeight: '40px' }}
          >
            <IcoPlus />
            Nouvel admin
          </Link>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        {tempPasswordAlert && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-amber-800 font-semibold text-sm">Mot de passe temporaire généré</p>
                <p className="text-amber-700 text-sm mt-1">Pour <strong>{tempPasswordAlert.adminName}</strong> :</p>
                <code className="block mt-2 bg-amber-100 px-3 py-2 rounded-lg text-amber-900 font-mono text-sm">
                  {tempPasswordAlert.password}
                </code>
                <p className="text-amber-600 text-xs mt-2">⚠️ Notez ce mot de passe — il ne sera plus affiché.</p>
              </div>
              <button onClick={() => setTempPasswordAlert(null)} className="text-amber-400 hover:text-amber-600 ml-4 flex-shrink-0 p-1">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Recherche</label>
              <input
                type="text"
                value={filters.search}
                onChange={e => handleFilterChange('search', e.target.value)}
                className={inputClass + ' w-full'}
                style={inputStyle}
                placeholder="Nom, prénom, email, raison sociale..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statut</label>
              <select
                value={filters.actif}
                onChange={e => handleFilterChange('actif', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Tous</option>
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '40px' }}
            >
              Réinitialiser
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">Nom / Prénom</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Raison sociale</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">SIRET</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={6} rows={4} />
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Aucun admin borne trouvé
                  </td>
                </tr>
              ) : (
                admins.map(admin => (
                  <tr key={admin.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{admin.nom} {admin.prenom}</td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3 text-gray-500">{admin.raisonSociale}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{admin.siret}</td>
                    <td className="px-4 py-3"><BadgeActif actif={admin.actif} /></td>
                    <td className="px-4 py-3 text-right">
                      <AdminRowActions
                        admin={admin}
                        onResetPassword={(a) => setConfirmModal({ isOpen: true, admin: a })}
                        onToggleActif={toggleActif}
                        onDelete={(a) => setDeleteModal({ isOpen: true, admin: a })}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmModal.isOpen && (
        <ConfirmModal
          title="Réinitialiser le mot de passe"
          message={`Voulez-vous vraiment réinitialiser le mot de passe de ${confirmModal.admin?.prenom} ${confirmModal.admin?.nom} ? L'ancien mot de passe ne fonctionnera plus.`}
          confirmLabel="Confirmer la réinitialisation"
          onConfirm={confirmResetPassword}
          onCancel={() => setConfirmModal({ isOpen: false, admin: null })}
          danger={false}
        />
      )}

      {deleteModal.isOpen && (
        <ConfirmModal
          title="Supprimer l'administrateur"
          message={`Êtes-vous sûr de vouloir supprimer ${deleteModal.admin?.prenom} ${deleteModal.admin?.nom} ? Cette action est irréversible.`}
          confirmLabel="Supprimer définitivement"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteModal({ isOpen: false, admin: null })}
          danger
        />
      )}
    </AppLayout>
  )
}
