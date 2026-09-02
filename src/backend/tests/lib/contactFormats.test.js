/**
 * tests/lib/contactFormats.test.js
 *
 * Règle projet n°9 — validation de format côté backend.
 *
 * Contexte (audit production) :
 *   - la valeur "TEST AUDIT" a été acceptée dans un champ code postal
 *     obligatoire et persistée (HTTP 201) ;
 *   - un téléphone était stocké "+33 0600000000" — le 0 national n'était pas
 *     retiré, la valeur n'était pas au format E.164.
 *
 * Field IDs CRM couverts (docs/CONTEXT.md) : 2089 code postal, 2015 téléphone,
 * 2016 email. Aucun ID inventé.
 */

import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

import {
  validateCodePostal,
  validateTelephone,
  validateEmail,
  detectContactFormat,
  validateReponsesContact,
  validateSubmissionValues,
  CRM_FIELD_ID_CODE_POSTAL,
  CRM_FIELD_ID_TELEPHONE,
  CRM_FIELD_ID_EMAIL,
} from '../../src/lib/contactFormats.js'

// ─── Field IDs CRM ───────────────────────────────────────────────────────────

describe('Field IDs CRM (docs/CONTEXT.md)', () => {
  test('code postal = 2089, téléphone = 2015, email = 2016', () => {
    expect(CRM_FIELD_ID_CODE_POSTAL).toBe(2089)
    expect(CRM_FIELD_ID_TELEPHONE).toBe(2015)
    expect(CRM_FIELD_ID_EMAIL).toBe(2016)
  })
})

// ─── Code postal ─────────────────────────────────────────────────────────────

describe('validateCodePostal — pays connu', () => {
  test('FR : 75001 accepté', () => {
    expect(validateCodePostal('75001', 'FR')).toMatchObject({ valid: true, value: '75001' })
  })

  test('FR : "TEST AUDIT" rejeté (régression audit production)', () => {
    const r = validateCodePostal('TEST AUDIT', 'FR')
    expect(r.valid).toBe(false)
    expect(r.code).toBe('CODE_POSTAL_INVALIDE')
  })

  test('FR : 4 chiffres rejetés', () => {
    expect(validateCodePostal('7500', 'FR').valid).toBe(false)
  })

  test('FR : 6 chiffres rejetés', () => {
    expect(validateCodePostal('750011', 'FR').valid).toBe(false)
  })

  test('FR : espaces internes tolérés et normalisés', () => {
    expect(validateCodePostal(' 75 001 ', 'FR')).toMatchObject({ valid: true, value: '75001' })
  })

  test('ES : 28001 accepté', () => {
    expect(validateCodePostal('28001', 'ES')).toMatchObject({ valid: true, value: '28001' })
  })

  test('BE : 4 chiffres acceptés, 5 chiffres rejetés', () => {
    expect(validateCodePostal('1000', 'BE').valid).toBe(true)
    expect(validateCodePostal('75001', 'BE').valid).toBe(false)
  })

  test('GB : SW1A 1AA accepté et reformaté', () => {
    expect(validateCodePostal('sw1a1aa', 'GB')).toMatchObject({ valid: true, value: 'SW1A 1AA' })
  })

  test('NL : 1012AB accepté et reformaté en « 1012 AB »', () => {
    expect(validateCodePostal('1012ab', 'NL')).toMatchObject({ valid: true, value: '1012 AB' })
  })

  test('PT : 1000-001 accepté et reformaté', () => {
    expect(validateCodePostal('1000001', 'PT')).toMatchObject({ valid: true, value: '1000-001' })
  })

  test('le pays est comparé sans tenir compte de la casse', () => {
    expect(validateCodePostal('75001', 'fr').valid).toBe(true)
  })
})

describe('validateCodePostal — pays inconnu (règle générique)', () => {
  test('"TEST AUDIT" rejeté : aucun chiffre', () => {
    const r = validateCodePostal('TEST AUDIT', 'ZZ')
    expect(r.valid).toBe(false)
    expect(r.code).toBe('CODE_POSTAL_INVALIDE')
  })

  test('pays absent (undefined) : "TEST AUDIT" rejeté aussi', () => {
    expect(validateCodePostal('TEST AUDIT').valid).toBe(false)
  })

  test('un code alphanumérique plausible est accepté', () => {
    expect(validateCodePostal('AB12 3CD', 'ZZ')).toMatchObject({ valid: true, value: 'AB123CD' })
  })

  test('trop court (2 caractères) rejeté', () => {
    expect(validateCodePostal('12', 'ZZ').valid).toBe(false)
  })

  test('trop long (11 caractères) rejeté', () => {
    expect(validateCodePostal('12345678901', 'ZZ').valid).toBe(false)
  })

  test('valeur vide rejetée', () => {
    expect(validateCodePostal('', 'FR')).toMatchObject({ valid: false, code: 'CODE_POSTAL_VIDE' })
  })
})

// ─── Téléphone ───────────────────────────────────────────────────────────────

describe('validateTelephone — normalisation E.164', () => {
  test('"+33 0600000000" → "+33600000000" (régression audit production)', () => {
    expect(validateTelephone('+33 0600000000', 'FR')).toEqual({
      valid: true,
      value: '+33600000000',
    })
  })

  test('"+33 0600000000" normalisé même quand la borne est dans un autre pays', () => {
    expect(validateTelephone('+33 0600000000', 'ES').value).toBe('+33600000000')
  })

  test('national FR "06 00 00 00 00" → "+33600000000"', () => {
    expect(validateTelephone('06 00 00 00 00', 'FR').value).toBe('+33600000000')
  })

  test('déjà E.164 : "+33600000000" inchangé', () => {
    expect(validateTelephone('+33600000000', 'FR').value).toBe('+33600000000')
  })

  test('préfixe international "0033600000000" → "+33600000000"', () => {
    expect(validateTelephone('0033600000000', 'FR').value).toBe('+33600000000')
  })

  test('ES : "+34 600123456" accepté sans retrait de préfixe', () => {
    expect(validateTelephone('+34 600123456', 'ES').value).toBe('+34600123456')
  })

  test('IT : le 0 initial fait partie du numéro et est conservé', () => {
    expect(validateTelephone('+39 0612345678', 'IT').value).toBe('+390612345678')
  })

  test('"TEST AUDIT" rejeté', () => {
    const r = validateTelephone('TEST AUDIT', 'FR')
    expect(r.valid).toBe(false)
    expect(r.code).toBe('TELEPHONE_CARACTERES_INVALIDES')
  })

  test('numéro FR trop court rejeté', () => {
    expect(validateTelephone('+33 06', 'FR')).toMatchObject({
      valid: false,
      code: 'TELEPHONE_INVALIDE',
    })
  })

  test('numéro FR trop long rejeté', () => {
    expect(validateTelephone('06000000001234', 'FR').valid).toBe(false)
  })

  test('valeur vide rejetée', () => {
    expect(validateTelephone('', 'FR')).toMatchObject({ valid: false, code: 'TELEPHONE_VIDE' })
  })

  test('pays inconnu + numéro national → format international exigé', () => {
    expect(validateTelephone('600000000', 'ZZ')).toMatchObject({
      valid: false,
      code: 'TELEPHONE_INTERNATIONAL_REQUIS',
    })
  })

  test('pays inconnu + indicatif inconnu mais E.164 plausible → accepté', () => {
    expect(validateTelephone('+2991234567', 'ZZ')).toEqual({ valid: true, value: '+2991234567' })
  })

  test('jamais plus de 15 chiffres (borne E.164)', () => {
    const r = validateTelephone('+2991234567890123456', 'ZZ')
    expect(r.valid).toBe(false)
  })
})

// ─── Email ───────────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  test('adresse valide acceptée', () => {
    expect(validateEmail('jean.dupont@example.com')).toEqual({
      valid: true,
      value: 'jean.dupont@example.com',
    })
  })

  test('normalisation en minuscules (le front met les champs texte en UPPERCASE)', () => {
    expect(validateEmail('JEAN.DUPONT@EXAMPLE.COM').value).toBe('jean.dupont@example.com')
  })

  test('"TEST AUDIT" rejeté', () => {
    expect(validateEmail('TEST AUDIT')).toMatchObject({ valid: false, code: 'EMAIL_INVALIDE' })
  })

  test('sans arobase rejeté', () => {
    expect(validateEmail('jeandupont.example.com').valid).toBe(false)
  })

  test('sans TLD rejeté', () => {
    expect(validateEmail('jean@localhost').valid).toBe(false)
  })

  test('valeur vide rejetée', () => {
    expect(validateEmail('')).toMatchObject({ valid: false, code: 'EMAIL_VIDE' })
  })
})

// ─── Détection du type de champ ──────────────────────────────────────────────

describe('detectContactFormat', () => {
  test('crmFieldIds [2089] → code_postal', () => {
    expect(detectContactFormat({ crmFieldIds: [2089], typeOption: 'texte_court' })).toBe(
      'code_postal'
    )
  })

  test('crmFieldIds [2015] → telephone', () => {
    expect(detectContactFormat({ crmFieldIds: [2015], typeOption: 'texte_court' })).toBe(
      'telephone'
    )
  })

  test('crmFieldIds [2016] → email', () => {
    expect(detectContactFormat({ crmFieldIds: [2016], typeOption: 'texte_court' })).toBe('email')
  })

  test('typeOption telephone / email suffit sans field ID', () => {
    expect(detectContactFormat({ typeOption: 'telephone' })).toBe('telephone')
    expect(detectContactFormat({ typeOption: 'email' })).toBe('email')
  })

  test('question groupée (plusieurs field IDs) → aucun format déduit', () => {
    expect(
      detectContactFormat({ crmFieldIds: [2262, 2087, 2088, 2089], typeOption: 'texte_court' })
    ).toBeNull()
  })

  test('question hors contact (2087 Nom) → null', () => {
    expect(detectContactFormat({ crmFieldIds: [2087], typeOption: 'texte_court' })).toBeNull()
  })

  test('crmFieldIds absent → null', () => {
    expect(detectContactFormat({ typeOption: 'texte_court' })).toBeNull()
    expect(detectContactFormat(null)).toBeNull()
  })
})

// ─── Agrégation V2 ───────────────────────────────────────────────────────────

describe('validateReponsesContact', () => {
  const questionsById = new Map([
    ['q-cp', { id: 'q-cp', typeOption: 'texte_court', crmFieldIds: [2089] }],
    ['q-tel', { id: 'q-tel', typeOption: 'telephone', crmFieldIds: [2015] }],
    ['q-mail', { id: 'q-mail', typeOption: 'email', crmFieldIds: [2016] }],
    ['q-nom', { id: 'q-nom', typeOption: 'texte_court', crmFieldIds: [2087] }],
  ])

  test('normalise le téléphone et laisse les autres champs intacts', () => {
    const { reponses, erreurs } = validateReponsesContact(
      [
        { questionId: 'q-cp', valeur: '75001' },
        { questionId: 'q-tel', valeur: '+33 0600000000' },
        { questionId: 'q-mail', valeur: 'JEAN@EXAMPLE.COM' },
        { questionId: 'q-nom', valeur: 'DUPONT' },
      ],
      questionsById,
      'FR'
    )
    expect(erreurs).toEqual([])
    expect(reponses).toEqual([
      { questionId: 'q-cp', valeur: '75001' },
      { questionId: 'q-tel', valeur: '+33600000000' },
      { questionId: 'q-mail', valeur: 'jean@example.com' },
      { questionId: 'q-nom', valeur: 'DUPONT' },
    ])
  })

  test('remonte une erreur pour "TEST AUDIT" en code postal', () => {
    const { erreurs } = validateReponsesContact(
      [{ questionId: 'q-cp', valeur: 'TEST AUDIT' }],
      questionsById,
      'FR'
    )
    expect(erreurs).toHaveLength(1)
    expect(erreurs[0]).toMatchObject({
      questionId: 'q-cp',
      champ: 'code_postal',
      code: 'CODE_POSTAL_INVALIDE',
    })
    expect(typeof erreurs[0].message).toBe('string')
  })

  test('une réponse vide n\'est pas contrôlée (abandon = envoi partiel)', () => {
    const { erreurs } = validateReponsesContact(
      [{ questionId: 'q-cp', valeur: '' }, { questionId: 'q-tel', valeur: '   ' }],
      questionsById,
      'FR'
    )
    expect(erreurs).toEqual([])
  })

  test('une question inconnue est laissée telle quelle', () => {
    const { reponses, erreurs } = validateReponsesContact(
      [{ questionId: 'q-inconnue', valeur: 'TEST AUDIT' }],
      questionsById,
      'FR'
    )
    expect(erreurs).toEqual([])
    expect(reponses[0].valeur).toBe('TEST AUDIT')
  })
})

// ─── Agrégation V1 ───────────────────────────────────────────────────────────

describe('validateSubmissionValues (V1)', () => {
  test('normalise 2015 en E.164 et 2016 en minuscules', () => {
    const { values, erreurs } = validateSubmissionValues([
      { fieldId: 2087, value: 'Dupont' },
      { fieldId: 2089, value: '75001' },
      { fieldId: 2015, value: '+33 0600000000' },
      { fieldId: 2016, value: 'JEAN@EXAMPLE.COM' },
    ])
    expect(erreurs).toEqual([])
    expect(values).toEqual([
      { fieldId: 2087, value: 'Dupont' },
      { fieldId: 2089, value: '75001' },
      { fieldId: 2015, value: '+33600000000' },
      { fieldId: 2016, value: 'jean@example.com' },
    ])
  })

  test('rejette "TEST AUDIT" sur le field 2089', () => {
    const { erreurs } = validateSubmissionValues([{ fieldId: 2089, value: 'TEST AUDIT' }])
    expect(erreurs).toHaveLength(1)
    expect(erreurs[0].fieldId).toBe(2089)
  })

  test('les valeurs tableau (options multiples) ne sont jamais contrôlées', () => {
    const { erreurs, values } = validateSubmissionValues([
      { fieldId: 2303, value: ['Isolation', 'Chauffage'] },
    ])
    expect(erreurs).toEqual([])
    expect(values[0].value).toEqual(['Isolation', 'Chauffage'])
  })
})

// ─── Tests de route (V2 + V1) ────────────────────────────────────────────────

const mockPrisma = {
  configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  superAdmin: { findUnique: jest.fn() },
  adminBorne: { findUnique: jest.fn(), findMany: jest.fn() },
  borne: { findUnique: jest.fn(), findMany: jest.fn() },
  formulaire: { findUnique: jest.fn() },
  question: { findMany: jest.fn() },
  enregistrement: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  partageJob: { create: jest.fn() },
  enregistrementReponse: { findMany: jest.fn().mockResolvedValue([]) },
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ prisma: mockPrisma }))

jest.unstable_mockModule('../../src/services/authService.js', () => ({
  loginUser: jest.fn(),
  issueAccessToken: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/refreshTokenService.js', () => ({
  createRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  cleanupExpiredTokens: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn().mockResolvedValue(false),
  cleanupExpired: jest.fn(),
}))

process.env.JWT_SECRET = 'test_jwt_secret'
process.env.API_KEY_MOBILE = 'ema_mobile_test'

const { default: request } = await import('supertest')
const { default: app } = await import('../../src/app.js')

const adminBorneToken = jwt.sign({ sub: 'uuid-admin', role: 'ADMIN_BORNE' }, 'test_jwt_secret', {
  expiresIn: '1h',
})
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

const BORNE_ID = '11111111-1111-4111-8111-111111111111'
const FORM_ID = '22222222-2222-4222-8222-222222222222'
const Q_CP = '33333333-3333-4333-8333-333333333333'
const Q_TEL = '44444444-4444-4444-8444-444444444444'

function armPrisma(pays = 'FR') {
  mockPrisma.borne.findUnique.mockResolvedValue({
    id: BORNE_ID,
    adminBorneId: 'uuid-admin',
    pays,
  })
  mockPrisma.question.findMany.mockResolvedValue([
    { id: Q_CP, typeOption: 'texte_court', crmFieldIds: [2089] },
    { id: Q_TEL, typeOption: 'telephone', crmFieldIds: [2015] },
  ])
  mockPrisma.formulaire.findUnique.mockResolvedValue({ version: '1.0.0' })
  mockPrisma.partageJob.create.mockResolvedValue({ id: 'job-1' })
  mockPrisma.enregistrement.create.mockImplementation(async ({ data }) => ({
    id: 'uuid-enr-1',
    ...data,
    reponses: data.reponses.create,
  }))
}

describe('POST /api/enregistrements — validation de format (règle 9)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    armPrisma()
  })

  it('code postal "TEST AUDIT" → 400 au lieu de 201', async () => {
    const res = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        borneId: BORNE_ID,
        formulaireId: FORM_ID,
        reponses: [{ questionId: Q_CP, valeur: 'TEST AUDIT' }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.formatErrors[0]).toMatchObject({
      questionId: Q_CP,
      champ: 'code_postal',
    })
    expect(mockPrisma.enregistrement.create).not.toHaveBeenCalled()
  })

  it('téléphone "+33 0600000000" → 201 et persistance en E.164', async () => {
    const res = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        borneId: BORNE_ID,
        formulaireId: FORM_ID,
        reponses: [
          { questionId: Q_CP, valeur: '75001' },
          { questionId: Q_TEL, valeur: '+33 0600000000' },
        ],
      })

    expect(res.status).toBe(201)
    const created = mockPrisma.enregistrement.create.mock.calls[0][0].data.reponses.create
    expect(created).toEqual([
      { questionId: Q_CP, valeur: '75001' },
      { questionId: Q_TEL, valeur: '+33600000000' },
    ])
  })

  it('borne espagnole : code postal FR à 5 chiffres accepté, 4 chiffres rejeté', async () => {
    armPrisma('ES')
    const ok = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        borneId: BORNE_ID,
        formulaireId: FORM_ID,
        reponses: [{ questionId: Q_CP, valeur: '28001' }],
      })
    expect(ok.status).toBe(201)

    const ko = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        borneId: BORNE_ID,
        formulaireId: FORM_ID,
        reponses: [{ questionId: Q_CP, valeur: '2800' }],
      })
    expect(ko.status).toBe(400)
  })
})

describe('POST /api/submissions (V1) — validation de format (règle 9)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.submission.create.mockResolvedValue({
      id: 'uuid-1234',
      createdAt: new Date('2026-09-02T00:00:00Z'),
      synced: false,
      configVersion: '1.0.0',
      values: [],
    })
  })

  it('code postal "TEST AUDIT" (field 2089) → 400', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', 'ema_mobile_test')
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2089, value: 'TEST AUDIT' }] })

    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
    expect(mockPrisma.submission.create).not.toHaveBeenCalled()
  })

  it('téléphone "+33 0600000000" (field 2015) → 201 et persistance en E.164', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', 'ema_mobile_test')
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2015, value: '+33 0600000000' }] })

    expect(res.status).toBe(201)
    const created = mockPrisma.submission.create.mock.calls[0][0].data.values.create
    expect(created).toEqual([{ fieldId: 2015, value: '+33600000000' }])
  })

  it('une valeur hors contact (2087 Nom) reste inchangée', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', 'ema_mobile_test')
      .send({ configVersion: '1.0.0', values: [{ fieldId: 2087, value: 'Dupont' }] })

    expect(res.status).toBe(201)
    const created = mockPrisma.submission.create.mock.calls[0][0].data.values.create
    expect(created).toEqual([{ fieldId: 2087, value: 'Dupont' }])
  })
})
