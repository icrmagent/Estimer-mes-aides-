import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

function SkeletonBlock({ className }) {
  return <div className={`skeleton ${className}`} />
}

function LoadingSkeleton() {
  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <div>
          <SkeletonBlock className="w-48 h-7 rounded mb-2" />
          <SkeletonBlock className="w-64 h-4 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <SkeletonBlock className="w-10 h-10 rounded-xl" />
                <SkeletonBlock className="w-10 h-4 rounded" />
              </div>
              <SkeletonBlock className="w-16 h-8 rounded mb-2" />
              <SkeletonBlock className="w-28 h-4 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <SkeletonBlock className="w-80 h-5 rounded mb-6" />
          <SkeletonBlock className="w-full h-56 rounded-xl" />
        </div>
      </div>
    </AppLayout>
  )
}

function StatCard({ label, value, icon, onClick, color = '#5B2D8E' }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 w-full group"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: `${color}18` }}
        >
          {icon}
        </div>
        <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">Voir →</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>{value ?? '—'}</div>
      <div className="text-sm text-gray-500 mt-1 font-medium">{label}</div>
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
      .then(res => setData(res.data.data || res.data))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data?.borneIds) return
    const unsubs = data.borneIds.map(borneId =>
      subscribeToBorne(borneId, (event) => {
        if (event.type === 'partage.echec') {
          setPusherAlert(`Échec définitif de partage pour la borne ${borneId}`)
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [data])

  if (loading) return <LoadingSkeleton />

  if (error) return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <span>{error}</span>
        <button type="button" onClick={() => setError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors text-lg leading-none">×</button>
      </div>
    </AppLayout>
  )

  const stats = data || {}
  const graphique = stats.graphique || []

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de la plateforme</p>
        </div>

        {/* Alerte Pusher */}
        {pusherAlert && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-red-500 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <span className="text-red-700 text-sm font-medium">{pusherAlert}</span>
            </div>
            <button onClick={() => setPusherAlert(null)} className="text-red-400 hover:text-red-600 transition-colors p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
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

        {/* Graphique */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5">Enregistrements par jour — 30 derniers jours</h2>
          {graphique.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={graphique}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: '13px' }}
                  cursor={{ stroke: '#5B2D8E', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#5B2D8E"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#5B2D8E', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span className="text-sm">Aucune donnée disponible</span>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
