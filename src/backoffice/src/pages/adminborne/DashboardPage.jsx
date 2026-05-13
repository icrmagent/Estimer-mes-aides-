import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'
import { PRIMARY, ErrorBanner, BadgeBorneStatut, SkeletonCard } from '../../components/ui.jsx'

export default function ABDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enAttenteCRM, setEnAttenteCRM] = useState(0)

  useEffect(() => {
    api.get('/api/dashboard/adminborne')
      .then(res => {
        const payload = res.data.data || res.data
        setData(payload)
        setEnAttenteCRM(payload.enAttenteCRM || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data?.bornes) return
    const unsubs = data.bornes.map(borne =>
      subscribeToBorne(borne.id, (event) => {
        if (event.type === 'partage.succes') {
          setEnAttenteCRM(prev => Math.max(0, prev - 1))
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [data])

  if (loading) return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <div className="h-7 w-44 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-4 w-52 bg-gray-100 rounded mt-2 animate-pulse" />
        </div>
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <SkeletonCard key={i} lines={3} />)}
        </div>
      </div>
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

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
            style={{ background: enAttenteCRM > 0 ? '#d97706' : PRIMARY }}
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

        {bornes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">🖥️</div>
            <p className="text-sm font-semibold text-gray-500">Aucune borne assignée</p>
            <p className="text-xs text-gray-400 mt-1">Contactez votre Super Administrateur pour obtenir l'accès.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bornes.map(borne => (
              <div key={borne.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{borne.idBorne}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{borne.adresse}</div>
                  </div>
                  <BadgeBorneStatut statut={borne.statut} />
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
