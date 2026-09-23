import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import { ecransVeilleService } from '../../services/ecransVeilleService.js'
import { PRIMARY, Toast, ErrorBanner, ConfirmModal, EmptyState, SkeletonCard, IcoPlus, IcoMore } from '../../components/ui.jsx'
import { SlideView, ScreenChrome, PlaybackModal } from '../../components/ecranVeille/SlideView.jsx'
import { IcoScreen, IcoPlay } from '../../components/ecranVeille/controls.jsx'
import { fromApi, formatDuration, DEFAULT_STYLE } from '../../components/ecranVeille/model.js'

function apiErrorMessage(err, fallback) {
  const e = err?.response?.data?.error
  if (typeof e === 'string') return e
  return e?.message || fallback
}

function Thumbnail({ ecran }) {
  const slide = ecran.apercu
    ? { ...ecran.apercu, style: { ...DEFAULT_STYLE, ...(ecran.apercu.style ?? {}) }, titre: ecran.apercu.titre ?? {}, sousTitre: ecran.apercu.sousTitre ?? {} }
    : null
  return (
    <div className="relative bg-gray-900" style={{ aspectRatio: '16 / 10', containerType: 'size' }}>
      {slide
        ? <SlideView slide={slide} animate={false} />
        : <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">Aucune diapositive</div>}
      {slide && <ScreenChrome ecran={{ ...ecran, afficherHorloge: false }} />}
      {!ecran.actif && (
        <div className="absolute inset-0 bg-white/55 flex items-center justify-center">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-700 bg-white rounded-full px-3 py-1 shadow">Inactif</span>
        </div>
      )}
    </div>
  )
}

function CardMenu({ ecran, onPlay, onDuplicate, onToggle, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const item = 'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors'
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Actions" aria-expanded={open}
        className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full" style={{ minWidth: '40px', minHeight: '40px' }}>
        <IcoMore />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden py-1">
          <button type="button" className={`${item} text-gray-700`} onClick={() => { setOpen(false); onPlay(ecran) }}>Lire en plein écran</button>
          <button type="button" className={`${item} text-gray-700`} onClick={() => { setOpen(false); onDuplicate(ecran) }}>Dupliquer</button>
          <button type="button" className={`${item} text-gray-700`} onClick={() => { setOpen(false); onToggle(ecran) }}>{ecran.actif ? 'Désactiver' : 'Activer'}</button>
          <button type="button" className={`${item} text-red-600 hover:bg-red-50`} onClick={() => { setOpen(false); onDelete(ecran) }}>Supprimer</button>
        </div>
      )}
    </div>
  )
}

export default function EcransVeilleListPage() {
  const navigate = useNavigate()
  const [ecrans, setEcrans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [playback, setPlayback] = useState(null)

  // Pas de setLoading(true) ici : un rechargement garde la liste affichée.
  const reload = useCallback(() => {
    return ecransVeilleService.list()
      .then((data) => setEcrans(Array.isArray(data) ? data : []))
      .catch((err) => setError(apiErrorMessage(err, 'Impossible de charger les écrans de veille')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handlePlay(ecran) {
    try {
      setPlayback(fromApi(await ecransVeilleService.get(ecran.id)))
    } catch (err) {
      setError(apiErrorMessage(err, 'Lecture impossible'))
    }
  }

  async function handleDuplicate(ecran) {
    try {
      const copie = await ecransVeilleService.duplicate(ecran.id)
      setToast({ message: 'Copie créée — sans borne affectée' })
      navigate(`/superadmin/ecrans-veille/${copie.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Duplication impossible'))
    }
  }

  async function handleToggle(ecran) {
    try {
      await ecransVeilleService.update(ecran.id, { actif: !ecran.actif })
      setEcrans((list) => list.map((e) => (e.id === ecran.id ? { ...e, actif: !ecran.actif } : e)))
      setToast({ message: ecran.actif ? 'Écran désactivé' : 'Écran activé' })
    } catch (err) {
      setError(apiErrorMessage(err, 'Modification impossible'))
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      const res = await ecransVeilleService.remove(pendingDelete.id)
      setToast({ message: res?.bornesDesaffectees ? `Écran supprimé — ${res.bornesDesaffectees} borne(s) sans veille` : 'Écran supprimé' })
      setPendingDelete(null)
      reload()
    } catch (err) {
      setError(apiErrorMessage(err, 'Suppression impossible'))
    } finally {
      setDeleting(false)
    }
  }

  const nbBornes = ecrans.reduce((sum, e) => sum + (e.bornes?.length ?? 0), 0)

  return (
    <AppLayout>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}
      {playback && <PlaybackModal ecran={playback} onClose={() => setPlayback(null)} />}
      {pendingDelete && (
        <ConfirmModal
          danger
          title="Supprimer l'écran de veille ?"
          message={pendingDelete.bornes?.length
            ? `« ${pendingDelete.nom} » est diffusé par ${pendingDelete.bornes.length} borne(s), qui n'auront plus d'écran de veille.`
            : `« ${pendingDelete.nom} » sera supprimé.`}
          confirmLabel="Supprimer"
          saving={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Écrans de veille</h1>
            <p className="text-gray-500 text-sm mt-1">
              Diaporamas affichés par les bornes après une période d'inactivité
              {!loading && ` — ${ecrans.length} écran${ecrans.length > 1 ? 's' : ''}, ${nbBornes} borne${nbBornes > 1 ? 's' : ''} équipée${nbBornes > 1 ? 's' : ''}`}
            </p>
          </div>
          <Link to="/superadmin/ecrans-veille/new"
            className="flex items-center gap-1.5 px-4 text-sm font-semibold rounded-xl text-white" style={{ background: PRIMARY, minHeight: '48px' }}>
            <IcoPlus /> Nouvel écran de veille
          </Link>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : ecrans.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm">
            <EmptyState icon={<IcoScreen />} title="Aucun écran de veille" description="Créez un diaporama puis affectez-le à vos bornes." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {ecrans.map((ecran) => (
              <article key={ecran.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <button type="button" onClick={() => navigate(`/superadmin/ecrans-veille/${ecran.id}`)} className="block text-left" aria-label={`Modifier ${ecran.nom}`}>
                  <Thumbnail ecran={ecran} />
                </button>
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="min-w-0">
                    <Link to={`/superadmin/ecrans-veille/${ecran.id}`} className="text-base font-bold text-gray-900 hover:underline line-clamp-1">{ecran.nom}</Link>
                    {ecran.description && <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{ecran.description}</p>}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-1.5">
                      <dt className="text-[11px] text-gray-500">Diapos</dt>
                      <dd className="text-sm font-bold text-gray-900">{ecran.nbDiapositivesActives}<span className="text-gray-400 font-medium">/{ecran.nbDiapositives}</span></dd>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-1.5">
                      <dt className="text-[11px] text-gray-500">Cycle</dt>
                      <dd className="text-sm font-bold text-gray-900">{formatDuration(ecran.dureeTotale)}</dd>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-1.5">
                      <dt className="text-[11px] text-gray-500">Délai</dt>
                      <dd className="text-sm font-bold text-gray-900">{formatDuration(ecran.delaiActivation)}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                    {ecran.bornes.length === 0
                      ? <span className="text-xs text-gray-400">Aucune borne affectée</span>
                      : ecran.bornes.slice(0, 4).map((b) => (
                        <span key={b.id} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-purple-50 text-purple-800">{b.idBorne}</span>
                      ))}
                    {ecran.bornes.length > 4 && <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 text-gray-600">+{ecran.bornes.length - 4}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
                    <span className="text-[11px] text-gray-400">Modifié le {new Date(ecran.updatedAt).toLocaleDateString('fr-FR')}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handlePlay(ecran)} disabled={!ecran.nbDiapositives}
                        className="flex items-center gap-1.5 px-3 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40" style={{ minHeight: '40px' }}>
                        <IcoPlay /> Lire
                      </button>
                      <CardMenu ecran={ecran} onPlay={handlePlay} onDuplicate={handleDuplicate} onToggle={handleToggle} onDelete={setPendingDelete} />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
