import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { ErrorBanner, SkeletonTableRows, EmptyState, BadgeBorneStatut } from '../../components/ui.jsx'

export default function ABBornesPage() {
  const [bornes, setBornes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/bornes')
      .then(res => setBornes(res.data.bornes || res.data.data || res.data || []))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Bornes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {bornes.length} borne{bornes.length !== 1 ? 's' : ''} assignée{bornes.length !== 1 ? 's' : ''}
          </p>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">ID Borne</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Formulaire actif</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={4} rows={3} />
              ) : bornes.length === 0 ? (
                <tr>
                  <td colSpan={4}>
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
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{borne.adresse}</td>
                    <td className="px-4 py-3"><BadgeBorneStatut statut={borne.statut} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{borne.formulaire?.label || '—'}</td>
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
    </AppLayout>
  )
}
