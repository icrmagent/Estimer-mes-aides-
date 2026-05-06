import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

export default function AdminBorneFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    nom: '',
    prenom: '',
    email: '',
    password: '',
    raisonSociale: '',
    siret: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (isEdit) {
      api.get(`/api/admin-bornes/${id}`)
        .then(res => {
          const a = res.data.adminBorne || res.data
          setForm({
            nom: a.nom || '',
            prenom: a.prenom || '',
            email: a.email || '',
            password: '', // never pre-fill password
            raisonSociale: a.raisonSociale || '',
            siret: a.siret || '',
          })
        })
        .catch(() => setError('Admin borne introuvable'))
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
      const payload = { ...form }
      if (isEdit) delete payload.password // don't send empty password on edit
      if (isEdit) {
        await api.put(`/api/admin-bornes/${id}`, payload)
      } else {
        await api.post('/api/admin-bornes', payload)
      }
      navigate('/superadmin/admin-bornes')
    } catch (err) {
      const data = err.response?.data
      if (data?.errors) {
        const fe = {}
        data.errors.forEach(e => { fe[e.field || e.path] = e.message })
        setFieldErrors(fe)
      } else {
        setError(data?.error || 'Erreur lors de la sauvegarde')
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
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Modifier l\'admin borne' : 'Nouvel admin borne'}
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.nom}
                onChange={e => handleChange('nom', e.target.value)}
                required
                className={inputClass}
                style={inputStyle}
                placeholder="Dupont"
              />
              {fieldErrors.nom && <p className="text-red-500 text-xs mt-1">{fieldErrors.nom}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.prenom}
                onChange={e => handleChange('prenom', e.target.value)}
                required
                className={inputClass}
                style={inputStyle}
                placeholder="Jean"
              />
              {fieldErrors.prenom && <p className="text-red-500 text-xs mt-1">{fieldErrors.prenom}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
              placeholder="jean.dupont@exemple.fr"
            />
            {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => handleChange('password', e.target.value)}
                required={!isEdit}
                autoComplete="new-password"
                className={inputClass}
                style={inputStyle}
                placeholder="Minimum 8 caractères"
              />
              {fieldErrors.password && <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Raison sociale <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.raisonSociale}
                onChange={e => handleChange('raisonSociale', e.target.value)}
                required
                className={inputClass}
                style={inputStyle}
                placeholder="SARL Exemple"
              />
              {fieldErrors.raisonSociale && <p className="text-red-500 text-xs mt-1">{fieldErrors.raisonSociale}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                SIRET <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.siret}
                onChange={e => handleChange('siret', e.target.value)}
                required
                className={inputClass}
                style={inputStyle}
                placeholder="12345678901234"
                maxLength={14}
              />
              {fieldErrors.siret && <p className="text-red-500 text-xs mt-1">{fieldErrors.siret}</p>}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/superadmin/admin-bornes')}
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
              {loading ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Créer l\'admin')}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
