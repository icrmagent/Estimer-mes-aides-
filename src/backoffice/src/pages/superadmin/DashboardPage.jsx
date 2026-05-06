import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

function StatCard({ label, value, icon, onClick, color = '#5B2D8E' }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm p-6 text-left hover:shadow-md transition-shadow w-full"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Voir →</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>{value ?? '—'}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </button>
  )
}

export default function SADashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pusherAlert, setPusherAlert] = useState(null)

  useEffect(() => {
    api.get('/api/dashboard/superadmin')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  // Pusher: subscribe to all borne channels for real-time alerts (Task 4.12)
  useEffect(() => {
    if (!data?.bornesActives) return
    // Subscribe to a general channel for superadmin alerts
    // In practice, we'd subscribe to each borne channel
    const unsubs = []
    if (data.borneIds) {
      data.borneIds.forEach(borneId => {
        const unsub = subscribeToBorne(borneId, (event) => {
          if (event.type === 'partage.echec') {
            setPusherAlert(`⚠️ Échec définitif de partage pour la borne ${borneId}`)
          }
        })
        unsubs.push(unsub)
      })
    }
    return () => unsubs.forEach(u => u())
  }, [data])

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Chargement...</div>
      </div>
    </AppLayout>
  )

  if (error) return (
    <AppLayout>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
    </AppLayout>
  )

  const stats = data || {}
  const graphique = stats.graphique || []

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de la plateforme</p>
        </div>

        {/* Pusher alert */}
        {pusherAlert && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-center justify-between">
            <span className="text-red-700 text-sm font-medium">{pusherAlert}</span>
            <button
              onClick={() => setPusherAlert(null)}
              className="text-red-400 hover:text-red-600 ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Bornes actives"
            value={stats.bornesActives}
            icon="🖥️"
            onClick={() => navigate('/superadmin/bornes')}
          />
          <StatCard
            label="Enregistrements (30j)"
            value={stats.enregistrements30j}
            icon="📁"
            onClick={() => navigate('/superadmin/enregistrements')}
          />
          <StatCard
            label="En attente CRM"
            value={stats.enAttenteCRM}
            icon="🔄"
            color="#d97706"
            onClick={() => navigate('/superadmin/partage')}
          />
          <StatCard
            label="AdminBornes actifs"
            value={stats.adminBornesActifs}
            icon="👥"
            onClick={() => navigate('/superadmin/admin-bornes')}
          />
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Enregistrements par jour (30 derniers jours)</h2>
          {graphique.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={graphique}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#5B2D8E"
                  strokeWidth={2}
                  dot={{ fill: '#5B2D8E', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
