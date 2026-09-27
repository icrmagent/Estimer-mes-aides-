/**
 * EntrepriseIcrmSelect.test.jsx — choix « Entreprise I-CRM destinataire » d'une borne.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import EntrepriseIcrmSelect from './EntrepriseIcrmSelect.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LENA = { id: 'e1', nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', actif: true }
const CAE = { id: 'e2', nom: 'CAE España', nomIcrm: 'CAE España', sousTypeIcrm: 'BORNE TACTILE', actif: true }
const ANCIENNE = { id: 'e3', nom: 'Ancienne', nomIcrm: null, sousTypeIcrm: null, actif: false }

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function rendre(props) {
  await act(async () => { root.render(<EntrepriseIcrmSelect entreprises={[LENA, CAE, ANCIENNE]} {...props} />) })
  return container.querySelector('#borne-entreprise-icrm')
}

describe('EntrepriseIcrmSelect', () => {
  it('« Aucune (utiliser les canaux) » puis les entreprises actives « Nom — entreprise I-CRM (sous-type) »', async () => {
    const select = await rendre({ value: '' })

    expect(container.querySelector('label[for="borne-entreprise-icrm"]').textContent).toBe('Entreprise I-CRM destinataire')
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Aucune (utiliser les canaux)'],
      ['e1', 'LENA (France) — LENA (BORNE TACTILE)'],
      ['e2', 'CAE España — CAE España (BORNE TACTILE)'],
    ])
    expect(select.value).toBe('')
    expect(select.disabled).toBe(false)
  })

  it('remonte l’id choisi', async () => {
    const onChange = vi.fn()
    const select = await rendre({ value: '', onChange })
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'e2')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('e2')
  })

  it('entreprise actuelle désactivée : toujours affichée et sélectionnée, avec l’avertissement « envois suspendus »', async () => {
    const select = await rendre({ value: 'e3', entrepriseActuelle: ANCIENNE })
    expect(select.value).toBe('e3')
    expect(select.options[select.selectedIndex].textContent).toBe('Ancienne — non vérifiée — désactivée')
    const avertissement = container.querySelector('[role="status"]').textContent
    expect(avertissement).toMatch(/désactivée : les envois de la borne sont suspendus/)
    expect(avertissement).toMatch(/aucun envoi vers ses canaux/)
  })

  it('lecture seule (AdminBorne) : désactivé, avec la mention du SuperAdmin', async () => {
    const select = await rendre({ value: 'e1', disabled: true })
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('e1')
    expect(container.textContent).toContain('Choisie par le Super Administrateur')
  })
})

describe('EntrepriseIcrmSelect — liste en chargement ou en erreur', () => {
  it('chargement : verrouillé sur la valeur actuelle, jamais « désactivée » à tort', async () => {
    await act(async () => {
      root.render(<EntrepriseIcrmSelect value="e1" entreprises={[]} etat="chargement" entrepriseActuelle={LENA} />)
    })
    const select = container.querySelector('#borne-entreprise-icrm')
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('e1')
    expect(select.options[select.selectedIndex].textContent).toBe('LENA (France) — LENA (BORNE TACTILE)')
    expect(container.textContent).toContain('Chargement des entreprises I-CRM')
  })

  it('erreur de chargement : verrouillé + message, la destination actuelle est conservée', async () => {
    await act(async () => {
      root.render(<EntrepriseIcrmSelect value="e1" entreprises={[]} etat="erreur" entrepriseActuelle={LENA} />)
    })
    const select = container.querySelector('#borne-entreprise-icrm')
    expect(select.disabled).toBe(true)
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Impossible de charger les entreprises I-CRM/)
    expect(select.options[select.selectedIndex].textContent).not.toMatch(/désactivée/)
  })

  it('entreprise actuelle à tester : avertissement « suspendus jusqu’à un test réussi »', async () => {
    await act(async () => {
      root.render(<EntrepriseIcrmSelect value="e1" entreprises={[{ ...LENA, verificationRequise: true }]} entrepriseActuelle={{ ...LENA, verificationRequise: true }} />)
    })
    expect(container.querySelector('[role="status"]').textContent).toMatch(/suspendus jusqu'à un test réussi/)
  })
})
