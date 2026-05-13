import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

function StatutBadge({ statut }) {
  const styles = {
    en_attente: 'bg-yellow-100 text-yellow-700',
    en_cours: 'bg-blue-100 text-blue-700',
    partage: 'bg-green-100 text-green-700',
    echec_temporaire: 'bg-orange-100 text-orange-700',
    echec_definitif: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut?.replace(/_/g, ' ')}
    </span>
  )
}

function getQuestionLabel(rep, index) {
  const label = rep.question?.libelleQuestion
  if (typeof label === 'string') return label
  if (label?.fr) return label.fr
  if (label?.en) return label.en
  if (label?.es) return label.es
  return `Champ ${index + 1}`
}

function getTranslatedText(value, langue = 'fr') {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[langue] || value.fr || value.en || value.es || ''
}

function getContactName(enregistrement) {
  if (!enregistrement?.reponses) return '—'
  let nom = ''
  let prenom = ''
  
  for (const rep of enregistrement.reponses) {
    const label = (getQuestionLabel(rep, 0) || '').toLowerCase().trim()
    const fieldId = String(rep.question?.fieldId || '')
    
    if (fieldId === '2087' || label === 'nom') nom = rep.valeur
    if (fieldId === '2088' || label === 'prénom' || label === 'prenom') prenom = rep.valeur
  }
  
  const nomComplet = nom?.trim() || ''
  const prenomComplet = prenom?.trim() || ''
  if (nomComplet || prenomComplet) return `${prenomComplet} ${nomComplet}`.trim()
  return '—'
}

function getResponseValue(rep, langue = 'fr') {
  const options = Array.isArray(rep.question?.options) ? rep.question.options : []
  if (!options.length) return rep.valeur || '—'

  const labelsById = new Map(options.map(opt => [String(opt.id), getTranslatedText(opt.label, langue)]))
  const rawValue = rep.valeur || ''
  const values = rawValue.startsWith('[')
    ? (() => {
        try {
          const parsed = JSON.parse(rawValue)
          return Array.isArray(parsed) ? parsed : [rawValue]
        } catch {
          return [rawValue]
        }
      })()
    : rawValue.split(',').map(item => item.trim()).filter(Boolean)

  const labels = values.map(item => labelsById.get(String(item)) || item)
  return labels.length ? labels.join(', ') : '—'
}

export default function EnregistrementsListPage() {
  const [enregistrements, setEnregistrements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [detailModal, setDetailModal] = useState({ isOpen: false, loading: false, enregistrement: null })
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, enregistrement: null })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [bornesList, setBornesList] = useState([])
  const [limit, setLimit] = useState(50)

  // Filters
  const [filters, setFilters] = useState({
    borneId: '',
    dateDebut: '',
    dateFin: '',
    statutPartage: '',
  })

  const fetchData = useCallback((p = 1, f = filters) => {
    setLoading(true)
    const params = { page: p, limit }
    if (f.borneId) params.borneId = f.borneId
    if (f.dateDebut) params.dateDebut = new Date(`${f.dateDebut}T00:00:00Z`).toISOString()
    if (f.dateFin) params.dateFin = new Date(`${f.dateFin}T23:59:59.999Z`).toISOString()
    if (f.statutPartage) params.statutPartage = f.statutPartage

    api.get('/api/enregistrements', { params })
      .then(res => {
        setEnregistrements(res.data.enregistrements || res.data.data || res.data || [])
        setTotal(res.data.meta?.total || res.data.total || 0)
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [filters, limit])

  useEffect(() => { fetchData(page, filters) }, [page, limit, filters, fetchData])

  useEffect(() => {
    api.get('/api/bornes', { params: { limit: 100 } })
      .then(res => setBornesList(res.data.bornes || res.data.data || res.data || []))
      .catch(err => console.error('Erreur chargement bornes', err))
  }, [])

  function handleFilterChange(field, value) {
    setPage(1)
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  async function handleExport() {
    try {
      const params = new URLSearchParams()
      if (filters.borneId) params.set('borneId', filters.borneId)
      if (filters.dateDebut) params.set('dateDebut', new Date(`${filters.dateDebut}T00:00:00Z`).toISOString())
      if (filters.dateFin) params.set('dateFin', new Date(`${filters.dateFin}T23:59:59.999Z`).toISOString())
      if (filters.statutPartage) params.set('statutPartage', filters.statutPartage)

      const res = await api.get(`/api/enregistrements/export?${params.toString()}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `enregistrements-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError('Erreur lors de l\'export')
    }
  }

  async function handleExportOne(enregistrement) {
    try {
      const res = await api.get(`/api/enregistrements/export?id=${enregistrement.id}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `enregistrement-${enregistrement.id.slice(0, 8)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Erreur lors du téléchargement')
    }
  }

  async function handleView(enregistrement) {
    setDetailModal({ isOpen: true, loading: true, enregistrement: null })
    try {
      const res = await api.get(`/api/enregistrements/${enregistrement.id}`)
      setDetailModal({ isOpen: true, loading: false, enregistrement: res.data.data || res.data })
    } catch {
      setDetailModal({ isOpen: false, loading: false, enregistrement: null })
      setError('Erreur lors du chargement de l’enregistrement')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/api/enregistrements/${deleteModal.enregistrement.id}`)
      setDeleteModal({ isOpen: false, enregistrement: null })
      fetchData(page)
    } catch {
      setError('Erreur lors de la suppression')
    }
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Enregistrements</h1>
            <p className="text-gray-500 text-sm mt-1">{total} enregistrement{total !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2.5 text-sm font-semibold rounded-xl text-white"
            style={{ background: '#1A56A0', minHeight: '48px' }}
          >
            ↓ Exporter XLSX
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Borne</label>
              <select
                value={filters.borneId}
                onChange={e => handleFilterChange('borneId', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Toutes les bornes</option>
                {bornesList.map(b => (
                  <option key={b.id} value={b.id}>{b.idBorne} {b.adresse ? `- ${b.adresse}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date début</label>
              <input
                type="date"
                value={filters.dateDebut}
                onChange={e => handleFilterChange('dateDebut', e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date fin</label>
              <input
                type="date"
                value={filters.dateFin}
                onChange={e => handleFilterChange('dateFin', e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statut partage</label>
              <select
                value={filters.statutPartage}
                onChange={e => handleFilterChange('statutPartage', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Tous</option>
                <option value="en_attente">En attente</option>
                <option value="en_cours">En cours</option>
                <option value="partage">Partagé</option>
                <option value="echec_temporaire">Échec temporaire</option>
                <option value="echec_definitif">Échec définitif</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => { setFilters({ borneId: '', dateDebut: '', dateFin: '', statutPartage: '' }); setPage(1); fetchData(1, { borneId: '', dateDebut: '', dateFin: '', statutPartage: '' }) }}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              style={{ minHeight: '40px' }}
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : enregistrements.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucun enregistrement trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Langue</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enregistrements.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-700">{e.borne?.idBorne || e.borneId || '—'}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{getContactName(e)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.formulaire?.label || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                        {e.langueUtilisee || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={e.statutPartage} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.createdAt ? new Date(e.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === e.id ? null : e.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                          aria-label="Actions de l’enregistrement"
                        >
                          ⋯
                        </button>
                        {openMenuId === e.id && (
                          <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 text-left shadow-lg">
                            <button type="button" onClick={() => { setOpenMenuId(null); handleView(e) }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Consulter</button>
                            <button type="button" onClick={() => { setOpenMenuId(null); handleExportOne(e) }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Télécharger Excel</button>
                            <button type="button" onClick={() => { setOpenMenuId(null); setDeleteModal({ isOpen: true, enregistrement: e }) }} className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">Supprimer</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {(total > 0) && (
          <div className="flex items-center justify-between p-4 border-t border-gray-50 mt-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-medium">Afficher :</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value))
                  setPage(1)
                }}
                className={inputClass}
                style={{ minHeight: '36px', padding: '4px 8px' }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={300}>300</option>
              </select>
              <span className="text-sm text-gray-500">par page</span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 transition-colors hover:bg-gray-50"
                style={{ minHeight: '40px' }}
              >
                ← Précédent
              </button>
              <span className="text-sm text-gray-500 font-medium px-2">Page {page} / {Math.max(1, Math.ceil(total / limit))}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 transition-colors hover:bg-gray-50"
                style={{ minHeight: '40px' }}
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>

      {detailModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Enregistrement</h2>
                <p className="text-xs text-gray-500 font-mono mt-1">{detailModal.enregistrement?.id}</p>
              </div>
              <button onClick={() => setDetailModal({ isOpen: false, loading: false, enregistrement: null })} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {detailModal.loading ? (
              <div className="py-10 text-center text-gray-400">Chargement...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="font-semibold text-gray-600">Borne :</span> {detailModal.enregistrement?.borne?.idBorne || '—'}</div>
                  <div><span className="font-semibold text-gray-600">Langue :</span> {detailModal.enregistrement?.langueUtilisee || '—'}</div>
                  <div><span className="font-semibold text-gray-600">Formulaire :</span> {detailModal.enregistrement?.formulaire?.label || '—'}</div>
                  <div><span className="font-semibold text-gray-600">Statut :</span> {detailModal.enregistrement?.statutPartage || '—'}</div>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  {(detailModal.enregistrement?.reponses || []).map((rep, index) => (
                    <div key={rep.id || rep.questionId} className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1">
                        {getQuestionLabel(rep, index)}
                      </div>
                      <div className="text-sm text-gray-800">{getResponseValue(rep, detailModal.enregistrement?.langueUtilisee || 'fr')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Supprimer l’enregistrement</h2>
            <p className="text-sm text-gray-600">Êtes-vous sûr de vouloir supprimer l’enregistrement <span className="font-mono font-semibold">{deleteModal.enregistrement?.id?.slice(0, 8)}…</span> ?</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleteModal({ isOpen: false, enregistrement: null })} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Annuler</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
