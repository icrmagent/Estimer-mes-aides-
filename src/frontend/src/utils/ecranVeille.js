/**
 * Règles de diffusion de l'écran de veille côté borne.
 *
 * La config arrive de GET /api/bornes/:id/config (`ecranVeille`, null si aucun
 * écran actif) et vit jusqu'à 24 h dans le cache local : les dates de diffusion
 * et la plage horaire sont donc évaluées ici, à l'instant T, pas côté serveur.
 */

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Vrai si `date` tombe dans la plage [heureDebut, heureFin[ (heure locale borne).
 * Une plage qui franchit minuit (20:00 → 08:00) est gérée. Pas de plage = toujours.
 */
export function isWithinPlage(ecran, date = new Date()) {
  if (!ecran?.heureDebut || !ecran?.heureFin) return true
  const now = date.getHours() * 60 + date.getMinutes()
  const debut = minutesOf(ecran.heureDebut)
  const fin = minutesOf(ecran.heureFin)
  return debut < fin ? now >= debut && now < fin : now >= debut || now < fin
}

/** Diapositives dans leur période de diffusion (le serveur n'envoie que les actives). */
export function playableSlides(diapositives = [], date = new Date()) {
  return diapositives.filter((d) => {
    if (d.actif === false) return false
    if (d.dateDebut && new Date(d.dateDebut) > date) return false
    if (d.dateFin && new Date(d.dateFin) <= date) return false
    return true
  })
}

/** Durée d'affichage en secondes (galerie : photos × durée par photo). */
export function slideDuration(slide) {
  if (slide.type === 'galerie') {
    return Math.max(1, slide.contenu?.images?.length ?? 0) * (slide.contenu?.dureeParImage ?? 4)
  }
  return slide.duree ?? 8
}

/** Écran diffusable maintenant : présent, dans sa plage, avec au moins une diapositive. */
export function canShowEcranVeille(ecran, date = new Date()) {
  return Boolean(ecran) && isWithinPlage(ecran, date) && playableSlides(ecran.diapositives, date).length > 0
}

/** Toutes les URLs de médias d'un écran, sans doublon — pour le préchargement hors ligne. */
export function collectMediaUrls(ecran) {
  const urls = new Set()
  for (const d of ecran?.diapositives ?? []) {
    const c = d.contenu ?? {}
    if (c.fond?.type === 'image' && c.fond.imageUrl) urls.add(c.fond.imageUrl)
    if (c.imageUrl) urls.add(c.imageUrl)
    for (const u of c.images ?? []) urls.add(u)
    if (c.videoUrl) urls.add(c.videoUrl)
    if (c.posterUrl) urls.add(c.posterUrl)
  }
  return [...urls].filter((u) => typeof u === 'string' && u.startsWith('https://'))
}
