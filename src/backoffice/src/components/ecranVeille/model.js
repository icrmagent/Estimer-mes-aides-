/**
 * Modèle de l'éditeur d'écran de veille : valeurs par défaut, conversion API,
 * validation client. Les règles reprennent le schéma Zod de
 * src/backend/src/routes/ecrans-veille.js (double validation, règle 9) — toute
 * évolution d'un côté doit être reportée de l'autre.
 */

export const TYPES = {
  texte: { label: 'Texte', description: 'Titre et sous-titre sur un fond coloré ou une image', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  image: { label: 'Photo', description: 'Une photo plein écran, avec texte incrusté', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  galerie: { label: 'Galerie', description: 'Plusieurs photos qui défilent', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  video: { label: 'Vidéo', description: 'Vidéo MP4 ou WebM, lue sans le son', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
}

export const TRANSITIONS = [
  { value: 'fondu', label: 'Fondu' },
  { value: 'glissement', label: 'Glissement' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'aucune', label: 'Aucune' },
]

export const DELAIS_PRESETS = [30, 60, 120, 300, 600]

export const LANGS = ['fr', 'es', 'en']

export const DEFAULT_STYLE = { position: 'centre', alignement: 'centre', couleurTexte: '#FFFFFF', opaciteVoile: 35 }

const MO = 1024 * 1024
export const MEDIA_LIMITS = {
  image: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxBytes: 10 * MO, accept: 'image/jpeg,image/png,image/webp,image/gif' },
  video: { types: ['video/mp4', 'video/webm'], maxBytes: 50 * MO, accept: 'video/mp4,video/webm' },
}

export const LIMITS = { nomMax: 120, descriptionMax: 500, texteMax: 200, dureeMin: 3, dureeMax: 300, delaiMin: 10, delaiMax: 3600, slidesMax: 50, galerieMin: 2, galerieMax: 20 }

export const DEFAULT_CTA = {
  fr: "Touchez l'écran pour commencer",
  es: 'Toque la pantalla para empezar',
  en: 'Touch the screen to start',
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Texte localisé avec repli sur le français (règle i18n du projet). */
export function t(value, lang = 'fr') {
  if (!value) return ''
  return value[lang] || value.fr || ''
}

export function newSlide(type) {
  const base = {
    _key: uuid(),
    type,
    duree: 8,
    actif: true,
    titre: {},
    sousTitre: {},
    style: { ...DEFAULT_STYLE },
    dateDebut: null,
    dateFin: null,
  }
  switch (type) {
    case 'texte':
      return {
        ...base,
        duree: 6,
        titre: { fr: 'Estimez vos aides à la rénovation' },
        sousTitre: { fr: 'Pour la rénovation énergétique de votre logement' },
        style: { ...DEFAULT_STYLE, opaciteVoile: 0 },
        contenu: { fond: { type: 'degrade', couleur: '#5B2D8E', couleur2: '#1A56A0', angle: 135, imageUrl: '' } },
      }
    case 'image':
      return { ...base, style: { ...DEFAULT_STYLE, position: 'bas' }, contenu: { imageUrl: '', ajustement: 'couvrir', effetZoom: true } }
    case 'galerie':
      return { ...base, style: { ...DEFAULT_STYLE, position: 'bas' }, contenu: { images: [], dureeParImage: 4, ajustement: 'couvrir' } }
    case 'video':
      return { ...base, duree: 30, style: { ...DEFAULT_STYLE, position: 'bas', opaciteVoile: 20 }, contenu: { videoUrl: '', posterUrl: '', lireJusquaFin: true } }
    default:
      throw new Error(`Type de diapositive inconnu : ${type}`)
  }
}

export function duplicateSlide(slide) {
  return JSON.parse(JSON.stringify({ ...slide, _key: uuid() }))
}

export function newEcran() {
  return {
    nom: '',
    description: '',
    actif: true,
    delaiActivation: 60,
    transition: 'fondu',
    ordreAleatoire: false,
    afficherCta: true,
    texteCta: { ...DEFAULT_CTA },
    afficherLogo: true,
    afficherHorloge: false,
    heureDebut: null,
    heureFin: null,
    borneIds: [],
    diapositives: [newSlide('texte')],
  }
}

/** Réponse GET /api/ecrans-veille/:id → état de l'éditeur. */
export function fromApi(ecran) {
  return {
    nom: ecran.nom ?? '',
    description: ecran.description ?? '',
    actif: ecran.actif ?? true,
    delaiActivation: ecran.delaiActivation ?? 60,
    transition: ecran.transition ?? 'fondu',
    ordreAleatoire: Boolean(ecran.ordreAleatoire),
    afficherCta: ecran.afficherCta ?? true,
    texteCta: ecran.texteCta ?? {},
    afficherLogo: ecran.afficherLogo ?? true,
    afficherHorloge: Boolean(ecran.afficherHorloge),
    heureDebut: ecran.heureDebut ?? null,
    heureFin: ecran.heureFin ?? null,
    borneIds: (ecran.bornes ?? []).map((b) => b.id),
    diapositives: (ecran.diapositives ?? []).map((d) => ({
      _key: d.id ?? uuid(),
      type: d.type,
      duree: d.duree,
      actif: d.actif ?? true,
      titre: d.titre ?? {},
      sousTitre: d.sousTitre ?? {},
      style: { ...DEFAULT_STYLE, ...(d.style ?? {}) },
      contenu: withContenuDefaults(d.type, d.contenu ?? {}),
      dateDebut: d.dateDebut ?? null,
      dateFin: d.dateFin ?? null,
    })),
  }
}

function withContenuDefaults(type, contenu) {
  const defaults = newSlide(type).contenu
  if (type === 'texte') return { fond: { ...defaults.fond, ...(contenu.fond ?? {}) } }
  return { ...defaults, ...contenu }
}

export function slideDuration(slide) {
  if (slide.type === 'galerie') {
    return Math.max(1, slide.contenu.images.length) * slide.contenu.dureeParImage
  }
  return slide.duree
}

export function cycleDuration(slides) {
  return slides.filter((s) => s.actif).reduce((sum, s) => sum + slideDuration(s), 0)
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${min} min ${String(rest).padStart(2, '0')} s` : `${min} min`
}

/** 'planifiee' avant dateDebut, 'expiree' après dateFin, sinon null. */
export function scheduleStatus(slide, now = new Date()) {
  if (slide.dateDebut && new Date(slide.dateDebut) > now) return 'planifiee'
  if (slide.dateFin && new Date(slide.dateFin) <= now) return 'expiree'
  return null
}

/** Diapositives que la borne diffuserait maintenant : actives et dans leur période. */
export function playableSlides(diapositives, now = new Date()) {
  return diapositives.filter((d) => d.actif && scheduleStatus(d, now) === null)
}

export function isHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

function cleanI18n(value) {
  if (!value) return null
  const entries = LANGS.map((l) => [l, (value[l] ?? '').trim()]).filter(([, v]) => v)
  return entries.length ? Object.fromEntries(entries) : null
}

function toContenuPayload(slide) {
  const c = slide.contenu
  switch (slide.type) {
    case 'texte': {
      const fond = { type: c.fond.type, couleur: c.fond.couleur }
      if (c.fond.type === 'degrade') {
        fond.couleur2 = c.fond.couleur2 || c.fond.couleur
        fond.angle = Number(c.fond.angle ?? 135)
      }
      if (c.fond.type === 'image') fond.imageUrl = c.fond.imageUrl.trim()
      return { fond }
    }
    case 'image':
      return { imageUrl: c.imageUrl.trim(), ajustement: c.ajustement, effetZoom: Boolean(c.effetZoom) }
    case 'galerie':
      return { images: c.images.map((u) => u.trim()), dureeParImage: Number(c.dureeParImage), ajustement: c.ajustement }
    case 'video': {
      const out = { videoUrl: c.videoUrl.trim(), lireJusquaFin: Boolean(c.lireJusquaFin) }
      if (c.posterUrl?.trim()) out.posterUrl = c.posterUrl.trim()
      return out
    }
    default:
      return c
  }
}

function toSlidePayload(slide) {
  const duree = slide.type === 'galerie'
    ? Math.min(LIMITS.dureeMax, Math.max(LIMITS.dureeMin, slideDuration(slide)))
    : Number(slide.duree)
  return {
    type: slide.type,
    duree,
    actif: Boolean(slide.actif),
    titre: cleanI18n(slide.titre),
    sousTitre: cleanI18n(slide.sousTitre),
    contenu: toContenuPayload(slide),
    style: {
      position: slide.style.position,
      alignement: slide.style.alignement,
      couleurTexte: slide.style.couleurTexte,
      opaciteVoile: Number(slide.style.opaciteVoile),
    },
    dateDebut: slide.dateDebut ? new Date(slide.dateDebut).toISOString() : null,
    dateFin: slide.dateFin ? new Date(slide.dateFin).toISOString() : null,
  }
}

/** État de l'éditeur → corps de POST/PUT /api/ecrans-veille. */
export function toPayload(state) {
  const plage = state.heureDebut && state.heureFin
  return {
    nom: state.nom.trim(),
    description: state.description?.trim() || null,
    actif: Boolean(state.actif),
    delaiActivation: Number(state.delaiActivation),
    transition: state.transition,
    ordreAleatoire: Boolean(state.ordreAleatoire),
    afficherCta: Boolean(state.afficherCta),
    texteCta: cleanI18n(state.texteCta),
    afficherLogo: Boolean(state.afficherLogo),
    afficherHorloge: Boolean(state.afficherHorloge),
    heureDebut: plage ? state.heureDebut : null,
    heureFin: plage ? state.heureFin : null,
    borneIds: [...state.borneIds],
    diapositives: state.diapositives.map(toSlidePayload),
  }
}

function checkI18n(errors, key, value) {
  for (const l of LANGS) {
    if ((value?.[l] ?? '').length > LIMITS.texteMax) {
      errors[key] = `${LIMITS.texteMax} caractères maximum (${l.toUpperCase()})`
      return
    }
  }
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Erreurs d'une diapositive, indexées par champ. Objet vide = valide. */
export function validateSlide(slide) {
  const errors = {}
  const c = slide.contenu
  checkI18n(errors, 'titre', slide.titre)
  checkI18n(errors, 'sousTitre', slide.sousTitre)

  if (slide.type !== 'galerie') {
    const d = Number(slide.duree)
    if (!Number.isInteger(d) || d < LIMITS.dureeMin || d > LIMITS.dureeMax) {
      errors.duree = `Durée entre ${LIMITS.dureeMin} et ${LIMITS.dureeMax} secondes`
    }
  }

  switch (slide.type) {
    case 'texte':
      if (!slide.titre?.fr?.trim()) errors.titre = 'Titre en français requis'
      if (c.fond.type === 'image' && !isHttpsUrl(c.fond.imageUrl)) errors.imageUrl = 'Image de fond HTTPS requise'
      break
    case 'image':
      if (!isHttpsUrl(c.imageUrl)) errors.imageUrl = 'Photo requise (URL HTTPS)'
      break
    case 'galerie':
      if (c.images.length < LIMITS.galerieMin) errors.images = `Au moins ${LIMITS.galerieMin} photos`
      else if (c.images.length > LIMITS.galerieMax) errors.images = `${LIMITS.galerieMax} photos maximum`
      else if (!c.images.every(isHttpsUrl)) errors.images = 'Toutes les photos doivent être en HTTPS'
      if (!(c.dureeParImage >= 2 && c.dureeParImage <= 60)) errors.dureeParImage = 'Entre 2 et 60 secondes par photo'
      break
    case 'video':
      if (!isHttpsUrl(c.videoUrl)) errors.videoUrl = 'Vidéo requise (URL HTTPS)'
      if (c.posterUrl?.trim() && !isHttpsUrl(c.posterUrl)) errors.posterUrl = 'Image d\'attente en HTTPS'
      break
    default:
      errors.type = 'Type inconnu'
  }

  if (slide.dateDebut && slide.dateFin && new Date(slide.dateFin) <= new Date(slide.dateDebut)) {
    errors.dateFin = 'La fin doit suivre le début'
  }
  return errors
}

/** Validation complète avant enregistrement. */
export function validateEcran(state) {
  const errors = {}
  const nom = state.nom.trim()
  if (!nom) errors.nom = 'Nom requis'
  else if (nom.length > LIMITS.nomMax) errors.nom = `${LIMITS.nomMax} caractères maximum`
  if ((state.description ?? '').length > LIMITS.descriptionMax) errors.description = `${LIMITS.descriptionMax} caractères maximum`

  const delai = Number(state.delaiActivation)
  if (!Number.isInteger(delai) || delai < LIMITS.delaiMin || delai > LIMITS.delaiMax) {
    errors.delaiActivation = `Entre ${LIMITS.delaiMin} s et ${LIMITS.delaiMax / 60} min`
  }

  const { heureDebut: debut, heureFin: fin } = state
  if (Boolean(debut) !== Boolean(fin)) errors.plage = 'Renseigner le début et la fin, ou aucun des deux'
  else if (debut && (!HEURE.test(debut) || !HEURE.test(fin))) errors.plage = 'Heures au format HH:MM'
  else if (debut && debut === fin) errors.plage = 'Le début et la fin doivent différer'

  checkI18n(errors, 'texteCta', state.texteCta)
  if (state.diapositives.length > LIMITS.slidesMax) errors.diapositives = `${LIMITS.slidesMax} diapositives maximum`

  const slides = {}
  for (const slide of state.diapositives) {
    const e = validateSlide(slide)
    if (Object.keys(e).length) slides[slide._key] = e
  }

  return { errors, slides, valid: Object.keys(errors).length === 0 && Object.keys(slides).length === 0 }
}
