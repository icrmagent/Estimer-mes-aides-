import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

function StatutBadge({ statut }) {
  const styles = {
    publie: 'bg-blue-100 text-blue-700',
    brouillon: 'bg-yellow-100 text-yellow-700',
    archive: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-500'}`}>
      {statut}
    </span>
  )
}

export default function FormulairesListPage() {
  const [formulaires, setFormulaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [duplicating, setDuplicating] = useState(null)

  useEffect(() => {
    api.get('/api/formulaires')
      .then(res => setFormulaires(res.data.formulaires || res.data.data || res.data || []))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDuplicate(formulaire) {
    setDuplicating(formulaire.id)
    try {
      const res = await api.post(`/api/formulaires/${formulaire.id}/dupliquer`)
      const newForm = res.data.formulaire || res.data
      setFormulaires(prev => [newForm, ...prev])
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la duplication')
    } finally {
      setDuplicating(null)
    }
  }

  async function handleChangeStatut(formulaire, newStatut) {
    try {
      await api.patch(`/api/formulaires/${formulaire.id}/statut`, { statut: newStatut })
      setFormulaires(prev => prev.map(f => f.id === formulaire.id ? { ...f, statut: newStatut } : f))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du changement de statut')
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Formulaires</h1>
            <p className="text-gray-500 text-sm mt-1">{formulaires.length} formulaire{formulaires.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : formulaires.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucun formulaire trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Label</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Version</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Questions</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {formulaires.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{f.label}</td>
                    <td className="px-4 py-3 text-gray-500">v{f.version}</td>
                    <td className="px-4 py-3"><StatutBadge statut={f.statut} /></td>
                    <td className="px-4 py-3 text-gray-500">{f._count?.questions ?? f.questions?.length ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {f.statut === 'brouillon' && (
                          <button
                            onClick={() => handleChangeStatut(f, 'publie')}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                            style={{ minHeight: '36px' }}
                          >
                            Publier
                          </button>
                        )}
                        {f.statut === 'publie' && (
                          <button
                            onClick={() => handleChangeStatut(f, 'archive')}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            style={{ minHeight: '36px' }}
                          >
                            Archiver
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(f)}
                          disabled={duplicating === f.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                          style={{ minHeight: '36px' }}
                        >
                          {duplicating === f.id ? '...' : 'Dupliquer'}
                        </button>
                        <Link
                          to={`/superadmin/formulaires/${f.id}/edit`}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          style={{ minHeight: '36px', display: 'flex', alignItems: 'center' }}
                        >
                          Éditer
                        </Link>
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
