import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

function StatutBadge({ statut, deletedAt }) {
  if (deletedAt) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Supprimé</span>
  }
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

function FormulaireRowActions({ f, handleChangeStatut, handleDuplicate, handleDelete, handleRestore, duplicating }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"/>
          <circle cx="12" cy="5" r="1"/>
          <circle cx="12" cy="19" r="1"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          <div className="py-1">
            {f.deletedAt ? (
              <button
                onClick={() => { setIsOpen(false); handleRestore(f); }}
                className="w-full text-left px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Restaurer
              </button>
            ) : (
              <>
                {f.statut === 'brouillon' && (
                  <button
                    onClick={() => { setIsOpen(false); handleChangeStatut(f, 'publie'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Publier
                  </button>
                )}

                {f.statut === 'publie' && (
                  <button
                    onClick={() => { setIsOpen(false); handleChangeStatut(f, 'archive'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    Archiver
                  </button>
                )}
                <button
                  onClick={() => { setIsOpen(false); handleDuplicate(f); }}
                  disabled={duplicating === f.id}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  {duplicating === f.id ? '...' : 'Dupliquer'}
                </button>
                <Link
                  to={`/superadmin/formulaires/${f.id}/edit`}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Éditer
                </Link>
                {f.statut === 'brouillon' && (
                  <button
                    onClick={() => { setIsOpen(false); handleDelete(f); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    Supprimer
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormulairesListPage() {
  const [formulaires, setFormulaires] = useState([])
  const [allFormulaires, setAllFormulaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [duplicating, setDuplicating] = useState(null)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const [statutFilter, setStatutFilter] = useState('')
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, formulaire: null })

  const fetchFormulaires = async (currentStatut) => {
    setLoading(true)
    try {
      const res = await api.get('/api/formulaires')
      const data = res.data.formulaires || res.data.data || res.data || []
      setAllFormulaires(data)
      
      if (currentStatut === 'archive') {
        const resDeleted = await api.get('/api/formulaires/deleted')
        const deletedData = resDeleted.data.formulaires || resDeleted.data.data || resDeleted.data || []
        const archivedForms = data.filter(f => f.statut === 'archive')
        setFormulaires([...archivedForms, ...deletedData])
      } else if (!currentStatut) {
        setFormulaires(data.filter(f => f.statut !== 'archive'))
      } else {
        setFormulaires(data.filter(f => f.statut === currentStatut))
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFormulaires('')
  }, [])

  function handleStatutFilter(statut) {
    setStatutFilter(statut)
    fetchFormulaires(statut)
  }

  async function handleDuplicate(formulaire) {
    setDuplicating(formulaire.id)
    try {
      const res = await api.post(`/api/formulaires/${formulaire.id}/dupliquer`)
      const newForm = res.data.formulaire || res.data.data || res.data
      setAllFormulaires(prev => [newForm, ...prev])
      setFormulaires(prev => [newForm, ...prev])
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la duplication'))
    } finally {
      setDuplicating(null)
    }
  }

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const res = await api.post('/api/formulaires', { label: 'Nouveau formulaire' })
      const newForm = res.data.data || res.data.formulaire || res.data
      navigate(`/superadmin/formulaires/${newForm.id}/edit`)
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la création'))
      setCreating(false)
    }
  }

  async function handleChangeStatut(formulaire, newStatut) {
    try {
      await api.patch(`/api/formulaires/${formulaire.id}/statut`, { statut: newStatut })
      const updater = prev => prev.map(f => f.id === formulaire.id ? { ...f, statut: newStatut } : f)
      setAllFormulaires(updater)
      setFormulaires(updater)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du changement de statut')
    }
  }

  function handleDelete(formulaire) {
    setDeleteModal({ isOpen: true, formulaire })
  }

  async function confirmDelete() {
    const formulaire = deleteModal.formulaire
    setDeleteModal({ isOpen: false, formulaire: null })
    if (!formulaire) return
    try {
      await api.delete(`/api/formulaires/${formulaire.id}`)
      fetchFormulaires(statutFilter)
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la suppression'))
    }
  }

  async function handleRestore(formulaire) {
    try {
      await api.post(`/api/formulaires/${formulaire.id}/restore`)
      fetchFormulaires(statutFilter)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la restauration')
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
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-60"
            style={{ background: '#5B2D8E', minHeight: '40px' }}
          >
            {creating ? 'Création...' : '+ Créer un formulaire'}
          </button>
        </div>

        {/* Status filter */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-600 mr-1">Filtrer par statut :</span>
            {['', 'brouillon', 'publie', 'archive'].map(s => (
              <button
                key={s}
                onClick={() => handleStatutFilter(s)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  statutFilter === s
                    ? 'text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={{
                  minHeight: '36px',
                  background: statutFilter === s ? '#5B2D8E' : undefined,
                }}
              >
                {s === '' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : formulaires.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucun formulaire trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 rounded-tl-2xl">Label</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Version</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Questions</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 rounded-tr-2xl">Actions</th>
                </tr>
              </thead>
              <tbody>
                {formulaires.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{f.label}</td>
                    <td className="px-4 py-3 text-gray-500">v{f.version}</td>
                    <td className="px-4 py-3"><StatutBadge statut={f.statut} deletedAt={f.deletedAt} /></td>
                    <td className="px-4 py-3 text-gray-500">{f._count?.questions ?? f.questions?.length ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <FormulaireRowActions
                        f={f}
                        handleChangeStatut={handleChangeStatut}
                        handleDuplicate={handleDuplicate}
                        handleDelete={handleDelete}
                        handleRestore={handleRestore}
                        duplicating={duplicating}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de confirmation de suppression */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Supprimer le formulaire</h3>
            <p className="text-gray-600 text-sm mb-6">
              Êtes-vous sûr de vouloir supprimer le formulaire <span className="font-semibold text-gray-800">{deleteModal.formulaire?.label}</span> ?
              <br/><br/>
              Cette action est irréversible.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, formulaire: null })}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
