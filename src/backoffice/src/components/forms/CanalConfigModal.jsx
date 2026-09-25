import { useState } from 'react'
import api from '../../services/api.js'
import {
  CANAL_TYPE_ICRM_API_KEY,
  TYPES_CANAL,
  URL_API_ICRM_FR,
  URL_API_ICRM_ES,
  typeDuCanal,
  typeInitialFormulaire,
  estNouvelleCleApi,
  validerSaisieCanal,
  construireRequeteCanal,
} from './canalConfig.js'

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
 *   (le backend ne renvoie plus apiKey/token bruts depuis L5). Seul l'identifiant
 *   public d'une clé API I-CRM (apiKeyId, « emak_… ») est repris.
 *
 * Deux types d'authentification (champ `type`) :
 * - « Clé API I-CRM (recommandé) » (icrm_api_key) : clé X-Api-Key + secret X-Api-Secret ;
 * - « Azure AD (ancien) » (azure_ad) : refresh token + access token Bearer.
 */
export default function CanalConfigModal({ isOpen, ...props }) {
  if (!isOpen) return null
  // Le formulaire est monté à l'ouverture et remonté quand on change de canal :
  // son état initial vient donc des props, sans effet de resynchronisation.
  return <CanalConfigForm key={props.initialCanal?.id ?? 'new'} {...props} />
}

function CanalConfigForm({ onClose, borneId, bornes = [], onSave, initialCanal = null }) {
  const isEdit = Boolean(initialCanal?.id)
  const typeInitial = isEdit ? typeDuCanal(initialCanal) : null
  // Identifiant de clé déjà enregistré : public, donc pré-rempli (le secret, lui, ne l'est jamais)
  const apiKeyInitiale = typeInitial === CANAL_TYPE_ICRM_API_KEY ? (initialCanal?.apiKeyId || '') : ''

  const [type, setType]       = useState(typeInitialFormulaire(initialCanal))
  const [selectedBorneId, setSelectedBorneId] = useState(borneId || '')
  const [label, setLabel]     = useState(initialCanal?.label || '')
  const [apiUrl, setApiUrl]   = useState(initialCanal?.apiUrl || '')
  const [apiKey, setApiKey]   = useState(apiKeyInitiale) // secret Azure jamais pré-rempli
  const [token, setToken]     = useState('') // jamais pré-rempli en mode édition (secret)
  const [actif, setActif]     = useState(initialCanal ? initialCanal.actif !== false : true)
  const [affecterBorne, setAffecterBorne] = useState(true)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const estCleApi = type === CANAL_TYPE_ICRM_API_KEY
  const changementDeType = isEdit && type !== typeInitial
  // En édition sans changement de type, un champ vide = inchangé…
  const cleFacultative = isEdit && !changementDeType
  // … sauf le secret d'une NOUVELLE clé API : I-CRM l'émet avec la clé.
  const nouvelleCle = estNouvelleCleApi({ isEdit, type, typeInitial, apiKey, apiKeyInitiale })
  const secretFacultatif = cleFacultative && !nouvelleCle

  const handleTypeChange = (nouveauType) => {
    setType(nouveauType)
    // Les valeurs d'un mode d'authentification n'ont pas de sens dans l'autre
    setApiKey(nouveauType === typeInitial ? apiKeyInitiale : '')
    setToken('')
    setShowApiKey(false)
    setShowToken(false)
    setTestResult(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const erreurSaisie = validerSaisieCanal({
        isEdit, type, typeInitial, borneId: selectedBorneId, label, apiUrl, apiKey, token, apiKeyInitiale,
      })
      if (erreurSaisie) { setError(erreurSaisie); setLoading(false); return }

      const corps = construireRequeteCanal({
        isEdit, type, borneId: selectedBorneId, label, apiUrl, apiKey, token, actif, apiKeyInitiale,
      })
      const response = isEdit
        ? await api.put(`/api/canaux/${initialCanal.id}`, corps)
        : await api.post('/api/canaux', corps)

      // Affecter la borne au canal (canalTransmission = label)
      if (affecterBorne && selectedBorneId) {
        await api.put(`/api/partage/bornes/${selectedBorneId}/canal`, {
          canalTransmission: label.trim(),
        })
      }

      if (onSave) onSave(response.data)
      onClose()
    } catch (err) {
      const details = err.response?.data?.details
      setError(
        err.response?.data?.error?.message ||
        (Array.isArray(details) && details[0]?.message) ||
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

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'
  const mentionVide = <span className="ml-2 text-gray-400 font-normal">(laisser vide pour ne pas changer)</span>
  const mentionInchange = cleFacultative ? mentionVide : null
  const mentionSecretInchange = secretFacultatif ? mentionVide : null

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
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm" role="alert">{error}</div>
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

          {/* Type d'authentification */}
          <div>
            <label htmlFor="canal-type" className={labelClass}>Type d'authentification</label>
            <select
              id="canal-type"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            >
              {TYPES_CANAL.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {changementDeType && (
              <p className="text-xs text-orange-600 mt-1">
                Changement de type : la clé et le secret doivent être saisis à nouveau.
              </p>
            )}
          </div>

          {/* URL API */}
          <div>
            <label htmlFor="canal-url" className={labelClass}>URL API I-CRM</label>
            <input
              id="canal-url"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={estCleApi ? URL_API_ICRM_FR : 'https://app-web-abondance-dev-webapi.azurewebsites.net'}
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
            {estCleApi && (
              <p className="text-xs text-gray-400 mt-1">
                URL de base, sans « /api » — France : {URL_API_ICRM_FR} · Espagne : {URL_API_ICRM_ES}
              </p>
            )}
          </div>

          {estCleApi ? (
            <>
              {/* Clé API I-CRM (identifiant public) */}
              <div>
                <label htmlFor="canal-cle-api" className={labelClass}>
                  Clé API (X-Api-Key)
                  {mentionInchange}
                </label>
                <input
                  id="canal-cle-api"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="emak_…"
                  className={inputClass + ' font-mono'}
                  style={inputStyle}
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs text-gray-400 mt-1">Identifiant de la clé délivrée par I-CRM (« emak_ » + 24 caractères).</p>
              </div>

              {/* Secret API I-CRM */}
              <div>
                <label htmlFor="canal-secret" className={labelClass}>
                  Secret (X-Api-Secret)
                  {mentionSecretInchange}
                </label>
                <div className="relative">
                  <input
                    id="canal-secret"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={secretFacultatif ? '••• inchangé' : 'Secret de 48 caractères…'}
                    className={inputClass + ' pr-12 font-mono'}
                    style={inputStyle}
                    disabled={loading}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    aria-label={showToken ? 'Masquer le secret' : 'Afficher le secret'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
                  >
                    {showToken ? '🙈' : '👁'}
                  </button>
                </div>
                {nouvelleCle && (
                  <p className="text-xs text-orange-600 mt-1" data-testid="canal-secret-nouvelle-cle">
                    Nouvelle clé : saisissez le secret émis avec elle par I-CRM (l'ancien secret ne fonctionne pas avec une autre clé).
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Affiché une seule fois par I-CRM à la création de la clé. Il n'est jamais réaffiché ici.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Refresh token (anciennement "Clé API") */}
              <div>
                <label htmlFor="canal-refresh" className={labelClass}>
                  Refresh token Azure AD
                  {mentionInchange}
                </label>
                <div className="relative">
                  <input
                    id="canal-refresh"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={secretFacultatif ? '••• inchangé' : 'Refresh token…'}
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
                  {mentionInchange}
                </label>
                <div className="relative">
                  <textarea
                    id="canal-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={secretFacultatif ? '••• inchangé' : 'eyJhbGciOi…'}
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
                {!changementDeType && initialCanal?.tokenExpiresAt && (
                  <p className={`text-xs mt-1 ${new Date(initialCanal.tokenExpiresAt) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {new Date(initialCanal.tokenExpiresAt) < new Date() ? '⚠️ Expiré le ' : 'Expire le '}
                    {new Date(initialCanal.tokenExpiresAt).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
            </>
          )}

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
                  data-testid="canal-test-resultat"
                  className={`mt-3 text-xs rounded-lg p-3 ${
                    testResult.success
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {testResult.success ? (
                    testResult.type === CANAL_TYPE_ICRM_API_KEY ? (
                      <>
                        ✅ Connecté à <strong>{testResult.entreprise || 'I-CRM'}</strong>
                        {testResult.subtype?.name && (
                          <> — sous-type {testResult.subtype.name}{testResult.subtype.id != null ? ` (#${testResult.subtype.id})` : ''}</>
                        )}
                        {testResult.client && <div className="mt-1">Client API : {testResult.client}</div>}
                        <div className="mt-1 text-green-600">HTTP {testResult.httpStatus}, {testResult.latencyMs}ms</div>
                      </>
                    ) : (
                      <>
                        ✅ Connexion OK (HTTP {testResult.httpStatus}, {testResult.latencyMs}ms)
                        {testResult.tokenExpired && <div className="mt-1 font-medium">⚠️ Le token est expiré.</div>}
                        {testResult.authValid === false && <div className="mt-1">Auth invalide (401)</div>}
                      </>
                    )
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
