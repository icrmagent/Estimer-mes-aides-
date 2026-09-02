/**
 * apiResponse.test.js
 *
 * Couvre :
 *  - la lecture du total paginé (`meta.total`) et le calcul des pages,
 *  - chaque branche de message d'erreur d'authentification du back-office.
 */
import { describe, it, expect } from 'vitest'
import { getMetaTotal, getTotalPages, describeAuthError } from './apiResponse.js'

// Réponse réelle de GET /api/bornes (src/backend/src/routes/bornes.js).
function bornesResponse(total, count = Math.min(total, 20)) {
  return {
    data: {
      success: true,
      data: Array.from({ length: count }, (_, i) => ({ id: `borne-${i}` })),
      meta: { page: 1, limit: 20, total },
    },
  }
}

describe('getMetaTotal', () => {
  it('lit le total sous meta.total (forme réelle de l\'API V2)', () => {
    expect(getMetaTotal(bornesResponse(45))).toBe(45)
  })

  it('accepte la forme héritée avec total à la racine', () => {
    expect(getMetaTotal({ data: { data: [], total: 7 } })).toBe(7)
  })

  it('préfère meta.total quand les deux formes coexistent', () => {
    expect(getMetaTotal({ data: { total: 0, meta: { total: 12 } } })).toBe(12)
  })

  it('renvoie le fallback si aucun total n\'est présent', () => {
    expect(getMetaTotal({ data: { data: [] } })).toBe(0)
    expect(getMetaTotal(undefined)).toBe(0)
    expect(getMetaTotal({ data: {} }, -1)).toBe(-1)
  })

  it('conserve un total de 0 sans le confondre avec une absence', () => {
    expect(getMetaTotal({ data: { meta: { total: 0 } } }, 99)).toBe(0)
  })
})

describe('getTotalPages', () => {
  it('affiche les contrôles de pagination au-delà d\'une page', () => {
    // Régression : avec res.data.total (undefined) le total tombait à 0,
    // totalPages valait 0 et le bloc `totalPages > 1` n'était jamais rendu.
    const total = getMetaTotal(bornesResponse(45))
    expect(getTotalPages(total, 20)).toBe(3)
    expect(getTotalPages(total, 20) > 1).toBe(true)
  })

  it('reste à une page quand tout tient dans la première', () => {
    expect(getTotalPages(getMetaTotal(bornesResponse(1, 1)), 20)).toBe(1)
  })

  it('renvoie 0 pour un total vide ou une limite invalide', () => {
    expect(getTotalPages(0, 20)).toBe(0)
    expect(getTotalPages(45, 0)).toBe(0)
    expect(getTotalPages(undefined, 20)).toBe(0)
  })
})

describe('describeAuthError', () => {
  const httpError = (status, data) => ({ response: { status, data } })

  it('401 → identifiants invalides', () => {
    const msg = describeAuthError(httpError(401, { error: 'Identifiants invalides' }))
    expect(msg).toMatch(/Identifiants invalides/)
    expect(msg).toMatch(/mot de passe/)
  })

  it('429 → trop de tentatives, message serveur prioritaire', () => {
    expect(describeAuthError(httpError(429, { error: 'Réessayez dans 5 minutes.' })))
      .toBe('Réessayez dans 5 minutes.')
    expect(describeAuthError(httpError(429, {}))).toMatch(/Trop de tentatives/)
  })

  it('5xx → service indisponible, jamais « identifiants invalides »', () => {
    const msg = describeAuthError(httpError(503, {}))
    expect(msg).toMatch(/Service indisponible \(erreur 503\)/)
    expect(msg).not.toMatch(/[Ii]dentifiants/)

    expect(describeAuthError(httpError(500, {}))).toMatch(/erreur 500/)
  })

  it('sans réponse HTTP (réseau/timeout) → service injoignable', () => {
    const msg = describeAuthError({ message: 'Network Error', code: 'ERR_NETWORK' })
    expect(msg).toMatch(/injoignable/)
    expect(msg).not.toMatch(/[Ii]dentifiants/)
  })

  it('400 → message de validation du backend', () => {
    expect(describeAuthError(httpError(400, { error: 'Email invalide' }))).toBe('Email invalide')
  })

  it('autre statut sans message exploitable → statut explicite', () => {
    expect(describeAuthError(httpError(418, { error: { code: 'X' } })))
      .toBe('Connexion impossible (erreur 418).')
  })

  it('produit un message distinct pour chaque cause', () => {
    const messages = [
      describeAuthError(httpError(401, {})),
      describeAuthError(httpError(429, {})),
      describeAuthError(httpError(503, {})),
      describeAuthError({ message: 'Network Error' }),
    ]
    expect(new Set(messages).size).toBe(4)
    messages.forEach((m) => expect(typeof m).toBe('string'))
  })
})
