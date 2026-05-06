import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

function StatutBadge({ statut }) {
  const styles = {
    en_attente: 'bg-yellow-100 text-yellow-700',
    en_cours: 'bg-blue-100 text-blue-700',
    succes: 'bg-green-100 text-green-700',
    echec_temporaire: 'bg-orange-100 text-orange-700',
    echec_definitif: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut?.replace(/_/g, ' ')}
    </span>
  )
}

export default function PartageJobsPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [relancing, setRelancing] = useState(null)
  const [pusherEvents, setPusherEvents] = useState([])

  const fetchJobs = useCallback(() => {
    setLoading(true)
    // Try /api/partage/jobs first, fallback to enregistrements with echec_definitif filter
    api.get('/api/partage/jobs')
      .then(res => setJobs(res.data.jobs || res.data.data || res.data || []))
      .catch(() => {
        // Fallback: use enregistrements with echec_definitif
        return api.get('/api/enregistrements', { params: { statutPartage: 'echec_definitif', limit: 100 } })
          .then(res => {
            const enrs = res.data.enregistrements || res.data.data || res.data || []
            // Map to job-like structure
            setJobs(enrs.map(e => ({
              id: e.id,
              enregistrementId: e.id,
              statut: e.statutPartage,
              tentatives: e.partageJob?.tentatives ?? '—',
              prochainEssai: e.partageJob?.prochainEssai ?? null,
              erreur: e.partageJob?.erreur ?? null,
              borne: e.borne,
            })))
          })
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Pusher: subscribe to borne channels for real-time updates (Task 4.12)
  useEffect(() => {
    const borneIds = [...new Set(jobs.map(j => j.borne?.id || j.borneId).filter(Boolean))]
    const unsubs = borneIds.map(borneId =>
      subscribeToBorne(borneId, (event) => {
        setPusherEvents(prev => [{ ...event, borneId, ts: new Date().toISOString() }, ...prev.slice(0, 9)])
        // Refresh jobs list on any event
        fetchJobs()
      })
    )
    return () => unsubs.forEach(u => u())
  }, [jobs.length, fetchJobs])

  async function handleRelancer(jobId) {
    setRelancing(jobId)
    try {
      await api.post(`/api/partage/jobs/${jobId}/relancer`)
      fetchJobs()
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la relance')
    } finally {
      setRelancing(null)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partage I-CRM</h1>
            <p className="text-gray-500 text-sm mt-1">File d'attente des jobs de synchronisation</p>
          </div>
          <button
            onClick={fetchJobs}
            className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
            style={{ minHeight: '48px' }}
          >
            ↻ Actualiser
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Pusher live events */}
        {pusherEvents.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-blue-700 font-semibold text-sm">Événements temps réel (Pusher)</p>
              <button onClick={() => setPusherEvents([])} className="text-blue-400 hover:text-blue-600 text-xs">Effacer</button>
            </div>
            <div className="space-y-1">
              {pusherEvents.map((ev, i) => (
                <div key={i} className="text-xs text-blue-600 font-mono">
                  [{new Date(ev.ts).toLocaleTimeString('fr-FR')}] {ev.type} — borne {ev.borneId}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : jobs.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              Aucun job en attente — tout est synchronisé ✓
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Enregistrement ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Tentatives</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Prochain essai</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Erreur</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {(job.enregistrementId || job.id)?.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={job.statut} /></td>
                    <td className="px-4 py-3 text-gray-600">{job.tentatives ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {job.prochainEssai
                        ? new Date(job.prochainEssai).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-red-500 text-xs max-w-xs truncate" title={job.erreur}>
                      {job.erreur || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {job.statut === 'echec_definitif' && (
                          <button
                            onClick={() => handleRelancer(job.id)}
                            disabled={relancing === job.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50"
                            style={{ background: '#5B2D8E', minHeight: '36px' }}
                          >
                            {relancing === job.id ? '...' : 'Relancer'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
