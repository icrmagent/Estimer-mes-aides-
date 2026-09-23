import { describe, it, expect } from 'vitest'
import { isWithinPlage, playableSlides, slideDuration, canShowEcranVeille, collectMediaUrls } from './ecranVeille.js'

const at = (hh, mm = 0) => new Date(2026, 8, 23, hh, mm)

describe('isWithinPlage', () => {
  it('sans plage, toujours vrai', () => {
    expect(isWithinPlage({ heureDebut: null, heureFin: null }, at(3))).toBe(true)
  })

  it('plage de jour : début inclus, fin exclue', () => {
    const ecran = { heureDebut: '08:00', heureFin: '20:00' }
    expect(isWithinPlage(ecran, at(7, 59))).toBe(false)
    expect(isWithinPlage(ecran, at(8, 0))).toBe(true)
    expect(isWithinPlage(ecran, at(19, 59))).toBe(true)
    expect(isWithinPlage(ecran, at(20, 0))).toBe(false)
  })

  it('plage de nuit franchissant minuit', () => {
    const ecran = { heureDebut: '20:00', heureFin: '08:00' }
    expect(isWithinPlage(ecran, at(22))).toBe(true)
    expect(isWithinPlage(ecran, at(3))).toBe(true)
    expect(isWithinPlage(ecran, at(12))).toBe(false)
  })
})

describe('playableSlides', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  it('écarte les diapositives hors période ou inactives', () => {
    const slides = [
      { id: 'a' },
      { id: 'b', dateDebut: '2026-10-01T00:00:00Z' },
      { id: 'c', dateFin: '2026-09-01T00:00:00Z' },
      { id: 'd', actif: false },
      { id: 'e', dateDebut: '2026-09-01T00:00:00Z', dateFin: '2026-10-01T00:00:00Z' },
    ]
    expect(playableSlides(slides, now).map((s) => s.id)).toEqual(['a', 'e'])
  })
})

describe('canShowEcranVeille', () => {
  it('faux sans écran, hors plage ou sans diapositive diffusable', () => {
    const slide = { id: 'a', type: 'texte', duree: 6 }
    expect(canShowEcranVeille(null, at(10))).toBe(false)
    expect(canShowEcranVeille({ diapositives: [] }, at(10))).toBe(false)
    expect(canShowEcranVeille({ heureDebut: '12:00', heureFin: '14:00', diapositives: [slide] }, at(10))).toBe(false)
    expect(canShowEcranVeille({ diapositives: [slide] }, at(10))).toBe(true)
  })
})

describe('slideDuration', () => {
  it('galerie = photos × durée par photo', () => {
    expect(slideDuration({ type: 'galerie', duree: 99, contenu: { images: ['1', '2', '3'], dureeParImage: 5 } })).toBe(15)
    expect(slideDuration({ type: 'image', duree: 7 })).toBe(7)
  })
})

describe('collectMediaUrls', () => {
  it('rassemble les médias HTTPS sans doublon', () => {
    const urls = collectMediaUrls({
      diapositives: [
        { type: 'texte', contenu: { fond: { type: 'image', imageUrl: 'https://cdn/fond.jpg' } } },
        { type: 'texte', contenu: { fond: { type: 'couleur', couleur: '#000', imageUrl: 'https://cdn/ignore.jpg' } } },
        { type: 'image', contenu: { imageUrl: 'https://cdn/a.jpg' } },
        { type: 'galerie', contenu: { images: ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'http://cdn/c.jpg'] } },
        { type: 'video', contenu: { videoUrl: 'https://cdn/v.mp4', posterUrl: 'https://cdn/p.jpg' } },
      ],
    })
    expect(urls).toEqual(['https://cdn/fond.jpg', 'https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/v.mp4', 'https://cdn/p.jpg'])
  })
})
