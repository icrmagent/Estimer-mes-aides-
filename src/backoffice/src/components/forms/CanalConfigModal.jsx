import { useState, useEffect } from 'react'
import api from '../../services/api.js'

/**
 * CanalConfigModal — Modal pour créer/modifier la configuration d'un canal I-CRM
 * 
 * Props:
 * - isOpen: boolean — affiche/masque le modal
 * - onClose: function — appelé quand fermer
 * - borneId: string — UUID de la borne
 * - onSave: function — appelé après succès (reçoit le canal créé/modifié)
 * - initialCanal?: object — pour modification (avec id, label, apiUrl, apiKey, token, actif)
 */
export default function CanalConfigModal({ isOpen, onClose, borneId, onSave, initialCanal = null }) {
  const [label, setLabel] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [actif, setActif] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Réinitialiser le formulaire quand le modal s'ouvre/ferme ou quand initialCanal change
  useEffect(() => {
    if (isOpen) {
      if (initialCanal) {
        setLabel(initialCanal.label || '')
        setApiUrl(initialCanal.apiUrl || '')
        setApiKey(initialCanal.apiKey || '')
        setToken(initialCanal.token || '')
        setActif(initialCanal.actif !== false)
      } else {
        setLabel('')
        setApiUrl('')
        setApiKey('')
        setToken('')
        setActif(true)
      }
      setError(null)
    }
  }, [isOpen, initialCanal])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Validation simple
      if (!label.trim()) {
        setError('Le label du canal est requis')
        setLoading(false)
        return
      }
      if (!apiUrl.trim()) {
        setError('L\'URL API est requise')
        setLoading(false)
        return
      }
      if (!apiKey.trim()) {
        setError('La clé API est requise')
        setLoading(false)
        return
      }
      if (!token.trim()) {
        setError('Le token est requis')
        setLoading(false)
        return
      }

      let response
      if (initialCanal && initialCanal.id) {
        // Modification
        response = await api.put(`/api/canaux/${initialCanal.id}`, {
          label: label.trim(),
          apiUrl: apiUrl.trim(),
          apiKey: apiKey.trim(),
          token: token.trim(),
          actif,
        })
      } else {
        // Création
        response = await api.post('/api/canaux', {
          label: label.trim(),
          apiUrl: apiUrl.trim(),
          apiKey: apiKey.trim(),
          token: token.trim(),
          actif,
          borneId,
        })
      }

      const canal = response.data
      if (onSave) {
        onSave(canal)
      }
      onClose()
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message ||
                       err.response?.data?.error ||
                       err.message ||
                       'Erreur lors de l\'enregistrement du canal'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Entête */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {initialCanal ? 'Modifier le canal' : 'Créer un nouveau canal'}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Contenu */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Label */}
          <div>
            <label className={labelClass}>Label du canal</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: icrm-production, agence-nord"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
              maxLength={120}
            />
            <div className="text-xs text-gray-400 mt-1">{label.length}/120</div>
          </div>

          {/* URL API */}
          <div>
            <label className={labelClass}>URL API I-CRM</label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="Ex: https://api.icrm.example.com"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
            <div className="text-xs text-gray-400 mt-1">URL valide requise</div>
          </div>

          {/* Clé API */}
          <div>
            <label className={labelClass}>Clé API</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••••••"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
            <div className="text-xs text-gray-400 mt-1">Clé secrète confidentielle</div>
          </div>

          {/* Token */}
          <div>
            <label className={labelClass}>Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••••••"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
            <div className="text-xs text-gray-400 mt-1">Token de connexion I-CRM</div>
          </div>

          {/* Actif */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="actif"
              checked={actif}
              onChange={(e) => setActif(e.target.checked)}
              disabled={loading}
              className="rounded"
              style={{ minWidth: '20px', minHeight: '20px' }}
            />
            <label htmlFor="actif" className="text-sm text-gray-600 font-medium cursor-pointer">
              Canal actif
            </label>
          </div>

          {/* Boutons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
              style={{ minHeight: '40px' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition"
              style={{ minHeight: '40px', background: '#5B2D8E' }}
            >
              {loading ? 'En cours...' : (initialCanal ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
