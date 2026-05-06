import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

// NOTE: Data isolation is enforced server-side via the ADMIN_BORNE JWT role check.
// The backend automatically filters bornes to only those assigned to the authenticated AdminBorne.
// No client-side filtering is needed or should be relied upon for security.

function StatutBadge({ statut }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {statut}
    </span>
  )
}

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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : bornes.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              Aucune borne assignée
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire actif</th>
                </tr>
              </thead>
              <tbody>
                {bornes.map(borne => (
                  <tr key={borne.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{borne.idBorne}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{borne.adresse}</td>
                    <td className="px-4 py-3"><StatutBadge statut={borne.statut} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{borne.formulaire?.label || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Read-only notice */}
        <p className="text-xs text-gray-400 text-center">
          Vue en lecture seule — la configuration des bornes est gérée par le Super Administrateur.
        </p>
      </div>
    </AppLayout>
  )
}
