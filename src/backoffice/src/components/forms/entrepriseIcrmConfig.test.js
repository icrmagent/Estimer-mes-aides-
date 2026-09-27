import { describe, it, expect } from 'vitest'
import {
  estNouvelleCleEntreprise,
  validerSaisieEntreprise,
  construireRequeteEntreprise,
  libelleEntrepriseIcrm,
  optionsEntreprisesIcrm,
  statutVerification,
  destinationBorne,
} from './entrepriseIcrmConfig.js'

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'

const saisie = (overrides = {}) => ({
  isEdit: false,
  nom: 'LENA (France)',
  apiUrl: 'https://icrm.api.ila26.fr',
  apiKey: CLE,
  token: SECRET,
  ...overrides,
})

describe('validerSaisieEntreprise — création', () => {
  it('saisie complète valide', () => {
    expect(validerSaisieEntreprise(saisie())).toBeNull()
    expect(validerSaisieEntreprise(saisie({ apiUrl: 'http://localhost:8000' }))).toBeNull()
  })

  it.each([
    ['nom vide', { nom: '  ' }, /nom de l'entreprise est requis/],
    ['nom trop long', { nom: 'N'.repeat(121) }, /120 caractères/],
    ['URL vide', { apiUrl: '' }, /URL API I-CRM est requise/],
    ['URL http distante', { apiUrl: 'http://icrm.api.ila26.fr' }, /https:\/\//],
    ['clé absente', { apiKey: '' }, /clé API I-CRM est requise/],
    ['secret absent', { token: '' }, /secret API I-CRM est requis/],
    ['clé au mauvais format', { apiKey: 'emak_abc' }, /emak_/],
    ['secret au mauvais format', { token: 'x'.repeat(47) }, /48 caractères/],
  ])('%s → message FR', (_cas, patch, message) => {
    expect(validerSaisieEntreprise(saisie(patch))).toMatch(message)
  })
})

describe('validerSaisieEntreprise — édition', () => {
  const edition = (overrides = {}) => saisie({ isEdit: true, token: '', apiKeyInitiale: CLE, ...overrides })

  it('clé et secret vides = inchangés', () => {
    expect(validerSaisieEntreprise(edition({ apiKey: '' }))).toBeNull()
    expect(validerSaisieEntreprise(edition())).toBeNull()
  })

  it('nouvelle clé sans secret : refusée ; avec secret : acceptée', () => {
    const autre = 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ'
    expect(estNouvelleCleEntreprise({ isEdit: true, apiKey: autre, apiKeyInitiale: CLE })).toBe(true)
    expect(estNouvelleCleEntreprise({ isEdit: true, apiKey: CLE, apiKeyInitiale: CLE })).toBe(false)
    expect(estNouvelleCleEntreprise({ isEdit: false, apiKey: autre })).toBe(false)
    expect(validerSaisieEntreprise(edition({ apiKey: autre }))).toMatch(/Nouvelle clé API/)
    expect(validerSaisieEntreprise(edition({ apiKey: autre, token: SECRET }))).toBeNull()
  })
})

describe('construireRequeteEntreprise', () => {
  it('création : tous les champs, rognés', () => {
    expect(construireRequeteEntreprise({ ...saisie({ nom: ' LENA ', apiUrl: ' https://icrm.api.ila26.fr ' }), actif: true }))
      .toEqual({ nom: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', actif: true, apiKey: CLE, token: SECRET })
  })

  it('édition : ni la clé inchangée ni le secret vide ; secret saisi seul envoyé', () => {
    const base = { isEdit: true, nom: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', apiKey: CLE, apiKeyInitiale: CLE, actif: false }
    expect(construireRequeteEntreprise({ ...base, token: '' }))
      .toEqual({ nom: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', actif: false })
    expect(construireRequeteEntreprise({ ...base, token: SECRET }))
      .toEqual({ nom: 'LENA', apiUrl: 'https://icrm.api.ila26.fr', actif: false, token: SECRET })
    expect(construireRequeteEntreprise({ ...base, apiKey: 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ', token: SECRET }))
      .toMatchObject({ apiKey: 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ', token: SECRET })
  })
})

describe('libellés et options du choix de la borne', () => {
  const lena = { id: 'e1', nom: 'LENA (France)', nomIcrm: 'LENA', sousTypeIcrm: 'BORNE TACTILE', actif: true }
  const cae = { id: 'e2', nom: 'CAE España', nomIcrm: null, sousTypeIcrm: null, actif: true }
  const inactive = { id: 'e3', nom: 'Ancienne', nomIcrm: 'X', sousTypeIcrm: null, actif: false }

  it('« Nom — entreprise I-CRM (sous-type) », ou « non vérifiée »', () => {
    expect(libelleEntrepriseIcrm(lena)).toBe('LENA (France) — LENA (BORNE TACTILE)')
    expect(libelleEntrepriseIcrm(cae)).toBe('CAE España — non vérifiée')
    expect(libelleEntrepriseIcrm({ ...lena, sousTypeIcrm: null })).toBe('LENA (France) — LENA')
    expect(libelleEntrepriseIcrm(null)).toBe('')
  })

  it('options : entreprises actives seulement, plus l’entreprise actuelle si elle est inactive', () => {
    expect(optionsEntreprisesIcrm([lena, cae, inactive])).toEqual([
      { value: 'e1', label: 'LENA (France) — LENA (BORNE TACTILE)' },
      { value: 'e2', label: 'CAE España — non vérifiée' },
    ])
    const avecActuelle = optionsEntreprisesIcrm([lena, inactive], inactive)
    expect(avecActuelle.map((o) => o.value)).toEqual(['e1', 'e3'])
    expect(avecActuelle[1].label).toMatch(/inactive$/)
    expect(optionsEntreprisesIcrm([lena], lena)).toHaveLength(1)
  })
})

describe('statutVerification', () => {
  it.each([
    [null, 'Non vérifiée', 'neutre'],
    ['ok', 'Connectée', 'ok'],
    ['invalid_credentials', 'Clé ou secret refusé', 'erreur'],
    ['reponse_non_conforme', "URL à vérifier (ce n'est pas l'API I-CRM)", 'erreur'],
    ['timeout', 'Délai dépassé', 'erreur'],
    ['http_502', 'Échec HTTP 502', 'erreur'],
    ['autre_code', 'Échec (autre_code)', 'erreur'],
  ])('%s → %s', (dernierStatut, texte, ton) => {
    expect(statutVerification({ dernierStatut })).toEqual({ texte, ton })
  })
})

describe('destinationBorne (même ordre que le worker)', () => {
  it('entreprise active prioritaire sur le canal', () => {
    expect(destinationBorne({ canalTransmission: 'icrm-lena', entrepriseIcrm: { nom: 'LENA', actif: true } }))
      .toEqual({ type: 'entreprise', libelle: 'LENA' })
  })

  it('sans entreprise : canal de la borne, ou « Canaux de la borne »', () => {
    expect(destinationBorne({ canalTransmission: 'icrm-lena', entrepriseIcrm: null }))
      .toEqual({ type: 'canal', libelle: 'Canal « icrm-lena »' })
    expect(destinationBorne({})).toEqual({ type: 'canal', libelle: 'Canaux de la borne' })
  })

  it('entreprise inactive : canal, avec alerte', () => {
    const d = destinationBorne({ canalTransmission: null, entrepriseIcrm: { nom: 'LENA', actif: false } })
    expect(d.type).toBe('canal')
    expect(d.alerte).toMatch(/LENA.*inactive/)
  })
})
