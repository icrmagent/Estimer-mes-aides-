import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

function StatutBadge({ statut }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {statut}
    </span>
  )
}

export default function ABDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // enAttenteCRM is updated in real-time via Pusher (Task 5.4)
  const [enAttenteCRM, setEnAttenteCRM] = useState(0)

  useEffect(() => {
    api.get('/api/dashboard/adminborne')
      .then(res => {
        setData(res.data)
        setEnAttenteCRM(res.data.enAttenteCRM || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  // Pusher: subscribe to each borne channel, update enAttenteCRM on partage.succes (Task 5.4)
  useEffect(() => {
    if (!data?.bornes) return
    const unsubs = data.bornes.map(borne =>
      subscribeToBorne(borne.id, (event) => {
        if (event.type === 'partage.succes') {
          // A successful share means one less pending
          setEnAttenteCRM(prev => Math.max(0, prev - 1))
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [data])

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64 text-gray-400">Chargement...</div>
    </AppLayout>
  )

  if (error) return (
    <AppLayout>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
    </AppLayout>
  )

  const bornes = data?.bornes || []

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de vos bornes</p>
        </div>

        {/* En attente CRM counter */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
            style={{ background: enAttenteCRM > 0 ? '#d97706' : '#5B2D8E' }}
          >
            {enAttenteCRM}
          </div>
          <div>
            <div className="text-base font-semibold text-gray-800">Enregistrements en attente CRM</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {enAttenteCRM === 0
                ? 'Tous les enregistrements sont synchronisés ✓'
                : `${enAttenteCRM} enregistrement${enAttenteCRM > 1 ? 's' : ''} en attente de partage`}
            </div>
          </div>
        </div>

        {/* Bornes list */}
        {bornes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="text-4xl mb-4">🖥️</div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Aucune borne assignée</h2>
            <p className="text-gray-400 text-sm">
              Aucune borne ne vous est encore assignée. Contactez votre Super Administrateur.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bornes.map(borne => (
              <div key={borne.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{borne.idBorne}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{borne.adresse}</div>
                  </div>
                  <StatutBadge statut={borne.statut} />
                </div>
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Enregistrements (7j)</span>
                    <span className="font-semibold text-gray-700">{borne.enregistrements7j ?? '—'}</span>
                  </div>
                  {borne.formulaire && (
                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                      <span>Formulaire</span>
                      <span className="font-medium text-gray-600 truncate max-w-[120px]">{borne.formulaire.label}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
