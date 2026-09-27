/**
 * DestinationBorne.test.jsx — colonne « Destination I-CRM » des listes de bornes.
 * Borne affectée à une entreprise désactivée : badge « Envois suspendus (entreprise
 * désactivée) », jamais le canal (même règle que le worker).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DestinationBorne from './DestinationBorne.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

async function rendre(borne) {
  await act(async () => { root.render(<DestinationBorne borne={borne} />) })
  return container
}

const badge = () => container.querySelector('[data-testid="badge-envois-suspendus"]')

describe('DestinationBorne', () => {
  it('entreprise active : son nom, sans badge', async () => {
    await rendre({ canalTransmission: 'icrm-lena', entrepriseIcrm: { id: 'e1', nom: 'CAE España', nomIcrm: 'CAE España', actif: true } })
    expect(container.textContent).toContain('CAE España')
    expect(container.textContent).not.toContain('icrm-lena')
    expect(badge()).toBeNull()
  })

  it('entreprise désactivée : son nom + badge « Envois suspendus (entreprise désactivée) », jamais le canal', async () => {
    await rendre({ canalTransmission: 'icrm-lena', entrepriseIcrm: { id: 'e1', nom: 'CAE España', actif: false } })
    expect(container.textContent).toContain('CAE España')
    expect(badge().textContent).toContain('Envois suspendus (entreprise désactivée)')
    expect(container.textContent).not.toContain('icrm-lena')
  })

  it('sans entreprise : le canal de la borne', async () => {
    await rendre({ canalTransmission: 'icrm-lena', entrepriseIcrm: null })
    expect(container.textContent).toBe('Canal « icrm-lena »')
    expect(badge()).toBeNull()
  })
})
