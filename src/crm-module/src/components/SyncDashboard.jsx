import { useState, useEffect, useCallback } from 'react'
import { getUnsyncedSubmissions, getAllSubmissions, markSynced } from '../services/backendApi.js'
import { createCrmProject, isSimulationMode } from '../services/crmApi.js'
import { exportSubmissionsToExcel } from '../utils/exportExcel.js'
import FilterBar from './FilterBar.jsx'
import SubmissionsTable from './SubmissionsTable.jsx'
import SyncReport from './SyncReport.jsx'

export default function SyncDashboard({ token, onLogout }) {
  const [submissions, setSubmissions] = useState([])
  const [pagination, setPagination] = useState(null)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' })
  const [selected, setSelected] = useState(new Set())
  const [syncProgress, setSyncProgress] = useState({})
  const [isSyncing, setIsSyncing] = useState(false)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState(null)

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filters.dateFrom) params.set('since', filters.dateFrom)
      const data = await getUnsyncedSubmissions(token, params)
      let list = data.data || []
      if (filters.dateTo) {
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        list = list.filter(s => new Date(s.created_at) <= to)
      }
      setSubmissions(list)
      setPagination(data.pagination)
      setSelected(new Set())
      setSyncProgress({})
    } catch (err) {
      if (err.message.includes('401')) {
        onLogout()
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [token, filters, onLogout])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(select) {
    if (select) setSelected(new Set(submissions.map(s => s.id)))
    else setSelected(new Set())
  }

  async function handleSync(ids) {
    if (ids.length === 0) return
    setIsSyncing(true)
    const results = { imported: 0, errors: [], total: ids.length, simulated: isSimulationMode() }

    for (const id of ids) {
      setSyncProgress(prev => ({ ...prev, [id]: 'syncing' }))
      const submission = submissions.find(s => s.id === id)
      try {
        const crmProject = await createCrmProject(submission)
        await markSynced(token, id, crmProject.id || `sim-${Date.now()}`)
        setSyncProgress(prev => ({ ...prev, [id]: 'done' }))
        results.imported++
      } catch (err) {
        setSyncProgress(prev => ({ ...prev, [id]: 'error' }))
        results.errors.push({ id, error: err.message })
      }
    }

    setReport(results)
    setIsSyncing(false)
  }

  async function handleExport() {
    setIsExporting(true)
    setError(null)
    try {
      const data = await getAllSubmissions(token)
      const all = data.data || []
      if (all.length === 0) {
        setError('Aucune soumission à exporter.')
        return
      }
      exportSubmissionsToExcel(all)
    } catch (err) {
      if (err.message.includes('401')) onLogout()
      else setError(err.message)
    } finally {
      setIsExporting(false)
    }
  }

  const selectedIds = [...selected]
  const canSync = selectedIds.length > 0 && !isSyncing

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface-2)', padding: 24 }}>
      {/* Header */}
      <div style={{
        maxWidth: 1100, margin: '0 auto 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
            Synchronisation CRM
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted)' }}>
            Estimer Mes Aides — Soumissions non synchronisées
            {isSimulationMode() && (
              <span style={{ marginLeft: 8, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600 }}>
                MODE SIMULATION
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={fetchSubmissions}
            className="btn-secondary"
            disabled={loading || isSyncing}
            style={{ padding: '8px 16px' }}
          >
            {loading ? 'Chargement…' : '↺ Actualiser'}
          </button>
          <button onClick={onLogout} style={{
            background: 'none', border: 'none', color: 'var(--color-muted)',
            cursor: 'pointer', fontSize: 13
          }}>
            Déconnexion
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="card" style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Filtres */}
        <div style={{ marginBottom: 20 }}>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            total={submissions.length}
          />
        </div>

        {/* Barre d'actions */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
          padding: '12px 0', borderTop: '1px solid #F0EBFF'
        }}>
          <button
            onClick={() => handleSync(selectedIds)}
            className="btn-primary"
            disabled={!canSync}
          >
            Importer la sélection ({selectedIds.length})
          </button>
          <button
            onClick={() => {
              const ids = submissions.map(s => s.id)
              toggleAll(true)
              handleSync(ids)
            }}
            className="btn-secondary"
            disabled={isSyncing || submissions.length === 0}
          >
            Importer tout ({submissions.length})
          </button>
          {isSyncing && (
            <span style={{ alignSelf: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
              Synchronisation en cours…
            </span>
          )}
          <button
            onClick={handleExport}
            className="btn-secondary"
            disabled={isExporting || isSyncing}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {isExporting ? 'Export…' : 'Export Excel'}
          </button>
        </div>

        {/* Erreur */}
        {error && (
          <div style={{
            background: '#FEE2E2', color: '#991B1B', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, fontSize: 14
          }}>
            {error}
          </div>
        )}

        {/* Tableau */}
        <SubmissionsTable
          submissions={submissions}
          selected={selected}
          onToggle={toggleSelect}
          onToggleAll={toggleAll}
          syncProgress={syncProgress}
        />

        {/* Pagination */}
        {pagination && pagination.total > 100 && (
          <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--color-muted)', fontSize: 13 }}>
            Affichage des 100 premières sur {pagination.total} soumissions
          </p>
        )}
      </div>

      {/* Rapport */}
      {report && (
        <SyncReport
          report={report}
          onClose={() => setReport(null)}
          onRefresh={fetchSubmissions}
        />
      )}
    </div>
  )
}
