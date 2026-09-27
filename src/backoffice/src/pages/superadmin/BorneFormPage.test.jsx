/**
 * BorneFormPage.test.jsx — fiche borne : entreprise I-CRM destinataire.
 *
 * Couvre : changement d'entreprise avec des envois en attente pour l'ancienne
 * destination → confirmation explicite (« les garder pour <ancienne> » par défaut /
 * « les envoyer vers <nouvelle> » = redirigerEnvoisEnAttente) ; sans envoi en
 * attente, pas de question ; liste des entreprises indisponible → choix verrouillé
 * et jamais envoyé (la destination actuelle n'est jamais retirée par erreur).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'b1' }), useNavigate: () => navigate }))
vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../components/layout/AppLayout.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))
vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { role: 'SUPER_ADMIN' } }),
}))

const { default: api } = await import('../../services/api.js')
const { default: BorneFormPage } = await import('./BorneFormPage.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CAE = { id: 'cae', nom: 'CAE España', nomIcrm: 'CAE España', sousTypeIcrm: 'BORNE TACTILE', actif: true }
const LENA = { id: 'lena', nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', actif: true }

function borne(envoisEnAttente) {
  return {
    id: 'b1', idBorne: 'BORNE-ES-01', langueDefaut: 'es', pays: 'ES', adresse: 'CALLE MAYOR 1',
    entrepriseIcrmId: 'cae', entrepriseIcrm: CAE, envoisEnAttente,
  }
}

function armer({ envoisEnAttente = null, echecEntreprises = false } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/api/entreprises-icrm') {
      if (echecEntreprises) throw new Error('réseau')
      return { data: { success: true, data: [CAE, LENA] } }
    }
    if (url === '/api/bornes/b1') return { data: { success: true, data: borne(envoisEnAttente) } }
    return { data: { data: [] } }
  })
  api.put.mockResolvedValue({ data: { success: true } })
}

let container
let root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function monter() {
  await act(async () => { root.render(<BorneFormPage />) })
  await act(async () => { await Promise.resolve() })
}

const $ = (sel) => container.querySelector(sel)

async function choisirEntreprise(id) {
  await act(async () => {
    const select = $('#borne-entreprise-icrm')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, id)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function soumettre() {
  await act(async () => {
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

async function cliquer(el) {
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

const ENVOIS_CAE = { total: 3, parEntreprise: [{ entrepriseIcrmId: 'cae', nom: 'CAE España', actif: true, supprimee: false, total: 3, suspendus: 2 }] }

describe('BorneFormPage — changement d’entreprise I-CRM et envois en attente', () => {
  it('envois en attente pour l’ancienne entreprise : confirmation, « les garder » (recommandé) par défaut', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    expect($('#borne-entreprise-icrm').value).toBe('cae')

    await choisirEntreprise('lena')
    await soumettre()

    expect(api.put).not.toHaveBeenCalled()
    expect(container.textContent).toContain("3 envoi(s) en attente pour l'entreprise « CAE España » (dont 2 suspendu(s))")
    expect($('[data-testid="envois-garder"]').textContent).toContain("Les garder pour l'entreprise « CAE España » (recommandé)")
    expect($('[data-testid="envois-rediriger"]').textContent).toContain("Les envoyer vers l'entreprise « LENA (France) »")

    await cliquer($('[data-testid="envois-garder"]'))

    expect(api.put).toHaveBeenCalledTimes(1)
    const [url, corps] = api.put.mock.calls[0]
    expect(url).toBe('/api/bornes/b1')
    expect(corps).toMatchObject({ entrepriseIcrmId: 'lena' })
    expect(corps).not.toHaveProperty('redirigerEnvoisEnAttente')
    expect(navigate).toHaveBeenCalledWith('/superadmin/bornes')
  })

  it('« les envoyer vers la nouvelle » : redirigerEnvoisEnAttente envoyé', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    await choisirEntreprise('lena')
    await soumettre()
    await cliquer($('[data-testid="envois-rediriger"]'))

    expect(api.put.mock.calls[0][1]).toMatchObject({ entrepriseIcrmId: 'lena', redirigerEnvoisEnAttente: true })
  })

  it('vers « Aucune » : la nouvelle destination annoncée est « les canaux de la borne »', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    await choisirEntreprise('')
    await soumettre()
    expect($('[data-testid="envois-rediriger"]').textContent).toContain('Les envoyer vers les canaux de la borne')
  })

  it('annuler la confirmation : rien n’est envoyé', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    await choisirEntreprise('lena')
    await soumettre()
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annuler' && b.closest('[role="dialog"]')))
    expect(api.put).not.toHaveBeenCalled()
    expect($('[data-testid="envois-garder"]')).toBeNull()
  })

  it('aucun envoi en attente pour l’ancienne entreprise : enregistrement direct, sans question', async () => {
    armer({ envoisEnAttente: { total: 1, parEntreprise: [{ entrepriseIcrmId: null, total: 1, suspendus: 0, supprimee: false }] } })
    await monter()
    await choisirEntreprise('lena')
    await soumettre()
    expect($('[data-testid="envois-garder"]')).toBeNull()
    expect(api.put.mock.calls[0][1]).toMatchObject({ entrepriseIcrmId: 'lena' })
  })

  it('destination inchangée : ni question ni entrepriseIcrmId envoyé', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    await soumettre()
    expect($('[data-testid="envois-garder"]')).toBeNull()
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('entrepriseIcrmId')
  })

  it('liste des entreprises indisponible : choix verrouillé, message, destination jamais envoyée', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE, echecEntreprises: true })
    await monter()
    const select = $('#borne-entreprise-icrm')
    expect(select.disabled).toBe(true)
    expect(select.options[select.selectedIndex].textContent).not.toMatch(/désactivée/)
    expect(container.textContent).toContain('Impossible de charger les entreprises I-CRM')
    await soumettre()
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('entrepriseIcrmId')
  })
})
