/**
 * model.test.js — validation client et conversion API de l'écran de veille.
 *
 * Les règles doivent rester alignées sur le schéma Zod du backend
 * (src/backend/src/routes/ecrans-veille.js) : un écran accepté ici puis refusé
 * par le serveur est une régression de la double validation (règle 9).
 */
import { describe, it, expect } from 'vitest'
import {
  newSlide, newEcran, duplicateSlide, fromApi, toPayload,
  validateSlide, validateEcran, slideDuration, cycleDuration, formatDuration,
  scheduleStatus, isHttpsUrl, t,
} from './model.js'

function withContenu(type, patch) {
  const s = newSlide(type)
  return { ...s, contenu: { ...s.contenu, ...patch } }
}

describe('valeurs par défaut', () => {
  it('un nouvel écran est valide dès sa création, sauf son nom', () => {
    const ecran = newEcran()
    const { errors, slides } = validateEcran(ecran)
    expect(Object.keys(errors)).toEqual(['nom'])
    expect(slides).toEqual({})
  })

  it('chaque diapositive reçoit une clé unique, y compris après duplication', () => {
    const a = newSlide('texte')
    const b = duplicateSlide(a)
    expect(a._key).not.toBe(b._key)
    expect(b.titre).toEqual(a.titre)
    b.titre.fr = 'modifié'
    expect(a.titre.fr).not.toBe('modifié')
  })
})

describe('validateSlide', () => {
  it('exige le titre FR d\'une diapositive texte', () => {
    expect(validateSlide({ ...newSlide('texte'), titre: { es: 'Hola' } })).toHaveProperty('titre')
  })

  it('refuse une URL en HTTP simple', () => {
    expect(validateSlide(withContenu('image', { imageUrl: 'http://cdn.test/a.jpg' }))).toHaveProperty('imageUrl')
    expect(validateSlide(withContenu('image', { imageUrl: 'https://cdn.test/a.jpg' }))).toEqual({})
  })

  it('exige au moins deux photos dans une galerie', () => {
    expect(validateSlide(withContenu('galerie', { images: ['https://cdn.test/a.jpg'] }))).toHaveProperty('images')
    expect(validateSlide(withContenu('galerie', { images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] }))).toEqual({})
  })

  it('borne la durée entre 3 et 300 secondes hors galerie', () => {
    const video = withContenu('video', { videoUrl: 'https://cdn.test/v.mp4' })
    expect(validateSlide({ ...video, duree: 2 })).toHaveProperty('duree')
    expect(validateSlide({ ...video, duree: 301 })).toHaveProperty('duree')
    expect(validateSlide({ ...video, duree: 45 })).toEqual({})
  })

  it('refuse une période de diffusion inversée', () => {
    const slide = { ...newSlide('texte'), dateDebut: '2026-10-02T00:00:00.000Z', dateFin: '2026-10-01T00:00:00.000Z' }
    expect(validateSlide(slide)).toHaveProperty('dateFin')
  })

  it('refuse un texte de plus de 200 caractères, quelle que soit la langue', () => {
    expect(validateSlide({ ...newSlide('texte'), sousTitre: { en: 'x'.repeat(201) } })).toHaveProperty('sousTitre')
  })
})

describe('validateEcran', () => {
  it('exige une plage horaire complète et non vide', () => {
    const base = { ...newEcran(), nom: 'Test' }
    expect(validateEcran({ ...base, heureDebut: '08:00', heureFin: null }).errors).toHaveProperty('plage')
    expect(validateEcran({ ...base, heureDebut: '08:00', heureFin: '08:00' }).errors).toHaveProperty('plage')
    expect(validateEcran({ ...base, heureDebut: '20:00', heureFin: '08:00' }).valid).toBe(true)
  })

  it('borne le délai d\'activation entre 10 s et 1 h', () => {
    const base = { ...newEcran(), nom: 'Test' }
    expect(validateEcran({ ...base, delaiActivation: 5 }).errors).toHaveProperty('delaiActivation')
    expect(validateEcran({ ...base, delaiActivation: 3600 }).valid).toBe(true)
  })

  it('indexe les erreurs de diapositive par clé', () => {
    const bad = withContenu('video', { videoUrl: '' })
    const result = validateEcran({ ...newEcran(), nom: 'Test', diapositives: [newSlide('texte'), bad] })
    expect(result.valid).toBe(false)
    expect(Object.keys(result.slides)).toEqual([bad._key])
  })
})

describe('durées', () => {
  it('la durée d\'une galerie découle de ses photos', () => {
    const g = withContenu('galerie', { images: ['https://a', 'https://b', 'https://c'], dureeParImage: 5 })
    expect(slideDuration(g)).toBe(15)
  })

  it('le cycle ignore les diapositives inactives', () => {
    const a = { ...newSlide('texte'), duree: 6 }
    const b = { ...newSlide('texte'), duree: 10, actif: false }
    expect(cycleDuration([a, b])).toBe(6)
  })

  it('formate en secondes puis en minutes', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(125)).toBe('2 min 05 s')
  })
})

describe('toPayload', () => {
  it('produit le corps attendu par l\'API, sans champ interne', () => {
    const texte = { ...newSlide('texte'), titre: { fr: ' Bonjour ', es: '' }, sousTitre: {} }
    const galerie = withContenu('galerie', { images: Array.from({ length: 20 }, (_, i) => `https://cdn.test/${i}.jpg`), dureeParImage: 60 })
    const payload = toPayload({ ...newEcran(), nom: '  Veille  ', description: '  ', heureDebut: '08:00', heureFin: null, diapositives: [texte, galerie] })

    expect(payload.nom).toBe('Veille')
    expect(payload.description).toBeNull()
    expect(payload.heureDebut).toBeNull()
    expect(payload.heureFin).toBeNull()
    expect(payload.diapositives[0]._key).toBeUndefined()
    expect(payload.diapositives[0].titre).toEqual({ fr: 'Bonjour' })
    expect(payload.diapositives[0].sousTitre).toBeNull()
    expect(payload.diapositives[0].contenu.fond).toEqual({ type: 'degrade', couleur: '#5B2D8E', couleur2: '#1A56A0', angle: 135 })
    // 20 × 60 s dépasse le plafond accepté par l'API : le serveur recalcule de toute façon.
    expect(payload.diapositives[1].duree).toBe(300)
  })

  it('n\'envoie pas d\'image d\'attente vide pour une vidéo', () => {
    const video = withContenu('video', { videoUrl: 'https://cdn.test/v.mp4', posterUrl: '' })
    const [slide] = toPayload({ ...newEcran(), nom: 'x', diapositives: [video] }).diapositives
    expect(slide.contenu).toEqual({ videoUrl: 'https://cdn.test/v.mp4', lireJusquaFin: true })
  })
})

describe('fromApi', () => {
  it('reconstruit l\'état de l\'éditeur et complète les champs absents', () => {
    const state = fromApi({
      id: 'e1', nom: 'V', description: null, actif: true, delaiActivation: 45, transition: 'zoom',
      ordreAleatoire: false, afficherCta: true, texteCta: null, afficherLogo: false, afficherHorloge: true,
      heureDebut: null, heureFin: null,
      bornes: [{ id: 'b1', idBorne: 'B-1' }],
      diapositives: [{ id: 'd1', type: 'image', duree: 8, actif: true, titre: null, sousTitre: null, contenu: { imageUrl: 'https://cdn.test/a.jpg' }, style: null }],
    })
    expect(state.borneIds).toEqual(['b1'])
    expect(state.description).toBe('')
    expect(state.diapositives[0]._key).toBe('d1')
    expect(state.diapositives[0].contenu).toEqual({ imageUrl: 'https://cdn.test/a.jpg', ajustement: 'couvrir', effetZoom: true })
    expect(state.diapositives[0].style.position).toBe('centre')
    expect(validateEcran(state).valid).toBe(true)
  })
})

describe('utilitaires', () => {
  it('scheduleStatus situe une diapositive dans sa période', () => {
    const now = new Date('2026-09-23T12:00:00Z')
    expect(scheduleStatus({ dateDebut: '2026-09-24T00:00:00Z' }, now)).toBe('planifiee')
    expect(scheduleStatus({ dateFin: '2026-09-23T11:00:00Z' }, now)).toBe('expiree')
    expect(scheduleStatus({ dateDebut: null, dateFin: null }, now)).toBeNull()
  })

  it('isHttpsUrl n\'accepte que des URLs HTTPS valides', () => {
    expect(isHttpsUrl('https://cdn.test/a.jpg')).toBe(true)
    expect(isHttpsUrl('http://cdn.test/a.jpg')).toBe(false)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpsUrl('')).toBe(false)
  })

  it('t() retombe sur le français', () => {
    expect(t({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello')
    expect(t({ fr: 'Bonjour' }, 'es')).toBe('Bonjour')
    expect(t(null, 'fr')).toBe('')
  })
})
