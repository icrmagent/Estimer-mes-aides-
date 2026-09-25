/**
 * Tests unitaires — queueWorker.js, canal « Clé API I-CRM » (type icrm_api_key).
 *
 * Contrat EMA → I-CRM v1 : POST {apiUrl}/api/external/estimer-mes-aides/v1/enregistrements
 *   - payload (buildIcrmEnregistrementPayload) : contact, réponses + libellés d'options,
 *     métadonnées borne / formulaire, langue, created_at ;
 *   - addendum v1.1 : borne.admin (AdminBorne, select fermé, membres vides omis) et
 *     created_at obligatoire (createdAt ISO-8601 UTC, sinon échec définitif) ;
 *   - en-têtes X-Api-Key / X-Api-Secret / Idempotency-Key, jamais d'appel Azure AD ;
 *   - 2xx au corps du contrat (status + projet_id) = succès (+ crmProjetId /
 *     crmProjetRef) ; 2xx non conforme (page HTML, autre API) = échec définitif,
 *     jamais « partagé » ; 2xx au corps illisible = backoff ;
 *   - 401/403/404/413/422 = échec définitif immédiat ; 408/409/429/5xx/réseau/
 *     timeout = backoff existant ;
 *   - bloc contact aux contraintes d'I-CRM (e-mail valide, longueurs max) : une
 *     valeur refusée quitte le contact mais reste dans reponses ;
 *   - aucun secret ni valeur saisie dans les logs (RGPD).
 * Le chemin historique azure_ad est couvert par tests/queueWorker.test.js et
 * tests/services/queueWorker.test.js (inchangés).
 */

import { jest } from '@jest/globals'

// ─── Mocks (must be before any imports) ──────────────────────────────────────

const mockPrisma = {
  partageJob: { findMany: jest.fn(), update: jest.fn() },
  enregistrement: { findUnique: jest.fn(), update: jest.fn() },
  canal: { update: jest.fn() },
  $transaction: jest.fn(),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

const mockNotifySucces = jest.fn()
const mockNotifyEchec = jest.fn()
const mockPublishEvent = jest.fn().mockResolvedValue(undefined)

jest.unstable_mockModule('../../src/services/pusherService.js', () => ({
  notifyPartageSucces: mockNotifySucces,
  notifyPartageEchec: mockNotifyEchec,
  publishEvent: mockPublishEvent,
}))

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
jest.unstable_mockModule('../../src/lib/logger.js', () => ({ default: mockLogger }))

global.fetch = jest.fn()

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const {
  processJob,
  MAX_TENTATIVES,
  buildIcrmEnregistrementPayload,
} = await import('../../src/services/queueWorker.js')

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLE = 'emak_A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'SeCrEt0123456789SeCrEt0123456789SeCrEt0123456789'
const ENR_ID = '9f1c2e0a-6d7b-4c1e-9a55-2b8f0c3d4e5f'
const URL_ATTENDUE = 'https://icrm.api.ila26.fr/api/external/estimer-mes-aides/v1/enregistrements'

const q = (crmFieldIds, fr, typeOption = 'texte_court', options = null, extra = {}) => ({
  id: `q-${crmFieldIds?.[0] ?? fr}`,
  libelleQuestion: { fr, es: `${fr} (es)` },
  orderPage: 1,
  crmFieldIds,
  typeOption,
  options,
  ...extra,
})

const rep = (question, valeur) => ({ questionId: question.id, valeur, question })

const OPTIONS_CIVILITE = [
  { id: '2262-1-mr', crmValue: 'Mr.', label: { fr: 'Mr.', es: 'Sr.', en: 'Mr.' } },
  { id: '2262-2-mme', crmValue: 'Mme', label: { fr: 'Mme', es: 'Sra.', en: 'Mrs.' } },
]
const OPTIONS_REVENU = [
  { id: '2294-1-1-inferieur-a-23734', crmValue: '1- Inférieur à 23734€', label: { fr: '1- Inférieur à 23 734 €' } },
  { id: '2294-2-2-entre-23734-et-30427', crmValue: '2- Entre 23734€ et 30427€', label: { fr: '2- Entre 23 734 € et 30 427 €' } },
]
// Options créées dans le back-office : UUID, pas de crmValue
const OPTIONS_TRAVAUX = [
  { id: 'id-a', label: { fr: 'Isolation des combles', es: 'Aislamiento' } },
  { id: 'id-b', label: { fr: 'Pompe à chaleur' } },
  { id: 'id-c', label: { es: 'Solo español' } },
  { id: 'id-d', label: {} },
]

const Q = {
  civilite: q([2262], 'Civilité', 'option_unique', OPTIONS_CIVILITE),
  nom: q([2087], 'Nom'),
  prenom: q([2088], 'Prénom'),
  adresse: q([2217], 'Adresse'),
  cp: q([2089], 'Code Postal'),
  ville: q([2090], 'Ville'),
  tel: q([2015], 'Num. de Téléphone', 'telephone'),
  email: q([2016], 'Adresse Email', 'email'),
  revenu: q([2294], 'Revenu total du foyer fiscal', 'option_unique', OPTIONS_REVENU),
  travaux: q([2303], 'Travaux souhaités', 'options_multiples', OPTIONS_TRAVAUX),
  commentaire: q([2305], 'Commentaires ou informations complémentaires', 'texte_long'),
}

// AdminBorne propriétaire de la borne, tel que chargé par le worker (select fermé)
const ADMIN_BORNE = {
  nom: 'LEFEBVRE',
  prenom: 'Claire',
  email: 'claire.lefebvre@brico-sud-ouest.example',
  raisonSociale: 'BRICO SUD-OUEST SAS',
  siret: '12345678900011',
}
const ADMIN_ATTENDU = {
  nom: 'LEFEBVRE',
  prenom: 'Claire',
  email: 'claire.lefebvre@brico-sud-ouest.example',
  raison_sociale: 'BRICO SUD-OUEST SAS',
  siret: '12345678900011',
}

function makeEnregistrement(overrides = {}) {
  return {
    id: ENR_ID,
    borneId: 'borne-uuid-1',
    formulaireId: 'form-uuid-1',
    formulaireVersion: '1.3.0',
    langueUtilisee: 'fr',
    statutPartage: 'en_attente',
    tentatives: 0,
    deletedAt: null,
    createdAt: new Date('2026-09-25T10:42:17.311Z'),
    formulaire: { id: 'form-uuid-1', label: 'Estimer mes aides', version: '1.4.0' },
    borne: {
      id: 'borne-uuid-1',
      idBorne: 'BORNE-1A2B3C4D',
      pays: 'FR',
      adresse: '12 AVENUE DU COMMERCE, 33000 BORDEAUX',
      commercant: 'BRICO SUD-OUEST',
      regie: null,
      installateur: 'LENA SOLUTIONS',
      adminBorne: { ...ADMIN_BORNE },
      canalTransmission: 'icrm-lena-prod',
      canaux: [
        {
          id: 'canal-uuid-1',
          label: 'icrm-lena-prod',
          type: 'icrm_api_key',
          apiUrl: 'https://icrm.api.ila26.fr/api/',
          apiKey: CLE,
          token: SECRET,
          actif: true,
        },
      ],
    },
    reponses: [
      rep(Q.civilite, '2262-1-mr'),
      rep(Q.nom, 'DUPONT'),
      rep(Q.prenom, 'JEAN'),
      rep(Q.adresse, '8 RUE DES LILAS'),
      rep(Q.cp, '33000'),
      rep(Q.ville, 'BORDEAUX'),
      rep(Q.tel, '+33612345678'),
      rep(Q.email, 'jean.dupont@example.com'),
      rep(Q.revenu, '2294-2-2-entre-23734-et-30427'),
      rep(Q.travaux, 'id-a, id-b'),
      rep(Q.commentaire, 'APPELER APRÈS 18H'),
    ],
    ...overrides,
  }
}

const makeJob = (overrides = {}) => ({
  id: 'job-uuid-1',
  enregistrementId: ENR_ID,
  statut: 'en_attente',
  tentatives: 0,
  prochainEssai: null,
  erreur: null,
  ...overrides,
})

function reponseHttp(status, corps, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nom) => headers[nom.toLowerCase()] ?? null },
    text: async () => (corps === undefined ? '' : typeof corps === 'string' ? corps : JSON.stringify(corps)),
  }
}

const erreurIcrm = (code, message = 'Refusé') => ({ error: { code, message, request_id: 'req-42' } })

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRM_API_URL = 'http://crm-legacy.example.com'
  process.env.CRM_API_KEY = 'legacy-crm-key'

  mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement())
  mockPrisma.enregistrement.update.mockResolvedValue({})
  mockPrisma.partageJob.update.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
  mockNotifySucces.mockResolvedValue(undefined)
  mockNotifyEchec.mockResolvedValue(undefined)
})

const appelsUpdateJob = (statut) =>
  mockPrisma.partageJob.update.mock.calls.filter((c) => c[0].data?.statut === statut)

const appelsUpdateEnregistrement = () => mockPrisma.enregistrement.update.mock.calls.map((c) => c[0])

function tousLesLogs() {
  return JSON.stringify([
    ...mockLogger.info.mock.calls,
    ...mockLogger.warn.mock.calls,
    ...mockLogger.error.mock.calls,
    ...mockLogger.debug.mock.calls,
  ])
}

// ─── buildIcrmEnregistrementPayload ──────────────────────────────────────────

describe('buildIcrmEnregistrementPayload — contrat v1', () => {
  it('construit le payload complet d’un enregistrement réaliste', () => {
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement())

    expect(payload).toEqual({
      external_id: ENR_ID,
      created_at: '2026-09-25T10:42:17.311Z',
      langue: 'fr',
      // version figée à la soumission (1.3.0), pas la version courante (1.4.0)
      formulaire: { id: 'form-uuid-1', version: '1.3.0', label: 'Estimer mes aides' },
      // regie null omise, canaux / canalTransmission jamais transmis
      borne: {
        id: 'borne-uuid-1',
        id_borne: 'BORNE-1A2B3C4D',
        pays: 'FR',
        adresse: '12 AVENUE DU COMMERCE, 33000 BORDEAUX',
        commercant: 'BRICO SUD-OUEST',
        installateur: 'LENA SOLUTIONS',
        admin: ADMIN_ATTENDU,
      },
      contact: {
        civility: 'Mr',
        last_name: 'DUPONT',
        first_name: 'JEAN',
        adresse: '8 RUE DES LILAS',
        code_postale: '33000',
        ville: 'BORDEAUX',
        phone_number: '+33612345678',
        email_adress: 'jean.dupont@example.com',
      },
      reponses: expect.any(Array),
    })
    expect(payload.reponses).toHaveLength(11)
    expect(JSON.stringify(payload)).not.toContain(SECRET)
    expect(JSON.stringify(payload)).not.toContain(CLE)
  })

  it('décrit chaque réponse : question_id, libellé FR, type, crm_field_ids, valeur brute, libellés', () => {
    const { reponses } = buildIcrmEnregistrementPayload(makeEnregistrement())
    const parChamp = Object.fromEntries(reponses.map((r) => [r.crm_field_ids[0], r]))

    expect(parChamp[2087]).toEqual({
      question_id: 'q-2087', libelle: 'Nom', type: 'texte_court',
      crm_field_ids: [2087], valeur: 'DUPONT', valeur_libelles: ['DUPONT'],
    })
    expect(parChamp[2294]).toEqual({
      question_id: 'q-2294', libelle: 'Revenu total du foyer fiscal', type: 'option_unique',
      crm_field_ids: [2294], valeur: '2294-2-2-entre-23734-et-30427',
      valeur_libelles: ['2- Entre 23734€ et 30427€'],
    })
    expect(parChamp[2303]).toEqual({
      question_id: 'q-2303', libelle: 'Travaux souhaités', type: 'options_multiples',
      crm_field_ids: [2303], valeur: 'id-a, id-b',
      valeur_libelles: ['Isolation des combles', 'Pompe à chaleur'],
    })
    expect(parChamp[2262].valeur_libelles).toEqual(['Mr.'])
    expect(parChamp[2015].type).toBe('telephone')
    expect(parChamp[2305]).toMatchObject({ type: 'texte_long', valeur_libelles: ['APPELER APRÈS 18H'] })
  })

  it('résout crmValue ?? label.fr ?? label[langue] ?? id, et garde une valeur inconnue telle quelle', () => {
    const enr = makeEnregistrement({
      langueUtilisee: 'es',
      reponses: [rep(Q.travaux, 'id-a, id-c, id-d, id-inconnu')],
    })
    const [r] = buildIcrmEnregistrementPayload(enr).reponses
    expect(r.valeur_libelles).toEqual(['Isolation des combles', 'Solo español', 'id-d', 'id-inconnu'])
  })

  it('ne découpe pas une option_unique et découpe options_multiples sur ", " en respectant les ids qui contiennent ", "', () => {
    const options = [
      { id: 'Isolation des murs, combles', crmValue: 'Isolation des murs, combles' },
      { id: 'Pompe à chaleur', crmValue: 'PAC' },
    ]
    const multiple = q([2303], 'Travaux', 'options_multiples', options)
    const unique = q([2299], 'Isolation', 'option_unique', options)
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement({
      reponses: [
        rep(multiple, 'Isolation des murs, combles, Pompe à chaleur'),
        rep(unique, 'Isolation des murs, combles'),
      ],
    }))
    expect(payload.reponses[0].valeur_libelles).toEqual(['Isolation des murs, combles', 'PAC'])
    expect(payload.reponses[1].valeur_libelles).toEqual(['Isolation des murs, combles'])
  })

  it('accepte l’ancien format tableau JSON pour options_multiples', () => {
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement({
      reponses: [rep(Q.travaux, '["id-b","id-a"]')],
    }))
    expect(payload.reponses[0]).toMatchObject({
      valeur: '["id-b","id-a"]',
      valeur_libelles: ['Pompe à chaleur', 'Isolation des combles'],
    })
  })

  it('omet les réponses vides, normalise crm_field_ids en entiers et complète un libellé absent', () => {
    const sansLibelle = { id: 'q-x', libelleQuestion: null, typeOption: 'option_unique', crmFieldIds: ['2292'], options: null }
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement({
      reponses: [
        rep(Q.nom, 'DUPONT'),
        rep(Q.prenom, '   '),
        rep(Q.ville, null),
        rep(sansLibelle, 'MAISON'),
        rep(q(null, 'Question libre'), 'réponse'),
      ],
    }))
    expect(payload.reponses).toHaveLength(3)
    expect(payload.reponses[1]).toEqual({
      question_id: 'q-x',
      libelle: 'Votre projet concerne (type de logement)',
      type: 'option_unique',
      crm_field_ids: [2292],
      valeur: 'MAISON',
      valeur_libelles: ['MAISON'],
    })
    expect(payload.reponses[2].crm_field_ids).toEqual([])
    expect(payload.contact).toEqual({ last_name: 'DUPONT' })
  })

  it('mappe le contact par libellé FR quand crmFieldIds est absent (LABEL_MAP)', () => {
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement({
      reponses: [rep(q(null, 'Nom'), 'MARTIN'), rep(q(null, 'E-mail', 'email'), 'c@example.com')],
    }))
    expect(payload.contact).toEqual({ last_name: 'MARTIN', email_adress: 'c@example.com' })
  })

  it('civilité : option sans crmValue (label) et valeur encodée sans option', () => {
    const civLibelle = q([2262], 'Civilité', 'option_unique', [{ id: 'u-1', label: { fr: 'Mme' } }])
    const civSansOptions = q([2262], 'Civilité', 'option_unique', null)
    expect(buildIcrmEnregistrementPayload(makeEnregistrement({ reponses: [rep(civLibelle, 'u-1')] })).contact)
      .toEqual({ civility: 'Mme' })
    expect(buildIcrmEnregistrementPayload(makeEnregistrement({ reponses: [rep(civSansOptions, '2262-2-mme')] })).contact)
      .toEqual({ civility: 'Mme' })
  })

  it('omet langue inconnue, blocs vides et contact vide ; garde reponses même vide et created_at', () => {
    const payload = buildIcrmEnregistrementPayload({
      id: ENR_ID,
      createdAt: new Date('2026-09-25T10:42:17.311Z'),
      langueUtilisee: 'de',
      borne: null,
      formulaire: null,
      reponses: [],
    })
    expect(payload).toEqual({ external_id: ENR_ID, created_at: '2026-09-25T10:42:17.311Z', reponses: [] })
  })
})

describe('buildIcrmEnregistrementPayload — v1.1 : created_at obligatoire', () => {
  it('created_at = enregistrement.createdAt en ISO-8601 UTC (Date, chaîne avec décalage)', () => {
    expect(buildIcrmEnregistrementPayload(makeEnregistrement()).created_at).toBe('2026-09-25T10:42:17.311Z')

    const avecDecalage = makeEnregistrement({ createdAt: '2026-09-25T12:42:17+02:00' })
    expect(buildIcrmEnregistrementPayload(avecDecalage).created_at).toBe('2026-09-25T10:42:17.000Z')
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['vide', ''],
    ['invalide', 'pas une date'],
  ])('createdAt %s → erreur définitive, aucun payload sans date', (_cas, createdAt) => {
    const enr = makeEnregistrement({ createdAt })

    let erreur = null
    try {
      buildIcrmEnregistrementPayload(enr)
    } catch (err) {
      erreur = err
    }
    expect(erreur).toBeInstanceOf(Error)
    expect(erreur.definitif).toBe(true)
    expect(erreur.message).toMatch(/created_at est obligatoire/)
  })

  it('processJob : createdAt invalide → echec_definitif dès la 1re tentative, sans appel réseau', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({ createdAt: null }))

    await processJob(makeJob({ tentatives: 0 }))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(appelsUpdateJob('succes')).toHaveLength(0)
    const jobDefinitif = appelsUpdateJob('echec_definitif')[0][0].data
    expect(jobDefinitif.tentatives).toBe(1)
    expect(jobDefinitif.erreur).toMatch(/sans date de création valide/)
  })
})

describe('buildIcrmEnregistrementPayload — v1.1 : borne.admin (widget « Info borne »)', () => {
  const avecAdmin = (adminBorne) => makeEnregistrement({
    borne: { ...makeEnregistrement().borne, adminBorne },
  })

  it('transmet nom, prénom, e-mail, raison sociale (raison_sociale) et SIRET de l’AdminBorne', () => {
    const { borne } = buildIcrmEnregistrementPayload(makeEnregistrement())
    expect(borne.admin).toEqual(ADMIN_ATTENDU)
    // Clés du contrat uniquement (jamais raisonSociale, passwordHash, actif…)
    expect(Object.keys(borne.admin).sort()).toEqual(['email', 'nom', 'prenom', 'raison_sociale', 'siret'])
  })

  it.each([
    ['null (borne du SuperAdmin)', null],
    ['absent', undefined],
    ['sans aucun membre renseigné', { nom: '', prenom: '  ', email: null, raisonSociale: undefined, siret: '' }],
  ])('admin %s → pas d’objet admin, le reste du bloc borne est inchangé', (_cas, adminBorne) => {
    const { borne } = buildIcrmEnregistrementPayload(avecAdmin(adminBorne))
    expect(borne).not.toHaveProperty('admin')
    expect(borne).toEqual({
      id: 'borne-uuid-1',
      id_borne: 'BORNE-1A2B3C4D',
      pays: 'FR',
      adresse: '12 AVENUE DU COMMERCE, 33000 BORDEAUX',
      commercant: 'BRICO SUD-OUEST',
      installateur: 'LENA SOLUTIONS',
    })
  })

  it('omet les membres vides et rogne les espaces', () => {
    const { borne } = buildIcrmEnregistrementPayload(avecAdmin({
      nom: '  LEFEBVRE ', prenom: '', email: null, raisonSociale: '   ', siret: ' 12345678900011 ',
    }))
    expect(borne.admin).toEqual({ nom: 'LEFEBVRE', siret: '12345678900011' })
  })

  it('e-mail mal formé omis, e-mail valide mis en minuscules ; valeur de plus de 255 caractères omise', () => {
    const invalide = buildIcrmEnregistrementPayload(avecAdmin({ ...ADMIN_BORNE, email: 'claire@brico,fr' }))
    expect(invalide.borne.admin).toEqual({
      nom: 'LEFEBVRE', prenom: 'Claire', raison_sociale: 'BRICO SUD-OUEST SAS', siret: '12345678900011',
    })

    const majuscules = buildIcrmEnregistrementPayload(avecAdmin({ ...ADMIN_BORNE, email: ' Claire.Lefebvre@Brico.FR ' }))
    expect(majuscules.borne.admin.email).toBe('claire.lefebvre@brico.fr')

    const tropLong = buildIcrmEnregistrementPayload(avecAdmin({ ...ADMIN_BORNE, raisonSociale: 'X'.repeat(256) }))
    expect(tropLong.borne.admin).not.toHaveProperty('raison_sociale')
    expect(tropLong.borne.admin.nom).toBe('LEFEBVRE')
    const limite = buildIcrmEnregistrementPayload(avecAdmin({ ...ADMIN_BORNE, raisonSociale: 'X'.repeat(255) }))
    expect(limite.borne.admin.raison_sociale).toHaveLength(255)
  })

  it('seul l’admin renseigné : le bloc borne ne contient que admin', () => {
    const payload = buildIcrmEnregistrementPayload(makeEnregistrement({ borne: { adminBorne: ADMIN_BORNE } }))
    expect(payload.borne).toEqual({ admin: ADMIN_ATTENDU })
  })
})

describe('buildIcrmEnregistrementPayload — bloc contact aux contraintes d’I-CRM', () => {
  // Questions reconnues par LIBELLÉ (pas de crmFieldIds) : non validées à la soumission.
  const qEmailLibelle = q(null, 'E-mail')
  const qTelLibelle = q(null, 'Téléphone')
  const qCpLibelle = q(null, 'Code postal')

  const contactDe = (reponses, borne) => buildIcrmEnregistrementPayload(makeEnregistrement({
    reponses,
    ...(borne ? { borne: { ...makeEnregistrement().borne, ...borne } } : {}),
  }))

  it.each([
    ['virgule au lieu du point', 'JEAN@GMAIL,COM'],
    ['espace', 'JEAN DUPONT@GMAIL'],
    ['sans domaine', 'jean.dupont'],
  ])('e-mail invalide (%s) : retiré du contact, conservé dans reponses', (_cas, email) => {
    const payload = contactDe([rep(Q.nom, 'DUPONT'), rep(qEmailLibelle, email)])

    expect(payload.contact).toEqual({ last_name: 'DUPONT' })
    const reponse = payload.reponses.find((r) => r.libelle === 'E-mail')
    expect(reponse).toMatchObject({ valeur: email, valeur_libelles: [email] })
  })

  it('e-mail valide saisi en majuscules (champ texte) : normalisé en minuscules', () => {
    const payload = contactDe([rep(qEmailLibelle, ' JEAN.DUPONT@GMAIL.COM ')])
    expect(payload.contact).toEqual({ email_adress: 'jean.dupont@gmail.com' })
  })

  it('téléphone et code postal : normalisés si valides pour le pays de la borne, sinon gardés tels quels', () => {
    const fr = contactDe([rep(qTelLibelle, '06 12 34 56 78'), rep(qCpLibelle, '75 011')])
    expect(fr.contact).toEqual({ phone_number: '+33612345678', code_postale: '75011' })

    const es = contactDe([rep(qTelLibelle, '612 34 56 78'), rep(qCpLibelle, '28013')], { pays: 'ES' })
    expect(es.contact).toEqual({ phone_number: '+34612345678', code_postale: '28013' })

    // Format douteux mais accepté par I-CRM : on ne retire pas une donnée d'identité
    const douteux = contactDe([rep(qTelLibelle, '06 12'), rep(qCpLibelle, 'CEDEX 9')])
    expect(douteux.contact).toEqual({ phone_number: '06 12', code_postale: 'CEDEX 9' })
  })

  it('valeur plus longue que la limite I-CRM : retirée du contact, conservée dans reponses', () => {
    const groupee = q([2262, 2087, 2088, 2217, 2089, 2090, 2015, 2016], 'Informations personnelles')
    const bloc = 'M. DUPONT JEAN 12 RUE X 75011 PARIS 0612345678 A@B.FR'
    const payload = contactDe([
      rep(groupee, bloc),
      rep(qCpLibelle, '1'.repeat(21)),
      rep(Q.prenom, 'J'.repeat(256)),
      rep(Q.nom, 'DUPONT'),
    ])

    expect(payload.contact).toEqual({ last_name: 'DUPONT' })
    expect(payload.reponses.map((r) => r.valeur)).toEqual([bloc, '1'.repeat(21), 'J'.repeat(256), 'DUPONT'])
  })

  it('une valeur refusée n’écrase pas une valeur valide du même champ', () => {
    const payload = contactDe([rep(Q.email, 'jean.dupont@example.com'), rep(qEmailLibelle, 'PAS UN EMAIL')])
    expect(payload.contact.email_adress).toBe('jean.dupont@example.com')
  })

  it('processJob : journalise les champs retirés (nom + motif), jamais leur valeur', async () => {
    mockPrisma.enregistrement.findUnique.mockResolvedValue(makeEnregistrement({
      reponses: [rep(Q.nom, 'DUPONT'), rep(qEmailLibelle, 'JEAN@GMAIL,COM')],
    }))
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: 3 }))

    await processJob(makeJob())

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.contact).toEqual({ last_name: 'DUPONT' })
    const log = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /retirées du bloc contact/.test(l.message))
    expect(log).toMatchObject({
      enregistrementId: ENR_ID,
      canalId: 'canal-uuid-1',
      contactEcarte: [{ champ: 'email_adress', motif: 'EMAIL_INVALIDE', question_id: 'q-E-mail' }],
    })
    expect(tousLesLogs()).not.toContain('JEAN@GMAIL,COM')
    expect(tousLesLogs()).not.toContain('DUPONT')
    expect(appelsUpdateJob('succes')).toHaveLength(1)
  })
})

// ─── processJob — canal icrm_api_key ─────────────────────────────────────────

describe('processJob — canal icrm_api_key : envoi', () => {
  it('POST sur l’URL normalisée avec X-Api-Key, X-Api-Secret, Idempotency-Key, sans Azure ni Bearer', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, {
      status: 'created', projet_id: 1234, projet_ref: 'P-XX2026001234', contact_id: 567, warnings: [],
    }))

    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(URL_ATTENDUE)
    expect(options.method).toBe('POST')
    expect(options.redirect).toBe('manual')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': CLE,
      'X-Api-Secret': SECRET,
      'Idempotency-Key': ENR_ID,
    })
    expect(options.headers.Authorization).toBeUndefined()
    // Jamais d'appel à l'autorité Azure AD ni de persistance de token
    expect(url).not.toMatch(/oauth2|auth\.dev\.ila26\.fr|customContacts/)
    expect(mockPrisma.canal.update).not.toHaveBeenCalled()

    const body = JSON.parse(options.body)
    expect(body.external_id).toBe(ENR_ID)
    expect(body.contact.last_name).toBe('DUPONT')
    expect(body.reponses).toHaveLength(11)
  })

  it('charge typeOption/options des questions et les métadonnées borne/formulaire', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: 1 }))
    await processJob(makeJob())

    const { include } = mockPrisma.enregistrement.findUnique.mock.calls[0][0]
    expect(include.reponses.include.question.select).toMatchObject({
      libelleQuestion: true, crmFieldIds: true, typeOption: true, options: true,
    })
    expect(include.borne.select).toMatchObject({
      canalTransmission: true, pays: true, adresse: true, commercant: true, regie: true, installateur: true,
    })
    expect(include.formulaire).toEqual({ select: { id: true, label: true, version: true } })
  })

  it('charge l’AdminBorne de la borne avec une liste fermée de colonnes (jamais passwordHash)', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: 1 }))
    await processJob(makeJob())

    const { include } = mockPrisma.enregistrement.findUnique.mock.calls[0][0]
    expect(include.borne.select.adminBorne).toEqual({
      select: { nom: true, prenom: true, email: true, raisonSociale: true, siret: true },
    })
    expect(include.borne.select.adminBorne.select).not.toHaveProperty('passwordHash')
  })

  it('envoie borne.admin et created_at dans le corps POST', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: 1 }))
    await processJob(makeJob())

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.created_at).toBe('2026-09-25T10:42:17.311Z')
    expect(body.borne.admin).toEqual(ADMIN_ATTENDU)
  })

  it('choisit le canal par canalTransmission même si un canal azure_ad est plus récent', async () => {
    const enr = makeEnregistrement()
    enr.borne.canaux = [
      { id: 'canal-azure', label: 'ancien', type: 'azure_ad', apiUrl: 'https://legacy.example', apiKey: 'rt', token: 'at', actif: true },
      ...enr.borne.canaux,
    ]
    mockPrisma.enregistrement.findUnique.mockResolvedValue(enr)
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: 1 }))

    await processJob(makeJob())

    expect(global.fetch.mock.calls[0][0]).toBe(URL_ATTENDUE)
  })

  it('un canal sans type (antérieur à la migration) suit le chemin historique Bearer / customContacts', async () => {
    // access token encore valide 1 h : pas de refresh Azure, un seul appel réseau
    const accessToken = [
      'e30',
      Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'signature',
    ].join('.')
    const enr = makeEnregistrement()
    enr.borne.canaux = [{ id: 'c', label: 'icrm-lena-prod', apiUrl: 'https://legacy.example', apiKey: 'rt', token: accessToken, actif: true }]
    mockPrisma.enregistrement.findUnique.mockResolvedValue(enr)
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://legacy.example/api/customContacts?lang=fr')
    expect(options.headers.Authorization).toBe(`Bearer ${accessToken}`)
    expect(options.headers['X-Api-Key']).toBeUndefined()
    // Corps historique inchangé : ni bloc borne/admin ni created_at du contrat v1.1
    const corps = JSON.parse(options.body)
    expect(corps).not.toHaveProperty('borne')
    expect(corps).not.toHaveProperty('created_at')
    expect(options.body).not.toContain(ADMIN_BORNE.email)
    // Le chemin historique n'écrit pas les colonnes de traçabilité
    const succes = appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'partage')
    expect(succes.data).toEqual({ statutPartage: 'partage', partageAt: expect.any(Date) })
  })
})

describe('processJob — canal icrm_api_key : réponses 2xx', () => {
  it('201 created → succès, trace crmProjetId / crmProjetRef, notification Pusher', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, {
      status: 'created', projet_id: 1234, projet_ref: 'P-XX2026001234', contact_id: 567, warnings: [],
    }))

    await processJob(makeJob())

    expect(appelsUpdateJob('succes')).toHaveLength(1)
    const succes = appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'partage')
    expect(succes.data).toEqual({
      statutPartage: 'partage',
      partageAt: expect.any(Date),
      crmProjetId: '1234',
      crmProjetRef: 'P-XX2026001234',
    })
    expect(mockNotifySucces).toHaveBeenCalledWith('borne-uuid-1', ENR_ID)
    expect(mockNotifyEchec).not.toHaveBeenCalled()

    const logSucces = mockLogger.info.mock.calls.map((c) => c[0]).find((l) => /Job succès/.test(l.message))
    expect(logSucces).toMatchObject({
      canalType: 'icrm_api_key', httpStatus: 201, statutIcrm: 'created', crmProjetId: '1234',
    })
  })

  it('200 already_processed (rejeu idempotent) → succès', async () => {
    global.fetch.mockResolvedValue(reponseHttp(200, {
      status: 'already_processed', projet_id: 1234, projet_ref: 'P-XX2026001234', contact_id: 567, warnings: [],
    }))

    await processJob(makeJob({ tentatives: 2 }))

    expect(appelsUpdateJob('succes')).toHaveLength(1)
    expect(appelsUpdateJob('echec_temporaire')).toHaveLength(0)
  })

  it('projet_id numérique en chaîne accepté', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, { status: 'created', projet_id: '1234', projet_ref: 'P-1' }))

    await processJob(makeJob())

    const succes = appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'partage')
    expect(succes.data).toMatchObject({ crmProjetId: '1234', crmProjetRef: 'P-1' })
  })
})

describe('processJob — canal icrm_api_key : 2xx non conforme au contrat', () => {
  // Page d'un front en repli SPA (URL de l'application au lieu de l'API), page de
  // proxy, autre API derrière une mauvaise URL de base : aucune preuve que
  // l'opportunité existe → jamais « partagé ».
  it.each([
    ['page HTML 200 (repli SPA d’un front)', () => reponseHttp(200, '<!doctype html><html><body><div id="app"></div></body></html>'), /réponse non JSON/],
    ['204 sans corps', () => reponseHttp(204), /réponse non JSON/],
    ['JSON 200 d’une autre API', () => reponseHttp(200, { ok: true }), /ni status ni projet_id/],
    ['201 sans projet_id', () => reponseHttp(201, { status: 'created', warnings: [] }), /ni status ni projet_id/],
    ['200 status inconnu', () => reponseHttp(200, { status: 'accepted', projet_id: 12 }), /ni status ni projet_id/],
  ])('%s → echec_definitif dès la 1re tentative, enregistrement non partagé', async (_cas, fabrique, nature) => {
    global.fetch.mockResolvedValue(fabrique())

    await processJob(makeJob({ tentatives: 0 }))

    expect(appelsUpdateJob('succes')).toHaveLength(0)
    expect(appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'partage')).toBeUndefined()
    expect(mockNotifySucces).not.toHaveBeenCalled()

    const jobDefinitif = appelsUpdateJob('echec_definitif')[0][0].data
    expect(jobDefinitif.tentatives).toBe(1)
    expect(jobDefinitif.erreur).toMatch(/non conforme au contrat/)
    expect(jobDefinitif.erreur).toMatch(nature)
    expect(jobDefinitif.erreur).toMatch(/vérifier l'URL API/)
    expect(appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'echec_definitif')).toBeDefined()
    expect(mockNotifyEchec).toHaveBeenCalledWith('borne-uuid-1', ENR_ID, expect.stringMatching(/non conforme/))

    const logErreur = mockLogger.error.mock.calls.map((c) => c[0]).find((l) => /échec définitif/.test(l.message))
    expect(logErreur).toMatchObject({ codeIcrm: 'reponse_non_conforme' })
    expect(tousLesLogs()).not.toContain('<!doctype html>')
  })

  it('2xx dont le corps ne peut pas être lu (délai dépassé) → échec temporaire, jamais « partagé »', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => null },
      text: async () => { throw abort },
    })

    await processJob(makeJob({ tentatives: 0 }))

    expect(appelsUpdateJob('succes')).toHaveLength(0)
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    const [appel] = appelsUpdateJob('echec_temporaire')
    expect(appel[0].data).toMatchObject({ tentatives: 1, prochainEssai: expect.any(Date) })
    expect(appel[0].data.erreur).toBe(
      'I-CRM HTTP 201 : lecture de la réponse impossible (délai de 30 s dépassé) — nouvel essai automatique',
    )
    expect(appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'partage')).toBeUndefined()
  })

  it('un corps illisible sur une erreur HTTP garde la classification par statut', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => { throw new Error('socket hang up') },
    })

    await processJob(makeJob())

    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toBe('I-CRM HTTP 401 (réponse non JSON)')
  })

  it('journalise les warnings I-CRM sans leurs valeurs (RGPD)', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, {
      status: 'created', projet_id: 9, projet_ref: 'P-9',
      warnings: [
        { code: 'unmapped_field', crm_field_ids: [2305], libelle: 'Commentaires', value: 'APPELER APRÈS 18H' },
        { code: 'unmatched_option', crm_field_ids: [2294], libelle: 'Revenu', value: '2- Entre 23734€ et 30427€' },
      ],
    }))

    await processJob(makeJob())

    const log = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /non mappées/.test(l.message))
    expect(log).toMatchObject({ nbWarnings: 2, crmProjetId: '9', jobId: 'job-uuid-1' })
    expect(log.warnings).toEqual([
      { code: 'unmapped_field', crm_field_ids: [2305], libelle: 'Commentaires' },
      { code: 'unmatched_option', crm_field_ids: [2294], libelle: 'Revenu' },
    ])
    expect(tousLesLogs()).not.toContain('APPELER APRÈS 18H')
    expect(tousLesLogs()).not.toContain('23734€')
  })

  it('v1.1 borne_field_missing : journalise la clé du champ « Info borne », jamais la valeur', async () => {
    global.fetch.mockResolvedValue(reponseHttp(201, {
      status: 'created', projet_id: 10, projet_ref: 'P-10',
      warnings: [
        { code: 'borne_field_missing', key: 'projets_ema_admin_email', value: ADMIN_BORNE.email },
        // clé inattendue (pas un identifiant de champ) : ignorée
        { code: 'borne_field_missing', key: ADMIN_BORNE.email, value: 'x' },
      ],
    }))

    await processJob(makeJob())

    const log = mockLogger.warn.mock.calls.map((c) => c[0]).find((l) => /non mappées/.test(l.message))
    expect(log.warnings).toEqual([
      { code: 'borne_field_missing', crm_field_ids: [], libelle: null, key: 'projets_ema_admin_email' },
      { code: 'borne_field_missing', crm_field_ids: [], libelle: null },
    ])
    expect(tousLesLogs()).not.toContain(ADMIN_BORNE.email)
    expect(appelsUpdateJob('succes')).toHaveLength(1)
  })
})

describe('processJob — canal icrm_api_key : échecs définitifs immédiats', () => {
  it.each([
    [401, 'invalid_credentials'],
    [403, 'client_disabled'],
    [403, 'subscription_inactive'],
    [404, 'not_found'],
    [413, 'payload_too_large'],
    [422, 'insufficient_identity'],
    [422, 'validation_failed'],
  ])('HTTP %i %s → echec_definitif dès la 1re tentative, sans réessai', async (status, code) => {
    global.fetch.mockResolvedValue(reponseHttp(status, erreurIcrm(code)))

    await processJob(makeJob({ tentatives: 0 }))

    expect(appelsUpdateJob('echec_temporaire')).toHaveLength(0)
    const [ops] = mockPrisma.$transaction.mock.calls[0]
    expect(ops).toHaveLength(2)
    const jobDefinitif = appelsUpdateJob('echec_definitif')[0][0].data
    expect(jobDefinitif.tentatives).toBe(1)
    expect(jobDefinitif.prochainEssai).toBeUndefined()
    expect(jobDefinitif.erreur).toContain(`HTTP ${status}`)
    expect(jobDefinitif.erreur).toContain(code)
    expect(jobDefinitif.erreur).toContain('req-42')

    const enrDefinitif = appelsUpdateEnregistrement().find((u) => u.data.statutPartage === 'echec_definitif')
    expect(enrDefinitif.data.derniereErreur).toContain(code)
    expect(mockNotifyEchec).toHaveBeenCalledWith('borne-uuid-1', ENR_ID, expect.stringContaining(code))

    const logErreur = mockLogger.error.mock.calls.map((c) => c[0]).find((l) => /échec définitif/.test(l.message))
    expect(logErreur).toMatchObject({ httpStatus: status, codeIcrm: code })
  })

  it('422 sur borne.admin : l’erreur nomme le champ, jamais la valeur de l’AdminBorne', async () => {
    global.fetch.mockResolvedValue(reponseHttp(422, {
      error: {
        code: 'validation_failed',
        message: 'Données invalides',
        request_id: 'req-43',
        details: { 'borne.admin.email': [`${ADMIN_BORNE.email} n'est pas accepté`] },
      },
    }))

    await processJob(makeJob())

    const erreur = appelsUpdateJob('echec_definitif')[0][0].data.erreur
    expect(erreur).toContain('borne.admin.email')
    expect(erreur).not.toContain(ADMIN_BORNE.email)
    expect(tousLesLogs()).not.toContain(ADMIN_BORNE.email)
  })

  it('redirection (3xx) → échec définitif, la redirection n’est pas suivie', async () => {
    global.fetch.mockResolvedValue(reponseHttp(301, undefined, { location: 'https://ailleurs.example' }))

    await processJob(makeJob())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const jobDefinitif = appelsUpdateJob('echec_definitif')[0][0].data
    expect(jobDefinitif.erreur).toMatch(/redirection refusée/)
  })

  it('canal incomplet (secret manquant) → échec définitif sans appel réseau', async () => {
    const enr = makeEnregistrement()
    enr.borne.canaux[0].token = ''
    mockPrisma.enregistrement.findUnique.mockResolvedValue(enr)

    await processJob(makeJob())

    expect(global.fetch).not.toHaveBeenCalled()
    expect(appelsUpdateJob('echec_definitif')[0][0].data.erreur).toMatch(/incomplet/)
  })
})

describe('processJob — canal icrm_api_key : échecs temporaires (backoff existant)', () => {
  it.each([
    [409, 'delivery_in_progress'],
    [408, 'request_timeout'],
    [429, 'too_many_requests'],
    [500, 'internal_error'],
    [503, 'internal_error'],
  ])('HTTP %i %s → echec_temporaire avec prochainEssai', async (status, code) => {
    global.fetch.mockResolvedValue(reponseHttp(status, erreurIcrm(code)))

    await processJob(makeJob({ tentatives: 0 }))

    const [appel] = appelsUpdateJob('echec_temporaire')
    expect(appel[0].data).toMatchObject({ tentatives: 1, prochainEssai: expect.any(Date) })
    expect(appel[0].data.erreur).toContain(code)
    expect(appelsUpdateJob('echec_definitif')).toHaveLength(0)
    expect(mockNotifyEchec).not.toHaveBeenCalled()
  })

  it('réponse 502 non JSON (proxy) → échec temporaire lisible', async () => {
    global.fetch.mockResolvedValue(reponseHttp(502, '<html>Bad Gateway</html>'))

    await processJob(makeJob())

    const [appel] = appelsUpdateJob('echec_temporaire')
    expect(appel[0].data.erreur).toBe('I-CRM HTTP 502 (réponse non JSON)')
  })

  it('erreur réseau → échec temporaire', async () => {
    global.fetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND icrm.api.ila26.fr'))

    await processJob(makeJob())

    expect(appelsUpdateJob('echec_temporaire')[0][0].data.erreur).toContain('ENOTFOUND')
  })

  it('timeout (AbortError) → échec temporaire', async () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    global.fetch.mockRejectedValue(abort)

    await processJob(makeJob())

    expect(appelsUpdateJob('echec_temporaire')).toHaveLength(1)
  })

  it('5xx sur la dernière tentative → echec_definitif (MAX_TENTATIVES)', async () => {
    global.fetch.mockResolvedValue(reponseHttp(500, erreurIcrm('internal_error')))

    await processJob(makeJob({ tentatives: MAX_TENTATIVES - 1 }))

    expect(appelsUpdateJob('echec_definitif')[0][0].data.tentatives).toBe(MAX_TENTATIVES)
    expect(mockNotifyEchec).toHaveBeenCalled()
  })
})

describe('processJob — canal icrm_api_key : confidentialité des journaux', () => {
  it.each([
    ['succès', () => reponseHttp(201, { status: 'created', projet_id: 1 })],
    ['422', () => reponseHttp(422, erreurIcrm('insufficient_identity'))],
    ['500', () => reponseHttp(500, erreurIcrm('internal_error'))],
  ])('%s : ni secret, ni clé, ni valeur saisie dans les logs', async (_cas, fabrique) => {
    global.fetch.mockResolvedValue(fabrique())

    await processJob(makeJob())

    const logs = tousLesLogs()
    expect(logs).not.toContain(SECRET)
    expect(logs).not.toContain('DUPONT')
    expect(logs).not.toContain('jean.dupont@example.com')
    expect(logs).not.toContain('+33612345678')
    // Données de l'AdminBorne (bloc borne.admin) : jamais journalisées
    expect(logs).not.toContain(ADMIN_BORNE.nom)
    expect(logs).not.toContain(ADMIN_BORNE.email)
    expect(logs).not.toContain(ADMIN_BORNE.raisonSociale)
    expect(logs).not.toContain(ADMIN_BORNE.siret)
    const erreurs = mockPrisma.partageJob.update.mock.calls.map((c) => c[0].data.erreur).filter(Boolean)
    erreurs.forEach((e) => expect(e).not.toContain(SECRET))
  })
})
