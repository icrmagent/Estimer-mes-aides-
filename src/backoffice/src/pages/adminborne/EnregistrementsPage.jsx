import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { ErrorBanner, SkeletonTableRows, BadgeEnreg } from '../../components/ui.jsx'

function getQuestionLabel(rep, index) {
  const label = rep.question?.libelleQuestion
  if (typeof label === 'string') return label
  if (label?.fr) return label.fr
  if (label?.en) return label.en
  if (label?.es) return label.es
  return `Champ ${index + 1}`
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

export default function ABEnregistrementsPage() {
  const [enregistrements, setEnregistrements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [bornesList, setBornesList] = useState([])
  const [limit, setLimit] = useState(50)

  const [filters, setFilters] = useState({
    borneId: '',
    dateDebut: '',
    dateFin: '',
  })

  const fetchData = useCallback((p = 1, f = filters) => {
    setLoading(true)
    const params = { page: p, limit }
    if (f.borneId) params.borneId = f.borneId
    if (f.dateDebut) params.dateDebut = new Date(`${f.dateDebut}T00:00:00Z`).toISOString()
    if (f.dateFin) params.dateFin = new Date(`${f.dateFin}T23:59:59.999Z`).toISOString()

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

      const res = await api.get(`/api/enregistrements/export?${params.toString()}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `mes-enregistrements-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Erreur lors de l\'export')
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

        <ErrorBanner message={error} onClose={() => setError(null)} />

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
            <button
              type="button"
              onClick={() => {
                const reset = { borneId: '', dateDebut: '', dateFin: '' }
                setFilters(reset)
                setPage(1)
                fetchData(1, reset)
              }}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              style={{ minHeight: '40px' }}
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm">
          <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Borne</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Formulaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Langue</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows cols={7} rows={5} />
                ) : enregistrements.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">Aucun enregistrement trouvé</td></tr>
                ) : enregistrements.map(e => (
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
                    <td className="px-4 py-3"><BadgeEnreg statut={e.statutPartage} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.createdAt ? new Date(e.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </AppLayout>
  )
}
