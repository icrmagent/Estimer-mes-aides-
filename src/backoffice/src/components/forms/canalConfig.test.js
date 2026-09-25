/**
 * canalConfig.test.js — règles du formulaire « canal I-CRM » :
 * type par défaut, validation clé / secret / URL, corps de requête, résumé du test.
 */
import { describe, it, expect } from 'vitest'
import {
  CANAL_TYPE_AZURE_AD,
  CANAL_TYPE_ICRM_API_KEY,
  TYPES_CANAL,
  typeDuCanal,
  libelleTypeCanal,
  typeInitialFormulaire,
  validerSaisieCanal,
  construireRequeteCanal,
  resumeTestCanal,
} from './canalConfig.js'

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const BORNE = '33333333-3333-4333-8333-333333333333'

const saisie = (overrides = {}) => ({
  isEdit: false,
  type: CANAL_TYPE_ICRM_API_KEY,
  typeInitial: null,
  borneId: BORNE,
  label: 'icrm-lena-prod',
  apiUrl: 'https://icrm.api.ila26.fr',
  apiKey: CLE,
  token: SECRET,
  ...overrides,
})

describe('types de canal', () => {
  it('propose la clé API en premier (recommandé) et Azure AD (ancien)', () => {
    expect(TYPES_CANAL.map((t) => t.label)).toEqual(['Clé API I-CRM (recommandé)', 'Azure AD (ancien)'])
    expect(TYPES_CANAL.map((t) => t.value)).toEqual(['icrm_api_key', 'azure_ad'])
  })

  it('un canal sans type est un canal Azure AD ; un nouveau canal démarre en clé API', () => {
    expect(typeDuCanal({})).toBe(CANAL_TYPE_AZURE_AD)
    expect(typeDuCanal({ type: 'icrm_api_key' })).toBe(CANAL_TYPE_ICRM_API_KEY)
    expect(typeInitialFormulaire(null)).toBe(CANAL_TYPE_ICRM_API_KEY)
    expect(typeInitialFormulaire({ id: 'c1' })).toBe(CANAL_TYPE_AZURE_AD)
    expect(typeInitialFormulaire({ id: 'c1', type: 'icrm_api_key' })).toBe(CANAL_TYPE_ICRM_API_KEY)
    expect(libelleTypeCanal('icrm_api_key')).toBe('Clé API I-CRM')
    expect(libelleTypeCanal(undefined)).toBe('Azure AD')
  })
})

describe('validerSaisieCanal — clé API I-CRM', () => {
  it('accepte une saisie complète', () => {
    expect(validerSaisieCanal(saisie())).toBeNull()
    expect(validerSaisieCanal(saisie({ apiUrl: 'http://localhost:8000' }))).toBeNull()
  })

  it.each([
    [{ borneId: '' }, /borne/],
    [{ label: '  ' }, /label/],
    [{ apiUrl: '' }, /URL API est requise/],
    [{ apiUrl: 'http://icrm.api.ila26.fr' }, /https:\/\//],
    [{ apiKey: '' }, /clé API I-CRM est requise/],
    [{ token: '' }, /secret API I-CRM est requis/],
    [{ apiKey: 'cle-invalide' }, /emak_/],
    [{ token: 'court' }, /48 caractères/],
  ])('refuse %o', (patch, message) => {
    expect(validerSaisieCanal(saisie(patch))).toMatch(message)
  })

  it('en édition sans changement de type, clé et secret vides = inchangés', () => {
    expect(validerSaisieCanal(saisie({
      isEdit: true, typeInitial: CANAL_TYPE_ICRM_API_KEY, apiKey: '', token: '',
    }))).toBeNull()
    // … mais une valeur saisie doit rester au bon format
    expect(validerSaisieCanal(saisie({
      isEdit: true, typeInitial: CANAL_TYPE_ICRM_API_KEY, apiKey: '', token: 'court',
    }))).toMatch(/48 caractères/)
  })

  it('en édition avec changement de type, clé et secret redeviennent obligatoires', () => {
    expect(validerSaisieCanal(saisie({
      isEdit: true, typeInitial: CANAL_TYPE_AZURE_AD, apiKey: CLE, token: '',
    }))).toMatch(/secret API I-CRM est requis/)
  })
})

describe('validerSaisieCanal — Azure AD (ancien)', () => {
  it('garde les règles historiques (tokens libres, requis en création)', () => {
    const azure = { type: CANAL_TYPE_AZURE_AD, apiUrl: 'http://dev.example', apiKey: 'rt', token: 'at' }
    expect(validerSaisieCanal(saisie(azure))).toBeNull()
    expect(validerSaisieCanal(saisie({ ...azure, apiKey: '' }))).toMatch(/refresh token/)
    expect(validerSaisieCanal(saisie({ ...azure, token: '' }))).toMatch(/token d'accès/)
    expect(validerSaisieCanal(saisie({ ...azure, isEdit: true, typeInitial: CANAL_TYPE_AZURE_AD, apiKey: '', token: '' }))).toBeNull()
  })
})

describe('construireRequeteCanal', () => {
  it('création : corps complet avec type et borne, valeurs rognées', () => {
    expect(construireRequeteCanal({
      isEdit: false, type: CANAL_TYPE_ICRM_API_KEY, borneId: BORNE, label: ' lena ',
      apiUrl: ' https://icrm.api.ila26.fr ', apiKey: ` ${CLE} `, token: ` ${SECRET} `, actif: true,
    })).toEqual({
      type: 'icrm_api_key', label: 'lena', apiUrl: 'https://icrm.api.ila26.fr',
      apiKey: CLE, token: SECRET, actif: true, borneId: BORNE,
    })
  })

  it('édition : n’envoie ni la clé inchangée ni un secret vide', () => {
    expect(construireRequeteCanal({
      isEdit: true, type: CANAL_TYPE_ICRM_API_KEY, borneId: BORNE, label: 'lena',
      apiUrl: 'https://icrm.api.ila26.fr', apiKey: CLE, token: '', actif: false, apiKeyInitiale: CLE,
    })).toEqual({ type: 'icrm_api_key', label: 'lena', apiUrl: 'https://icrm.api.ila26.fr', actif: false })
  })

  it('édition : envoie une nouvelle clé et un nouveau secret', () => {
    const autreCle = 'emak_ZZZZZZZZZZZZZZZZZZZZZZZZ'
    expect(construireRequeteCanal({
      isEdit: true, type: CANAL_TYPE_ICRM_API_KEY, borneId: BORNE, label: 'lena',
      apiUrl: 'https://icrm.api.ila26.fr', apiKey: autreCle, token: SECRET, actif: true, apiKeyInitiale: CLE,
    })).toMatchObject({ apiKey: autreCle, token: SECRET })
  })
})

describe('resumeTestCanal', () => {
  it('clé API : nomme l’entreprise et le sous-type', () => {
    expect(resumeTestCanal({
      success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 87,
      entreprise: 'CAE España', subtype: { id: 6, name: 'BORNE TACTILE' }, client: 'EMA CAE',
    })).toEqual({
      message: 'Connecté à CAE España · sous-type BORNE TACTILE (#6) (HTTP 200, 87ms)',
      type: 'success',
    })
  })

  it('clé API sans sous-type renvoyé', () => {
    expect(resumeTestCanal({ success: true, type: 'icrm_api_key', httpStatus: 200, latencyMs: 5, entreprise: 'LENA' }).message)
      .toBe('Connecté à LENA (HTTP 200, 5ms)')
  })

  it('échec : message d’erreur du backend', () => {
    expect(resumeTestCanal({ success: false, error: 'Clé API ou secret refusé par I-CRM' })).toEqual({
      message: 'Connexion impossible : Clé API ou secret refusé par I-CRM', type: 'error',
    })
  })

  it('Azure AD : message historique inchangé', () => {
    expect(resumeTestCanal({ success: true, httpStatus: 405, latencyMs: 12, tokenExpired: true })).toEqual({
      message: 'Connexion OK (405, 12ms) — token expiré !', type: 'error',
    })
    expect(resumeTestCanal({ success: true, httpStatus: 200, latencyMs: 12, tokenExpired: false }).type).toBe('success')
  })
})
