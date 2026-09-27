/**
 * PartageJobsPage.test.jsx — « Mettre en file d'attente » (Partage I-CRM).
 *
 * Couvre : la répartition par destination est demandée au serveur AVANT toute
 * écriture (`?simulation=true`) et affichée dans la confirmation (« 2 → « LENA »,
 * 1 → « CAE España » (1 suspendu) ») ; jamais une seule destination annoncée quand
 * plusieurs s'appliquent ; option « tout envoyer vers la destination actuelle »
 * (redirigerEnvoisEnAttente) avec sa propre répartition ; rien à transmettre →
 * pas de confirmation ; refus du serveur → bandeau d'erreur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/pusher.js', () => ({ subscribeToBorne: () => () => {} }))
vi.mock('../../components/layout/AppLayout.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

const { default: api } = await import('../../services/api.js')
const { default: PartageJobsPage } = await import('./PartageJobsPage.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LENA = { id: 'lena', nom: 'LENA', nomIcrm: 'LENA', actif: true, verificationRequise: false }
const BORNE = { id: 'b1', idBorne: 'BORNE-A', adresse: '1 rue A', canalTransmission: null, entrepriseIcrmId: 'lena', entrepriseIcrm: LENA }
const DEST_LENA = { type: 'entreprise_icrm', entrepriseIcrmId: 'lena', nom: 'LENA', actif: true, supprimee: false }
const DEST_CAE = { type: 'entreprise_icrm', entrepriseIcrmId: 'cae', nom: 'CAE España', actif: false, supprimee: false }

const SIMULATION_DEUX = {
  simulation: true,
  borneId: 'b1',
  destinationActuelle: DEST_LENA,
  destination: null,
  destinations: [
    { ...DEST_CAE, total: 1, suspendus: 1, echecs: 0 },
    { ...DEST_LENA, total: 2, suspendus: 0, echecs: 0 },
  ],
  queued: 3,
  created: 1,
  relaunched: 2,
  suspendus: 1,
  jobsRecibles: 1,
  autresCibles: 1,
}
const SIMULATION_REDIRECTION = {
  ...SIMULATION_DEUX,
  destination: { ...DEST_LENA, total: 3, suspendus: 0, echecs: 0 },
  destinations: [{ ...DEST_LENA, total: 3, suspendus: 0, echecs: 0 }],
  suspendus: 0,
  autresCibles: 0,
}

let container
let root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  api.get.mockImplementation(async (url) => {
    if (url === '/api/bornes') return { data: { success: true, data: [BORNE] } }
    if (url === '/api/canaux') return { data: [] }
    if (url === '/api/partage/stats') return { data: { success: true, data: { byStatut: {} } } }
    return { data: { success: true, data: [], meta: { total: 0 } } }
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function monter() {
  await act(async () => { root.render(<PartageJobsPage />) })
  await act(async () => { await Promise.resolve() })
}

const $ = (sel) => container.querySelector(sel)
const boutonLancer = () => $('[aria-label="Mettre les enregistrements en file d\'attente pour transmission"]')

async function cliquer(el) {
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

/** api.post : simulations selon le corps, puis l'appel réel. */
function armerLancer({ simulation = SIMULATION_DEUX, redirection = SIMULATION_REDIRECTION, reel } = {}) {
  api.post.mockImplementation(async (url, corps, options) => {
    if (options?.params?.simulation === 'true') {
      return { data: { success: true, data: corps?.redirigerEnvoisEnAttente ? redirection : simulation } }
    }
    const base = corps?.redirigerEnvoisEnAttente ? redirection : simulation
    return { data: { success: true, data: reel ?? { ...base, simulation: undefined } } }
  })
}

describe('PartageJobsPage — « Mettre en file » avec la répartition par destination', () => {
  it('simulation d’abord, répartition affichée (jamais une seule destination), puis mise en file sur confirmation', async () => {
    armerLancer()
    await monter()

    await cliquer(boutonLancer())

    // Deux simulations (normale + « tout rediriger »), aucune écriture
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.post.mock.calls[0]).toEqual(['/api/partage/bornes/b1/lancer', {}, { params: { simulation: 'true' } }])
    expect(api.post.mock.calls[1]).toEqual(['/api/partage/bornes/b1/lancer', { redirigerEnvoisEnAttente: true }, { params: { simulation: 'true' } }])

    expect(container.textContent).toContain('3 enregistrement(s) non partagé(s) de cette borne, par destination : 1 → « CAE España » (1 suspendu), 2 → « LENA »')
    expect($('[data-testid="lancer-repartition"]').textContent).toContain('Plusieurs destinations : 1 envoi(s) gardent l\'entreprise choisie à leur création')
    expect($('[data-testid="lancer-repartition"]').textContent).toContain('1 envoi(s) seront mis en file au statut « Suspendu »')
    expect($('[data-testid="lancer-confirmer"]').textContent).toBe('Mettre en file : 1 → « CAE España » (1 suspendu), 2 → « LENA »')
    expect($('[data-testid="lancer-rediriger"]').textContent).toBe('Tout envoyer vers « LENA » : 3 → « LENA »')

    await cliquer($('[data-testid="lancer-confirmer"]'))

    expect(api.post).toHaveBeenCalledTimes(3)
    expect(api.post.mock.calls[2]).toEqual(['/api/partage/bornes/b1/lancer', {}])
    expect($('[data-testid="lancer-confirmer"]')).toBeNull()
    expect(container.textContent).toContain('3 enregistrement(s) mis en file : 1 → « CAE España » (1 suspendu), 2 → « LENA » — 1 envoi(s) suspendu(s)')
  })

  it('« tout envoyer vers la destination actuelle » : redirigerEnvoisEnAttente envoyé', async () => {
    armerLancer()
    await monter()
    await cliquer(boutonLancer())
    await cliquer($('[data-testid="lancer-rediriger"]'))

    expect(api.post.mock.calls[2]).toEqual(['/api/partage/bornes/b1/lancer', { redirigerEnvoisEnAttente: true }])
    expect(container.textContent).toContain('3 enregistrement(s) mis en file : 3 → « LENA ». Worker actif toutes les 30s.')
  })

  it('une seule destination : une seule simulation, pas d’option de redirection', async () => {
    armerLancer({ simulation: { ...SIMULATION_REDIRECTION } })
    await monter()
    await cliquer(boutonLancer())

    expect(api.post).toHaveBeenCalledTimes(1)
    expect($('[data-testid="lancer-confirmer"]').textContent).toBe('Mettre en file : 3 → « LENA »')
    expect($('[data-testid="lancer-rediriger"]')).toBeNull()
    expect($('[data-testid="lancer-repartition"]').textContent).not.toContain('Plusieurs destinations')
  })

  it('rien à transmettre : pas de confirmation, message', async () => {
    armerLancer({ simulation: { ...SIMULATION_REDIRECTION, queued: 0, destinations: [] } })
    await monter()
    await cliquer(boutonLancer())
    expect($('[data-testid="lancer-confirmer"]')).toBeNull()
    expect(container.textContent).toContain('Aucun enregistrement non partagé à mettre en file pour cette borne.')
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('refus du serveur pendant la simulation : bandeau d’erreur, aucune écriture', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { code: 'NO_ACTIVE_CHANNEL', message: 'Aucun canal I-CRM actif' } } } })
    await monter()
    await cliquer(boutonLancer())
    expect(container.textContent).toContain('Aucun canal I-CRM actif')
    expect($('[data-testid="lancer-confirmer"]')).toBeNull()
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('annuler : rien n’est mis en file', async () => {
    armerLancer()
    await monter()
    await cliquer(boutonLancer())
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annuler' && b.closest('[role="dialog"]')))
    expect(api.post).toHaveBeenCalledTimes(2)
    expect($('[data-testid="lancer-confirmer"]')).toBeNull()
  })
})
