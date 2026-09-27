import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import api from '../../services/api.js'
import { ErrorBanner, Toast } from '../../components/ui.jsx'
import EntrepriseIcrmSelect from '../../components/forms/EntrepriseIcrmSelect.jsx'
import ChoixModal from '../../components/ChoixModal.jsx'
import {
  envoisConcernesParChangement,
  envoisHorsDestination,
  resumeDestinations,
  libelleDestination,
} from '../../components/forms/entrepriseIcrmConfig.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { COUNTRIES } from '../../utils/countries.js'

export default function BorneFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const auth = useAuth()
  // L'entreprise I-CRM destinataire est choisie par le SuperAdmin uniquement (le backend le vérifie aussi)
  const estSuperAdmin = auth?.user?.role === 'SUPER_ADMIN'

  const [form, setForm] = useState({
    idBorne: '',
    langueDefaut: 'fr',
    pays: 'FR',
    adresse: '',
    commercant: '',
    regie: '',
    installateur: '',
    canalTransmission: '',
    formulaireId: '',
    adminBorneId: '',
    ecranVeilleId: '',
    entrepriseIcrmId: '',
  })
  const [formulaires, setFormulaires] = useState([])
  const [ecransVeille, setEcransVeille] = useState([])
  const [adminBornes, setAdminBornes] = useState([])
  const [entreprisesIcrm, setEntreprisesIcrm] = useState([])
  // Entreprise de la borne au chargement : affichée même inactive, et seul un
  // changement réel est envoyé (un formulaire réémis ne la retire jamais par erreur)
  const [entrepriseInitiale, setEntrepriseInitiale] = useState(null)
  // Liste des entreprises : 'chargement' | 'pret' | 'erreur' (choix verrouillé tant qu'elle manque)
  const [etatListeEntreprises, setEtatListeEntreprises] = useState('chargement')
  const [borneChargee, setBorneChargee] = useState(!isEdit)
  // Envois pas encore livrés de la borne, par cible (GET /api/bornes/:id)
  const [envoisEnAttente, setEnvoisEnAttente] = useState(null)
  // Changement de destination avec des envois en attente : choix explicite demandé
  const [choixEnvois, setChoixEnvois] = useState(null)
  // « Rediriger les envois » vers la destination actuelle : simulation à confirmer
  const [redirection, setRedirection] = useState(null)
  const [redirectionEnCours, setRedirectionEnCours] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    // Load formulaires and adminBornes for selects
    Promise.all([
      api.get('/api/formulaires').catch(() => ({ data: [] })),
      api.get('/api/admin-bornes').catch(() => ({ data: [] })),
      api.get('/api/ecrans-veille').catch(() => ({ data: [] })),
      api.get('/api/entreprises-icrm').catch(() => null),
    ]).then(([fRes, aRes, eRes, iRes]) => {
      setFormulaires(fRes.data.formulaires || fRes.data.data || fRes.data || [])
      setAdminBornes(aRes.data.adminBornes || aRes.data.data || aRes.data || [])
      setEcransVeille(eRes.data.data || [])
      if (iRes) {
        setEntreprisesIcrm(iRes.data?.data || [])
        setEtatListeEntreprises('pret')
      } else {
        setEtatListeEntreprises('erreur')
      }
    })

    if (isEdit) {
      api.get(`/api/bornes/${id}`)
        .then(res => {
          const b = res.data.data || res.data.borne || res.data
          setForm({
            idBorne: b.idBorne || '',
            langueDefaut: b.langueDefaut || 'fr',
            pays: b.pays || 'FR',
            adresse: b.adresse || '',
            commercant: b.commercant || '',
            regie: b.regie || '',
            installateur: b.installateur || '',
            canalTransmission: b.canalTransmission || '',
            formulaireId: b.formulaireId || '',
            adminBorneId: b.adminBorneId || '',
            ecranVeilleId: b.ecranVeilleId || '',
            entrepriseIcrmId: b.entrepriseIcrmId || '',
          })
          setEntrepriseInitiale(b.entrepriseIcrm || null)
          setEnvoisEnAttente(b.envoisEnAttente || null)
          setBorneChargee(true)
        })
        .catch(() => setError('Borne introuvable'))
    }
  }, [id, isEdit])

  // Destination ENREGISTRÉE de la borne (pas la sélection en cours d'édition)
  const destinationEnregistreeId = entrepriseInitiale?.id ?? null
  const horsDestination = envoisHorsDestination(envoisEnAttente, destinationEnregistreeId)
  const nbHorsDestination = horsDestination.reduce((s, d) => s + d.total, 0)
  const selectionModifiee = (form.entrepriseIcrmId || null) !== destinationEnregistreeId

  async function simulerRedirection() {
    setError(null)
    setRedirectionEnCours(true)
    try {
      const res = await api.post(`/api/bornes/${id}/rediriger-envois`, { vers: 'destination_actuelle' }, { params: { simulation: 'true' } })
      const simulation = res.data?.data || {}
      if (!simulation.total) {
        setToast({ message: 'Aucun envoi à rediriger : tous visent déjà la destination actuelle.', type: 'success' })
        return
      }
      setRedirection(simulation)
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la préparation de la redirection'))
    } finally {
      setRedirectionEnCours(false)
    }
  }

  async function confirmerRedirection() {
    setRedirectionEnCours(true)
    try {
      const res = await api.post(`/api/bornes/${id}/rediriger-envois`, { vers: 'destination_actuelle' })
      const r = res.data?.data || {}
      const suspendus = (r.destinations || []).reduce((s, d) => s + (d.suspendus || 0), 0)
      setToast({
        message: `${r.total || 0} envoi(s) redirigé(s) : ${resumeDestinations(r.destinations)}`
          + (suspendus > 0 ? ` — ${suspendus} restent suspendus (destination indisponible).` : '.'),
        type: suspendus > 0 ? 'error' : 'success',
      })
      // Décompte à jour
      const detail = await api.get(`/api/bornes/${id}`)
      const b = detail.data?.data || detail.data
      setEnvoisEnAttente(b?.envoisEnAttente || null)
    } catch (err) {
      const e = err.response?.data?.error
      setError(typeof e === 'string' ? e : (e?.message || 'Erreur lors de la redirection des envois'))
    } finally {
      setRedirection(null)
      setRedirectionEnCours(false)
    }
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => ({ ...prev, [field]: null }))
  }

  function construirePayload() {
    // `idBorne` est généré côté backend : il n'est jamais envoyé.
    const payload = { ...form, ecranVeilleId: form.ecranVeilleId || null }
    delete payload.idBorne
    // Entreprise I-CRM : envoyée seulement si elle change (et par le SuperAdmin)
    delete payload.entrepriseIcrmId
    const entrepriseIcrmId = form.entrepriseIcrmId || null
    if (estSuperAdmin && entrepriseIcrmId !== (entrepriseInitiale?.id ?? null)) {
      payload.entrepriseIcrmId = entrepriseIcrmId
    }
    return payload
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    const payload = construirePayload()
    // Changement de destination : les envois pas encore livrés GARDENT leur cible,
    // sauf choix explicite de les rediriger (jamais implicitement).
    if (isEdit && payload.entrepriseIcrmId !== undefined) {
      const concernes = envoisConcernesParChangement(envoisEnAttente, entrepriseInitiale?.id ?? null)
      if (concernes.total > 0) {
        const nouvelle = entreprisesIcrm.find((x) => x.id === payload.entrepriseIcrmId)
        setChoixEnvois({
          payload,
          concernes,
          ancienne: entrepriseInitiale?.nom ? `l'entreprise « ${entrepriseInitiale.nom} »` : 'les canaux de la borne',
          nouvelle: nouvelle ? `l'entreprise « ${nouvelle.nom} »` : 'les canaux de la borne',
        })
        return
      }
    }
    enregistrer(payload)
  }

  async function enregistrer(payload) {
    setChoixEnvois(null)
    setLoading(true)
    try {
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Pays <span className="text-red-500">*</span>
              </label>
              <select
                value={form.pays}
                onChange={e => handleChange('pays', e.target.value)}
                className={inputClass}
                style={inputStyle}
                required
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Détermine le filtrage de l'auto-complétion d'adresse côté borne.
              </p>
              {fieldErrors.pays && <p className="text-red-500 text-xs mt-1">{fieldErrors.pays}</p>}
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

          <EntrepriseIcrmSelect
            value={form.entrepriseIcrmId}
            onChange={value => handleChange('entrepriseIcrmId', value)}
            entreprises={entreprisesIcrm}
            etat={borneChargee ? etatListeEntreprises : 'chargement'}
            entrepriseActuelle={entrepriseInitiale}
            disabled={!estSuperAdmin}
            className={`${inputClass}${estSuperAdmin ? '' : ' bg-gray-50 text-gray-500 cursor-not-allowed'}`}
            style={inputStyle}
          />
          {fieldErrors.entrepriseIcrmId && <p className="text-red-500 text-xs -mt-4">{fieldErrors.entrepriseIcrmId}</p>}

          {isEdit && estSuperAdmin && nbHorsDestination > 0 && (
            <div className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 -mt-2 space-y-2" role="status" data-testid="envois-hors-destination">
              <p>
                {nbHorsDestination} envoi(s) non livré(s) de cette borne visent une autre destination que sa destination
                actuelle ({libelleDestination(entrepriseInitiale
                  ? { type: 'entreprise_icrm', nom: entrepriseInitiale.nom }
                  : { type: 'canal' })}) : {resumeDestinations(horsDestination)}.
              </p>
              <button
                type="button"
                onClick={simulerRedirection}
                disabled={redirectionEnCours || selectionModifiee}
                data-testid="rediriger-envois"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-300 text-orange-800 bg-white hover:bg-orange-100 disabled:opacity-50"
                style={{ minHeight: '32px' }}
                title={selectionModifiee ? "Enregistrez d'abord la nouvelle destination" : undefined}
              >
                {redirectionEnCours ? 'En cours…' : 'Rediriger vers la destination actuelle…'}
              </button>
              {selectionModifiee && <p className="text-orange-700">Enregistrez d'abord la borne : la redirection vise la destination enregistrée.</p>}
            </div>
          )}

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
              {form.entrepriseIcrmId
                ? "Non utilisé tant qu'une entreprise I-CRM est choisie ci-dessus (même désactivée : ses envois sont alors suspendus)."
                : "Identifiant du canal I-CRM utilisé pour l'envoi des leads. Les clés API se configurent dans la page Partage."}
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
                <option value="">Géré par SuperAdmin</option>
                {adminBornes.map(a => (
                  <option key={a.id} value={a.id}>{a.nom} {a.prenom} ({a.email})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Écran de veille</label>
            <select
              value={form.ecranVeilleId}
              onChange={e => handleChange('ecranVeilleId', e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Aucun (la borne reste sur l'écran d'accueil) —</option>
              {ecransVeille.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.nom}{ev.actif ? '' : ' (inactif)'} — {ev.nbDiapositivesActives} diapo{ev.nbDiapositivesActives > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Diaporama affiché après une période d'inactivité. Se gère dans « Écrans de veille ».
            </p>
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

      {choixEnvois && (
        <ChoixModal
          titre="Envois en attente pour l'ancienne destination"
          message={`${choixEnvois.concernes.total} envoi(s) non livré(s) pour ${choixEnvois.ancienne}`
            + (choixEnvois.concernes.suspendus ? ` (dont ${choixEnvois.concernes.suspendus} suspendu(s))` : '')
            + (choixEnvois.concernes.echecs ? ` (dont ${choixEnvois.concernes.echecs} en échec définitif)` : '')
            + '. Les nouveaux enregistrements iront vers la nouvelle destination ; que faire de ceux-ci ?'}
          choix={[
            {
              label: `Les garder pour ${choixEnvois.ancienne} (recommandé)`,
              variante: 'recommande',
              testId: 'envois-garder',
              onClick: () => enregistrer(choixEnvois.payload),
            },
            {
              label: `Les envoyer vers ${choixEnvois.nouvelle}`,
              variante: 'secondaire',
              testId: 'envois-rediriger',
              onClick: () => enregistrer({ ...choixEnvois.payload, redirigerEnvoisEnAttente: true }),
            },
          ]}
          onAnnuler={() => setChoixEnvois(null)}
          saving={loading}
        />
      )}

      {redirection && (
        <ChoixModal
          titre="Rediriger les envois vers la destination actuelle ?"
          message={`${redirection.total} envoi(s) non livré(s) : ${resumeDestinations(redirection.depuis)} → `
            + `${libelleDestination(redirection.destinationActuelle)}.`}
          details={(
            <div className="space-y-1" data-testid="redirection-repartition">
              <p>À l'arrivée : {resumeDestinations(redirection.destinations)}.</p>
              <p>
                Les envois suspendus repartent en file si la destination peut recevoir ; les échecs définitifs changent
                seulement de destination (relance ensuite depuis « Partage I-CRM »).
              </p>
            </div>
          )}
          choix={[{
            label: `Rediriger ${redirection.total} envoi(s) vers ${libelleDestination(redirection.destinationActuelle)}`,
            variante: 'recommande',
            testId: 'redirection-confirmer',
            onClick: confirmerRedirection,
          }]}
          onAnnuler={() => setRedirection(null)}
          saving={redirectionEnCours}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}
