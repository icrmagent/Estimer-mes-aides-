import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'

function StatusBadge({ actif }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {actif ? 'Actif' : 'Inactif'}
    </span>
  )
}

export default function AdminBornesListPage() {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tempPasswordAlert, setTempPasswordAlert] = useState(null) // { adminId, password }

  useEffect(() => {
    api.get('/api/admin-bornes')
      .then(res => setAdmins(res.data.adminBornes || res.data.data || res.data || []))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  async function toggleActif(admin) {
    const newActif = !admin.actif
    try {
      await api.patch(`/api/admin-bornes/${admin.id}/statut`, { actif: newActif })
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, actif: newActif } : a))
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour')
    }
  }

  async function resetPassword(admin) {
    try {
      const res = await api.post(`/api/admin-bornes/${admin.id}/reset-password`)
      setTempPasswordAlert({
        adminId: admin.id,
        adminName: `${admin.nom} ${admin.prenom}`,
        password: res.data.temporaryPassword || res.data.password || res.data.motDePasseTemporaire,
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la réinitialisation')
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Bornes</h1>
            <p className="text-gray-500 text-sm mt-1">{admins.length} administrateur{admins.length !== 1 ? 's' : ''}</p>
          </div>
          <Link
            to="/superadmin/admin-bornes/new"
            className="px-4 py-2.5 text-white font-semibold rounded-xl text-sm transition-opacity hover:opacity-90"
            style={{ background: '#5B2D8E', minHeight: '48px', display: 'flex', alignItems: 'center' }}
          >
            + Nouvel admin
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Temp password alert — NOT window.alert() */}
        {tempPasswordAlert && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-amber-800 font-semibold text-sm">Mot de passe temporaire généré</p>
                <p className="text-amber-700 text-sm mt-1">
                  Pour <strong>{tempPasswordAlert.adminName}</strong> :
                </p>
                <code className="block mt-2 bg-amber-100 px-3 py-2 rounded-lg text-amber-900 font-mono text-sm">
                  {tempPasswordAlert.password}
                </code>
                <p className="text-amber-600 text-xs mt-2">⚠️ Notez ce mot de passe — il ne sera plus affiché.</p>
              </div>
              <button
                onClick={() => setTempPasswordAlert(null)}
                className="text-amber-400 hover:text-amber-600 ml-4 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
          ) : admins.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Aucun admin borne trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Nom / Prénom</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Raison sociale</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">SIRET</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(admin => (
                  <tr key={admin.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{admin.nom} {admin.prenom}</td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3 text-gray-500">{admin.raisonSociale}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{admin.siret}</td>
                    <td className="px-4 py-3"><StatusBadge actif={admin.actif} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => resetPassword(admin)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                          style={{ minHeight: '36px' }}
                        >
                          Réinit. MDP
                        </button>
                        <button
                          onClick={() => toggleActif(admin)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                          style={{
                            minHeight: '36px',
                            borderColor: admin.actif ? '#d1d5db' : '#5B2D8E',
                            color: admin.actif ? '#6b7280' : '#5B2D8E',
                          }}
                        >
                          {admin.actif ? 'Désactiver' : 'Activer'}
                        </button>
                        <Link
                          to={`/superadmin/admin-bornes/${admin.id}/edit`}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          style={{ minHeight: '36px', display: 'flex', alignItems: 'center' }}
                        >
                          Modifier
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
