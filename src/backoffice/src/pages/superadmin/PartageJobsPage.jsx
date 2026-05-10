import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import CanalConfigModal from '../../components/forms/CanalConfigModal.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

function StatutBadge({ statut }) {
  const styles = {
    en_attente: 'bg-yellow-100 text-yellow-700',
    en_cours: 'bg-blue-100 text-blue-700',
    succes: 'bg-green-100 text-green-700',
    partage: 'bg-green-100 text-green-700',
    echec_temporaire: 'bg-orange-100 text-orange-700',
    echec_definitif: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut?.replace(/_/g, ' ') || '—'}
    </span>
  )
}

function getApiList(res) {
  return res.data?.data || res.data?.jobs || res.data?.enregistrements || res.data || []
}

function getMetaTotal(res, fallback = 0) {
  return res.data?.meta?.total ?? res.data?.total ?? fallback
}

function getBorneLabel(borne) {
  if (!borne) return '—'
  return `${borne.idBorne || borne.id}${borne.adresse ? ` · ${borne.adresse}` : ''}`
}

export default function PartageJobsPage() {
  const [bornes, setBornes] = useState([])
  const [selectedBorneId, setSelectedBorneId] = useState('')
  const [canalInput, setCanalInput] = useState('')
  const [jobs, setJobs] = useState([])
  const [enregistrements, setEnregistrements] = useState([])
  const [jobsTotal, setJobsTotal] = useState(0)
  const [enregistrementsTotal, setEnregistrementsTotal] = useState(0)
  const [loadingBornes, setLoadingBornes] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingEnregistrements, setLoadingEnregistrements] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [relancing, setRelancing] = useState(null)
  const [savingCanal, setSavingCanal] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [pusherEvents, setPusherEvents] = useState([])
  const [canaux, setCanaux] = useState([])
  const [loadingCanaux, setLoadingCanaux] = useState(false)
  const [showCanalModal, setShowCanalModal] = useState(false)
  const [editingCanal, setEditingCanal] = useState(null)
  const [deletingCanalId, setDeletingCanalId] = useState(null)

  const selectedBorne = bornes.find((borne) => borne.id === selectedBorneId)

  const fetchBornes = useCallback(() => {
    setLoadingBornes(true)
    api.get('/api/bornes', { params: { limit: 100 } })
      .then((res) => {
        const list = getApiList(res)
        setBornes(list)
        setSelectedBorneId((current) => current || list[0]?.id || '')
      })
      .catch((err) => {
        const e = err.response?.data?.error
        setError(typeof e === 'string' ? e : (e?.message || 'Erreur de chargement des bornes'))
      })
      .finally(() => setLoadingBornes(false))
  }, [])

  const fetchJobs = useCallback(() => {
    if (!selectedBorneId) {
      setJobs([])
      setJobsTotal(0)
      return
    }

    setLoadingJobs(true)
    api.get('/api/partage/jobs', { params: { borneId: selectedBorneId, limit: 100 } })
      .then((res) => {
        const list = getApiList(res)
        setJobs(list)
        setJobsTotal(getMetaTotal(res, list.length))
      })
      .catch((err) => {
        const e = err.response?.data?.error
        setError(typeof e === 'string' ? e : (e?.message || 'Erreur de chargement des jobs'))
      })
      .finally(() => setLoadingJobs(false))
  }, [selectedBorneId])

  const fetchEnregistrements = useCallback(() => {
    if (!selectedBorneId) {
      setEnregistrements([])
      setEnregistrementsTotal(0)
      return
    }

    setLoadingEnregistrements(true)
    api.get('/api/enregistrements', { params: { borneId: selectedBorneId, limit: 100 } })
      .then((res) => {
        const list = getApiList(res)
        setEnregistrements(list)
        setEnregistrementsTotal(getMetaTotal(res, list.length))
      })
      .catch((err) => {
        const e = err.response?.data?.error
        setError(typeof e === 'string' ? e : (e?.message || 'Erreur de chargement des enregistrements'))
      })
      .finally(() => setLoadingEnregistrements(false))
  }, [selectedBorneId])

  const fetchCanaux = useCallback(() => {
    if (!selectedBorneId) {
      setCanaux([])
      return
    }

    setLoadingCanaux(true)
    api.get('/api/canaux', { params: { borneId: selectedBorneId } })
      .then((res) => {
        const list = res.data || []
        setCanaux(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        const e = err.response?.data?.error
        setError(typeof e === 'string' ? e : (e?.message || 'Erreur de chargement des canaux'))
        setCanaux([])
      })
      .finally(() => setLoadingCanaux(false))
  }, [selectedBorneId])

  const refreshSelectedBorneData = useCallback(() => {
    fetchJobs()
    fetchEnregistrements()
  }, [fetchJobs, fetchEnregistrements])

  const handleCanalSaved = (canal) => {
    setSuccess('Canal enregistré avec succès.')
    fetchCanaux()
    setEditingCanal(null)
    setShowCanalModal(false)
  }

  const handleDeleteCanal = async (canalId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce canal ?')) {
      return
    }

    setDeletingCanalId(canalId)
    setError(null)
    try {
      await api.delete(`/api/canaux/${canalId}`)
      setSuccess('Canal supprimé.')
      fetchCanaux()
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la suppression'))
    } finally {
      setDeletingCanalId(null)
    }
  }

  useEffect(() => { fetchBornes() }, [fetchBornes])

  useEffect(() => {
    setCanalInput(selectedBorne?.canalTransmission || '')
    setPusherEvents([])
    refreshSelectedBorneData()
    fetchCanaux()
  }, [selectedBorne?.id, selectedBorne?.canalTransmission, refreshSelectedBorneData, fetchCanaux])

  useEffect(() => {
    if (!selectedBorneId) return undefined

    return subscribeToBorne(selectedBorneId, (event) => {
      setPusherEvents((prev) => [{ ...event, borneId: selectedBorneId, ts: new Date().toISOString() }, ...prev.slice(0, 9)])
      refreshSelectedBorneData()
    })
  }, [selectedBorneId, refreshSelectedBorneData])

  async function handleSaveCanal() {
    if (!selectedBorneId) return

    setSavingCanal(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.put(`/api/partage/bornes/${selectedBorneId}/canal`, {
        canalTransmission: canalInput.trim() || null,
      })
      const updated = res.data?.data || res.data
      setBornes((prev) => prev.map((borne) => (
        borne.id === selectedBorneId ? { ...borne, canalTransmission: updated.canalTransmission } : borne
      )))
      setSuccess('Canal de transmission enregistré.')
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de l’enregistrement du canal'))
    } finally {
      setSavingCanal(false)
    }
  }

  async function handleLancerTransmission() {
    if (!selectedBorneId) return

    setLaunching(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.post(`/api/partage/bornes/${selectedBorneId}/lancer`)
      const result = res.data?.data || {}
      setSuccess(`${result.queued || 0} enregistrement(s) préparé(s) pour la transmission.`)
      refreshSelectedBorneData()
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors du lancement de la transmission'))
    } finally {
      setLaunching(false)
    }
  }

  async function handleRelancer(jobId) {
    setRelancing(jobId)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/partage/jobs/${jobId}/relancer`)
      setSuccess('Job remis en file d’attente.')
      refreshSelectedBorneData()
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la relance'))
    } finally {
      setRelancing(null)
    }
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const canLaunch = Boolean(selectedBorneId) && !launching

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partage I-CRM</h1>
            <p className="text-gray-500 text-sm mt-1">
              Transmission par borne, canal configurable et suivi des enregistrements
            </p>
          </div>
          <button
            onClick={refreshSelectedBorneData}
            disabled={!selectedBorneId}
            className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-600 ml-4">✕</button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[260px] flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Borne</label>
              <select
                value={selectedBorneId}
                onChange={(e) => setSelectedBorneId(e.target.value)}
                className={inputClass + ' w-full'}
                style={inputStyle}
                disabled={loadingBornes}
              >
                <option value="">{loadingBornes ? 'Chargement...' : 'Sélectionner une borne'}</option>
                {bornes.map((borne) => (
                  <option key={borne.id} value={borne.id}>{getBorneLabel(borne)}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[240px] flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Canal de transmission</label>
              <input
                type="text"
                value={canalInput}
                onChange={(e) => setCanalInput(e.target.value)}
                className={inputClass + ' w-full'}
                style={inputStyle}
                placeholder="Ex. icrm-production, agence-nord..."
                disabled={!selectedBorneId}
                maxLength={120}
              />
            </div>
            <button
              type="button"
              onClick={handleSaveCanal}
              disabled={!selectedBorneId || savingCanal}
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
              style={{ background: '#5B2D8E', minHeight: '40px' }}
            >
              {savingCanal ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCanal(null)
                setShowCanalModal(true)
              }}
              disabled={!selectedBorneId}
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
              style={{ background: '#5B2D8E', minHeight: '40px' }}
            >
              ⚙️ Configurer canal
            </button>
            <button
              type="button"
              onClick={handleLancerTransmission}
              disabled={!canLaunch}
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
              style={{ background: '#1A56A0', minHeight: '40px' }}
            >
              {launching ? 'Lancement...' : 'Lancer la transmission'}
            </button>
          </div>
        </div>

        {pusherEvents.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-blue-700 font-semibold text-sm">Événements temps réel</p>
              <button onClick={() => setPusherEvents([])} className="text-blue-400 hover:text-blue-600 text-xs">Effacer</button>
            </div>
            <div className="space-y-1">
              {pusherEvents.map((ev, i) => (
                <div key={i} className="text-xs text-blue-600 font-mono">
                  [{new Date(ev.ts).toLocaleTimeString('fr-FR')}] {ev.type} · {selectedBorne?.idBorne || ev.borneId}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canaux configurés */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Canaux I-CRM</h2>
              <p className="text-xs text-gray-500">{canaux.length} canal{canaux.length !== 1 ? 'x' : ''} configuré{canaux.length !== 1 ? 's' : ''} pour cette borne</p>
            </div>
          </div>
          {loadingCanaux ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : !selectedBorneId ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Sélectionnez une borne</div>
          ) : canaux.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="mb-2">Aucun canal configuré</p>
              <button
                onClick={() => {
                  setEditingCanal(null)
                  setShowCanalModal(true)
                }}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-purple-300 text-purple-600 hover:bg-purple-50"
                style={{ color: '#5B2D8E' }}
              >
                + Ajouter un canal
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Label</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">URL API</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {canaux.map((canal) => (
                    <tr key={canal.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{canal.label}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[200px]" title={canal.apiUrl}>{canal.apiUrl}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${canal.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {canal.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingCanal(canal)
                              setShowCanalModal(true)
                            }}
                            disabled={loadingCanaux}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteCanal(canal.id)}
                            disabled={deletingCanalId === canal.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingCanalId === canal.id ? '...' : 'Supprimer'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => {
                    setEditingCanal(null)
                    setShowCanalModal(true)
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-purple-300 text-white disabled:opacity-50"
                  style={{ background: '#5B2D8E', minHeight: '40px' }}
                >
                  + Ajouter un canal
                </button>
              </div>
            </div>
          )}
        </div>
        
        <CanalConfigModal
          isOpen={showCanalModal}
          onClose={() => {
            setShowCanalModal(false)
            setEditingCanal(null)
          }}
          borneId={selectedBorneId}
          onSave={handleCanalSaved}
          initialCanal={editingCanal}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Enregistrements</h2>
                <p className="text-xs text-gray-500">{enregistrementsTotal} élément{enregistrementsTotal !== 1 ? 's' : ''} pour la borne sélectionnée</p>
              </div>
            </div>
            {loadingEnregistrements ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
            ) : !selectedBorneId ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Sélectionnez une borne</div>
            ) : enregistrements.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Aucun enregistrement pour cette borne</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enregistrements.map((enregistrement) => (
                      <tr key={enregistrement.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{enregistrement.id?.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{enregistrement.formulaire?.label || '—'}</td>
                        <td className="px-4 py-3"><StatutBadge statut={enregistrement.statutPartage} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {enregistrement.createdAt ? new Date(enregistrement.createdAt).toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Jobs de transmission</h2>
                <p className="text-xs text-gray-500">{jobsTotal} job{jobsTotal !== 1 ? 's' : ''} pour la borne sélectionnée</p>
              </div>
            </div>
            {loadingJobs ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
            ) : !selectedBorneId ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Sélectionnez une borne</div>
            ) : jobs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Aucun job pour cette borne</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Enregistrement</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Tentatives</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Erreur</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {(job.enregistrementId || job.enregistrement?.id || job.id)?.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3"><StatutBadge statut={job.statut} /></td>
                        <td className="px-4 py-3 text-gray-600">{job.tentatives ?? '—'}</td>
                        <td className="px-4 py-3 text-red-500 text-xs max-w-[180px] truncate" title={job.erreur}>
                          {job.erreur || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {['echec_definitif', 'echec_temporaire'].includes(job.statut) && (
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
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
