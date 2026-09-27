/**
 * EntrepriseIcrmModal.test.jsx — fenêtre « Entreprise I-CRM » montée dans jsdom
 * (react-dom/client + act, comme CanalConfigModal.test.jsx).
 *
 * Couvre : champs (placeholder https://icrm.api.ila26.fr, secret masqué +
 * afficher/masquer), validation avant appel API, requêtes de création et
 * d'édition (secret en écriture seule), nouvelle clé → secret obligatoire,
 * message d'erreur du backend.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const { default: api } = await import('../../services/api.js')
const { default: EntrepriseIcrmModal } = await import('./EntrepriseIcrmModal.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'

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

async function monter(props = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  await act(async () => {
    root.render(<EntrepriseIcrmModal isOpen onSave={onSave} onClose={onClose} {...props} />)
  })
  return { onSave, onClose }
}

const $ = (sel) => container.querySelector(sel)

async function changer(sel, valeur) {
  await act(async () => {
    const el = $(sel)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valeur)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function cocher(sel) {
  await act(async () => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

async function soumettre() {
  await act(async () => {
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

const alerte = () => container.querySelector('[role="alert"]')?.textContent

describe('EntrepriseIcrmModal — création', () => {
  it('fermée : ne rend rien', async () => {
    await act(async () => { root.render(<EntrepriseIcrmModal isOpen={false} />) })
    expect(container.innerHTML).toBe('')
  })

  it('affiche les champs, URL d’exemple FR, secret masqué avec afficher/masquer', async () => {
    await monter()

    expect($('h2').textContent).toBe('Nouvelle entreprise I-CRM')
    const libelles = [...container.querySelectorAll('label')].map((l) => l.textContent)
    expect(libelles).toEqual(expect.arrayContaining(['Nom', 'URL API I-CRM', 'Clé API (X-Api-Key)', 'Secret (X-Api-Secret)', 'Entreprise active']))
    expect($('#entreprise-url').getAttribute('placeholder')).toBe('https://icrm.api.ila26.fr')
    expect(container.textContent).toContain('https://icrm.api.es.ila26.com')
    expect($('#entreprise-secret').getAttribute('type')).toBe('password')
    expect($('#entreprise-actif').checked).toBe(true)

    await cocher('button[aria-label="Afficher le secret"]')
    expect($('#entreprise-secret').getAttribute('type')).toBe('text')
    await cocher('button[aria-label="Masquer le secret"]')
    expect($('#entreprise-secret').getAttribute('type')).toBe('password')
  })

  it('envoie nom, URL, clé, secret et actif puis ferme', async () => {
    const creee = { id: 'e1', nom: 'LENA (France)', apiKeyId: CLE, hasToken: true }
    api.post.mockResolvedValue({ data: { success: true, data: creee } })
    const { onSave, onClose } = await monter()

    await changer('#entreprise-nom', 'LENA (France)')
    await changer('#entreprise-url', 'https://icrm.api.ila26.fr')
    await changer('#entreprise-cle-api', CLE)
    await changer('#entreprise-secret', SECRET)
    await soumettre()

    expect(api.post).toHaveBeenCalledWith('/api/entreprises-icrm', {
      nom: 'LENA (France)', apiUrl: 'https://icrm.api.ila26.fr', actif: true, apiKey: CLE, token: SECRET,
    })
    expect(onSave).toHaveBeenCalledWith(creee, { success: true, data: creee })
    expect(onClose).toHaveBeenCalled()
  })

  it('refuse une saisie invalide sans appeler l’API', async () => {
    await monter()
    await changer('#entreprise-nom', 'LENA')
    await changer('#entreprise-url', 'http://icrm.api.ila26.fr')
    await changer('#entreprise-cle-api', CLE)
    await changer('#entreprise-secret', SECRET)
    await soumettre()
    expect(alerte()).toMatch(/https:\/\//)

    await changer('#entreprise-url', 'https://icrm.api.ila26.fr')
    await changer('#entreprise-secret', 'court')
    await soumettre()
    expect(alerte()).toMatch(/48 caractères/)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('affiche le message d’erreur du backend (ex. nom déjà pris)', async () => {
    api.post.mockRejectedValue({
      response: { status: 409, data: { success: false, error: { code: 'DUPLICATE', message: 'Une entreprise I-CRM porte déjà ce nom' } } },
    })
    const { onClose } = await monter()
    await changer('#entreprise-nom', 'LENA')
    await changer('#entreprise-url', 'https://icrm.api.ila26.fr')
    await changer('#entreprise-cle-api', CLE)
    await changer('#entreprise-secret', SECRET)
    await soumettre()

    expect(alerte()).toBe('Une entreprise I-CRM porte déjà ce nom')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('EntrepriseIcrmModal — édition', () => {
  const entreprise = {
    id: 'e1', nom: 'LENA (France)', apiUrl: 'https://icrm.api.ila26.fr', apiKeyId: CLE, hasToken: true, actif: true,
  }

  it('pré-remplit l’identifiant de clé (public), jamais le secret', async () => {
    await monter({ initialEntreprise: entreprise })
    expect($('h2').textContent).toBe("Modifier l'entreprise I-CRM")
    expect($('#entreprise-cle-api').value).toBe(CLE)
    expect($('#entreprise-secret').value).toBe('')
    expect($('label[for="entreprise-secret"]').textContent).toContain('laisser vide pour ne pas changer')
  })

  it('n’envoie ni la clé inchangée ni le secret vide ; désactivation envoyée', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: entreprise } })
    await monter({ initialEntreprise: entreprise })
    await changer('#entreprise-nom', 'LENA')
    await cocher('#entreprise-actif')
    const avertissement = $('[data-testid="entreprise-desactivation"]').textContent
    expect(avertissement).toContain('envois de ses bornes sont suspendus')
    expect(avertissement).toContain('aucun envoi vers leurs canaux')
    expect(avertissement).not.toMatch(/repassent sur leurs canaux/)
    await soumettre()

    expect(api.put).toHaveBeenCalledWith('/api/entreprises-icrm/e1', {
      nom: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', actif: false,
    })
  })

  it('désactiver une entreprise qui a des bornes : « N borne(s) suspendue(s) tant que l’entreprise est désactivée »', async () => {
    await monter({ initialEntreprise: { ...entreprise, nbBornes: 3 } })
    expect($('[data-testid="entreprise-desactivation"]')).toBeNull()

    await cocher('#entreprise-actif')
    expect($('[data-testid="entreprise-desactivation"]').textContent)
      .toContain("3 bornes suspendues tant que l'entreprise est désactivée")

    await cocher('#entreprise-actif')
    expect($('[data-testid="entreprise-desactivation"]')).toBeNull()
  })

  it('désactivation d’une entreprise sans borne : pas de compte de bornes suspendues', async () => {
    await monter({ initialEntreprise: { ...entreprise, nbBornes: 0 } })
    await cocher('#entreprise-actif')
    expect($('[data-testid="entreprise-desactivation"]').textContent).not.toMatch(/bornes? suspendue/)
  })

  it('nouvelle clé : le secret devient obligatoire, puis clé + secret envoyés', async () => {
    const autre = 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ'
    api.put.mockResolvedValue({ data: { success: true, data: entreprise } })
    await monter({ initialEntreprise: entreprise })
    expect($('[data-testid="entreprise-secret-nouvelle-cle"]')).toBeNull()

    await changer('#entreprise-cle-api', autre)
    expect($('[data-testid="entreprise-secret-nouvelle-cle"]')).not.toBeNull()
    expect($('label[for="entreprise-secret"]').textContent).not.toContain('laisser vide')

    await soumettre()
    expect(alerte()).toMatch(/Nouvelle clé API/)
    expect(api.put).not.toHaveBeenCalled()

    await changer('#entreprise-secret', SECRET)
    await soumettre()
    expect(api.put).toHaveBeenCalledWith('/api/entreprises-icrm/e1', expect.objectContaining({ apiKey: autre, token: SECRET }))
  })
})
