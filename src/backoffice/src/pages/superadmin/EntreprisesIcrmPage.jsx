import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout.jsx'
import EntrepriseIcrmModal from '../../components/forms/EntrepriseIcrmModal.jsx'
import { resumeTestCanal } from '../../components/forms/canalConfig.js'
import { statutVerification } from '../../components/forms/entrepriseIcrmConfig.js'
import {
  PRIMARY, IcoPlus,
  Toast, ErrorBanner, ConfirmModal, SkeletonTableRows, EmptyState, BadgeActif,
} from '../../components/ui.jsx'
import api from '../../services/api.js'

const TONS_STATUT = {
  ok: 'bg-green-50 border-green-200 text-green-700',
  erreur: 'bg-red-50 border-red-200 text-red-700',
  neutre: 'bg-gray-100 border-gray-200 text-gray-500',
}

function messageErreur(err, defaut) {
  const e = err.response?.data?.error
  return typeof e === 'string' ? e : (e?.message || err.message || defaut)
}

/**
 * Entreprises (tenants) I-CRM — SuperAdmin.
 * Chaque entreprise est enregistrée une fois avec sa clé API I-CRM, testée,
 * puis choisie dans la fiche de chaque borne (« Entreprise I-CRM destinataire »).
 */
export default function EntreprisesIcrmPage() {
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null) // { message, type }
  const [modal, setModal] = useState({ isOpen: false, entreprise: null })
  const [testingId, setTestingId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const charger = useCallback(() => {
    api.get('/api/entreprises-icrm')
      .then((res) => setEntreprises(res.data?.data || []))
      .catch((err) => setError(messageErreur(err, 'Erreur de chargement des entreprises I-CRM')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { charger() }, [charger])

  const remplacer = (maj) => {
    if (!maj?.id) return
    setEntreprises((prev) => prev.map((e) => (e.id === maj.id ? { ...e, ...maj } : e)))
  }

  const handleSaved = () => {
    setToast({ message: 'Entreprise I-CRM enregistrée. Cliquez « Tester » pour vérifier la clé.', type: 'success' })
    charger()
  }

  const handleTester = async (entreprise) => {
    setTestingId(entreprise.id)
    try {
      const res = await api.post(`/api/entreprises-icrm/${entreprise.id}/test`)
      remplacer(res.data?.entrepriseIcrm)
      // Le toast nomme l'entreprise et le sous-type renvoyés par le ping I-CRM
      setToast(resumeTestCanal(res.data || {}))
    } catch (err) {
      remplacer(err.response?.data?.entrepriseIcrm)
      setToast({ message: `Test échoué : ${messageErreur(err, 'erreur réseau')}`, type: 'error' })
    } finally {
      setTestingId(null)
    }
  }

  const supprimer = async (entreprise, force) => {
    setDeleting(true)
    setError(null)
    try {
      const res = await api.delete(`/api/entreprises-icrm/${entreprise.id}`, force ? { params: { force: 'true' } } : undefined)
      const n = res.data?.data?.bornesDesaffectees || 0
      setToast({
        message: n > 0
          ? `Entreprise supprimée — ${n} borne${n > 1 ? 's' : ''} repassée${n > 1 ? 's' : ''} sur leurs canaux.`
          : 'Entreprise supprimée.',
        type: 'success',
      })
      setConfirm(null)
      charger()
    } catch (err) {
      const e = err.response?.data?.error
      if (err.response?.status === 409 && e?.code === 'ENTREPRISE_ICRM_EN_USAGE' && !force) {
        const bornes = e.details?.bornes || []
        setConfirm({
          title: 'Entreprise utilisée par des bornes',
          message: `${e.message} Bornes : ${bornes.map((b) => b.idBorne).join(', ')}.`,
          confirmLabel: 'Désaffecter et supprimer',
          danger: true,
          onConfirm: () => supprimer(entreprise, true),
        })
      } else {
        setConfirm(null)
        setError(messageErreur(err, 'Erreur lors de la suppression'))
      }
    } finally {
      setDeleting(false)
    }
  }

  const demanderSuppression = (entreprise) => {
    setConfirm({
      title: "Supprimer l'entreprise I-CRM",
      message: `Supprimer « ${entreprise.nom} » ? Sa clé ne sera plus utilisée par EMA.`,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => supprimer(entreprise, false),
    })
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Entreprises I-CRM</h1>
            <p className="text-gray-500 text-sm mt-1">
              Tenants I-CRM destinataires des enregistrements, choisis borne par borne
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ isOpen: true, entreprise: null })}
            className="flex items-center gap-1.5 px-4 py-2.5 text-white font-semibold rounded-xl text-sm transition-opacity hover:opacity-90"
            style={{ background: PRIMARY, minHeight: '40px' }}
          >
            <IcoPlus />
            Nouvelle entreprise
          </button>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-xs text-purple-900 space-y-1">
          <p>
            <strong>1.</strong> Enregistrez chaque entreprise une fois avec la clé API émise par I-CRM pour ce tenant.
            {' '}<strong>2.</strong> Cliquez « Tester » : I-CRM renvoie l'entreprise et le sous-type liés à la clé.
            {' '}<strong>3.</strong> Dans la fiche de chaque borne, choisissez l'« Entreprise I-CRM destinataire ».
          </p>
          <p>Une borne affectée à une entreprise active lui envoie ses enregistrements, sans passer par ses canaux.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Entreprise I-CRM</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">URL API</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Clé</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Dernière vérification</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Bornes</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Actif</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows cols={8} rows={2} />
              ) : entreprises.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>}
                      title="Aucune entreprise I-CRM"
                      description="Ajoutez LENA (France) ou CAE España avec la clé API délivrée par I-CRM."
                    />
                  </td>
                </tr>
              ) : (
                entreprises.map((entreprise) => {
                  const statut = statutVerification(entreprise)
                  return (
                    <tr key={entreprise.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{entreprise.nom}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {entreprise.nomIcrm
                          ? (
                            <>
                              <div className="font-semibold">{entreprise.nomIcrm}</div>
                              {entreprise.sousTypeIcrm && <div className="text-gray-500">sous-type {entreprise.sousTypeIcrm}</div>}
                            </>
                          )
                          : <span className="text-gray-400">— (à tester)</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-[220px]" title={entreprise.apiUrl}>
                        {entreprise.apiUrl}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {entreprise.apiKeyId
                          ? <span className="font-mono text-gray-700" title="Identifiant de la clé API (non secret)">{entreprise.apiKeyId}</span>
                          : <span className="text-orange-600">clé manquante</span>}
                        {!entreprise.hasToken && <span className="ml-1 text-orange-600">· secret manquant</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`inline-flex items-center font-semibold px-2 py-0.5 rounded-full border ${TONS_STATUT[statut.ton]}`}>
                          {statut.texte}
                        </span>
                        {entreprise.derniereVerification && (
                          <div className="text-gray-400 mt-1">
                            {new Date(entreprise.derniereVerification).toLocaleString('fr-FR')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{entreprise.nbBornes ?? '—'}</td>
                      <td className="px-4 py-3"><BadgeActif actif={entreprise.actif} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleTester(entreprise)}
                            disabled={testingId === entreprise.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                            aria-label={`Tester la connexion de l'entreprise ${entreprise.nom}`}
                            style={{ minHeight: '32px' }}
                          >
                            {testingId === entreprise.id ? '...' : 'Tester'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setModal({ isOpen: true, entreprise })}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                            aria-label={`Modifier l'entreprise ${entreprise.nom}`}
                            style={{ minHeight: '32px' }}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => demanderSuppression(entreprise)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                            aria-label={`Supprimer l'entreprise ${entreprise.nom}`}
                            style={{ minHeight: '32px' }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EntrepriseIcrmModal
        isOpen={modal.isOpen}
        initialEntreprise={modal.entreprise}
        onClose={() => setModal({ isOpen: false, entreprise: null })}
        onSave={handleSaved}
      />

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          danger={confirm.danger}
          saving={deleting}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}
