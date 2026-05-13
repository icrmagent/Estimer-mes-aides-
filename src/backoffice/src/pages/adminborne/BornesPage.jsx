import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import ConfirmCredentialsModal from '../../components/ConfirmCredentialsModal.jsx'
import { ErrorBanner, Toast, SkeletonTableRows, EmptyState, BadgeBorneStatut } from '../../components/ui.jsx'

export default function ABBornesPage() {
  const [bornes, setBornes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [credModal, setCredModal] = useState({ isOpen: false, borne: null, action: null })

  useEffect(() => {
    api.get('/api/bornes')
      .then(res => setBornes(res.data.bornes || res.data.data || res.data || []))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  function openCredentialsForToggle(borne) {
    setCredModal({ isOpen: true, borne, action: borne.estConnectee ? 'logout' : 'login' })
  }

  function handleRemoteActionSuccess() {
    const { borne, action } = credModal
    const newVal = action === 'login'
    setBornes(prev => prev.map(b => b.id === borne.id ? { ...b, estConnectee: newVal } : b))
    setToast({ message: `Borne ${newVal ? 'connectée à distance' : 'déconnectée à distance'}` })
    setCredModal({ isOpen: false, borne: null, action: null })
  }

  return (
    <AppLayout>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Bornes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {bornes.length} borne{bornes.length !== 1 ? 's' : ''} assignée{bornes.length !== 1 ? 's' : ''}
          </p>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="bg-white rounded-2xl shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">ID Borne</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Connexion</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire actif</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={6} rows={3} />
              ) : bornes.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
                      title="Aucune borne assignée"
                      description="Contactez votre Super Administrateur."
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openCredentialsForToggle(borne)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          borne.estConnectee
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                        style={{ minHeight: '32px' }}
                      >
                        {borne.estConnectee ? 'Déconnecter' : 'Connecter'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Vue en lecture seule — la configuration des bornes est gérée par le Super Administrateur.
        </p>
      </div>

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
