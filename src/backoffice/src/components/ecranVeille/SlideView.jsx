import { useEffect, useMemo, useReducer, useState } from 'react'
import logoBorne from '../../assets/logo-borne.png'
import { t, slideDuration, playableSlides } from './model.js'

/*
 * Rendu d'une diapositive d'écran de veille — reproduction de ce qu'affiche la
 * borne (src/frontend/src/components/ScreenSaver.jsx). Les tailles de texte sont
 * en unités de conteneur (cqmin) : le rendu est identique dans la vignette, le
 * cadre tablette et le plein écran. Le parent doit porter `containerType: 'size'`.
 */

const POSITION = { haut: 'flex-start', centre: 'center', bas: 'flex-end' }
const ALIGN = { gauche: ['flex-start', 'left'], centre: ['center', 'center'], droite: ['flex-end', 'right'] }

const TRANSITION_MS = 900
// Une vidéo « lue jusqu'à la fin » qui ne se termine jamais (flux cassé) ne doit pas figer la veille.
const VIDEO_SAFETY_S = 600

function Placeholder({ label }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70"
      style={{ background: 'repeating-linear-gradient(135deg, #2a2640 0 14px, #312c4b 14px 28px)' }}>
      <svg width="15%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ maxWidth: 56 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
      <span style={{ fontSize: '3cqmin' }}>{label}</span>
    </div>
  )
}

// Monté avec key={url} : l'état « inaccessible » repart à zéro quand l'URL change.
function Photo({ url, fit, zoom, seconds, animate }) {
  const [broken, setBroken] = useState(false)
  if (!url) return <Placeholder label="Aucune photo" />
  if (broken) return <Placeholder label="Photo inaccessible" />
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
      className="absolute inset-0 w-full h-full ev-anim"
      style={{
        objectFit: fit === 'contenir' ? 'contain' : 'cover',
        background: '#000',
        animation: animate && zoom ? `ev-kenburns ${seconds}s ease-out both` : undefined,
      }}
    />
  )
}

function Gallery({ contenu, animate }) {
  const { images, dureeParImage, ajustement } = contenu
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!animate || images.length < 2) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), dureeParImage * 1000)
    return () => clearInterval(id)
  }, [animate, images, dureeParImage])

  if (images.length === 0) return <Placeholder label="Galerie vide" />
  return images.map((url, i) => (
    <div key={`${url}-${i}`} className="absolute inset-0" style={{ opacity: i === index ? 1 : 0, transition: 'opacity 700ms ease' }}>
      <Photo key={url} url={url} fit={ajustement} zoom seconds={dureeParImage + 1} animate={animate && i === index} />
    </div>
  ))
}

function Video({ contenu, loop, onEnded }) {
  const [broken, setBroken] = useState(false)
  if (!contenu.videoUrl) return <Placeholder label="Aucune vidéo" />
  if (broken) return <Placeholder label="Vidéo inaccessible" />
  return (
    <video
      src={contenu.videoUrl}
      poster={contenu.posterUrl || undefined}
      autoPlay
      muted
      playsInline
      loop={loop}
      onEnded={onEnded}
      onError={() => setBroken(true)}
      className="absolute inset-0 w-full h-full object-cover bg-black"
    />
  )
}

function textBackground(fond) {
  if (fond.type === 'degrade') return `linear-gradient(${fond.angle ?? 135}deg, ${fond.couleur}, ${fond.couleur2 || fond.couleur})`
  return fond.couleur
}

/**
 * @param {object} props
 * @param {object} props.slide
 * @param {string} [props.lang]
 * @param {boolean} [props.animate] - effets (zoom lent, défilement galerie, lecture vidéo)
 * @param {boolean} [props.loopVideo]
 * @param {() => void} [props.onVideoEnded]
 */
export function SlideView({ slide, lang = 'fr', animate = true, loopVideo = true, onVideoEnded }) {
  const { style, contenu } = slide
  const titre = t(slide.titre, lang)
  const sousTitre = t(slide.sousTitre, lang)
  const [alignItems, textAlign] = ALIGN[style.alignement] ?? ALIGN.centre

  let media = null
  let background = '#000'
  if (slide.type === 'texte') {
    background = textBackground(contenu.fond)
    if (contenu.fond.type === 'image') {
      media = <Photo key={contenu.fond.imageUrl} url={contenu.fond.imageUrl} fit="couvrir" zoom={false} animate={false} />
    }
  } else if (slide.type === 'image') {
    media = <Photo key={contenu.imageUrl} url={contenu.imageUrl} fit={contenu.ajustement} zoom={contenu.effetZoom} seconds={slideDuration(slide) + 1} animate={animate} />
  } else if (slide.type === 'galerie') {
    media = <Gallery key={contenu.images.join('|')} contenu={contenu} animate={animate} />
  } else if (slide.type === 'video') {
    media = animate
      ? <Video key={contenu.videoUrl} contenu={contenu} loop={loopVideo} onEnded={onVideoEnded} />
      : contenu.posterUrl
        ? <Photo key={contenu.posterUrl} url={contenu.posterUrl} fit="couvrir" zoom={false} animate={false} />
        : <Placeholder label="Vidéo" />
  }

  return (
    <div className="absolute inset-0 overflow-hidden select-none" style={{ background }}>
      {media}
      {style.opaciteVoile > 0 && (
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${style.opaciteVoile / 100})` }} />
      )}
      {(titre || sousTitre) && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{ justifyContent: POSITION[style.position] ?? 'center', alignItems, textAlign, padding: '9cqmin 7cqmin 13cqmin' }}
        >
          <div style={{ maxWidth: '82%', color: style.couleurTexte, textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
            {titre && <p style={{ fontSize: '6.4cqmin', fontWeight: 800, lineHeight: 1.12, margin: 0, overflowWrap: 'anywhere' }}>{titre}</p>}
            {sousTitre && <p style={{ fontSize: '3.3cqmin', fontWeight: 500, lineHeight: 1.35, margin: '1.6cqmin 0 0', opacity: 0.92, overflowWrap: 'anywhere' }}>{sousTitre}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function Clock({ lang }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  const locale = { fr: 'fr-FR', es: 'es-ES', en: 'en-GB' }[lang] ?? 'fr-FR'
  return (
    <div className="absolute text-white text-right" style={{ top: '4cqmin', right: '5cqmin', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: '5.2cqmin', fontWeight: 700, lineHeight: 1 }}>
        {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{ fontSize: '2.2cqmin', opacity: 0.85, marginTop: '0.8cqmin', textTransform: 'capitalize' }}>
        {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

/** Éléments fixes au-dessus du diaporama : logo, horloge, invitation à toucher. */
export function ScreenChrome({ ecran, lang = 'fr' }) {
  const cta = t(ecran.texteCta, lang)
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {ecran.afficherLogo && (
        // Logo blanc sur fond transparent : une ombre suffit à le détacher de toute image.
        <img src={logoBorne} alt="" className="absolute"
          style={{ top: '4cqmin', left: '5cqmin', height: '7cqmin', width: 'auto', filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.55))' }} />
      )}
      {ecran.afficherHorloge && <Clock lang={lang} />}
      {ecran.afficherCta && cta && (
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: '5cqmin' }}>
          <div
            className="flex items-center text-white font-semibold ev-anim"
            style={{
              gap: '1.4cqmin',
              fontSize: '2.8cqmin',
              padding: '1.6cqmin 3.4cqmin',
              borderRadius: '99px',
              background: 'rgba(91,45,142,0.88)',
              border: '1px solid rgba(255,255,255,0.35)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
              animation: 'ev-pulse 2.4s ease-in-out infinite',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '3.4cqmin', height: '3.4cqmin' }}>
              <path d="M9 11V6a2 2 0 0 1 4 0v5" /><path d="M13 10a2 2 0 0 1 4 0v1" /><path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3.4L3.3 14a2 2 0 0 1 3.4-2L9 15" />
            </svg>
            {cta}
          </div>
        </div>
      )}
    </div>
  )
}

/** Cadre de tablette. `children` est rendu dans un conteneur de requête (cqmin). */
export function TabletFrame({ orientation = 'paysage', children }) {
  const portrait = orientation === 'portrait'
  return (
    <div className="mx-auto" style={{ width: portrait ? '62%' : '100%' }}>
      <div className="rounded-[22px] bg-gray-900 p-2.5 shadow-xl ring-1 ring-black/10">
        <div className="relative overflow-hidden rounded-[14px] bg-black" style={{ aspectRatio: portrait ? '10 / 16' : '16 / 10', containerType: 'size' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function shuffled(count, avoidFirst) {
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // Pas deux fois la même diapositive à la jonction de deux cycles.
  if (count > 1 && order[0] === avoidFirst) [order[0], order[1]] = [order[1], order[0]]
  return order
}

function initPlayer({ count, random }) {
  const order = random ? shuffled(count) : Array.from({ length: count }, (_, i) => i)
  return { order, pos: 0, current: { idx: order[0] ?? 0, token: 0 }, previous: null }
}

function playerReducer(state, action) {
  switch (action.type) {
    case 'next': {
      let { order } = state
      let pos = state.pos + 1
      if (pos >= order.length) {
        order = action.random ? shuffled(order.length, order[order.length - 1]) : order
        pos = 0
      }
      return { order, pos, current: { idx: order[pos], token: state.current.token + 1 }, previous: state.current }
    }
    case 'clearPrevious':
      return state.previous?.token === action.token ? { ...state, previous: null } : state
    case 'reset':
      return initPlayer(action)
    default:
      return state
  }
}

const ENTER = {
  fondu: `ev-fade-in ${TRANSITION_MS}ms ease both`,
  glissement: `ev-slide-in ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1) both`,
  zoom: `ev-zoom-in ${TRANSITION_MS}ms ease-out both`,
}
const LEAVE = { glissement: `ev-slide-out ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1) both` }

/** Lecture de la séquence avec transitions, minuteries et fin de vidéo — comme la borne. */
export function SlideshowPlayer({ ecran, slides, lang = 'fr' }) {
  const random = Boolean(ecran.ordreAleatoire)
  const [state, dispatch] = useReducer(playerReducer, { count: slides.length, random }, initPlayer)
  const slidesKey = slides.map((s) => s._key ?? s.id).join('|')

  useEffect(() => {
    dispatch({ type: 'reset', count: slides.length, random })
  }, [slidesKey, slides.length, random])

  const { current, previous } = state
  const slide = slides[current.idx]
  const single = slides.length <= 1
  const waitsForVideo = slide?.type === 'video' && slide.contenu.lireJusquaFin

  useEffect(() => {
    if (single || !slide) return undefined
    const seconds = waitsForVideo ? VIDEO_SAFETY_S : slideDuration(slide)
    const id = setTimeout(() => dispatch({ type: 'next', random }), seconds * 1000)
    return () => clearTimeout(id)
    // Relancé à chaque affichage (token), pas à chaque rendu.
  }, [current.token, single]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previous) return undefined
    const token = previous.token
    const id = setTimeout(() => dispatch({ type: 'clearPrevious', token }), ecran.transition === 'aucune' ? 0 : TRANSITION_MS)
    return () => clearTimeout(id)
  }, [previous, ecran.transition])

  if (!slide) return null

  const layer = (entry, phase) => {
    const s = slides[entry.idx]
    if (!s) return null
    const animation = phase === 'enter' ? ENTER[ecran.transition] : LEAVE[ecran.transition]
    return (
      <div key={entry.token} className="absolute inset-0 ev-anim" style={{ zIndex: phase === 'enter' ? 2 : 1, animation: entry.token === 0 ? undefined : animation }}>
        <SlideView
          slide={s}
          lang={lang}
          animate
          loopVideo={single || !(s.type === 'video' && s.contenu.lireJusquaFin)}
          onVideoEnded={phase === 'enter' && !single ? () => dispatch({ type: 'next', random }) : undefined}
        />
      </div>
    )
  }

  return (
    <>
      {previous && ecran.transition !== 'aucune' && layer(previous, 'leave')}
      {layer(current, 'enter')}
    </>
  )
}

/** Hook utilitaire : Échap ferme. */
function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/**
 * Lecture plein écran, comme sur la borne. Un clic sur l'écran quitte,
 * exactement comme un toucher réveille la borne.
 */
export function PlaybackModal({ ecran, onClose, initialLang = 'fr' }) {
  const [lang, setLang] = useState(initialLang)
  const [orientation, setOrientation] = useState('paysage')
  const slides = useMemo(() => playableSlides(ecran.diapositives), [ecran.diapositives])
  useEscape(onClose)

  const portrait = orientation === 'portrait'
  const ratio = portrait ? 10 / 16 : 16 / 10

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Lecture de l'écran de veille">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-black/80 text-white text-sm">
        <div className="flex items-center gap-2">
          {['fr', 'es', 'en'].map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)}
              className={`px-3 rounded-lg font-semibold ${lang === l ? 'bg-white text-gray-900' : 'bg-white/10 hover:bg-white/20'}`}
              style={{ minHeight: '36px' }}>
              {l.toUpperCase()}
            </button>
          ))}
          <button type="button" onClick={() => setOrientation(portrait ? 'paysage' : 'portrait')}
            className="px-3 rounded-lg bg-white/10 hover:bg-white/20" style={{ minHeight: '36px' }}>
            {portrait ? 'Portrait' : 'Paysage'}
          </button>
        </div>
        <span className="hidden sm:inline text-white/60">Cliquez sur l'écran pour simuler un toucher</span>
        <button type="button" onClick={onClose} className="px-4 rounded-lg bg-white text-gray-900 font-semibold" style={{ minHeight: '36px' }}>
          Quitter (Échap)
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-3 min-h-0" onClick={onClose}>
        <div
          className="relative overflow-hidden bg-black cursor-pointer"
          style={{ aspectRatio: `${ratio}`, width: `min(100%, calc((100vh - 72px) * ${ratio}))`, containerType: 'size' }}
        >
          {slides.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-center p-6" style={{ fontSize: '3cqmin' }}>
              Aucune diapositive diffusable : toutes sont désactivées ou hors de leur période de diffusion.
            </div>
          ) : (
            <SlideshowPlayer ecran={ecran} slides={slides} lang={lang} />
          )}
          <ScreenChrome ecran={ecran} lang={lang} />
        </div>
      </div>
    </div>
  )
}
