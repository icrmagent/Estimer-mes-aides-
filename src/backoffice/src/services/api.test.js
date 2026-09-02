/**
 * api.test.js — intercepteur de réponse 401
 *
 * Régression couverte : un 401 sur /api/auth/login était traité comme une session
 * expirée. L'intercepteur purgeait le stockage et forçait `window.location.href`,
 * rechargeant la page de login avant que le message d'erreur ne soit lisible.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import api, { isAuthEndpoint } from './api.js'

const rejectedHandler = api.interceptors.response.handlers[0].rejected

function unauthorized(url) {
  return {
    config: { url, method: 'post', headers: {} },
    response: { status: 401, data: { error: 'Identifiants invalides' } },
  }
}

describe('isAuthEndpoint', () => {
  it('reconnaît les routes d\'authentification', () => {
    expect(isAuthEndpoint({ url: '/api/auth/login' })).toBe(true)
    expect(isAuthEndpoint({ url: 'http://localhost:3000/api/auth/refresh' })).toBe(true)
    expect(isAuthEndpoint({ url: '/api/auth/logout' })).toBe(true)
  })

  it('ne classe pas les routes métier comme authentification', () => {
    expect(isAuthEndpoint({ url: '/api/bornes' })).toBe(false)
    expect(isAuthEndpoint({ url: '/api/enregistrements?page=2' })).toBe(false)
    expect(isAuthEndpoint(undefined)).toBe(false)
  })
})

describe('intercepteur 401', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('ema_access_token', 'jeton-existant')
  })

  it('laisse remonter un 401 de login sans purger ni rediriger', async () => {
    const err = unauthorized('/api/auth/login')

    await expect(rejectedHandler(err)).rejects.toBe(err)

    // Le stockage intact prouve que la branche « session expirée »
    // (purge + window.location.href = '/login') n'a pas été empruntée.
    expect(localStorage.getItem('ema_access_token')).toBe('jeton-existant')
  })

  it('laisse remonter un 401 de refresh sans boucler sur le rafraîchissement', async () => {
    localStorage.setItem('ema_refresh_token', 'refresh-expire')
    const err = unauthorized('/api/auth/refresh')

    await expect(rejectedHandler(err)).rejects.toBe(err)
    expect(localStorage.getItem('ema_refresh_token')).toBe('refresh-expire')
  })

  it('propage les erreurs non-401 telles quelles', async () => {
    const err = { config: { url: '/api/bornes', method: 'get' }, response: { status: 404, data: {} } }
    await expect(rejectedHandler(err)).rejects.toBe(err)
  })
})
