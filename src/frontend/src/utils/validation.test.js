import { describe, expect, it } from 'vitest'
import {
  validateCodePostal,
  validateTelephone,
  validateEmailAddress,
  detectContactFormat,
  validateQuestionValue,
  normalizeQuestionValue,
  contactErrorMessage,
  CRM_FIELD_ID_CODE_POSTAL,
  CRM_FIELD_ID_TELEPHONE,
  CRM_FIELD_ID_EMAIL,
} from './validation.js'

/**
 * Règle projet n°9 — validation côté client, miroir du backend.
 * Les cas de référence sont volontairement identiques à ceux de
 * src/backend/tests/lib/contactFormats.test.js pour détecter toute dérive
 * entre les deux implémentations.
 */

describe('field IDs CRM (docs/CONTEXT.md)', () => {
  it('code postal 2089, telephone 2015, email 2016', () => {
    expect(CRM_FIELD_ID_CODE_POSTAL).toBe(2089)
    expect(CRM_FIELD_ID_TELEPHONE).toBe(2015)
    expect(CRM_FIELD_ID_EMAIL).toBe(2016)
  })
})

describe('validateCodePostal', () => {
  it('FR : 75001 accepte', () => {
    expect(validateCodePostal('75001', 'FR')).toMatchObject({ valid: true, value: '75001' })
  })

  it('FR : "TEST AUDIT" rejete (regression audit production)', () => {
    expect(validateCodePostal('TEST AUDIT', 'FR')).toMatchObject({
      valid: false,
      code: 'CODE_POSTAL_INVALIDE',
    })
  })

  it('FR : 4 et 6 chiffres rejetes', () => {
    expect(validateCodePostal('7500', 'FR').valid).toBe(false)
    expect(validateCodePostal('750011', 'FR').valid).toBe(false)
  })

  it('ES : 28001 accepte', () => {
    expect(validateCodePostal('28001', 'ES').valid).toBe(true)
  })

  it('BE : 4 chiffres acceptes, 5 chiffres rejetes', () => {
    expect(validateCodePostal('1000', 'BE').valid).toBe(true)
    expect(validateCodePostal('75001', 'BE').valid).toBe(false)
  })

  it('GB : sw1a1aa accepte et reformate', () => {
    expect(validateCodePostal('sw1a1aa', 'GB')).toMatchObject({ valid: true, value: 'SW1A 1AA' })
  })

  it('NL : 1012ab reformate en "1012 AB"', () => {
    expect(validateCodePostal('1012ab', 'NL').value).toBe('1012 AB')
  })

  it('pays inconnu : "TEST AUDIT" rejete, code alphanumerique accepte', () => {
    expect(validateCodePostal('TEST AUDIT', 'ZZ').valid).toBe(false)
    expect(validateCodePostal('AB12 3CD', 'ZZ')).toMatchObject({ valid: true, value: 'AB123CD' })
  })

  it('valeur vide rejetee', () => {
    expect(validateCodePostal('', 'FR')).toMatchObject({ valid: false, code: 'CODE_POSTAL_VIDE' })
  })
})

describe('validateTelephone', () => {
  it('"+33 0600000000" normalise en "+33600000000" (regression audit production)', () => {
    expect(validateTelephone('+33 0600000000', 'FR')).toMatchObject({
      valid: true,
      value: '+33600000000',
    })
  })

  it('national FR "06 00 00 00 00" normalise en E.164', () => {
    expect(validateTelephone('06 00 00 00 00', 'FR').value).toBe('+33600000000')
  })

  it('"0033600000000" normalise en E.164', () => {
    expect(validateTelephone('0033600000000', 'FR').value).toBe('+33600000000')
  })

  it('ES : "+34 600123456" conserve son numero national', () => {
    expect(validateTelephone('+34 600123456', 'ES').value).toBe('+34600123456')
  })

  it('IT : le 0 initial fait partie du numero', () => {
    expect(validateTelephone('+39 0612345678', 'IT').value).toBe('+390612345678')
  })

  it('"TEST AUDIT" rejete', () => {
    expect(validateTelephone('TEST AUDIT', 'FR')).toMatchObject({
      valid: false,
      code: 'TELEPHONE_CARACTERES_INVALIDES',
    })
  })

  it('numero FR trop court ou trop long rejete', () => {
    expect(validateTelephone('+33 06', 'FR').valid).toBe(false)
    expect(validateTelephone('06000000001234', 'FR').valid).toBe(false)
  })

  it('pays inconnu + numero national : format international exige', () => {
    expect(validateTelephone('600000000', 'ZZ')).toMatchObject({
      valid: false,
      code: 'TELEPHONE_INTERNATIONAL_REQUIS',
    })
  })
})

describe('validateEmailAddress', () => {
  it('adresse valide acceptee et mise en minuscules', () => {
    expect(validateEmailAddress('JEAN.DUPONT@EXAMPLE.COM')).toMatchObject({
      valid: true,
      value: 'jean.dupont@example.com',
    })
  })

  it('"TEST AUDIT" et une adresse sans TLD sont rejetees', () => {
    expect(validateEmailAddress('TEST AUDIT').valid).toBe(false)
    expect(validateEmailAddress('jean@localhost').valid).toBe(false)
  })
})

describe('detectContactFormat', () => {
  it('deduit le format depuis un field ID CRM unique', () => {
    expect(detectContactFormat({ crmFieldIds: [2089], typeOption: 'texte_court' })).toBe('code_postal')
    expect(detectContactFormat({ crmFieldIds: [2015], typeOption: 'texte_court' })).toBe('telephone')
    expect(detectContactFormat({ crmFieldIds: [2016], typeOption: 'texte_court' })).toBe('email')
  })

  it('deduit le format depuis typeOption', () => {
    expect(detectContactFormat({ typeOption: 'telephone' })).toBe('telephone')
    expect(detectContactFormat({ typeOption: 'email' })).toBe('email')
  })

  it('une question groupee ou hors contact ne declenche aucun controle', () => {
    expect(detectContactFormat({ crmFieldIds: [2262, 2087, 2089], typeOption: 'texte_court' })).toBeNull()
    expect(detectContactFormat({ crmFieldIds: [2087], typeOption: 'texte_court' })).toBeNull()
  })
})

describe('validateQuestionValue — messages traduits', () => {
  const questionCp = { id: 'q1', crmFieldIds: [2089], typeOption: 'texte_court' }

  it('renvoie null quand la valeur est valide', () => {
    expect(validateQuestionValue(questionCp, '75001', { pays: 'FR', langue: 'fr' })).toBeNull()
  })

  it('renvoie null pour une valeur vide (obligatoire gere ailleurs)', () => {
    expect(validateQuestionValue(questionCp, '', { pays: 'FR', langue: 'fr' })).toBeNull()
    expect(validateQuestionValue(questionCp, '   ', { pays: 'FR', langue: 'fr' })).toBeNull()
  })

  it('renvoie un message FR pour "TEST AUDIT"', () => {
    const msg = validateQuestionValue(questionCp, 'TEST AUDIT', { pays: 'FR', langue: 'fr' })
    expect(msg).toBe('Code postal invalide (format attendu : 12345)')
  })

  it('renvoie un message ES', () => {
    const msg = validateQuestionValue(questionCp, 'TEST AUDIT', { pays: 'ES', langue: 'es' })
    expect(msg).toBe('Código postal no válido (formato esperado : 12345)')
  })

  it('renvoie un message EN', () => {
    const msg = validateQuestionValue(questionCp, 'TEST AUDIT', { pays: 'GB', langue: 'en' })
    expect(msg).toBe('Invalid postal code (expected format : SW1A 1AA)')
  })

  it('retombe sur le FR pour une langue inconnue', () => {
    expect(contactErrorMessage('CODE_POSTAL_INVALIDE', 'de')).toBe('Code postal invalide')
  })

  it('les trois langues couvrent tous les codes d erreur', () => {
    const codes = [
      'CODE_POSTAL_VIDE',
      'CODE_POSTAL_INVALIDE',
      'TELEPHONE_VIDE',
      'TELEPHONE_CARACTERES_INVALIDES',
      'TELEPHONE_INTERNATIONAL_REQUIS',
      'TELEPHONE_INVALIDE',
      'EMAIL_VIDE',
      'EMAIL_INVALIDE',
    ]
    for (const langue of ['fr', 'es', 'en']) {
      for (const code of codes) {
        const msg = contactErrorMessage(code, langue)
        expect(typeof msg).toBe('string')
        expect(msg.length).toBeGreaterThan(0)
      }
    }
    // aucun message n est identique entre FR et EN (traduction reellement faite)
    for (const code of codes) {
      expect(contactErrorMessage(code, 'fr')).not.toBe(contactErrorMessage(code, 'en'))
    }
  })
})

describe('normalizeQuestionValue', () => {
  it('normalise le telephone en E.164 avant envoi API', () => {
    const question = { id: 'q-tel', typeOption: 'telephone', crmFieldIds: [2015] }
    expect(normalizeQuestionValue(question, '+33 0600000000', { pays: 'FR' })).toEqual({
      valid: true,
      value: '+33600000000',
    })
  })

  it('signale une valeur invalide sans la transformer', () => {
    const question = { id: 'q-cp', typeOption: 'texte_court', crmFieldIds: [2089] }
    expect(normalizeQuestionValue(question, 'TEST AUDIT', { pays: 'FR' })).toEqual({
      valid: false,
      value: 'TEST AUDIT',
    })
  })

  it('laisse intacte une question hors contact', () => {
    const question = { id: 'q-nom', typeOption: 'texte_court', crmFieldIds: [2087] }
    expect(normalizeQuestionValue(question, 'DUPONT', { pays: 'FR' })).toEqual({
      valid: true,
      value: 'DUPONT',
    })
  })
})
