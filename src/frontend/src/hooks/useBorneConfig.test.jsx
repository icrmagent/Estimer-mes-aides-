/**
 * useBorneConfig.test.jsx — réveil à froid de l'API
 *
 * Régression couverte : le fetch de configuration n'avait ni AbortController ni
 * timeout. L'hébergement free met l'API en veille après 15 min et répond en ~50 s :
 * la borne restait figée sur un écran de chargement muet, sans issue si l'API ne
 * répondait jamais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { BorneContext } from '../context/BorneContext.jsx'
import { useBorneConfig } from './useBorneConfig.js'

const BORNE_ID = 'borne-uuid-1'
const API = 'https://api.test'
const CACHE_KEY = `ema_borne_config_${BORNE_ID}`

const CONFIG = {
  borne: { id: BORNE_ID, idBorne: 'B-001', langueDefaut: 'fr' },
  formulaire: { id: 'form-1', label: 'Démo', questions: [] },
}

function Probe() {
  const { loading, loadError, wakingUp } = useBorneConfig(BORNE_ID, API)
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="waking">{String(wakingUp)}</span>
      <span data-testid="error">{loadError || ''}</span>
    </div>
  )
}

let setConfig
let setError

function renderProbe() {
  return render(
    <BorneContext.Provider value={{ setConfig, setError }}>
      <Probe />
    </BorneContext.Provider>
  )
}

/** fetch qui ne répond jamais et rejette avec AbortError à l'abandon du signal. */
function pendingFetch() {
  return vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.')
      err.name = 'AbortError'
      reject(err)
    })
  }))
}

describe('useBorneConfig — réveil à froid', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('borne_token', 'jwt-borne')
    setConfig = vi.fn()
    setError = vi.fn()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('signale le réveil du serveur quand la réponse tarde', async () => {
    window.fetch = pendingFetch()
    renderProbe()

    // Avant le seuil : chargement ordinaire, aucune alerte prématurée.
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(screen.getByTestId('waking').textContent).toBe('false')
    expect(screen.getByTestId('loading').textContent).toBe('true')

    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByTestId('waking').textContent).toBe('true')
    expect(screen.getByTestId('loading').textContent).toBe('true')
  })

  it('abandonne la requête après le timeout et explique le délai dépassé', async () => {
    window.fetch = pendingFetch()
    renderProbe()

    await act(async () => { vi.advanceTimersByTime(59_000) })
    expect(screen.getByTestId('loading').textContent).toBe('true')

    await act(async () => { vi.advanceTimersByTime(2_000) })

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('error').textContent).toMatch(/délai dépassé/)
    expect(screen.getByTestId('waking').textContent).toBe('false')
    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/délai dépassé/))
    expect(window.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('retombe sur le cache expiré plutôt que sur une erreur quand l\'API abandonne', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: CONFIG,
      timestamp: Date.now() - 48 * 60 * 60 * 1000, // cache périmé (TTL 24h)
    }))
    window.fetch = pendingFetch()
    renderProbe()

    await act(async () => { vi.advanceTimersByTime(61_000) })

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(setConfig).toHaveBeenCalledWith(CONFIG.borne, CONFIG.formulaire)
    expect(screen.getByTestId('error').textContent).toMatch(/Mode hors ligne/)
  })

  it('sert le cache TTL 24h sans attendre l\'API (mitigation préservée)', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: CONFIG,
      timestamp: Date.now() - 60_000,
    }))
    window.fetch = pendingFetch()
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(setConfig).toHaveBeenCalledWith(CONFIG.borne, CONFIG.formulaire)
    expect(screen.getByTestId('waking').textContent).toBe('false')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('charge et met en cache la configuration quand l\'API répond', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: CONFIG }),
    })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(setConfig).toHaveBeenCalledWith(CONFIG.borne, CONFIG.formulaire)
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).data).toEqual(CONFIG)
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('abandonne la requête en cours au démontage', async () => {
    window.fetch = pendingFetch()
    const { unmount } = renderProbe()

    await act(async () => { vi.advanceTimersByTime(100) })
    const signal = window.fetch.mock.calls[0][1].signal
    expect(signal.aborted).toBe(false)

    unmount()
    expect(signal.aborted).toBe(true)
  })
})
