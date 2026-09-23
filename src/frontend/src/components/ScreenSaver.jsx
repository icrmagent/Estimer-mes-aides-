import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useBorne } from '../context/BorneContext.jsx'
import { t } from '../utils/i18n.js'
import { canShowEcranVeille, collectMediaUrls, isWithinPlage, playableSlides, slideDuration } from '../utils/ecranVeille.js'
import { resolveMediaUrl, syncMediaCache } from '../services/mediaCacheService.js'
import ilaLogo from '../assets/logo.png'

/*
 * Écran de veille de la borne — diaporama configuré dans le back-office.
 *
 * Monté par StartPage uniquement : la veille ne se déclenche que sur l'écran
 * d'accueil, après `delaiActivation` secondes sans toucher. Le formulaire garde
 * sa propre inactivité (annulation → retour accueil → puis veille).
 *
 * Le rendu reproduit l'aperçu du back-office
 * (src/backoffice/src/components/ecranVeille/SlideView.jsx) en unités vmin :
 * toute évolution visuelle doit être reportée des deux côtés.
 */

const ACTIVITY_EVENTS = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'keydown', 'wheel', 'scroll']
const RECHECK_MS = 60_000
const PLAGE_CHECK_MS = 30_000
const FADE_OUT_MS = 400
const TRANSITION_MS = 900
// Vidéo « lue jusqu'à la fin » qui ne se termine jamais (flux cassé) : on n'y reste pas indéfiniment.
const VIDEO_SAFETY_S = 600
const BROKEN_SKIP_MS = 1_200

const POSITION = { haut: 'flex-start', centre: 'center', bas: 'flex-end' }
const ALIGN = { gauche: ['flex-start', 'left'], centre: ['center', 'center'], droite: ['flex-end', 'right'] }
const LOCALES = { fr: 'fr-FR', es: 'es-ES', en: 'en-GB' }

const ENTER = {
  fondu: `ev-fade-in ${TRANSITION_MS}ms ease both`,
  glissement: `ev-slide-in ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1) both`,
  zoom: `ev-zoom-in ${TRANSITION_MS}ms ease-out both`,
}
const LEAVE = { glissement: `ev-slide-out ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1) both` }

// ─── Rendu d'une diapositive ─────────────────────────────────────────────────

function Photo({ src, fit, zoom, seconds, onBroken }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={onBroken}
      className="ev-anim"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: fit === 'contenir' ? 'contain' : 'cover',
        background: '#000',
        animation: zoom ? `ev-kenburns ${seconds}s ease-out both` : undefined,
      }}
    />
  )
}

function Gallery({ contenu, src, onBroken }) {
  const { images = [], dureeParImage = 4, ajustement } = contenu
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (images.length < 2) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), dureeParImage * 1000)
    return () => clearInterval(id)
  }, [images.length, dureeParImage])

  return images.map((url, i) => (
    <div key={`${url}-${i}`} style={{ position: 'absolute', inset: 0, opacity: i === index ? 1 : 0, transition: 'opacity 700ms ease' }}>
      <Photo src={src(url)} fit={ajustement} zoom={i === index} seconds={dureeParImage + 1} onBroken={i === index ? onBroken : undefined} />
    </div>
  ))
}

function textBackground(fond = {}) {
  if (fond.type === 'degrade') return `linear-gradient(${fond.angle ?? 135}deg, ${fond.couleur}, ${fond.couleur2 || fond.couleur})`
  return fond.couleur || '#5B2D8E'
}

function Slide({ slide, lang, src, loopVideo, onVideoEnded, onBroken }) {
  const style = { position: 'centre', alignement: 'centre', couleurTexte: '#FFFFFF', opaciteVoile: 35, ...(slide.style ?? {}) }
  const c = slide.contenu ?? {}
  const titre = t(slide.titre, lang)
  const sousTitre = t(slide.sousTitre, lang)
  const [alignItems, textAlign] = ALIGN[style.alignement] ?? ALIGN.centre

  let media = null
  let background = '#000'
  if (slide.type === 'texte') {
    background = textBackground(c.fond)
    if (c.fond?.type === 'image') media = <Photo src={src(c.fond.imageUrl)} fit="couvrir" onBroken={onBroken} />
  } else if (slide.type === 'image') {
    media = <Photo src={src(c.imageUrl)} fit={c.ajustement} zoom={c.effetZoom} seconds={slideDuration(slide) + 1} onBroken={onBroken} />
  } else if (slide.type === 'galerie') {
    media = <Gallery contenu={c} src={src} onBroken={onBroken} />
  } else if (slide.type === 'video') {
    media = (
      <video
        src={src(c.videoUrl)}
        poster={c.posterUrl ? src(c.posterUrl) : undefined}
        autoPlay
        muted
        playsInline
        loop={loopVideo}
        onEnded={onVideoEnded}
        onError={onBroken}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
      />
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background }}>
      {media}
      {style.opaciteVoile > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${style.opaciteVoile / 100})` }} />}
      {(titre || sousTitre) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          justifyContent: POSITION[style.position] ?? 'center', alignItems, textAlign,
          padding: '9vmin 7vmin 13vmin',
        }}>
          <div style={{ maxWidth: '82%', color: style.couleurTexte, textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
            {titre && <p style={{ fontSize: '6.4vmin', fontWeight: 800, lineHeight: 1.12, margin: 0, overflowWrap: 'anywhere' }}>{titre}</p>}
            {sousTitre && <p style={{ fontSize: '3.3vmin', fontWeight: 500, lineHeight: 1.35, margin: '1.6vmin 0 0', opacity: 0.92, overflowWrap: 'anywhere' }}>{sousTitre}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Lecture de la séquence ──────────────────────────────────────────────────

function shuffled(count, avoidFirst) {
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
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
    default:
      return state
  }
}

function Player({ ecran, slides, lang, src }) {
  const random = Boolean(ecran.ordreAleatoire)
  const [state, dispatch] = useReducer(playerReducer, { count: slides.length, random }, initPlayer)
  const { current, previous } = state
  const slide = slides[current.idx]
  const single = slides.length <= 1
  const next = useCallback(() => dispatch({ type: 'next', random }), [random])

  useEffect(() => {
    if (single || !slide) return undefined
    const waitsForVideo = slide.type === 'video' && slide.contenu?.lireJusquaFin
    const id = setTimeout(next, (waitsForVideo ? VIDEO_SAFETY_S : slideDuration(slide)) * 1000)
    return () => clearTimeout(id)
    // Relancé à chaque nouvel affichage (token), pas à chaque rendu.
  }, [current.token, single]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previous) return undefined
    const token = previous.token
    const id = setTimeout(() => dispatch({ type: 'clearPrevious', token }), ecran.transition === 'aucune' ? 0 : TRANSITION_MS)
    return () => clearTimeout(id)
  }, [previous, ecran.transition])

  // Média inaccessible : on passe vite à la suite plutôt que d'afficher un écran noir.
  const skipBroken = useCallback(() => {
    if (!single) setTimeout(next, BROKEN_SKIP_MS)
  }, [single, next])

  const layer = (entry, phase) => {
    const s = slides[entry.idx]
    if (!s) return null
    const animation = entry.token === 0 ? undefined : (phase === 'enter' ? ENTER[ecran.transition] : LEAVE[ecran.transition])
    const waitsForVideo = s.type === 'video' && s.contenu?.lireJusquaFin
    return (
      <div key={entry.token} className="ev-anim" style={{ position: 'absolute', inset: 0, zIndex: phase === 'enter' ? 2 : 1, animation }}>
        <Slide
          slide={s}
          lang={lang}
          src={src}
          loopVideo={single || !waitsForVideo}
          onVideoEnded={phase === 'enter' && !single ? next : undefined}
          onBroken={phase === 'enter' ? skipBroken : undefined}
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

// ─── Éléments fixes ──────────────────────────────────────────────────────────

function Clock({ lang }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  const locale = LOCALES[lang] ?? 'fr-FR'
  return (
    <div style={{ position: 'absolute', top: '4vmin', right: '5vmin', color: '#fff', textAlign: 'right', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: '5.2vmin', fontWeight: 700, lineHeight: 1 }}>{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
      <div style={{ fontSize: '2.2vmin', opacity: 0.85, marginTop: '0.8vmin', textTransform: 'capitalize' }}>
        {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

function Chrome({ ecran, lang }) {
  const cta = t(ecran.texteCta, lang)
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {ecran.afficherLogo && (
        <img src={ilaLogo} alt="" style={{ position: 'absolute', top: '4vmin', left: '5vmin', height: '7vmin', width: 'auto', filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.55))' }} />
      )}
      {ecran.afficherHorloge && <Clock lang={lang} />}
      {ecran.afficherCta && cta && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '5vmin', display: 'flex', justifyContent: 'center' }}>
          <div className="ev-anim" style={{
            display: 'flex', alignItems: 'center', gap: '1.4vmin', color: '#fff', fontWeight: 600,
            fontSize: '2.8vmin', padding: '1.6vmin 3.4vmin', borderRadius: '99px',
            background: 'rgba(91,45,142,0.88)', border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)', animation: 'ev-pulse 2.4s ease-in-out infinite',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '3.4vmin', height: '3.4vmin' }}>
              <path d="M9 11V6a2 2 0 0 1 4 0v5" /><path d="M13 10a2 2 0 0 1 4 0v1" /><path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3.4L3.3 14a2 2 0 0 1 3.4-2L9 15" />
            </svg>
            {cta}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Déclenchement ───────────────────────────────────────────────────────────

export default function ScreenSaver() {
  const { ecranVeille, langue, resetLangue } = useBorne()
  const [phase, setPhase] = useState('off') // off | on | closing
  const [activation, setActivation] = useState(0)
  const [media, setMedia] = useState({ activation: -1, map: null })
  const resetLangueRef = useRef(resetLangue)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    resetLangueRef.current = resetLangue
  })

  // Préchargement hors ligne dès que la config est connue, sans attendre la veille.
  useEffect(() => {
    if (!ecranVeille) return
    const urls = collectMediaUrls(ecranVeille)
    if (urls.length) syncMediaCache(urls).catch(() => {})
  }, [ecranVeille])

  // Minuterie d'inactivité : réarmée à chaque toucher, revérifiée chaque minute hors plage horaire.
  useEffect(() => {
    if (!ecranVeille || phase !== 'off') return undefined
    const delayMs = Math.max(10, ecranVeille.delaiActivation ?? 60) * 1000
    let timer = null

    function tryActivate() {
      if (canShowEcranVeille(ecranVeille, new Date())) {
        // Chaque réveil est une nouvelle session visiteur : langue par défaut de la borne.
        resetLangueRef.current?.()
        setActivation((n) => n + 1)
        setPhase('on')
      } else {
        timer = setTimeout(tryActivate, RECHECK_MS)
      }
    }
    function onActivity() {
      clearTimeout(timer)
      timer = setTimeout(tryActivate, delayMs)
    }

    timer = setTimeout(tryActivate, delayMs)
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity, { passive: true, capture: true }))
    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity, { capture: true }))
    }
  }, [ecranVeille, phase])

  // Fin de plage horaire pendant la veille : retour à l'accueil.
  useEffect(() => {
    if (phase !== 'on') return undefined
    const id = setInterval(() => {
      if (!isWithinPlage(ecranVeille, new Date())) setPhase('off')
    }, PLAGE_CHECK_MS)
    return () => clearInterval(id)
  }, [phase, ecranVeille])

  // Résolution des médias (cache hors ligne ou réseau) à chaque mise en veille.
  useEffect(() => {
    if (phase !== 'on' || !ecranVeille) return undefined
    let cancelled = false
    const revokes = []
    const urls = collectMediaUrls(ecranVeille)
    Promise.all(urls.map((u) => resolveMediaUrl(u))).then((results) => {
      results.forEach((r) => { if (r.revoke) revokes.push(r.revoke) })
      if (cancelled) return
      setMedia({ activation, map: new Map(urls.map((u, i) => [u, results[i].src])) })
    })
    return () => {
      cancelled = true
      revokes.forEach((revoke) => revoke())
    }
  }, [phase, ecranVeille, activation])

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  const slides = useMemo(
    () => (phase === 'off' || !ecranVeille ? [] : playableSlides(ecranVeille.diapositives)),
    [phase, ecranVeille],
  )

  // Le toucher qui réveille la borne ne doit rien déclencher dessous : le voile
  // reste monté pendant le fondu de sortie et absorbe le « clic fantôme » qui suit.
  function dismiss(e) {
    e.preventDefault()
    e.stopPropagation()
    if (phase !== 'on') return
    setPhase('closing')
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setPhase('off'), FADE_OUT_MS)
  }

  if (phase === 'off' || !ecranVeille || slides.length === 0) return null

  const ready = media.activation === activation && media.map
  const src = (url) => (ready ? media.map.get(url) ?? url : url)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Écran de veille — touchez pour commencer"
      data-testid="ecran-veille"
      onPointerDown={dismiss}
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      onKeyDown={dismiss}
      tabIndex={-1}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#000', overflow: 'hidden',
        cursor: 'pointer', touchAction: 'none', userSelect: 'none',
        opacity: phase === 'closing' ? 0 : 1, transition: `opacity ${FADE_OUT_MS}ms ease`,
        animation: 'ev-fade-in 600ms ease both',
      }}
    >
      {ready && <Player key={activation} ecran={ecranVeille} slides={slides} lang={langue} src={src} />}
      <Chrome ecran={ecranVeille} lang={langue} />
    </div>
  )
}
