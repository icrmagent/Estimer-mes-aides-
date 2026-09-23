import I18nTextInput from '../forms/I18nTextInput.jsx'
import { MediaInput, GalleryInput } from './MediaInput.jsx'
import { Field, Toggle, Segmented } from './controls.jsx'
import { inputClass, inputStyle } from './styles.js'
import { LIMITS, slideDuration, formatDuration } from './model.js'

const POSITIONS = [
  { value: 'haut', label: 'Haut' },
  { value: 'centre', label: 'Centre' },
  { value: 'bas', label: 'Bas' },
]
const ALIGNEMENTS = [
  { value: 'gauche', label: 'Gauche' },
  { value: 'centre', label: 'Centré' },
  { value: 'droite', label: 'Droite' },
]
const FONDS = [
  { value: 'couleur', label: 'Couleur' },
  { value: 'degrade', label: 'Dégradé' },
  { value: 'image', label: 'Image' },
]
const AJUSTEMENTS = [
  { value: 'couvrir', label: 'Remplir l\'écran' },
  { value: 'contenir', label: 'Image entière' },
]

/** datetime-local attend « YYYY-MM-DDTHH:mm » en heure locale. */
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null
}

function ColorInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-2" style={{ minHeight: '48px' }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="w-10 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
        <span className="text-sm font-mono text-gray-600 uppercase">{value}</span>
      </div>
    </Field>
  )
}

function SubSection({ title, children }) {
  return (
    <div className="pt-5 mt-5 border-t border-gray-100 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </div>
  )
}

/**
 * Formulaire d'une diapositive. Chaque modification remonte immédiatement
 * (`onChange(slide)`) pour que l'aperçu se mette à jour en direct.
 */
export default function SlideEditor({ slide, errors = {}, onChange }) {
  const c = slide.contenu
  const setContenu = (patch) => onChange({ ...slide, contenu: { ...c, ...patch } })
  const setFond = (patch) => setContenu({ fond: { ...c.fond, ...patch } })
  const setStyle = (patch) => onChange({ ...slide, style: { ...slide.style, ...patch } })

  return (
    <div>
      {/* ── Contenu propre au type ─────────────────────────────────────── */}
      <div className="space-y-4">
        {slide.type === 'texte' && (
          <>
            <Field label="Fond">
              <Segmented ariaLabel="Type de fond" value={c.fond.type} onChange={(type) => setFond({ type })} options={FONDS} />
            </Field>
            {c.fond.type !== 'image' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorInput label={c.fond.type === 'degrade' ? 'Couleur de départ' : 'Couleur'} value={c.fond.couleur} onChange={(couleur) => setFond({ couleur })} />
                {c.fond.type === 'degrade' && (
                  <ColorInput label="Couleur d'arrivée" value={c.fond.couleur2 || c.fond.couleur} onChange={(couleur2) => setFond({ couleur2 })} />
                )}
              </div>
            )}
            {c.fond.type === 'degrade' && (
              <Field label={`Orientation du dégradé — ${c.fond.angle ?? 135}°`}>
                <input type="range" min={0} max={360} step={15} value={c.fond.angle ?? 135}
                  onChange={(e) => setFond({ angle: Number(e.target.value) })} className="w-full accent-purple-700" />
              </Field>
            )}
            {c.fond.type === 'image' && (
              <MediaInput label="Image de fond" kind="image" value={c.fond.imageUrl} onChange={(imageUrl) => setFond({ imageUrl })} error={errors.imageUrl} />
            )}
          </>
        )}

        {slide.type === 'image' && (
          <>
            <MediaInput label="Photo" kind="image" value={c.imageUrl} onChange={(imageUrl) => setContenu({ imageUrl })} error={errors.imageUrl} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <Field label="Cadrage">
                <Segmented ariaLabel="Cadrage" value={c.ajustement} onChange={(ajustement) => setContenu({ ajustement })} options={AJUSTEMENTS} />
              </Field>
              <Toggle label="Zoom lent" description="Effet « Ken Burns » pendant l'affichage" checked={c.effetZoom} onChange={(effetZoom) => setContenu({ effetZoom })} />
            </div>
          </>
        )}

        {slide.type === 'galerie' && (
          <>
            <GalleryInput images={c.images} onChange={(images) => setContenu({ images })} error={errors.images} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <Field label="Durée par photo (s)" error={errors.dureeParImage}
                hint={`Durée totale : ${formatDuration(slideDuration(slide))}`}>
                <input type="number" min={2} max={60} value={c.dureeParImage}
                  onChange={(e) => setContenu({ dureeParImage: Number(e.target.value) })} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Cadrage">
                <Segmented ariaLabel="Cadrage" value={c.ajustement} onChange={(ajustement) => setContenu({ ajustement })} options={AJUSTEMENTS} />
              </Field>
            </div>
          </>
        )}

        {slide.type === 'video' && (
          <>
            <MediaInput label="Vidéo" kind="video" value={c.videoUrl} onChange={(videoUrl) => setContenu({ videoUrl })} error={errors.videoUrl} />
            <MediaInput label="Image d'attente" kind="image" optional value={c.posterUrl} onChange={(posterUrl) => setContenu({ posterUrl })} error={errors.posterUrl} />
            <Toggle
              label="Lire la vidéo jusqu'à la fin"
              description="Sinon, elle est coupée après la durée choisie ci-dessous. La vidéo est toujours lue sans le son."
              checked={c.lireJusquaFin}
              onChange={(lireJusquaFin) => setContenu({ lireJusquaFin })}
            />
          </>
        )}

        {slide.type !== 'galerie' && !(slide.type === 'video' && c.lireJusquaFin) && (
          <Field label="Durée d'affichage (secondes)" error={errors.duree} hint={`Entre ${LIMITS.dureeMin} et ${LIMITS.dureeMax} secondes`}>
            <input type="number" min={LIMITS.dureeMin} max={LIMITS.dureeMax} value={slide.duree}
              onChange={(e) => onChange({ ...slide, duree: Number(e.target.value) })} className={inputClass} style={inputStyle} />
          </Field>
        )}
      </div>

      {/* ── Texte incrusté ─────────────────────────────────────────────── */}
      <SubSection title="Texte">
        <div>
          <I18nTextInput label="Titre" required={slide.type === 'texte'} value={slide.titre} onChange={(titre) => onChange({ ...slide, titre })} />
          {errors.titre && <p className="text-xs text-red-600 mt-1" role="alert">{errors.titre}</p>}
        </div>
        <div>
          <I18nTextInput label="Sous-titre" value={slide.sousTitre} onChange={(sousTitre) => onChange({ ...slide, sousTitre })} />
          {errors.sousTitre && <p className="text-xs text-red-600 mt-1" role="alert">{errors.sousTitre}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Position verticale">
            <Segmented ariaLabel="Position du texte" value={slide.style.position} onChange={(position) => setStyle({ position })} options={POSITIONS} />
          </Field>
          <Field label="Alignement">
            <Segmented ariaLabel="Alignement du texte" value={slide.style.alignement} onChange={(alignement) => setStyle({ alignement })} options={ALIGNEMENTS} />
          </Field>
          <ColorInput label="Couleur du texte" value={slide.style.couleurTexte} onChange={(couleurTexte) => setStyle({ couleurTexte })} />
          <Field label={`Voile sombre — ${slide.style.opaciteVoile} %`} hint="Améliore la lisibilité du texte sur une photo claire">
            <input type="range" min={0} max={90} step={5} value={slide.style.opaciteVoile}
              onChange={(e) => setStyle({ opaciteVoile: Number(e.target.value) })} className="w-full accent-purple-700 mt-3" />
          </Field>
        </div>
      </SubSection>

      {/* ── Diffusion ──────────────────────────────────────────────────── */}
      <SubSection title="Diffusion">
        <Toggle label="Diapositive active" description="Une diapositive inactive reste dans la séquence mais n'est pas diffusée"
          checked={slide.actif} onChange={(actif) => onChange({ ...slide, actif })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Diffuser à partir du" hint="Vide = immédiatement">
            <input type="datetime-local" value={toLocalInput(slide.dateDebut)}
              onChange={(e) => onChange({ ...slide, dateDebut: fromLocalInput(e.target.value) })} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Jusqu'au" hint="Vide = sans limite" error={errors.dateFin}>
            <input type="datetime-local" value={toLocalInput(slide.dateFin)}
              onChange={(e) => onChange({ ...slide, dateFin: fromLocalInput(e.target.value) })} className={inputClass} style={inputStyle} />
          </Field>
        </div>
      </SubSection>
    </div>
  )
}
