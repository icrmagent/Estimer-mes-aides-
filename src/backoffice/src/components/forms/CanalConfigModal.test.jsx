/**
 * CanalConfigModal.test.jsx — formulaire « canal I-CRM » monté dans jsdom
 * (react-dom/client + act, sans dépendance de test supplémentaire).
 *
 * Couvre : sélecteur « Type d'authentification », champs propres à la clé API
 * (clé X-Api-Key, secret masqué avec afficher/masquer), champs Azure masqués,
 * requêtes envoyées en création / édition, résultat du test de connexion.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const { default: api } = await import('../../services/api.js')
const { default: CanalConfigModal } = await import('./CanalConfigModal.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const BORNE = { id: '33333333-3333-4333-8333-333333333333', idBorne: 'BORNE-LENA-01', adresse: '1 rue A' }

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
    root.render(
      <CanalConfigModal isOpen borneId={BORNE.id} bornes={[BORNE]} onSave={onSave} onClose={onClose} {...props} />
    )
  })
  return { onSave, onClose }
}

const $ = (sel) => container.querySelector(sel)

function saisir(el, valeur) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valeur)
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}

async function changer(sel, valeur) {
  await act(async () => saisir($(sel), valeur))
}

async function soumettre() {
  await act(async () => {
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

async function cliquer(el) {
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

const libelles = () => [...container.querySelectorAll('label')].map((l) => l.textContent)

describe('CanalConfigModal — création', () => {
  it('propose « Clé API I-CRM (recommandé) » par défaut et masque les champs Azure', async () => {
    await monter()

    const select = $('#canal-type')
    expect(select.value).toBe('icrm_api_key')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Clé API I-CRM (recommandé)', 'Azure AD (ancien)'])
    expect(libelles()).toEqual(expect.arrayContaining(['Clé API (X-Api-Key)', 'Secret (X-Api-Secret)']))
    expect($('#canal-refresh')).toBeNull()
    expect($('#canal-token')).toBeNull()
    expect($('#canal-url').getAttribute('placeholder')).toBe('https://icrm.api.ila26.fr')
    expect($('#canal-secret').getAttribute('type')).toBe('password')
  })

  it('le bouton œil affiche puis masque le secret', async () => {
    await monter()
    const oeil = container.querySelector('button[aria-label="Afficher le secret"]')
    await cliquer(oeil)
    expect($('#canal-secret').getAttribute('type')).toBe('text')
    await cliquer(container.querySelector('button[aria-label="Masquer le secret"]'))
    expect($('#canal-secret').getAttribute('type')).toBe('password')
  })

  it('envoie type, clé et secret puis affecte la borne', async () => {
    api.post.mockResolvedValue({ data: { id: 'c1', type: 'icrm_api_key', apiKeyId: CLE } })
    api.put.mockResolvedValue({ data: {} })
    const { onSave, onClose } = await monter()

    await changer('#canal-label', 'icrm-lena-prod')
    await changer('#canal-url', 'https://icrm.api.ila26.fr')
    await changer('#canal-cle-api', CLE)
    await changer('#canal-secret', SECRET)
    await soumettre()

    expect(api.post).toHaveBeenCalledWith('/api/canaux', {
      type: 'icrm_api_key',
      label: 'icrm-lena-prod',
      apiUrl: 'https://icrm.api.ila26.fr',
      apiKey: CLE,
      token: SECRET,
      actif: true,
      borneId: BORNE.id,
    })
    expect(api.put).toHaveBeenCalledWith(`/api/partage/bornes/${BORNE.id}/canal`, { canalTransmission: 'icrm-lena-prod' })
    expect(onSave).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('refuse une clé au mauvais format sans appeler l’API', async () => {
    await monter()
    await changer('#canal-label', 'lena')
    await changer('#canal-url', 'https://icrm.api.ila26.fr')
    await changer('#canal-cle-api', 'pas-une-cle')
    await changer('#canal-secret', SECRET)
    await soumettre()

    expect(container.querySelector('[role="alert"]').textContent).toMatch(/emak_/)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('affiche le message de validation détaillé renvoyé par le backend', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Données invalides', details: [{ path: ['apiUrl'], message: "L'URL API I-CRM doit être en https" }] } },
    })
    await monter()
    await changer('#canal-label', 'lena')
    await changer('#canal-url', 'https://icrm.api.ila26.fr')
    await changer('#canal-cle-api', CLE)
    await changer('#canal-secret', SECRET)
    await soumettre()

    expect(container.querySelector('[role="alert"]').textContent).toBe("L'URL API I-CRM doit être en https")
  })

  it('« Azure AD (ancien) » réaffiche les champs historiques', async () => {
    await monter()
    await changer('#canal-type', 'azure_ad')

    expect($('#canal-refresh')).not.toBeNull()
    expect($('#canal-token')).not.toBeNull()
    expect($('#canal-cle-api')).toBeNull()
    expect($('#canal-secret')).toBeNull()
  })
})

describe('CanalConfigModal — édition', () => {
  const canalCleApi = {
    id: 'c1', label: 'icrm-lena-prod', type: 'icrm_api_key', apiUrl: 'https://icrm.api.ila26.fr',
    apiKeyId: CLE, hasApiKey: true, hasToken: true, actif: true, tokenExpiresAt: null,
  }

  it('pré-remplit l’identifiant de clé (public), jamais le secret', async () => {
    await monter({ initialCanal: canalCleApi })

    expect($('#canal-type').value).toBe('icrm_api_key')
    expect($('#canal-cle-api').value).toBe(CLE)
    expect($('#canal-secret').value).toBe('')
    expect(libelles().join(' ')).toContain('laisser vide pour ne pas changer')
  })

  it('n’envoie ni la clé inchangée ni le secret vide', async () => {
    api.put.mockResolvedValue({ data: canalCleApi })
    await monter({ initialCanal: canalCleApi })
    await changer('#canal-label', 'lena-renomme')
    await soumettre()

    expect(api.put).toHaveBeenCalledWith('/api/canaux/c1', {
      type: 'icrm_api_key', label: 'lena-renomme', apiUrl: 'https://icrm.api.ila26.fr', actif: true,
    })
  })

  it('passage d’un canal Azure en clé API : clé et secret exigés', async () => {
    await monter({ initialCanal: { id: 'c2', label: 'ancien', apiUrl: 'https://icrm.api.ila26.fr', actif: true } })
    expect($('#canal-type').value).toBe('azure_ad')

    await changer('#canal-type', 'icrm_api_key')
    expect(container.textContent).toContain('la clé et le secret doivent être saisis à nouveau')
    await soumettre()

    expect(container.querySelector('[role="alert"]').textContent).toMatch(/clé API I-CRM est requise/)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('le test de connexion affiche l’entreprise et le sous-type', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 42,
        entreprise: 'LENA', subtype: { id: 23, name: 'BORNE TACTILE' }, client: 'EMA LENA prod',
      },
    })
    await monter({ initialCanal: canalCleApi })

    const bouton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Tester la connexion'))
    await cliquer(bouton)

    expect(api.post).toHaveBeenCalledWith('/api/canaux/c1/test')
    const resultat = container.querySelector('[data-testid="canal-test-resultat"]').textContent
    expect(resultat).toContain('Connecté à LENA')
    expect(resultat).toContain('sous-type BORNE TACTILE (#23)')
    expect(resultat).toContain('Client API : EMA LENA prod')
  })

  it('le test de connexion affiche le message d’échec (401)', async () => {
    api.post.mockResolvedValue({
      data: { success: false, type: 'icrm_api_key', httpStatus: 401, error: 'Clé API ou secret refusé par I-CRM' },
    })
    await monter({ initialCanal: canalCleApi })

    const bouton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Tester la connexion'))
    await cliquer(bouton)

    expect(container.querySelector('[data-testid="canal-test-resultat"]').textContent)
      .toContain('Clé API ou secret refusé par I-CRM')
  })
})
