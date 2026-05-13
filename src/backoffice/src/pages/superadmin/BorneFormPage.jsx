import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { ErrorBanner } from '../../components/ui.jsx'

export default function BorneFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    idBorne: '',
    langueDefaut: 'fr',
    adresse: '',
    commercant: '',
    regie: '',
    installateur: '',
    canalTransmission: '',
    formulaireId: '',
    adminBorneId: '',
  })
  const [formulaires, setFormulaires] = useState([])
  const [adminBornes, setAdminBornes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    // Load formulaires and adminBornes for selects
    Promise.all([
      api.get('/api/formulaires').catch(() => ({ data: [] })),
      api.get('/api/admin-bornes').catch(() => ({ data: [] })),
    ]).then(([fRes, aRes]) => {
      setFormulaires(fRes.data.formulaires || fRes.data.data || fRes.data || [])
      setAdminBornes(aRes.data.adminBornes || aRes.data.data || aRes.data || [])
    })

    if (isEdit) {
      api.get(`/api/bornes/${id}`)
        .then(res => {
          const b = res.data.data || res.data.borne || res.data
          setForm({
            idBorne: b.idBorne || '',
            langueDefaut: b.langueDefaut || 'fr',
            adresse: b.adresse || '',
            commercant: b.commercant || '',
            regie: b.regie || '',
            installateur: b.installateur || '',
            canalTransmission: b.canalTransmission || '',
            formulaireId: b.formulaireId || '',
            adminBorneId: b.adminBorneId || '',
          })
        })
        .catch(() => setError('Borne introuvable'))
    }
  }, [id, isEdit])

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => ({ ...prev, [field]: null }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      const { idBorne, ...payload } = form
      if (isEdit) {
        await api.put(`/api/bornes/${id}`, payload)
      } else {
        await api.post('/api/bornes', payload)
      }
      navigate('/superadmin/bornes')
    } catch (err) {
      const data = err.response?.data
      if (data?.error?.details?.fieldErrors) {
        const fe = {}
        const fieldErrors = data.error.details.fieldErrors
        Object.keys(fieldErrors).forEach(key => {
          fe[key] = fieldErrors[key][0]
        })
        setFieldErrors(fe)
        setError(data.error.message || 'Données invalides')
      } else if (data?.errors) {
        const fe = {}
        data.errors.forEach(e => { fe[e.field || e.path] = e.message })
        setFieldErrors(fe)
        setError('Données invalides')
      } else {
        const errMsg = typeof data?.error === 'string' 
          ? data.error 
          : (data?.error?.message || 'Erreur lors de la sauvegarde')
        setError(errMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:border-transparent'
  const inputStyle = { minHeight: '48px', fontSize: '16px' }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Modifier la borne' : 'Nouvelle borne'}</h1>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                ID Borne <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={isEdit ? form.idBorne : 'Généré automatiquement'}
                readOnly
                disabled
                className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
                style={inputStyle}
                aria-describedby="id-borne-help"
              />
              <p id="id-borne-help" className="text-xs text-gray-500 mt-1">
                Cet identifiant est généré par le serveur et ne peut pas être modifié.
              </p>
              {fieldErrors.idBorne && <p className="text-red-500 text-xs mt-1">{fieldErrors.idBorne}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Langue par défaut</label>
              <select
                value={form.langueDefaut}
                onChange={e => handleChange('langueDefaut', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="fr">🇫🇷 Français</option>
                <option value="es">🇪🇸 Español</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Adresse <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.adresse}
              onChange={e => handleChange('adresse', e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
              placeholder="123 rue de la Paix, 75001 Paris"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Commerçant</label>
              <input
                type="text"
                value={form.commercant}
                onChange={e => handleChange('commercant', e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Nom du commerçant"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Régie</label>
              <input
                type="text"
                value={form.regie}
                onChange={e => handleChange('regie', e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Nom de la régie"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Installateur</label>
              <input
                type="text"
                value={form.installateur}
                onChange={e => handleChange('installateur', e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Nom de l'installateur"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Canal de transmission I-CRM</label>
            <input
              type="text"
              value={form.canalTransmission}
              onChange={e => handleChange('canalTransmission', e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="ex: canal-principal (configurer les identifiants dans Partage)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Identifiant du canal I-CRM utilisé pour l'envoi des leads. Les clés API se configurent dans la page Partage.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Formulaire assigné</label>
              <select
                value={form.formulaireId}
                onChange={e => handleChange('formulaireId', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— Aucun —</option>
                {formulaires.map(f => (
                  <option key={f.id} value={f.id}>{f.label} (v{f.version})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Admin Borne assigné</label>
              <select
                value={form.adminBorneId}
                onChange={e => handleChange('adminBorneId', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— Aucun —</option>
                {adminBornes.map(a => (
                  <option key={a.id} value={a.id}>{a.nom} {a.prenom} ({a.email})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/superadmin/bornes')}
              className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              style={{ minHeight: '48px' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-opacity disabled:opacity-60"
              style={{ background: '#5B2D8E', minHeight: '48px' }}
            >
              {loading ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Créer la borne')}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
