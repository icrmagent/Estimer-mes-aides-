import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout.jsx'
import I18nTextInput from '../../components/forms/I18nTextInput.jsx'
import api from '../../services/api.js'
import { ecransVeilleService } from '../../services/ecransVeilleService.js'
import { PRIMARY, Toast, ErrorBanner, ConfirmModal, IcoPlus, IcoTrash, IcoCheck } from '../../components/ui.jsx'
import SlideEditor from '../../components/ecranVeille/SlideEditor.jsx'
import { SlideView, ScreenChrome, TabletFrame, PlaybackModal } from '../../components/ecranVeille/SlideView.jsx'
import { inputClass, inputStyle } from '../../components/ecranVeille/styles.js'
import {
  Card, Field, Toggle, Segmented, TypeBadge,
  IcoPlay, IcoGrip, IcoArrow, IcoCopy,
} from '../../components/ecranVeille/controls.jsx'
import {
  TYPES, TRANSITIONS, DELAIS_PRESETS, LIMITS,
  newEcran, newSlide, duplicateSlide, fromApi, toPayload, validateEcran,
  slideDuration, cycleDuration, formatDuration, scheduleStatus, playableSlides, t,
} from '../../components/ecranVeille/model.js'

const LANG_OPTIONS = [{ value: 'fr', label: 'FR' }, { value: 'es', label: 'ES' }, { value: 'en', label: 'EN' }]
const ORIENTATIONS = [{ value: 'paysage', label: 'Paysage' }, { value: 'portrait', label: 'Portrait' }]

function apiErrorMessage(err, fallback) {
  const e = err?.response?.data?.error
  if (typeof e === 'string') return e
  return e?.message || fallback
}

/** Toutes les bornes, page par page (l'API plafonne à 100 par page). */
async function fetchAllBornes() {
  const all = []
  for (let page = 1; page <= 50; page += 1) {
    const res = await api.get('/api/bornes', { params: { page, limit: 100 } })
    const rows = res.data?.data ?? []
    all.push(...rows)
    const total = res.data?.meta?.total ?? rows.length
    if (rows.length === 0 || all.length >= total) break
  }
  return all
}

function slideLabel(slide) {
  const titre = t(slide.titre, 'fr')
  if (titre) return titre
  return { texte: 'Texte sans titre', image: 'Photo sans titre', galerie: 'Galerie sans titre', video: 'Vidéo sans titre' }[slide.type]
}

function formatDelai(seconds) {
  return seconds < 60 ? `${seconds} s` : formatDuration(seconds)
}

// ─── Séquence ────────────────────────────────────────────────────────────────

function SequenceRow({ slide, index, count, selected, hasError, dragState, onSelect, onMove, onDuplicate, onDelete, onToggle, dragHandlers }) {
  const status = scheduleStatus(slide)
  const isOver = dragState.over === index && dragState.from !== null && dragState.from !== index
  return (
    <li
      draggable
      {...dragHandlers}
      onClick={onSelect}
      className={`group flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 rounded-xl border px-2 py-2 cursor-pointer transition-colors ${
        selected ? 'border-purple-300 bg-purple-50/60' : 'border-gray-100 hover:border-gray-200 bg-white'
      } ${isOver ? 'ring-2 ring-purple-300' : ''} ${dragState.from === index ? 'opacity-50' : ''}`}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="text-gray-300 group-hover:text-gray-500 cursor-grab hidden sm:block" aria-hidden="true"><IcoGrip /></span>
      <span className="w-6 text-center text-xs font-bold text-gray-400">{index + 1}</span>
      <div className="relative w-20 h-[50px] rounded-lg overflow-hidden flex-shrink-0 bg-gray-900" style={{ containerType: 'size' }}>
        <SlideView slide={slide} animate={false} />
        {!slide.actif && <div className="absolute inset-0 bg-white/60" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-semibold truncate ${slide.actif ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{slideLabel(slide)}</span>
          {hasError && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="À corriger" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <TypeBadge type={slide.type} types={TYPES} />
          <span className="text-xs text-gray-500">
            {slide.type === 'video' && slide.contenu.lireJusquaFin ? 'Durée de la vidéo' : formatDuration(slideDuration(slide))}
          </span>
          {status === 'planifiee' && <span className="text-[11px] font-semibold px-1.5 rounded bg-blue-50 text-blue-700">Planifiée</span>}
          {status === 'expiree' && <span className="text-[11px] font-semibold px-1.5 rounded bg-gray-100 text-gray-500">Expirée</span>}
        </div>
      </div>
      <div className="flex items-center justify-end w-full sm:w-auto border-t border-gray-100 sm:border-0" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onToggle} className="px-2 text-xs font-semibold text-gray-500 hover:text-gray-900 hidden md:block" style={{ minHeight: '40px' }}>
          {slide.actif ? 'Désactiver' : 'Activer'}
        </button>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Monter" className="p-2.5 text-gray-400 hover:text-gray-900 disabled:opacity-25"><IcoArrow dir="up" /></button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Descendre" className="p-2.5 text-gray-400 hover:text-gray-900 disabled:opacity-25"><IcoArrow dir="down" /></button>
        <button type="button" onClick={onDuplicate} aria-label="Dupliquer" className="p-2.5 text-gray-400 hover:text-gray-900"><IcoCopy /></button>
        <button type="button" onClick={onDelete} aria-label="Supprimer" className="p-2.5 text-gray-400 hover:text-red-600"><IcoTrash /></button>
      </div>
    </li>
  )
}

function AddSlidePicker({ onPick, onCancel }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-gray-50 border border-dashed border-gray-300">
      {Object.entries(TYPES).map(([type, meta]) => (
        <button key={type} type="button" onClick={() => onPick(type)}
          className="text-left rounded-xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-sm p-3 transition" style={{ minHeight: '64px' }}>
          <TypeBadge type={type} types={TYPES} />
          <p className="text-xs text-gray-500 mt-1.5">{meta.description}</p>
        </button>
      ))}
      <button type="button" onClick={onCancel} className="sm:col-span-2 text-sm text-gray-500 hover:text-gray-800" style={{ minHeight: '40px' }}>Annuler</button>
    </div>
  )
}

// ─── Bornes ──────────────────────────────────────────────────────────────────

function BornesPicker({ bornes, selectedIds, ecranId, onChange, loading }) {
  const [query, setQuery] = useState('')
  const selected = new Set(selectedIds)
  const q = query.trim().toLowerCase()
  const visible = bornes.filter((b) => !q || `${b.idBorne} ${b.adresse} ${b.commercant ?? ''}`.toLowerCase().includes(q))

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une borne (ID, adresse, commerçant)"
          className={inputClass} style={inputStyle} />
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange([...new Set([...selectedIds, ...visible.map((b) => b.id)])])}
            className="px-3 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 whitespace-nowrap" style={{ minHeight: '48px' }}>
            Tout cocher
          </button>
          <button type="button" onClick={() => onChange(selectedIds.filter((id) => !visible.some((b) => b.id === id)))}
            className="px-3 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 whitespace-nowrap" style={{ minHeight: '48px' }}>
            Tout décocher
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Chargement des bornes…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Aucune borne ne correspond.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl max-h-[420px] overflow-y-auto">
          {visible.map((b) => {
            const checked = selected.has(b.id)
            const autre = b.ecranVeille && b.ecranVeille.id !== ecranId ? b.ecranVeille : null
            return (
              <li key={b.id}>
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50" style={{ minHeight: '56px' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="w-5 h-5 accent-purple-700 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{b.idBorne}</span>
                      {b.statut !== 'actif' && <span className="text-[11px] font-semibold px-1.5 rounded bg-gray-100 text-gray-500">Inactive</span>}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">{b.adresse}{b.commercant ? ` — ${b.commercant}` : ''}</span>
                  </span>
                  {autre && (
                    <span className={`text-[11px] text-right leading-tight ${checked ? 'text-amber-700' : 'text-gray-400'}`}>
                      {checked ? 'Quittera' : 'Diffuse'}<br />« {autre.nom} »
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-gray-500">
        {selectedIds.length} borne{selectedIds.length > 1 ? 's' : ''} sélectionnée{selectedIds.length > 1 ? 's' : ''}. Une borne ne diffuse qu'un seul écran de veille : la cocher ici la retire de son écran actuel.
      </p>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EcranVeilleEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [ecran, setEcran] = useState(() => (isEdit ? null : newEcran()))
  const [snapshot, setSnapshot] = useState(() => (isEdit ? null : JSON.stringify(toPayload(newEcran()))))
  const [selectedKey, setSelectedKey] = useState(() => ecran?.diapositives[0]?._key ?? null)
  const [tab, setTab] = useState('sequence')
  const [bornes, setBornes] = useState([])
  const [bornesLoading, setBornesLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [picking, setPicking] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [previewLang, setPreviewLang] = useState('fr')
  const [orientation, setOrientation] = useState('paysage')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [drag, setDrag] = useState({ from: null, over: null })

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    ecransVeilleService.get(id)
      .then((data) => {
        if (cancelled) return
        const state = fromApi(data)
        setEcran(state)
        setSnapshot(JSON.stringify(toPayload(state)))
        setSelectedKey(state.diapositives[0]?._key ?? null)
      })
      .catch((err) => !cancelled && setLoadError(apiErrorMessage(err, 'Écran de veille introuvable')))
    return () => { cancelled = true }
  }, [id, isEdit])

  useEffect(() => {
    fetchAllBornes()
      .then(setBornes)
      .catch(() => setError('Liste des bornes indisponible — l\'affectation ne peut pas être modifiée pour le moment.'))
      .finally(() => setBornesLoading(false))
  }, [])

  const dirty = ecran !== null && snapshot !== null && JSON.stringify(toPayload(ecran)) !== snapshot
  const validation = useMemo(() => (ecran ? validateEcran(ecran) : null), [ecran])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = useCallback((patch) => setEcran((prev) => ({ ...prev, ...patch })), [])

  const setSlides = useCallback((fn) => setEcran((prev) => ({ ...prev, diapositives: fn(prev.diapositives) })), [])

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-4">
          <ErrorBanner message={loadError} />
          <Link to="/superadmin/ecrans-veille" className="text-sm font-semibold" style={{ color: PRIMARY }}>← Retour aux écrans de veille</Link>
        </div>
      </AppLayout>
    )
  }

  if (!ecran) {
    return (
      <AppLayout>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-72 bg-gray-200 rounded" />
          <div className="h-96 bg-white rounded-2xl" />
        </div>
      </AppLayout>
    )
  }

  const slides = ecran.diapositives
  const selectedIndex = slides.findIndex((s) => s._key === selectedKey)
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : null
  const slideErrors = showErrors ? validation.slides : {}
  const settingsErrors = showErrors ? validation.errors : {}
  const diffusees = playableSlides(slides)

  function moveSlide(from, to) {
    if (to < 0 || to >= slides.length || from === to) return
    setSlides((list) => {
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function addSlide(type) {
    if (slides.length >= LIMITS.slidesMax) {
      setError(`${LIMITS.slidesMax} diapositives maximum par écran de veille`)
      return
    }
    const slide = newSlide(type)
    setSlides((list) => [...list, slide])
    setSelectedKey(slide._key)
    setPicking(false)
  }

  function duplicateAt(index) {
    const copy = duplicateSlide(slides[index])
    setSlides((list) => [...list.slice(0, index + 1), copy, ...list.slice(index + 1)])
    setSelectedKey(copy._key)
  }

  function deleteSlide(key) {
    const index = slides.findIndex((s) => s._key === key)
    const remaining = slides.filter((s) => s._key !== key)
    setSlides(() => remaining)
    if (key === selectedKey) setSelectedKey(remaining[Math.min(index, remaining.length - 1)]?._key ?? null)
    setPendingDelete(null)
  }

  function replaceSlide(next) {
    setSlides((list) => list.map((s) => (s._key === next._key ? next : s)))
  }

  function dragHandlers(index) {
    return {
      onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ from: index, over: index }) },
      onDragOver: (e) => { e.preventDefault(); if (drag.over !== index) setDrag((d) => ({ ...d, over: index })) },
      onDrop: (e) => { e.preventDefault(); if (drag.from !== null) moveSlide(drag.from, index); setDrag({ from: null, over: null }) },
      onDragEnd: () => setDrag({ from: null, over: null }),
    }
  }

  async function handleSave() {
    setError(null)
    const result = validateEcran(ecran)
    if (!result.valid) {
      setShowErrors(true)
      const firstBadSlide = slides.find((s) => result.slides[s._key])
      if (Object.keys(result.errors).some((k) => k !== 'diapositives')) setTab('reglages')
      else if (firstBadSlide) { setTab('sequence'); setSelectedKey(firstBadSlide._key) }
      setError('Certains champs sont à corriger avant l\'enregistrement.')
      return
    }

    setSaving(true)
    try {
      const payload = toPayload(ecran)
      const saved = isEdit
        ? await ecransVeilleService.update(id, payload)
        : await ecransVeilleService.create(payload)
      const state = fromApi(saved)
      setEcran(state)
      setSnapshot(JSON.stringify(toPayload(state)))
      setSelectedKey(state.diapositives[Math.max(0, selectedIndex)]?._key ?? null)
      setShowErrors(false)
      setToast({ message: isEdit ? 'Écran de veille enregistré — bornes prévenues' : 'Écran de veille créé' })
      setBornes(await fetchAllBornes().catch(() => bornes))
      if (!isEdit) navigate(`/superadmin/ecrans-veille/${saved.id}`, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Erreur lors de l\'enregistrement'))
    } finally {
      setSaving(false)
    }
  }

  const delaiIsPreset = DELAIS_PRESETS.includes(Number(ecran.delaiActivation))
  const plageActive = ecran.heureDebut !== null || ecran.heureFin !== null
  const tabs = [
    { key: 'sequence', label: `Séquence (${slides.length})`, error: showErrors && Object.keys(validation.slides).length > 0 },
    { key: 'reglages', label: 'Réglages', error: showErrors && Object.keys(validation.errors).length > 0 },
    { key: 'bornes', label: `Bornes (${ecran.borneIds.length})`, error: false },
  ]

  return (
    <AppLayout>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}
      {playing && <PlaybackModal ecran={ecran} initialLang={previewLang} onClose={() => setPlaying(false)} />}
      {pendingDelete && (
        <ConfirmModal
          danger
          title="Supprimer la diapositive ?"
          message={`« ${slideLabel(pendingDelete)} » sera retirée de la séquence à l'enregistrement.`}
          confirmLabel="Supprimer"
          onConfirm={() => deleteSlide(pendingDelete._key)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <div className="space-y-5">
        {/* En-tête */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link to="/superadmin/ecrans-veille" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Écrans de veille</Link>
            <h1 className="text-2xl font-bold text-gray-900 truncate mt-1">{ecran.nom.trim() || (isEdit ? 'Écran de veille' : 'Nouvel écran de veille')}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500">
              <span className={`font-semibold px-2 py-0.5 rounded-full border ${ecran.actif ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                {ecran.actif ? 'Actif' : 'Inactif'}
              </span>
              <span>{diffusees.length} diapositive{diffusees.length > 1 ? 's' : ''} diffusée{diffusees.length > 1 ? 's' : ''}</span>
              <span>·</span>
              <span>cycle de {formatDuration(cycleDuration(diffusees))}</span>
              {dirty && <span className="font-semibold text-amber-600">· Modifications non enregistrées</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPlaying(true)} disabled={slides.length === 0}
              className="flex items-center gap-2 px-4 text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50" style={{ minHeight: '48px' }}>
              <IcoPlay /> Lire en plein écran
            </button>
            <button type="button" onClick={handleSave} disabled={saving || (isEdit && !dirty)}
              className="flex items-center gap-2 px-5 text-sm font-semibold rounded-xl text-white disabled:opacity-50" style={{ background: PRIMARY, minHeight: '48px' }}>
              <IcoCheck /> {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer l\'écran'}
            </button>
          </div>
        </div>

        <ErrorBanner message={error} onClose={() => setError(null)} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          {/* Colonne édition */}
          <div className="space-y-5 min-w-0">
            <div role="tablist" className="flex gap-1 p-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              {tabs.map((tb) => (
                <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)}
                  className={`relative flex-1 px-4 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${tab === tb.key ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  style={{ minHeight: '44px', background: tab === tb.key ? PRIMARY : undefined }}>
                  {tb.label}
                  {tb.error && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>

            {tab === 'sequence' && (
              <>
                <Card
                  title="Séquence du diaporama"
                  subtitle="Glissez-déposez ou utilisez les flèches pour réordonner. La borne boucle sur les diapositives actives."
                  actions={!picking && (
                    <button type="button" onClick={() => setPicking(true)}
                      className="flex items-center gap-1.5 px-4 text-sm font-semibold rounded-xl text-white" style={{ background: PRIMARY, minHeight: '40px' }}>
                      <IcoPlus /> Ajouter
                    </button>
                  )}
                >
                  <div className="space-y-3">
                    {picking && <AddSlidePicker onPick={addSlide} onCancel={() => setPicking(false)} />}
                    {slides.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">Aucune diapositive. Ajoutez un texte, une photo, une galerie ou une vidéo.</p>
                    ) : (
                      <ol className="space-y-2">
                        {slides.map((slide, i) => (
                          <SequenceRow
                            key={slide._key}
                            slide={slide}
                            index={i}
                            count={slides.length}
                            selected={slide._key === selectedKey}
                            hasError={Boolean(slideErrors[slide._key])}
                            dragState={drag}
                            dragHandlers={dragHandlers(i)}
                            onSelect={() => setSelectedKey(slide._key)}
                            onMove={(delta) => moveSlide(i, i + delta)}
                            onDuplicate={() => duplicateAt(i)}
                            onDelete={() => setPendingDelete(slide)}
                            onToggle={() => replaceSlide({ ...slide, actif: !slide.actif })}
                          />
                        ))}
                      </ol>
                    )}
                    {settingsErrors.diapositives && <p className="text-xs text-red-600">{settingsErrors.diapositives}</p>}
                  </div>
                </Card>

                {selected && (
                  <Card
                    title={`Diapositive ${selectedIndex + 1} — ${TYPES[selected.type].label}`}
                    subtitle={TYPES[selected.type].description}
                  >
                    <SlideEditor slide={selected} errors={slideErrors[selected._key]} onChange={replaceSlide} />
                  </Card>
                )}
              </>
            )}

            {tab === 'reglages' && (
              <Card title="Réglages de l'écran de veille">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Nom" error={settingsErrors.nom} hint="Visible uniquement dans le back-office">
                      <input type="text" value={ecran.nom} maxLength={LIMITS.nomMax} onChange={(e) => update({ nom: e.target.value })}
                        placeholder="ex. Veille agences — automne 2026" className={inputClass} style={inputStyle} />
                    </Field>
                    <Field label="Description" error={settingsErrors.description}>
                      <input type="text" value={ecran.description ?? ''} maxLength={LIMITS.descriptionMax} onChange={(e) => update({ description: e.target.value })}
                        placeholder="Optionnel" className={inputClass} style={inputStyle} />
                    </Field>
                  </div>

                  <Toggle label="Écran actif" description="Inactif, il n'est plus diffusé : les bornes affectées restent sur leur écran d'accueil."
                    checked={ecran.actif} onChange={(actif) => update({ actif })} />

                  <Field label="Déclenchement après inactivité" error={settingsErrors.delaiActivation}
                    hint="Temps sans toucher sur l'écran d'accueil avant que la veille démarre.">
                    <div className="flex flex-wrap items-center gap-3">
                      <Segmented
                        ariaLabel="Délai d'activation"
                        value={delaiIsPreset ? Number(ecran.delaiActivation) : 'custom'}
                        onChange={(v) => update({ delaiActivation: v === 'custom' ? Number(ecran.delaiActivation) + 1 : v })}
                        options={[...DELAIS_PRESETS.map((s) => ({ value: s, label: formatDelai(s) })), { value: 'custom', label: 'Autre' }]}
                      />
                      {!delaiIsPreset && (
                        <div className="flex items-center gap-2">
                          <input type="number" min={LIMITS.delaiMin} max={LIMITS.delaiMax} value={ecran.delaiActivation}
                            onChange={(e) => update({ delaiActivation: Number(e.target.value) })} className={`${inputClass} w-28`} style={inputStyle} aria-label="Délai en secondes" />
                          <span className="text-sm text-gray-500">secondes</span>
                        </div>
                      )}
                    </div>
                  </Field>

                  <Field label="Transition entre diapositives">
                    <Segmented ariaLabel="Transition" value={ecran.transition} onChange={(transition) => update({ transition })} options={TRANSITIONS} />
                  </Field>

                  <div className="divide-y divide-gray-100 border-y border-gray-100">
                    <Toggle label="Ordre aléatoire" description="Mélange la séquence à chaque tour"
                      checked={ecran.ordreAleatoire} onChange={(ordreAleatoire) => update({ ordreAleatoire })} />
                    <Toggle label="Logo" description="Logo de la borne en haut à gauche"
                      checked={ecran.afficherLogo} onChange={(afficherLogo) => update({ afficherLogo })} />
                    <Toggle label="Horloge" description="Heure et date en haut à droite"
                      checked={ecran.afficherHorloge} onChange={(afficherHorloge) => update({ afficherHorloge })} />
                    <Toggle label="Invitation à toucher l'écran" description="Bandeau animé en bas de l'écran"
                      checked={ecran.afficherCta} onChange={(afficherCta) => update({ afficherCta })} />
                  </div>

                  {ecran.afficherCta && (
                    <div>
                      <I18nTextInput label="Texte de l'invitation" value={ecran.texteCta ?? {}} onChange={(texteCta) => update({ texteCta })} />
                      {settingsErrors.texteCta && <p className="text-xs text-red-600 mt-1">{settingsErrors.texteCta}</p>}
                    </div>
                  )}

                  <div>
                    <Toggle label="Limiter à une plage horaire"
                      description="Hors plage, la borne reste sur l'écran d'accueil. Une plage de nuit (20:00 → 08:00) est acceptée."
                      checked={plageActive}
                      onChange={(on) => update(on ? { heureDebut: '08:00', heureFin: '20:00' } : { heureDebut: null, heureFin: null })} />
                    {plageActive && (
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <Field label="De">
                          <input type="time" value={ecran.heureDebut ?? ''} onChange={(e) => update({ heureDebut: e.target.value || null })} className={inputClass} style={inputStyle} />
                        </Field>
                        <Field label="À">
                          <input type="time" value={ecran.heureFin ?? ''} onChange={(e) => update({ heureFin: e.target.value || null })} className={inputClass} style={inputStyle} />
                        </Field>
                      </div>
                    )}
                    {settingsErrors.plage && <p className="text-xs text-red-600 mt-1">{settingsErrors.plage}</p>}
                  </div>
                </div>
              </Card>
            )}

            {tab === 'bornes' && (
              <Card title="Bornes qui diffusent cet écran" subtitle="Les bornes cochées sont prévenues en temps réel à l'enregistrement.">
                <BornesPicker bornes={bornes} selectedIds={ecran.borneIds} ecranId={id} loading={bornesLoading}
                  onChange={(borneIds) => update({ borneIds })} />
              </Card>
            )}
          </div>

          {/* Colonne aperçu */}
          <div className="xl:sticky xl:top-0 space-y-4">
            <Card
              title="Aperçu en direct"
              subtitle={selected ? `Diapositive ${selectedIndex + 1} / ${slides.length}` : 'Aucune diapositive sélectionnée'}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Segmented ariaLabel="Langue de l'aperçu" value={previewLang} onChange={setPreviewLang} options={LANG_OPTIONS} />
                  <Segmented ariaLabel="Orientation" value={orientation} onChange={setOrientation} options={ORIENTATIONS} />
                </div>
                <TabletFrame orientation={orientation}>
                  {selected
                    ? <SlideView key={selected._key} slide={selected} lang={previewLang} animate />
                    : <div className="absolute inset-0 bg-gray-800" />}
                  <ScreenChrome ecran={ecran} lang={previewLang} />
                </TabletFrame>
                {selected && !selected.actif && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Cette diapositive est désactivée : elle ne sera pas diffusée.</p>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <dt className="text-xs text-gray-500">Déclenchement</dt>
                    <dd className="font-semibold text-gray-900">{formatDelai(Number(ecran.delaiActivation) || 0)} d'inactivité</dd>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <dt className="text-xs text-gray-500">Durée d'un cycle</dt>
                    <dd className="font-semibold text-gray-900">{formatDuration(cycleDuration(diffusees))}</dd>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <dt className="text-xs text-gray-500">Plage horaire</dt>
                    <dd className="font-semibold text-gray-900">{plageActive ? `${ecran.heureDebut ?? '—'} → ${ecran.heureFin ?? '—'}` : 'Toute la journée'}</dd>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <dt className="text-xs text-gray-500">Bornes</dt>
                    <dd className="font-semibold text-gray-900">{ecran.borneIds.length}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => setPlaying(true)} disabled={slides.length === 0}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
                  style={{ background: '#1a1a2e', minHeight: '48px' }}>
                  <IcoPlay /> Lire la séquence comme sur la borne
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
