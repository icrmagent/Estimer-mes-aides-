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
 * - initialCanal?: object — pour modification ; les secrets ne sont JAMAIS pré-remplis
 *   (le backend ne renvoie plus apiKey/token bruts depuis L5).
 */
export default function CanalConfigModal({ isOpen, onClose, borneId, bornes = [], onSave, initialCanal = null }) {
  const isEdit = Boolean(initialCanal?.id)

  const [selectedBorneId, setSelectedBorneId] = useState(borneId || '')
  const [label, setLabel]     = useState('')
  const [apiUrl, setApiUrl]   = useState('')
  const [apiKey, setApiKey]   = useState('')
  const [token, setToken]     = useState('')
  const [actif, setActif]     = useState(true)
  const [affecterBorne, setAffecterBorne] = useState(true)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedBorneId(borneId || '')
      setAffecterBorne(true)
      setError(null)
      setTestResult(null)
      setShowApiKey(false)
      setShowToken(false)
      if (initialCanal) {
        setLabel(initialCanal.label || '')
        setApiUrl(initialCanal.apiUrl || '')
        setApiKey('') // jamais pré-rempli en mode édition (secret)
        setToken('')  // jamais pré-rempli en mode édition (secret)
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

      // En création, les secrets sont obligatoires. En édition, on accepte des champs
      // vides (= ne pas modifier) pour permettre la rotation partielle.
      if (!isEdit) {
        if (!apiKey.trim()) { setError('Le refresh token I-CRM est requis'); setLoading(false); return }
        if (!token.trim())  { setError("Le token d'accès est requis"); setLoading(false); return }
      }

      let response
      if (isEdit) {
        const patch = {
          label: label.trim(),
          apiUrl: apiUrl.trim(),
          actif,
        }
        if (apiKey.trim()) patch.apiKey = apiKey.trim()
        if (token.trim())  patch.token = token.trim()
        response = await api.put(`/api/canaux/${initialCanal.id}`, patch)
      } else {
        response = await api.post('/api/canaux', {
          label: label.trim(),
          apiUrl: apiUrl.trim(),
          apiKey: apiKey.trim(),
          token: token.trim(),
          actif,
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

  const handleTestConnection = async () => {
    if (!isEdit) {
      setError('Enregistrez le canal avant de pouvoir tester la connexion.')
      return
    }
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await api.post(`/api/canaux/${initialCanal.id}/test`)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message || 'Erreur réseau',
      })
    } finally {
      setTesting(false)
    }
  }

  if (!isOpen) return null

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">

        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifier le canal' : 'Créer un nouveau canal'}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer la fenêtre"
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
          )}

          {/* Borne */}
          <div>
            <label htmlFor="canal-borne" className={labelClass}>Borne assignée</label>
            <select
              id="canal-borne"
              value={selectedBorneId}
              onChange={(e) => setSelectedBorneId(e.target.value)}
              className={inputClass}
              style={inputStyle}
              disabled={loading || isEdit}
            >
              <option value="">— Sélectionner une borne —</option>
              {bornes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.idBorne}{b.adresse ? ` · ${b.adresse}` : ''}
                  {b.canalTransmission ? ` (canal: ${b.canalTransmission})` : ''}
                </option>
              ))}
            </select>
            {isEdit && (
              <p className="text-xs text-gray-400 mt-1">La borne ne peut pas être changée après création.</p>
            )}
          </div>

          {/* Label */}
          <div>
            <label htmlFor="canal-label" className={labelClass}>Label du canal</label>
            <input
              id="canal-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: icrm-production, agence-nord"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
              maxLength={120}
            />
            <div className="text-xs text-gray-400 mt-1">{label.length}/120 — sert d'identifiant pour l'affectation à la borne</div>
          </div>

          {/* URL API */}
          <div>
            <label htmlFor="canal-url" className={labelClass}>URL API I-CRM</label>
            <input
              id="canal-url"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://app-web-abondance-dev-webapi.azurewebsites.net"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
          </div>

          {/* Refresh token (anciennement "Clé API") */}
          <div>
            <label htmlFor="canal-refresh" className={labelClass}>
              Refresh token Azure AD
              {isEdit && <span className="ml-2 text-gray-400 font-normal">(laisser vide pour ne pas changer)</span>}
            </label>
            <div className="relative">
              <input
                id="canal-refresh"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? '••• inchangé' : 'Refresh token…'}
                className={inputClass + ' pr-12'}
                style={inputStyle}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? 'Masquer le refresh token' : 'Afficher le refresh token'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                {showApiKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Utilisé par le worker pour rafraîchir automatiquement le token d'accès.</p>
          </div>

          {/* Access token */}
          <div>
            <label htmlFor="canal-token" className={labelClass}>
              Token d'accès (Bearer)
              {isEdit && <span className="ml-2 text-gray-400 font-normal">(laisser vide pour ne pas changer)</span>}
            </label>
            <div className="relative">
              <textarea
                id="canal-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isEdit ? '••• inchangé' : 'eyJhbGciOi…'}
                className={inputClass + ' pr-12'}
                style={{
                  ...inputStyle,
                  minHeight: '80px',
                  resize: 'vertical',
                  fontFamily: showToken ? 'monospace' : 'inherit',
                  fontSize: '11px',
                  WebkitTextSecurity: showToken ? 'none' : 'disc',
                }}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                aria-label={showToken ? 'Masquer le token' : 'Afficher le token'}
                className="absolute right-2 top-2 text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                {showToken ? '🙈' : '👁'}
              </button>
            </div>
            {initialCanal?.tokenExpiresAt && (
              <p className={`text-xs mt-1 ${new Date(initialCanal.tokenExpiresAt) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {new Date(initialCanal.tokenExpiresAt) < new Date() ? '⚠️ Expiré le ' : 'Expire le '}
                {new Date(initialCanal.tokenExpiresAt).toLocaleString('fr-FR')}
              </p>
            )}
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
                Affecter ce canal à la borne (canalTransmission = label)
              </label>
            </div>
          </div>

          {/* Tester la connexion — uniquement en édition */}
          {isEdit && (
            <div className="border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || loading}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                style={{ minHeight: '40px' }}
              >
                {testing ? 'Test en cours…' : '⚡ Tester la connexion'}
              </button>
              {testResult && (
                <div
                  className={`mt-3 text-xs rounded-lg p-3 ${
                    testResult.success
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {testResult.success ? (
                    <>
                      ✅ Connexion OK (HTTP {testResult.httpStatus}, {testResult.latencyMs}ms)
                      {testResult.tokenExpired && <div className="mt-1 font-medium">⚠️ Le token est expiré.</div>}
                      {testResult.authValid === false && <div className="mt-1">Auth invalide (401)</div>}
                    </>
                  ) : (
                    <>❌ {testResult.error || 'Connexion impossible'}</>
                  )}
                </div>
              )}
            </div>
          )}

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
              {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer et affecter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
