/**
 * BorneFormPage.test.jsx — fiche borne : entreprise I-CRM destinataire.
 *
 * Couvre : changement d'entreprise avec des envois en attente pour l'ancienne
 * destination → confirmation explicite (« les garder pour <ancienne> » par défaut /
 * « les envoyer vers <nouvelle> » = redirigerEnvoisEnAttente) ; sans envoi en
 * attente, pas de question ; liste des entreprises indisponible → choix verrouillé
 * et jamais envoyé (la destination actuelle n'est jamais retirée par erreur) ;
 * « Rediriger les envois » vers la destination actuelle : simulation, répartition
 * annoncée, confirmation, puis appel réel.
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
    expect(container.textContent).toContain("3 envoi(s) non livré(s) pour l'entreprise « CAE España » (dont 2 suspendu(s))")
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

// Après la suppression forcée de « Vieille » (envois gardés suspendus) et un échec
// définitif de l'ère des canaux : 3 envois ne visent pas la destination actuelle (CAE)
const ENVOIS_HORS_DESTINATION = {
  total: 6,
  horsDestination: 3,
  parEntreprise: [
    { entrepriseIcrmId: 'cae', nom: 'CAE España', actif: true, supprimee: false, total: 3, suspendus: 0, echecs: 0 },
    { entrepriseIcrmId: 'vieille', nom: 'Vieille', actif: false, supprimee: true, total: 2, suspendus: 2, echecs: 0 },
    { entrepriseIcrmId: null, nom: null, actif: null, supprimee: false, total: 1, suspendus: 0, echecs: 1 },
  ],
}
const SIMULATION = {
  borneId: 'b1',
  simulation: true,
  destinationActuelle: { type: 'entreprise_icrm', entrepriseIcrmId: 'cae', nom: 'CAE España', actif: true, supprimee: false },
  total: 3,
  depuis: [
    { type: 'entreprise_icrm', entrepriseIcrmId: 'vieille', nom: 'Vieille', supprimee: true, total: 2, suspendus: 2, echecs: 0 },
    { type: 'canal', entrepriseIcrmId: null, nom: null, total: 1, suspendus: 0, echecs: 1 },
  ],
  destinations: [{ type: 'entreprise_icrm', entrepriseIcrmId: 'cae', nom: 'CAE España', total: 3, suspendus: 0, echecs: 1 }],
}

describe('BorneFormPage — « Rediriger les envois » vers la destination actuelle', () => {
  it('annonce les envois hors destination, simule, montre la répartition, puis redirige sur confirmation', async () => {
    armer({ envoisEnAttente: ENVOIS_HORS_DESTINATION })
    api.post.mockImplementation(async (url, corps, options) => ({
      data: { success: true, data: options?.params?.simulation === 'true' ? SIMULATION : { ...SIMULATION, simulation: undefined } },
    }))
    await monter()

    const bandeau = $('[data-testid="envois-hors-destination"]')
    expect(bandeau.textContent).toContain('3 envoi(s) non livré(s)')
    expect(bandeau.textContent).toContain('2 → « Vieille » (supprimée) (2 suspendus), 1 → canaux de la borne (1 en échec définitif)')

    await cliquer($('[data-testid="rediriger-envois"]'))

    // Simulation d'abord : rien n'est écrit tant que l'opérateur n'a pas confirmé
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post.mock.calls[0]).toEqual(['/api/bornes/b1/rediriger-envois', { vers: 'destination_actuelle' }, { params: { simulation: 'true' } }])
    const repartition = $('[data-testid="redirection-repartition"]')
    expect(repartition.textContent).toContain('3 → « CAE España » (1 en échec définitif)')
    expect(container.textContent).toContain('3 envoi(s) non livré(s) : 2 → « Vieille » (supprimée) (2 suspendus), 1 → canaux de la borne (1 en échec définitif) → « CAE España »')

    await cliquer($('[data-testid="redirection-confirmer"]'))

    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.post.mock.calls[1]).toEqual(['/api/bornes/b1/rediriger-envois', { vers: 'destination_actuelle' }])
    expect($('[data-testid="redirection-confirmer"]')).toBeNull()
    expect(container.textContent).toContain('3 envoi(s) redirigé(s) : 3 → « CAE España » (1 en échec définitif).')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('annuler la confirmation : aucune redirection', async () => {
    armer({ envoisEnAttente: ENVOIS_HORS_DESTINATION })
    api.post.mockResolvedValue({ data: { success: true, data: SIMULATION } })
    await monter()
    await cliquer($('[data-testid="rediriger-envois"]'))
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annuler' && b.closest('[role="dialog"]')))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect($('[data-testid="redirection-confirmer"]')).toBeNull()
  })

  it('destination modifiée mais pas encore enregistrée : bouton désactivé (la redirection vise la destination enregistrée)', async () => {
    armer({ envoisEnAttente: ENVOIS_HORS_DESTINATION })
    await monter()
    await choisirEntreprise('lena')
    expect($('[data-testid="rediriger-envois"]').disabled).toBe(true)
    expect(container.textContent).toContain("Enregistrez d'abord la borne")
  })

  it('tous les envois visent déjà la destination actuelle : pas de bandeau', async () => {
    armer({ envoisEnAttente: ENVOIS_CAE })
    await monter()
    expect($('[data-testid="envois-hors-destination"]')).toBeNull()
  })
})
