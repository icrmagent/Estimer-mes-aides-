import { useState } from 'react'
import api from '../../services/api.js'
import { URL_API_ICRM_FR, URL_API_ICRM_ES } from './canalConfig.js'
import {
  NOM_ENTREPRISE_MAX,
  estNouvelleCleEntreprise,
  validerSaisieEntreprise,
  construireRequeteEntreprise,
} from './entrepriseIcrmConfig.js'

/**
 * EntrepriseIcrmModal — création / modification d'une entreprise (tenant) I-CRM.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - onSave: function — appelée après succès avec l'entreprise renvoyée par l'API
 * - initialEntreprise?: object — pour modification ; le secret n'est JAMAIS
 *   pré-rempli (l'API ne le renvoie pas). Seul l'identifiant public de la clé
 *   (apiKeyId, « emak_… ») est repris.
 */
export default function EntrepriseIcrmModal({ isOpen, ...props }) {
  if (!isOpen) return null
  // Monté à l'ouverture, remonté quand on change d'entreprise : l'état initial vient des props.
  return <EntrepriseIcrmForm key={props.initialEntreprise?.id ?? 'new'} {...props} />
}

function EntrepriseIcrmForm({ onClose, onSave, initialEntreprise = null }) {
  const isEdit = Boolean(initialEntreprise?.id)
  const apiKeyInitiale = isEdit ? (initialEntreprise.apiKeyId || '') : ''

  const [nom, setNom] = useState(initialEntreprise?.nom || '')
  const [apiUrl, setApiUrl] = useState(initialEntreprise?.apiUrl || '')
  const [apiKey, setApiKey] = useState(apiKeyInitiale)
  const [token, setToken] = useState('') // jamais pré-rempli (secret)
  const [actif, setActif] = useState(initialEntreprise ? initialEntreprise.actif !== false : true)
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const nouvelleCle = estNouvelleCleEntreprise({ isEdit, apiKey, apiKeyInitiale })
  const secretFacultatif = isEdit && !nouvelleCle

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const erreurSaisie = validerSaisieEntreprise({ isEdit, nom, apiUrl, apiKey, token, apiKeyInitiale })
    if (erreurSaisie) { setError(erreurSaisie); return }

    setLoading(true)
    try {
      const corps = construireRequeteEntreprise({ isEdit, nom, apiUrl, apiKey, token, actif, apiKeyInitiale })
      const response = isEdit
        ? await api.put(`/api/entreprises-icrm/${initialEntreprise.id}`, corps)
        : await api.post('/api/entreprises-icrm', corps)
      if (onSave) onSave(response.data?.data ?? response.data)
      onClose()
    } catch (err) {
      const e2 = err.response?.data?.error
      setError(
        (typeof e2 === 'string' ? e2 : e2?.message)
        || err.message
        || "Erreur lors de l'enregistrement de l'entreprise I-CRM"
      )
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full'
  const inputStyle = { minHeight: '40px', fontSize: '14px' }
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1'
  const mentionVide = <span className="ml-2 text-gray-400 font-normal">(laisser vide pour ne pas changer)</span>

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="entreprise-icrm-titre">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 id="entreprise-icrm-titre" className="text-lg font-bold text-gray-900">
            {isEdit ? "Modifier l'entreprise I-CRM" : 'Nouvelle entreprise I-CRM'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer la fenêtre"
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm" role="alert">{error}</div>
          )}

          <div>
            <label htmlFor="entreprise-nom" className={labelClass}>Nom</label>
            <input
              id="entreprise-nom"
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : LENA (France), CAE España"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
              maxLength={NOM_ENTREPRISE_MAX}
            />
            <p className="text-xs text-gray-400 mt-1">Libellé affiché dans le back-office (choix de la borne).</p>
          </div>

          <div>
            <label htmlFor="entreprise-url" className={labelClass}>URL API I-CRM</label>
            <input
              id="entreprise-url"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={URL_API_ICRM_FR}
              className={inputClass}
              style={inputStyle}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-gray-400 mt-1">
              URL de base, sans « /api » — France : {URL_API_ICRM_FR} · Espagne : {URL_API_ICRM_ES}
            </p>
          </div>

          <div>
            <label htmlFor="entreprise-cle-api" className={labelClass}>
              Clé API (X-Api-Key)
              {isEdit ? mentionVide : null}
            </label>
            <input
              id="entreprise-cle-api"
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
            <p className="text-xs text-gray-400 mt-1">Identifiant de la clé délivrée par I-CRM pour ce tenant (« emak_ » + 24 caractères).</p>
          </div>

          <div>
            <label htmlFor="entreprise-secret" className={labelClass}>
              Secret (X-Api-Secret)
              {secretFacultatif ? mentionVide : null}
            </label>
            <div className="relative">
              <input
                id="entreprise-secret"
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
              <p className="text-xs text-orange-600 mt-1" data-testid="entreprise-secret-nouvelle-cle">
                Nouvelle clé : saisissez le secret émis avec elle par I-CRM (l'ancien secret ne fonctionne pas avec une autre clé).
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Affiché une seule fois par I-CRM à la création de la clé. Il n'est jamais réaffiché ici.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="entreprise-actif"
              checked={actif}
              onChange={(e) => setActif(e.target.checked)}
              disabled={loading}
              style={{ minWidth: '20px', minHeight: '20px' }}
            />
            <label htmlFor="entreprise-actif" className="text-sm text-gray-600 font-medium cursor-pointer">
              Entreprise active
            </label>
          </div>
          {!actif && (
            <p className="text-xs text-orange-600 -mt-2">
              Inactive : les bornes qui l'ont pour destination repassent sur leurs canaux I-CRM.
            </p>
          )}

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
              {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : "Créer l'entreprise")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
