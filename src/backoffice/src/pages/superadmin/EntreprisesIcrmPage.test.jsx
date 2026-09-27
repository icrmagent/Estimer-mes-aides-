/**
 * EntreprisesIcrmPage.test.jsx — page « Entreprises I-CRM » (SuperAdmin) montée dans jsdom.
 *
 * Couvre : tableau (nom, entreprise I-CRM + sous-type, URL, identifiant de clé,
 * statut de vérification, nombre de bornes, actif), « Tester » (toast avec
 * l'entreprise et le sous-type renvoyés par I-CRM, ligne mise à jour), suppression
 * refusée (409, bornes listées) puis confirmée avec désaffectation (?force=true).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
// La mise en page (menu, barre du haut) dépend du routeur et de l'authentification
vi.mock('../../components/layout/AppLayout.jsx', () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}))

const { default: api } = await import('../../services/api.js')
const { default: EntreprisesIcrmPage } = await import('./EntreprisesIcrmPage.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const LENA = {
  id: 'e1', nom: 'LENA (France)', nomIcrm: null, sousTypeIcrm: null, apiUrl: 'https://icrm.api.ila26.fr',
  apiKeyId: CLE, hasToken: true, actif: true, derniereVerification: null, dernierStatut: null, nbBornes: 2,
}

let container
let root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  api.get.mockResolvedValue({ data: { success: true, data: [LENA] } })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function monter() {
  await act(async () => { root.render(<EntreprisesIcrmPage />) })
}

const bouton = (texte) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === texte)

async function cliquer(el) {
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

describe('EntreprisesIcrmPage', () => {
  it('liste les entreprises : identifiant de clé, « Non vérifiée », nombre de bornes', async () => {
    await monter()

    expect(api.get).toHaveBeenCalledWith('/api/entreprises-icrm')
    const ligne = container.querySelector('tbody tr').textContent
    expect(ligne).toContain('LENA (France)')
    expect(ligne).toContain('(à tester)')
    expect(ligne).toContain('https://icrm.api.ila26.fr')
    expect(ligne).toContain(CLE)
    expect(ligne).toContain('Non vérifiée')
    expect(ligne).toContain('Actif')
    expect(bouton('Tester')).toBeDefined()
  })

  it('Tester : toast « Connecté à … · sous-type … » et ligne mise à jour', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 35,
        entreprise: 'LENA', subtype: { id: 23, name: 'BORNE TACTILE' },
        entrepriseIcrm: { ...LENA, nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', dernierStatut: 'ok', derniereVerification: '2026-09-27T10:00:00.000Z' },
      },
    })
    await monter()

    await cliquer(bouton('Tester'))

    expect(api.post).toHaveBeenCalledWith('/api/entreprises-icrm/e1/test')
    expect(container.textContent).toContain('Connecté à LENA · sous-type BORNE TACTILE (#23)')
    const ligne = container.querySelector('tbody tr').textContent
    expect(ligne).toContain('sous-type BORNE TACTILE')
    expect(ligne).toContain('Connectée')
  })

  it('Tester en échec (401) : toast d’erreur', async () => {
    api.post.mockResolvedValue({
      data: { success: false, type: 'icrm_api_key', httpStatus: 401, error: 'Clé API ou secret refusé par I-CRM', entrepriseIcrm: { ...LENA, dernierStatut: 'invalid_credentials' } },
    })
    await monter()
    await cliquer(bouton('Tester'))
    expect(container.textContent).toContain('Connexion impossible : Clé API ou secret refusé par I-CRM')
    expect(container.querySelector('tbody tr').textContent).toContain('Clé ou secret refusé')
  })

  it('entreprise désactivée avec des bornes : « N bornes suspendues » dans la colonne Actif', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [{ ...LENA, actif: false }] } })
    await monter()
    const ligne = container.querySelector('tbody tr').textContent
    expect(ligne).toContain('Inactif')
    expect(ligne).toContain("2 bornes suspendues tant que l'entreprise est désactivée")
  })

  it('réactivation depuis la fenêtre : toast avec le nombre d’envois suspendus relancés', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [{ ...LENA, actif: false }] } })
    api.put.mockResolvedValue({ data: { success: true, data: { ...LENA, actif: true }, jobsRepris: 4 } })
    await monter()

    await cliquer(bouton('Modifier'))
    await cliquer(container.querySelector('#entreprise-actif'))
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(api.put).toHaveBeenCalledWith('/api/entreprises-icrm/e1', expect.objectContaining({ actif: true }))
    expect(container.textContent).toContain('Entreprise I-CRM réactivée : 4 envois suspendus relancés.')
  })

  const reponse409 = {
    response: {
      status: 409,
      data: {
        success: false,
        error: {
          code: 'ENTREPRISE_ICRM_EN_USAGE',
          message: "L'entreprise « LENA (France) » est la destination de 2 bornes et de 5 envois pas encore livrés.",
          details: { bornes: [{ id: 'b1', idBorne: 'BORNE-A' }, { id: 'b2', idBorne: 'BORNE-B' }], envoisEnAttente: 5 },
        },
      },
    },
  }

  async function ouvrirChoixSuppression() {
    await monter()
    await cliquer(bouton('Supprimer'))
    expect(container.textContent).toContain("Supprimer l'entreprise I-CRM")
    await cliquer([...container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Supprimer').pop())
    expect(api.delete).toHaveBeenNthCalledWith(1, '/api/entreprises-icrm/e1', undefined)
    expect(container.textContent).toContain('Bornes désaffectées : BORNE-A, BORNE-B.')
    expect(container.textContent).toContain('5 envoi(s) pas encore livré(s)')
  }

  it('Supprimer : 409 → choix explicite ; « garder les envois suspendus » (recommandé) → DELETE ?force=true', async () => {
    api.delete
      .mockRejectedValueOnce(reponse409)
      .mockResolvedValueOnce({ data: { success: true, data: { id: 'e1', bornesDesaffectees: 2, envoisRediriges: 0, envoisSuspendus: 5 } } })
    await ouvrirChoixSuppression()

    await cliquer(container.querySelector('[data-testid="suppression-garder"]'))

    expect(api.delete).toHaveBeenNthCalledWith(2, '/api/entreprises-icrm/e1', { params: { force: 'true' } })
    expect(container.textContent).toContain('2 bornes repassées sur leurs canaux')
    expect(container.textContent).toContain('5 envoi(s) gardé(s) suspendu(s)')
  })

  it('Supprimer : 409 → « envoyer vers les canaux » → DELETE ?force=true&redirigerEnvoisEnAttente=true', async () => {
    api.delete
      .mockRejectedValueOnce(reponse409)
      .mockResolvedValueOnce({ data: { success: true, data: { id: 'e1', bornesDesaffectees: 2, envoisRediriges: 5, envoisSuspendus: 0 } } })
    await ouvrirChoixSuppression()

    await cliquer(container.querySelector('[data-testid="suppression-rediriger"]'))

    expect(api.delete).toHaveBeenNthCalledWith(2, '/api/entreprises-icrm/e1', { params: { force: 'true', redirigerEnvoisEnAttente: 'true' } })
    expect(container.textContent).toContain('5 envoi(s) redirigé(s) vers les canaux')
  })

  it('envois suspendus affichés dans la colonne Actif', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [{ ...LENA, actif: false, nbEnvoisSuspendus: 12 }] } })
    await monter()
    expect(container.querySelector('[data-testid="envois-suspendus"]').textContent).toContain('12 envois suspendus')
  })

  it('Tester : résultat non enregistré (identifiants modifiés pendant le ping) → toast d’avertissement', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 20, entreprise: 'LENA', persiste: false,
        avertissement: 'Les identifiants ont été modifiés pendant le test : résultat non enregistré, relancez le test.',
        entrepriseIcrm: LENA,
      },
    })
    await monter()
    await cliquer(bouton('Tester'))
    expect(container.textContent).toContain('résultat non enregistré, relancez le test')
  })

  it('Tester : succès qui reprend des envois suspendus → toast avec le nombre relancé', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 20, entreprise: 'LENA', subtype: { id: 23, name: 'BORNE TACTILE' },
        persiste: true, jobsRepris: 3, entrepriseIcrm: { ...LENA, dernierStatut: 'ok' },
      },
    })
    await monter()
    await cliquer(bouton('Tester'))
    expect(container.textContent).toContain('3 envoi(s) suspendu(s) relancé(s)')
  })

  it('réactivation refusée faute de test réussi : toast « testez l’entreprise »', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [{ ...LENA, actif: false }] } })
    api.put.mockResolvedValue({
      data: { success: true, data: { ...LENA, actif: true }, jobsRepris: 0, avertissement: "Testez l'entreprise pour reprendre les envois." },
    })
    await monter()
    await cliquer(bouton('Modifier'))
    await cliquer(container.querySelector('#entreprise-actif'))
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(container.textContent).toContain("Testez l'entreprise pour reprendre les envois.")
  })
})
