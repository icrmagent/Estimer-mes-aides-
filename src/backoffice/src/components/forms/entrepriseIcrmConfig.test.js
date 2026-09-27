import { describe, it, expect } from 'vitest'
import {
  estNouvelleCleEntreprise,
  validerSaisieEntreprise,
  construireRequeteEntreprise,
  libelleEntrepriseIcrm,
  optionsEntreprisesIcrm,
  statutVerification,
  destinationBorne,
  messageBornesSuspendues,
  libelleSuspension,
  envoisConcernesParChangement,
  destinationJob,
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

  it('options : entreprises actives seulement, plus l’entreprise actuelle si elle est désactivée', () => {
    expect(optionsEntreprisesIcrm([lena, cae, inactive])).toEqual([
      { value: 'e1', label: 'LENA (France) — LENA (BORNE TACTILE)' },
      { value: 'e2', label: 'CAE España — non vérifiée' },
    ])
    const avecActuelle = optionsEntreprisesIcrm([lena, inactive], inactive)
    expect(avecActuelle.map((o) => o.value)).toEqual(['e1', 'e3'])
    expect(avecActuelle[1].label).toBe('Ancienne — X — désactivée')
    expect(optionsEntreprisesIcrm([lena], lena)).toHaveLength(1)
  })
})

describe('messageBornesSuspendues', () => {
  it('« N borne(s) suspendue(s) tant que l’entreprise est désactivée », rien sans borne', () => {
    expect(messageBornesSuspendues(1)).toBe("1 borne suspendue tant que l'entreprise est désactivée")
    expect(messageBornesSuspendues(3)).toBe("3 bornes suspendues tant que l'entreprise est désactivée")
    expect(messageBornesSuspendues(0)).toBeNull()
    expect(messageBornesSuspendues(undefined)).toBeNull()
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

describe('destinationBorne (même règle que le worker)', () => {
  it('entreprise active prioritaire sur le canal', () => {
    expect(destinationBorne({ canalTransmission: 'icrm-lena', entrepriseIcrm: { nom: 'LENA', actif: true } }))
      .toEqual({ type: 'entreprise', libelle: 'LENA' })
  })

  it('sans entreprise : canal de la borne, ou « Canaux de la borne »', () => {
    expect(destinationBorne({ canalTransmission: 'icrm-lena', entrepriseIcrm: null }))
      .toEqual({ type: 'canal', libelle: 'Canal « icrm-lena »' })
    expect(destinationBorne({})).toEqual({ type: 'canal', libelle: 'Canaux de la borne' })
  })

  it('entreprise désactivée : toujours l’entreprise (jamais le canal), envois suspendus', () => {
    expect(destinationBorne({ canalTransmission: 'icrm-lena', entrepriseIcrm: { nom: 'LENA', actif: false } }))
      .toEqual({ type: 'entreprise', libelle: 'LENA', suspendu: 'Envois suspendus (entreprise désactivée)' })
  })

  it('entreprise à tester (URL ou clé modifiée) : envois suspendus', () => {
    expect(destinationBorne({ entrepriseIcrm: { nom: 'LENA', actif: true, verificationRequise: true } }))
      .toEqual({ type: 'entreprise', libelle: 'LENA', suspendu: 'Envois suspendus (entreprise à tester)' })
    expect(libelleSuspension({ actif: true, verificationRequise: false })).toBeNull()
    expect(libelleSuspension(null)).toBeNull()
  })
})

describe('règles de la revue (hôte, chargement, envois en attente, destination d’un job)', () => {
  it('nouvel hôte d’URL en édition : le secret est exigé ; même hôte : non', () => {
    const base = { isEdit: true, nom: 'LENA', apiKey: CLE, apiKeyInitiale: CLE, token: '', apiUrlInitiale: 'https://icrm.api.ila26.fr' }
    expect(validerSaisieEntreprise({ ...base, apiUrl: 'https://icrm.api.es.ila26.com' })).toMatch(/Nouvel hôte/)
    expect(validerSaisieEntreprise({ ...base, apiUrl: 'https://icrm.api.es.ila26.com', token: SECRET })).toBeNull()
    expect(validerSaisieEntreprise({ ...base, apiUrl: 'https://icrm.api.ila26.fr/api/' })).toBeNull()
  })

  it('liste pas encore chargée : l’entreprise actuelle ACTIVE n’est jamais marquée « désactivée »', () => {
    const actuelle = { id: 'e1', nom: 'LENA', nomIcrm: 'LENA', sousTypeIcrm: null, actif: true }
    expect(optionsEntreprisesIcrm([], actuelle)).toEqual([{ value: 'e1', label: 'LENA — LENA' }])
    expect(optionsEntreprisesIcrm([], { ...actuelle, actif: undefined })[0].label).not.toMatch(/désactivée/)
    expect(optionsEntreprisesIcrm([], { ...actuelle, actif: false })[0].label).toMatch(/— désactivée$/)
  })

  it('statut « À tester » quand l’URL ou la clé a changé', () => {
    expect(statutVerification({ verificationRequise: true, dernierStatut: null })).toEqual({ texte: 'À tester (URL ou clé modifiée)', ton: 'erreur' })
  })

  it('envois concernés par un changement : ceux de l’ancienne cible + ceux d’entreprises supprimées', () => {
    const envois = {
      total: 10,
      parEntreprise: [
        { entrepriseIcrmId: 'cae', total: 5, suspendus: 4, supprimee: false },
        { entrepriseIcrmId: null, total: 2, suspendus: 0, supprimee: false },
        { entrepriseIcrmId: 'vieille', total: 3, suspendus: 3, supprimee: true },
      ],
    }
    expect(envoisConcernesParChangement(envois, 'cae')).toEqual({ total: 8, suspendus: 7 })
    expect(envoisConcernesParChangement(envois, null)).toEqual({ total: 5, suspendus: 3 })
    expect(envoisConcernesParChangement(null, 'cae')).toEqual({ total: 0, suspendus: 0 })
  })

  it('destination d’un job livré = instantané ; pas encore livré = cible du job (suspendue si besoin) ; sinon canal', () => {
    const livre = {
      statut: 'succes',
      entrepriseIcrm: { nom: 'LENA', actif: true }, // cible actuelle de la ligne, ignorée pour un job livré
      enregistrement: { crmDestination: { nom: 'CAE España', nomIcrm: 'CAE España', sousTypeIcrm: 'BORNE TACTILE', apiHost: 'icrm.api.es.ila26.com' } },
    }
    expect(destinationJob(livre)).toEqual({ type: 'entreprise', libelle: 'CAE España', detail: 'CAE España · BORNE TACTILE · icrm.api.es.ila26.com' })
    expect(destinationJob({ statut: 'succes', enregistrement: { borne: { canalTransmission: 'icrm-lena' } } }))
      .toEqual({ type: 'canal', libelle: 'icrm-lena' })
    expect(destinationJob({ statut: 'suspendu', entrepriseIcrm: { nom: 'CAE', actif: false } }))
      .toEqual({ type: 'entreprise', libelle: 'CAE', suspendu: 'Envois suspendus (entreprise désactivée)' })
    expect(destinationJob({ statut: 'en_attente', entrepriseIcrm: { nom: 'LENA', actif: true } }))
      .toEqual({ type: 'entreprise', libelle: 'LENA' })
    expect(destinationJob({ statut: 'en_attente', entrepriseIcrm: null }, { canalParDefaut: 'canal-x' }))
      .toEqual({ type: 'canal', libelle: 'canal-x' })
    expect(destinationJob({ statut: 'en_attente' })).toEqual({ type: 'aucune', libelle: '—' })
  })
})
