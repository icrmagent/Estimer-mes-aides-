/**
 * LoginPage.test.jsx — messages d'erreur de connexion borne
 *
 * Régression couverte : `res.json()` était appelé AVANT `res.ok`. Sur une page
 * HTML 502/503 renvoyée par l'hébergeur, le parse échouait et l'exploitant lisait
 * « Erreur de connexion. Vérifiez votre réseau. » — il suspectait le Wi-Fi au lieu
 * du backend, et la tentative était comptée dans le verrouillage local.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const ATTEMPTS_KEY = 'borne_login_attempts'

/** Réponse JSON classique de l'API. */
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

/** Page HTML d'erreur d'un proxy : res.json() rejette. */
const htmlErrorResponse = (status) => ({
  ok: false,
  status,
  json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0') },
})

async function submitLogin() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
  await user.type(screen.getByPlaceholderText('admin@exemple.fr'), 'admin@exemple.fr')
  await user.type(screen.getByPlaceholderText('••••••••'), 'motdepasse')
  await user.click(screen.getByRole('button', { name: /Se connecter/i }))
}

describe('LoginPage borne — distinction des causes d\'échec', () => {
  beforeEach(() => {
    localStorage.clear()
    navigateMock.mockClear()
    window.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('401 → identifiants invalides et tentative comptée', async () => {
    window.fetch.mockResolvedValue(jsonResponse(401, { error: 'Identifiants invalides' }))

    await submitLogin()

    expect(await screen.findByText(/Identifiants invalides\. 4 tentative\(s\) restante\(s\)\./)).toBeInTheDocument()
    expect(localStorage.getItem(ATTEMPTS_KEY)).toBe('1')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('502 HTML → service indisponible, sans accuser le réseau ni compter la tentative', async () => {
    window.fetch.mockResolvedValue(htmlErrorResponse(502))

    await submitLogin()

    const message = await screen.findByText(/Service indisponible \(erreur 502\)/)
    expect(message).toBeInTheDocument()
    expect(screen.queryByText(/Vérifiez le réseau de la borne/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Identifiants invalides/)).not.toBeInTheDocument()
    // Un backend endormi ne doit pas verrouiller la borne.
    expect(localStorage.getItem(ATTEMPTS_KEY)).toBeNull()
  })

  it('503 → même famille de message que 502, statut affiché', async () => {
    window.fetch.mockResolvedValue(htmlErrorResponse(503))

    await submitLogin()

    expect(await screen.findByText(/Service indisponible \(erreur 503\)/)).toBeInTheDocument()
  })

  it('429 → trop de tentatives côté serveur', async () => {
    window.fetch.mockResolvedValue(jsonResponse(429, { error: 'Trop de tentatives' }))

    await submitLogin()

    expect(await screen.findByText(/Trop de tentatives de connexion/)).toBeInTheDocument()
    expect(localStorage.getItem(ATTEMPTS_KEY)).toBeNull()
  })

  it('panne réseau (fetch rejeté) → serveur injoignable', async () => {
    window.fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await submitLogin()

    expect(await screen.findByText(/Serveur injoignable\. Vérifiez le réseau de la borne/)).toBeInTheDocument()
    expect(localStorage.getItem(ATTEMPTS_KEY)).toBeNull()
  })

  it('200 sans token → réponse inattendue, pas de session ouverte', async () => {
    window.fetch.mockResolvedValue(jsonResponse(200, { success: true }))

    await submitLogin()

    expect(await screen.findByText(/Réponse inattendue du serveur/)).toBeInTheDocument()
    expect(localStorage.getItem('borne_token')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('200 avec token → session ouverte et redirection', async () => {
    window.fetch.mockImplementation((url) => {
      if (String(url).includes('/api/auth/login')) {
        return Promise.resolve(jsonResponse(200, { token: 'jwt-borne' }))
      }
      if (String(url).includes('/api/bornes')) {
        return Promise.resolve(jsonResponse(200, { data: [{ id: 'borne-uuid' }] }))
      }
      return Promise.resolve(jsonResponse(200, {}))
    })

    await submitLogin()

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/start', { replace: true }))
    expect(localStorage.getItem('borne_token')).toBe('jwt-borne')
  })

  it('5 échecs 401 consécutifs → verrouillage local affiché', async () => {
    localStorage.setItem(ATTEMPTS_KEY, '4')
    window.fetch.mockResolvedValue(jsonResponse(401, { error: 'Identifiants invalides' }))

    await submitLogin()

    expect(await screen.findByText(/Accès temporairement bloqué/)).toBeInTheDocument()
    expect(localStorage.getItem('borne_login_lockout')).not.toBeNull()
  })
})
