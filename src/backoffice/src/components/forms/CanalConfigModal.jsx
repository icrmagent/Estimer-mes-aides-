import { useState, useEffect } from 'react'
import api from '../../services/api.js'

/**
 * CanalConfigModal — Modal pour créer/modifier la configuration d'un canal I-CRM
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - borneId: string — UUID pré-sélectionné (borne active dans la page parente)
 * - bornes: array — liste complète des bornes pour le sélecteur
 * - onSave: function — appelé après succès (reçoit le canal créé/modifié)
 * - initialCanal?: object — pour modification
 */
export default function CanalConfigModal({ isOpen, onClose, borneId, bornes = [], onSave, initialCanal = null }) {
  const [selectedBorneId, setSelectedBorneId] = useState(borneId || '')
  const [label, setLabel]     = useState('')
  const [apiUrl, setApiUrl]   = useState('')
  const [apiKey, setApiKey]   = useState('')
  const [token, setToken]     = useState('')
  const [actif, setActif]     = useState(true)
  const [affecterBorne, setAffecterBorne] = useState(true)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedBorneId(borneId || '')
      setAffecterBorne(true)
      setError(null)
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
    }
  }, [isOpen, initialCanal, borneId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!selectedBorneId) { setError('Sélectionnez une borne'); setLoading(false); return }
      if (!label.trim())    { setError('Le label du canal est requis'); setLoading(false); return }
      if (!apiUrl.trim())   { setError("L'URL API est requise"); setLoading(false); return }
      if (!apiKey.trim())   { setError('La clé API est requise'); setLoading(false); return }
      if (!token.trim())    { setError('Le token est requis'); setLoading(false); return }

      let response
      if (initialCanal?.id) {
        response = await api.put(`/api/canaux/${initialCanal.id}`, {
          label: label.trim(), apiUrl: apiUrl.trim(), apiKey: apiKey.trim(), token: token.trim(), actif,
        })
      } else {
        response = await api.post('/api/canaux', {
          label: label.trim(), apiUrl: apiUrl.trim(), apiKey: apiKey.trim(), token: token.trim(), actif,
          borneId: selectedBorneId,
        })
      }

      // Affecter la borne au canal (canalTransmission = label)
      if (affecterBorne && selectedBorneId) {
        await api.put(`/api/partage/bornes/${selectedBorneId}/canal`, {
          canalTransmission: label.trim(),
        })
      }

      if (onSave) onSave(response.data)
      onClose()
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        "Erreur lors de l'enregistrement du canal"
      )
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

        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {initialCanal ? 'Modifier le canal' : 'Créer un nouveau canal'}
          </h2>
          <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-2xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
          )}

          {/* Borne */}
          <div>
            <label className={labelClass}>Borne assignée</label>
            <select
              value={selectedBorneId}
              onChange={(e) => setSelectedBorneId(e.target.value)}
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            >
              <option value="">— Sélectionner une borne —</option>
              {bornes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.idBorne}{b.adresse ? ` · ${b.adresse}` : ''}
                  {b.canalTransmission ? ` (canal: ${b.canalTransmission})` : ''}
                </option>
              ))}
            </select>
          </div>

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
              placeholder="https://app-web-abondance-dev-webapi.azurewebsites.net"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
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
          </div>

          {/* Token JWT */}
          <div>
            <label className={labelClass}>Token JWT I-CRM</label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi..."
              className={inputClass}
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
              disabled={loading}
            />
            <div className="text-xs text-gray-400 mt-1">Bearer token — à renouveler à l'expiration</div>
          </div>

          {/* Actif + Affecter */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="actif"
                checked={actif}
                onChange={(e) => setActif(e.target.checked)}
                disabled={loading}
                style={{ minWidth: '20px', minHeight: '20px' }}
              />
              <label htmlFor="actif" className="text-sm text-gray-600 font-medium cursor-pointer">Canal actif</label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="affecterBorne"
                checked={affecterBorne}
                onChange={(e) => setAffecterBorne(e.target.checked)}
                disabled={loading}
                style={{ minWidth: '20px', minHeight: '20px' }}
              />
              <label htmlFor="affecterBorne" className="text-sm text-gray-600 font-medium cursor-pointer">
                Affecter ce canal à la borne sélectionnée
              </label>
            </div>
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
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl text-white disabled:opacity-50 transition"
              style={{ minHeight: '40px', background: '#5B2D8E' }}
            >
              {loading ? 'En cours...' : (initialCanal ? 'Modifier' : 'Créer et affecter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
