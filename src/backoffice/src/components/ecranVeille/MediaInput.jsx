import { useRef, useState } from 'react'
import { ecransVeilleService } from '../../services/ecransVeilleService.js'
import { MEDIA_LIMITS, LIMITS, isHttpsUrl } from './model.js'
import { IcoUpload, IcoArrow } from './controls.jsx'
import { inputClass, inputStyle } from './styles.js'
import { PRIMARY, IcoTrash, IcoPlus } from '../ui.jsx'

function ProgressBar({ ratio }) {
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(ratio * 100)}%`, background: PRIMARY }} />
    </div>
  )
}

function Thumb({ url, kind }) {
  const [broken, setBroken] = useState(false)
  if (!url || !isHttpsUrl(url) || broken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-[10px] text-center px-1">
        {broken ? 'Inaccessible' : 'Aperçu'}
      </div>
    )
  }
  return kind === 'video'
    ? <video src={url} muted playsInline preload="metadata" onError={() => setBroken(true)} className="w-full h-full object-cover bg-black" />
    : <img src={url} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" />
}

/** Bouton « Téléverser » + état d'envoi, partagé par les champs simple et galerie. */
function useUpload(kind) {
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  async function upload(files, onUrl) {
    setError(null)
    for (const [i, file] of files.entries()) {
      setProgress({ ratio: 0, index: i + 1, total: files.length, name: file.name })
      try {
        const url = await ecransVeilleService.uploadMedia(file, kind, {
          onProgress: (ratio) => setProgress((p) => (p ? { ...p, ratio } : p)),
        })
        onUrl(url)
      } catch (err) {
        setError(`${file.name} : ${err.message}`)
        break
      }
    }
    setProgress(null)
  }

  return { progress, error, setError, upload }
}

function UploadButton({ kind, multiple = false, disabled, onFiles }) {
  const inputRef = useRef(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_LIMITS[kind].accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 px-4 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60 whitespace-nowrap"
        style={{ minHeight: '48px' }}
      >
        <IcoUpload />
        {multiple ? 'Ajouter des fichiers' : 'Téléverser'}
      </button>
    </>
  )
}

function limitHint(kind) {
  const rule = MEDIA_LIMITS[kind]
  const formats = rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ')
  return `${formats} — ${rule.maxBytes / 1048576} Mo maximum`
}

/** Un média : URL HTTPS saisie ou fichier téléversé vers le stockage. */
export function MediaInput({ label, kind, value, onChange, error, optional = false }) {
  const { progress, error: uploadError, setError, upload } = useUpload(kind)
  const busy = progress !== null

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{optional && <span className="font-normal text-gray-400"> (optionnel)</span>}
      </label>
      <div className="flex gap-3 items-start">
        <div className="w-20 h-14 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
          <Thumb key={value} url={value} kind={kind} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              inputMode="url"
              value={value ?? ''}
              onChange={(e) => { setError(null); onChange(e.target.value) }}
              placeholder="https://…"
              disabled={busy}
              className={inputClass}
              style={inputStyle}
              aria-invalid={Boolean(error)}
            />
            <UploadButton kind={kind} disabled={busy} onFiles={(files) => upload(files.slice(0, 1), onChange)} />
          </div>
          {busy && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 truncate">Envoi de {progress.name}… {Math.round(progress.ratio * 100)} %</p>
              <ProgressBar ratio={progress.ratio} />
            </div>
          )}
          {uploadError || error
            ? <p className="text-xs text-red-600" role="alert">{uploadError || error}</p>
            : <p className="text-xs text-gray-500">{limitHint(kind)}</p>}
        </div>
      </div>
    </div>
  )
}

/** Liste ordonnée de photos pour une diapositive galerie. */
export function GalleryInput({ images, onChange, error }) {
  const { progress, error: uploadError, setError, upload } = useUpload('image')
  const [draft, setDraft] = useState('')
  const busy = progress !== null
  const full = images.length >= LIMITS.galerieMax

  function addUrl() {
    const url = draft.trim()
    if (!isHttpsUrl(url)) {
      setError('Saisissez une URL HTTPS valide')
      return
    }
    setError(null)
    onChange([...images, url])
    setDraft('')
  }

  function move(i, delta) {
    const next = [...images]
    const [item] = next.splice(i, 1)
    next.splice(i + delta, 0, item)
    onChange(next)
  }

  function handleFiles(files) {
    const room = LIMITS.galerieMax - images.length
    const accepted = files.slice(0, room)
    let acc = [...images]
    upload(accepted, (url) => {
      acc = [...acc, url]
      onChange(acc)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Photos de la galerie</span>
        <span className="text-xs text-gray-500">{images.length} / {LIMITS.galerieMax}</span>
      </div>

      {images.length > 0 && (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((url, i) => (
            <li key={`${url}-${i}`} className="relative rounded-xl overflow-hidden border border-gray-200 bg-white group">
              <div className="aspect-video"><Thumb url={url} kind="image" /></div>
              <span className="absolute top-1.5 left-1.5 text-[11px] font-bold text-white bg-black/60 rounded-md px-1.5">{i + 1}</span>
              <div className="flex items-center justify-between px-1.5 py-1 bg-white">
                <div className="flex">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Déplacer avant" className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30" style={{ transform: 'rotate(-90deg)' }}><IcoArrow /></button>
                  <button type="button" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Déplacer après" className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30" style={{ transform: 'rotate(90deg)' }}><IcoArrow /></button>
                </div>
                <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label="Retirer la photo" className="p-2 text-red-500 hover:text-red-700"><IcoTrash /></button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
          placeholder="Coller l'URL HTTPS d'une photo"
          disabled={busy || full}
          className={inputClass}
          style={inputStyle}
        />
        <button type="button" onClick={addUrl} disabled={busy || full || !draft.trim()}
          className="flex items-center justify-center gap-1.5 px-4 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          style={{ minHeight: '48px' }}>
          <IcoPlus /> Ajouter
        </button>
        <UploadButton kind="image" multiple disabled={busy || full} onFiles={handleFiles} />
      </div>

      {busy && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 truncate">Envoi {progress.index}/{progress.total} — {progress.name}… {Math.round(progress.ratio * 100)} %</p>
          <ProgressBar ratio={progress.ratio} />
        </div>
      )}
      {uploadError || error
        ? <p className="text-xs text-red-600" role="alert">{uploadError || error}</p>
        : <p className="text-xs text-gray-500">{limitHint('image')} par photo — {LIMITS.galerieMin} à {LIMITS.galerieMax} photos.</p>}
    </div>
  )
}
