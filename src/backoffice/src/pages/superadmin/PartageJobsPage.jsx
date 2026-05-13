import { useState, useEffect, useCallback, useMemo } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import CanalConfigModal from '../../components/forms/CanalConfigModal.jsx'
import { ConfirmModal, Toast, ErrorBanner, PRIMARY, SECONDARY } from '../../components/ui.jsx'
import api from '../../services/api.js'
import { subscribeToBorne } from '../../services/pusher.js'

const JOB_STATUTS = ['en_attente', 'en_cours', 'succes', 'echec_temporaire', 'echec_definitif']

const STATUT_LABELS = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  succes: 'Succès',
  partage: 'Partagé',
  echec_temporaire: 'Échec temporaire',
  echec_definitif: 'Échec définitif',
}

function pluralCanal(n) {
  return n <= 1 ? 'canal' : 'canaux'
}

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
      {STATUT_LABELS[statut] || statut || '—'}
    </span>
  )
}

function CopyId({ id }) {
  const [copied, setCopied] = useState(false)
  if (!id) return <span className="text-gray-400">—</span>
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* ignore */ }
      }}
      title={`Copier l'UUID : ${id}`}
      aria-label={`Copier l'identifiant ${id}`}
      className="font-mono text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 transition-colors"
    >
      <span>{id.slice(0, 8)}…</span>
      <span className={`text-[10px] ${copied ? 'text-green-600' : 'text-gray-300'}`}>
        {copied ? '✓' : '⧉'}
      </span>
    </button>
  )
}

function KpiCard({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-gray-900',
    info: 'text-blue-700',
    success: 'text-green-700',
    warn: 'text-orange-600',
    danger: 'text-red-600',
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
    </div>
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
  const [jobs, setJobs] = useState([])
  const [enregistrements, setEnregistrements] = useState([])
  const [jobsTotal, setJobsTotal] = useState(0)
  const [enregistrementsTotal, setEnregistrementsTotal] = useState(0)
  const [statutFilter, setStatutFilter] = useState('')
  const [stats, setStats] = useState(null)
  const [loadingBornes, setLoadingBornes] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingEnregistrements, setLoadingEnregistrements] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null) // { message, type }
  const [relancing, setRelancing] = useState(null)
  const [launching, setLaunching] = useState(false)
  const [pusherEvents, setPusherEvents] = useState([])
  const [canaux, setCanaux] = useState([])
  const [loadingCanaux, setLoadingCanaux] = useState(false)
  const [showCanalModal, setShowCanalModal] = useState(false)
  const [editingCanal, setEditingCanal] = useState(null)
  const [deletingCanalId, setDeletingCanalId] = useState(null)
  const [confirm, setConfirm] = useState(null) // { title, message, onConfirm, danger }
  const [testingCanalId, setTestingCanalId] = useState(null)

  const selectedBorne = useMemo(
    () => bornes.find((borne) => borne.id === selectedBorneId),
    [bornes, selectedBorneId],
  )

  const activeChannel = useMemo(() => {
    if (!canaux.length) return null
    const byLabel = selectedBorne?.canalTransmission
      && canaux.find((c) => c.label === selectedBorne.canalTransmission)
    return byLabel || canaux.find((c) => c.actif) || null
  }, [canaux, selectedBorne?.canalTransmission])

  const hasActiveChannel = canaux.some((c) => c.actif)
  const channelLabelMismatch =
    Boolean(selectedBorne?.canalTransmission)
    && canaux.length > 0
    && !canaux.some((c) => c.label === selectedBorne.canalTransmission)

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
    const params = { borneId: selectedBorneId, limit: 100 }
    if (statutFilter) params.statut = statutFilter
    api.get('/api/partage/jobs', { params })
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
  }, [selectedBorneId, statutFilter])

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

  const fetchStats = useCallback(() => {
    if (!selectedBorneId) {
      setStats(null)
      return
    }
    api.get('/api/partage/stats', { params: { borneId: selectedBorneId } })
      .then((res) => setStats(res.data?.data || null))
      .catch(() => setStats(null))
  }, [selectedBorneId])

  const refreshAll = useCallback(() => {
    fetchJobs()
    fetchEnregistrements()
    fetchCanaux()
    fetchStats()
  }, [fetchJobs, fetchEnregistrements, fetchCanaux, fetchStats])

  // L6 — Refetch canaux+jobs+stats sans re-fetch des bornes (qui re-déclenche la cascade)
  const handleCanalSaved = useCallback(() => {
    setToast({ message: 'Canal enregistré avec succès.', type: 'success' })
    fetchCanaux()
    fetchStats()
    setEditingCanal(null)
    setShowCanalModal(false)
  }, [fetchCanaux, fetchStats])

  const handleDeleteCanal = (canalId, canalLabel) => {
    setConfirm({
      title: 'Supprimer le canal',
      message: `Êtes-vous sûr de vouloir supprimer le canal « ${canalLabel} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        setDeletingCanalId(canalId)
        setError(null)
        try {
          await api.delete(`/api/canaux/${canalId}`)
          setToast({ message: 'Canal supprimé.', type: 'success' })
          fetchCanaux()
        } catch (err) {
          const e = err.response?.data?.error
          setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la suppression'))
        } finally {
          setDeletingCanalId(null)
          setConfirm(null)
        }
      },
    })
  }

  const handleTestCanal = async (canalId) => {
    setTestingCanalId(canalId)
    try {
      const res = await api.post(`/api/canaux/${canalId}/test`)
      const r = res.data || {}
      if (r.success) {
        setToast({
          message: `Connexion OK (${r.httpStatus}, ${r.latencyMs}ms)${r.tokenExpired ? ' — token expiré !' : ''}`,
          type: r.tokenExpired ? 'error' : 'success',
        })
      } else {
        setToast({ message: `Connexion impossible : ${r.error || 'erreur inconnue'}`, type: 'error' })
      }
    } catch (err) {
      const r = err.response?.data
      setToast({
        message: `Test échoué : ${r?.error || err.message || 'erreur réseau'}`,
        type: 'error',
      })
    } finally {
      setTestingCanalId(null)
    }
  }

  useEffect(() => { fetchBornes() }, [fetchBornes])

  useEffect(() => {
    setPusherEvents([])
    refreshAll()
  }, [selectedBorneId, refreshAll])

  // Refetch jobs lors d'un changement de filtre statut (sans recharger le reste)
  useEffect(() => { fetchJobs() }, [statutFilter, fetchJobs])

  useEffect(() => {
    if (!selectedBorneId) return undefined

    return subscribeToBorne(selectedBorneId, (event) => {
      setPusherEvents((prev) => [{ ...event, borneId: selectedBorneId, ts: new Date().toISOString() }, ...prev.slice(0, 9)])
      fetchJobs()
      fetchEnregistrements()
      fetchStats()
    })
  }, [selectedBorneId, fetchJobs, fetchEnregistrements, fetchStats])

  const requestLancerTransmission = () => {
    if (!selectedBorneId) return

    if (!hasActiveChannel) {
      setError(
        `Impossible de lancer la transmission : aucun canal I-CRM actif n'est configuré pour cette borne. `
        + `Créez et activez un canal avant de continuer.`,
      )
      return
    }

    if (channelLabelMismatch) {
      setError(
        `Le canal de transmission « ${selectedBorne.canalTransmission} » ne correspond à aucun canal actif. `
        + `Réaffectez un canal depuis le tableau ci-dessous.`,
      )
      return
    }

    const enAttenteEtErreur = stats
      ? (stats.byStatut?.en_attente || 0)
        + (stats.byStatut?.echec_temporaire || 0)
        + (stats.byStatut?.echec_definitif || 0)
      : null

    const targetLabel = activeChannel?.label || selectedBorne?.canalTransmission || '(canal par défaut)'

    setConfirm({
      title: 'Mettre en file d\'attente la transmission ?',
      message:
        enAttenteEtErreur != null
          ? `Les enregistrements non encore partagés (${enAttenteEtErreur}) seront mis en file vers le canal « ${targetLabel} ». Le worker traite la file toutes les 30 secondes.`
          : `Les enregistrements non encore partagés seront mis en file vers le canal « ${targetLabel} ». Le worker traite la file toutes les 30 secondes.`,
      confirmLabel: 'Mettre en file',
      danger: false,
      onConfirm: doLancerTransmission,
    })
  }

  const doLancerTransmission = async () => {
    setLaunching(true)
    setError(null)
    setConfirm(null)
    try {
      const res = await api.post(`/api/partage/bornes/${selectedBorneId}/lancer`)
      const result = res.data?.data || {}
      setToast({
        message: `${result.queued || 0} enregistrement(s) mis en file. Worker actif toutes les 30s.`,
        type: 'success',
      })
      refreshAll()
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors du lancement de la transmission'))
    } finally {
      setLaunching(false)
    }
  }

  const handleRelancer = (job) => {
    const isStuck = job.statut === 'en_cours'
    setConfirm({
      title: isStuck ? 'Réinitialiser un job bloqué' : 'Relancer le job',
      message: isStuck
        ? `Ce job est en cours depuis ${new Date(job.updatedAt).toLocaleString('fr-FR')}. Il sera réinitialisé en file d'attente.`
        : `Le job sera remis en file d'attente avec 0 tentatives.`,
      confirmLabel: isStuck ? 'Réinitialiser' : 'Relancer',
      danger: false,
      onConfirm: async () => {
        setRelancing(job.id)
        setError(null)
        try {
          await api.post(`/api/partage/jobs/${job.id}/relancer`)
          setToast({ message: 'Job remis en file d\'attente.', type: 'success' })
          fetchJobs()
          fetchStats()
        } catch (err) {
          const e = err.response?.data?.error
          setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la relance'))
        } finally {
          setRelancing(null)
          setConfirm(null)
        }
      },
    })
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const canLaunch = Boolean(selectedBorneId) && !launching && hasActiveChannel && !channelLabelMismatch

  const canalLabelByLabel = useMemo(() => {
    const map = new Map()
    for (const c of canaux) map.set(c.label, c)
    return map
  }, [canaux])

  // Cache borne par enregistrementId (pour résoudre le canal d'un job)
  const enregistrementBorneCanalByEnregId = useMemo(() => {
    const map = new Map()
    for (const e of enregistrements) map.set(e.id, e.borne?.canalTransmission || selectedBorne?.canalTransmission || null)
    return map
  }, [enregistrements, selectedBorne?.canalTransmission])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partage I-CRM</h1>
            <p className="text-gray-500 text-sm mt-1">
              Transmission par borne, canal configurable et suivi des enregistrements
            </p>
          </div>
          <button
            onClick={refreshAll}
            disabled={!selectedBorneId}
            aria-label="Actualiser les données"
            className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            style={{ minHeight: '48px' }}
          >
            ↻ Actualiser
          </button>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        {/* Étape 1 — Sélection de la borne */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[260px] flex-1">
              <label htmlFor="borne-select" className="block text-xs font-semibold text-gray-600 mb-1">
                1. Borne
              </label>
              <select
                id="borne-select"
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

            <div className="min-w-[200px]">
              <div className="block text-xs font-semibold text-gray-600 mb-1">2. Canal actif</div>
              <div
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50"
                style={{ minHeight: '40px' }}
              >
                {!selectedBorneId
                  ? <span className="text-gray-400">—</span>
                  : channelLabelMismatch
                    ? <span className="text-red-600 font-medium">⚠️ Canal "{selectedBorne.canalTransmission}" introuvable</span>
                    : activeChannel
                      ? <span className="font-medium text-gray-900">{activeChannel.label}</span>
                      : <span className="text-orange-600">Aucun canal actif</span>
                }
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setEditingCanal(null); setShowCanalModal(true) }}
              disabled={!selectedBorneId}
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
              style={{ background: PRIMARY, minHeight: '40px' }}
            >
              + Ajouter un canal
            </button>

            <button
              type="button"
              onClick={requestLancerTransmission}
              disabled={!canLaunch}
              aria-label="Mettre les enregistrements en file d'attente pour transmission"
              className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
              style={{ background: SECONDARY, minHeight: '40px' }}
              title={
                !selectedBorneId ? 'Sélectionnez une borne'
                : !hasActiveChannel ? 'Aucun canal actif'
                : channelLabelMismatch ? 'Canal incohérent'
                : 'Mettre en file d\'attente'
              }
            >
              {launching ? 'En cours…' : '3. Mettre en file d\'attente'}
            </button>
          </div>

          {selectedBorneId && !loadingCanaux && !hasActiveChannel && (
            <div className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              ⚠️ Aucun canal actif n'est configuré. La transmission est désactivée tant que vous n'aurez pas ajouté un canal.
            </div>
          )}
        </div>

        {/* KPI Cards — supervision globale */}
        {selectedBorneId && stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="En attente" value={stats.byStatut?.en_attente ?? 0} tone="info" />
            <KpiCard label="En cours" value={stats.byStatut?.en_cours ?? 0} tone="info" />
            <KpiCard label="Succès" value={stats.byStatut?.succes ?? 0} tone="success" />
            <KpiCard
              label="Échecs"
              value={(stats.byStatut?.echec_temporaire ?? 0) + (stats.byStatut?.echec_definitif ?? 0)}
              tone="danger"
            />
            <KpiCard
              label="Taux 24h"
              value={stats.tauxSucces24h == null ? '—' : `${stats.tauxSucces24h}%`}
              tone={stats.tauxSucces24h == null
                ? 'neutral'
                : stats.tauxSucces24h >= 90 ? 'success'
                : stats.tauxSucces24h >= 50 ? 'warn'
                : 'danger'}
            />
          </div>
        )}

        {pusherEvents.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-blue-700 font-semibold text-sm">Événements temps réel</p>
              <button
                onClick={() => setPusherEvents([])}
                aria-label="Effacer l'historique des événements"
                className="text-blue-400 hover:text-blue-600 text-xs"
              >
                Effacer
              </button>
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
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Canaux I-CRM</h2>
              <p className="text-xs text-gray-500">
                {canaux.length} {pluralCanal(canaux.length)} configuré{canaux.length > 1 ? 's' : ''} pour cette borne
              </p>
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
                onClick={() => { setEditingCanal(null); setShowCanalModal(true) }}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-purple-300 text-purple-600 hover:bg-purple-50"
                style={{ color: PRIMARY }}
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
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Token</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {canaux.map((canal) => {
                    const isAffected = selectedBorne?.canalTransmission === canal.label
                    const tokenExp = canal.tokenExpiresAt ? new Date(canal.tokenExpiresAt) : null
                    const tokenExpired = tokenExp ? tokenExp.getTime() < Date.now() : null
                    return (
                      <tr key={canal.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {canal.label}
                          {isAffected && (
                            <span className="ml-2 text-[10px] font-semibold uppercase text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">
                              actif sur borne
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[240px]" title={canal.apiUrl}>
                          {canal.apiUrl}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {canal.hasToken
                            ? tokenExp
                              ? <span className={tokenExpired ? 'text-red-600 font-medium' : 'text-gray-600'}>
                                  {tokenExpired ? 'Expiré ' : 'Expire '} {tokenExp.toLocaleDateString('fr-FR')}
                                </span>
                              : <span className="text-gray-500">configuré</span>
                            : <span className="text-orange-600">manquant</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${canal.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {canal.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              onClick={() => handleTestCanal(canal.id)}
                              disabled={testingCanalId === canal.id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              aria-label={`Tester la connexion du canal ${canal.label}`}
                            >
                              {testingCanalId === canal.id ? '...' : 'Tester'}
                            </button>
                            <button
                              onClick={() => { setEditingCanal(canal); setShowCanalModal(true) }}
                              disabled={loadingCanaux}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                              aria-label={`Modifier le canal ${canal.label}`}
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDeleteCanal(canal.id, canal.label)}
                              disabled={deletingCanalId === canal.id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              aria-label={`Supprimer le canal ${canal.label}`}
                            >
                              {deletingCanalId === canal.id ? '...' : 'Supprimer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => { setEditingCanal(null); setShowCanalModal(true) }}
                  className="px-4 py-2 text-sm font-medium rounded-xl text-white"
                  style={{ background: PRIMARY, minHeight: '40px' }}
                >
                  + Ajouter un canal
                </button>
              </div>
            </div>
          )}
        </div>

        <CanalConfigModal
          isOpen={showCanalModal}
          onClose={() => { setShowCanalModal(false); setEditingCanal(null) }}
          borneId={selectedBorneId}
          bornes={bornes}
          onSave={handleCanalSaved}
          initialCanal={editingCanal}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Enregistrements</h2>
                <p className="text-xs text-gray-500">
                  {enregistrementsTotal} élément{enregistrementsTotal !== 1 ? 's' : ''} pour la borne sélectionnée
                </p>
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
                        <td className="px-4 py-3"><CopyId id={enregistrement.id} /></td>
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

          <div className="bg-white rounded-2xl shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-900">Jobs de transmission</h2>
                <p className="text-xs text-gray-500">
                  {jobsTotal} job{jobsTotal !== 1 ? 's' : ''} {statutFilter ? `(filtré : ${STATUT_LABELS[statutFilter] || statutFilter})` : 'pour la borne'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="statut-filter" className="text-xs font-semibold text-gray-500">
                  Filtre statut
                </label>
                <select
                  id="statut-filter"
                  value={statutFilter}
                  onChange={(e) => setStatutFilter(e.target.value)}
                  className={inputClass}
                  style={{ minHeight: '36px', fontSize: '13px' }}
                >
                  <option value="">Tous</option>
                  {JOB_STATUTS.map((s) => (
                    <option key={s} value={s}>{STATUT_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            {loadingJobs ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
            ) : !selectedBorneId ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Sélectionnez une borne</div>
            ) : jobs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400">
                Aucun job {statutFilter ? `avec le statut "${STATUT_LABELS[statutFilter]}"` : 'pour cette borne'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Enregistrement</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Canal</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Tentatives</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Erreur</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const enregId = job.enregistrementId || job.enregistrement?.id
                      const labelFromJob = job.enregistrement?.borne?.canalTransmission
                        || enregistrementBorneCanalByEnregId.get(enregId)
                        || null
                      const canalForJob = labelFromJob ? canalLabelByLabel.get(labelFromJob) : null
                      const isStuckEnCours = job.statut === 'en_cours'
                        && job.updatedAt
                        && (Date.now() - new Date(job.updatedAt).getTime()) > 5 * 60 * 1000

                      return (
                        <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3"><CopyId id={enregId} /></td>
                          <td className="px-4 py-3 text-xs">
                            {labelFromJob
                              ? (
                                <span className={canalForJob ? 'text-gray-700' : 'text-orange-600'}>
                                  {labelFromJob}
                                  {!canalForJob && <span title="Canal introuvable" className="ml-1">⚠</span>}
                                </span>
                              )
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3"><StatutBadge statut={job.statut} /></td>
                          <td className="px-4 py-3 text-gray-600">{job.tentatives ?? '—'}</td>
                          <td className="px-4 py-3 text-red-500 text-xs max-w-[220px] truncate" title={job.erreur}>
                            {job.erreur || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              {(['echec_definitif', 'echec_temporaire'].includes(job.statut) || isStuckEnCours) && (
                                <button
                                  onClick={() => handleRelancer(job)}
                                  disabled={relancing === job.id}
                                  aria-label={`Relancer le job ${job.id}`}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50"
                                  style={{ background: PRIMARY, minHeight: '36px' }}
                                >
                                  {relancing === job.id ? '...' : (isStuckEnCours ? 'Réinitialiser' : 'Relancer')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          danger={confirm.danger}
          saving={launching || Boolean(relancing) || Boolean(deletingCanalId)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </AppLayout>
  )
}
