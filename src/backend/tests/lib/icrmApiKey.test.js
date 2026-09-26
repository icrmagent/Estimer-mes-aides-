/**
 * Tests unitaires — lib/icrmApiKey.js (canal « Clé API I-CRM »).
 * Normalisation d'URL, en-têtes, classification des statuts, messages d'erreur.
 */

import {
  CANAL_TYPES,
  CANAL_TYPE_AZURE_AD,
  CANAL_TYPE_ICRM_API_KEY,
  ICRM_EMA_API_PATH,
  ICRM_API_KEY_ID_REGEX,
  ICRM_API_SECRET_REGEX,
  typeDeCanal,
  estCanalCleApi,
  normaliserUrlApiIcrm,
  urlPointAccesIcrm,
  enTetesCleApiIcrm,
  estStatutIcrmDefinitif,
  lireCorpsJsonIcrm,
  lireSuccesEnregistrementIcrm,
  estPingIcrmConforme,
  formaterErreurIcrm,
  formaterSuccesNonConformeIcrm,
  codeErreurIcrm,
  CODE_REPONSE_NON_CONFORME,
} from '../../src/lib/icrmApiKey.js'

const CLE = 'emak_' + 'A1b2C3d4E5f6G7h8I9j0K1l2'
const SECRET = 'S'.repeat(24) + '0123456789abcdefghijklmn'

describe('icrmApiKey — types de canal', () => {
  it('expose les deux types et traite une ligne sans type comme azure_ad', () => {
    expect(CANAL_TYPES).toEqual(['azure_ad', 'icrm_api_key'])
    expect(typeDeCanal({})).toBe(CANAL_TYPE_AZURE_AD)
    expect(typeDeCanal(null)).toBe(CANAL_TYPE_AZURE_AD)
    expect(typeDeCanal({ type: CANAL_TYPE_ICRM_API_KEY })).toBe(CANAL_TYPE_ICRM_API_KEY)
    expect(estCanalCleApi({ type: 'icrm_api_key' })).toBe(true)
    expect(estCanalCleApi({ type: 'azure_ad' })).toBe(false)
    expect(estCanalCleApi(undefined)).toBe(false)
  })

  it('valide le format de la clé (emak_ + 24 alnum) et du secret (48 alnum)', () => {
    expect(ICRM_API_KEY_ID_REGEX.test(CLE)).toBe(true)
    expect(ICRM_API_KEY_ID_REGEX.test('emak_court')).toBe(false)
    expect(ICRM_API_KEY_ID_REGEX.test('EMAK_A1b2C3d4E5f6G7h8I9j0K1l2')).toBe(false)
    expect(ICRM_API_KEY_ID_REGEX.test(CLE + 'x')).toBe(false)
    expect(ICRM_API_SECRET_REGEX.test(SECRET)).toBe(true)
    expect(SECRET).toHaveLength(48)
    expect(ICRM_API_SECRET_REGEX.test(SECRET.slice(1))).toBe(false)
    expect(ICRM_API_SECRET_REGEX.test(SECRET.slice(1) + '-')).toBe(false)
  })
})

describe('icrmApiKey — normaliserUrlApiIcrm', () => {
  it.each([
    ['https://icrm.api.ila26.fr', 'https://icrm.api.ila26.fr'],
    ['https://icrm.api.ila26.fr/', 'https://icrm.api.ila26.fr'],
    ['https://icrm.api.ila26.fr///', 'https://icrm.api.ila26.fr'],
    ['https://icrm.api.ila26.fr/api', 'https://icrm.api.ila26.fr'],
    ['https://icrm.api.ila26.fr/api/', 'https://icrm.api.ila26.fr'],
    ['https://icrm.api.es.ila26.com/API/', 'https://icrm.api.es.ila26.com'],
    ['  https://icrm.api.ila26.fr/api  ', 'https://icrm.api.ila26.fr'],
    ['https://hote.example/sous-chemin/api', 'https://hote.example/sous-chemin'],
    ['https://hote.example/apis', 'https://hote.example/apis'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (entree, attendu) => {
    expect(normaliserUrlApiIcrm(entree)).toBe(attendu)
  })

  it('construit les URL du contrat v1', () => {
    expect(ICRM_EMA_API_PATH).toBe('/api/external/estimer-mes-aides/v1')
    expect(urlPointAccesIcrm('https://icrm.api.ila26.fr/api/', '/enregistrements'))
      .toBe('https://icrm.api.ila26.fr/api/external/estimer-mes-aides/v1/enregistrements')
    expect(urlPointAccesIcrm('https://icrm.api.es.ila26.com', '/ping'))
      .toBe('https://icrm.api.es.ila26.com/api/external/estimer-mes-aides/v1/ping')
  })
})

describe('icrmApiKey — en-têtes', () => {
  it('envoie X-Api-Key / X-Api-Secret et aucun Authorization', () => {
    const h = enTetesCleApiIcrm({ apiKey: CLE, token: SECRET }, { 'Idempotency-Key': 'enr-1' })
    expect(h).toEqual({
      Accept: 'application/json',
      'X-Api-Key': CLE,
      'X-Api-Secret': SECRET,
      'Idempotency-Key': 'enr-1',
    })
    expect(h.Authorization).toBeUndefined()
  })
})

describe('icrmApiKey — classification des statuts', () => {
  it.each([401, 403, 404, 413, 422, 301, 302, 307, 308])('%i est définitif', (status) => {
    expect(estStatutIcrmDefinitif(status)).toBe(true)
  })

  it.each([408, 409, 429, 500, 502, 503, 504, 400, 0, undefined])('%s est temporaire', (status) => {
    expect(estStatutIcrmDefinitif(status)).toBe(false)
  })
})

describe('icrmApiKey — lecture du corps et message d’erreur', () => {
  it('lit un corps JSON via text(), tolère le vide et le non-JSON', async () => {
    await expect(lireCorpsJsonIcrm({ text: async () => '{"ok":true}' })).resolves.toEqual({ ok: true })
    await expect(lireCorpsJsonIcrm({ text: async () => '' })).resolves.toBeNull()
    await expect(lireCorpsJsonIcrm({ text: async () => '<html>502</html>' })).resolves.toBeNull()
    await expect(lireCorpsJsonIcrm({ json: async () => ({ a: 1 }) })).resolves.toEqual({ a: 1 })
    await expect(lireCorpsJsonIcrm({ text: async () => { throw new Error('flux coupé') } })).resolves.toBeNull()
  })

  it('propagerErreurLecture : une erreur de lecture est levée, un corps non JSON reste null', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    await expect(lireCorpsJsonIcrm({ text: async () => { throw abort } }, { propagerErreurLecture: true }))
      .rejects.toBe(abort)
    await expect(lireCorpsJsonIcrm({ text: async () => '<!doctype html>' }, { propagerErreurLecture: true }))
      .resolves.toBeNull()
    await expect(lireCorpsJsonIcrm({ text: async () => '' }, { propagerErreurLecture: true })).resolves.toBeNull()
  })

  it('inclut statut, code, message, noms de champs (sans valeurs) et request_id', () => {
    const msg = formaterErreurIcrm(422, {
      error: {
        code: 'validation_failed',
        message: 'Données invalides',
        details: { 'contact.email_adress': ['format invalide : jean@@x'], 'reponses.0.valeur': ['requis'] },
        request_id: 'req-123',
      },
    })
    expect(msg).toBe(
      'I-CRM HTTP 422 validation_failed : Données invalides — champs : contact.email_adress, reponses.0.valeur [request_id req-123]'
    )
    expect(msg).not.toContain('jean@@x')
  })

  it('reprend le X-Request-Id de l’en-tête quand le corps ne le donne pas', () => {
    const res = { headers: { get: (n) => (n === 'x-request-id' ? 'hdr-9' : null) } }
    expect(formaterErreurIcrm(401, { error: { code: 'invalid_credentials', message: 'Clé inconnue' } }, res))
      .toBe('I-CRM HTTP 401 invalid_credentials : Clé inconnue [request_id hdr-9]')
  })

  it('signale une réponse non JSON et une redirection refusée', () => {
    expect(formaterErreurIcrm(502, null)).toBe('I-CRM HTTP 502 (réponse non JSON)')
    expect(formaterErreurIcrm(301, null)).toMatch(/redirection refusée/)
  })

  it('tronque les messages trop longs', () => {
    const msg = formaterErreurIcrm(500, { error: { code: 'internal_error', message: 'x'.repeat(2000) } })
    expect(msg.length).toBeLessThanOrEqual(500)
  })

  it('codeErreurIcrm extrait error.code', () => {
    expect(codeErreurIcrm({ error: { code: 'client_disabled' } })).toBe('client_disabled')
    expect(codeErreurIcrm({ error: 'texte' })).toBeNull()
    expect(codeErreurIcrm(null)).toBeNull()
  })
})

describe('icrmApiKey — conformité des réponses 2xx au contrat v1', () => {
  it('201 / 200 conformes : statut, projet_id (chaîne), projet_ref, warnings', () => {
    expect(lireSuccesEnregistrementIcrm({
      status: 'created', projet_id: 1234, projet_ref: 'P-XX2026001234', contact_id: 5, warnings: [{ code: 'unmapped_field' }],
    })).toEqual({ statut: 'created', projetId: '1234', projetRef: 'P-XX2026001234', warnings: [{ code: 'unmapped_field' }] })
    expect(lireSuccesEnregistrementIcrm({ status: 'already_processed', projet_id: '77', projet_ref: '' }))
      .toEqual({ statut: 'already_processed', projetId: '77', projetRef: null, warnings: [] })
  })

  it.each([
    ['corps absent (204 / non JSON)', null],
    ['tableau', [{ status: 'created', projet_id: 1 }]],
    ['objet quelconque (autre API)', { ok: true }],
    ['status inconnu', { status: 'queued', projet_id: 1 }],
    ['projet_id absent', { status: 'created' }],
    ['projet_id null', { status: 'created', projet_id: null }],
    ['projet_id nul ou négatif', { status: 'created', projet_id: 0 }],
    ['projet_id non entier', { status: 'created', projet_id: '12a' }],
    ['projet_id décimal', { status: 'created', projet_id: 1.5 }],
  ])('non conforme : %s → null', (_cas, corps) => {
    expect(lireSuccesEnregistrementIcrm(corps)).toBeNull()
  })

  it('ping conforme : ok === true et api_version renseignée', () => {
    expect(estPingIcrmConforme({ ok: true, api_version: '1', entreprise: 'LENA' })).toBe(true)
    expect(estPingIcrmConforme({ ok: true, api_version: 1 })).toBe(true)
    expect(estPingIcrmConforme(null)).toBe(false)
    expect(estPingIcrmConforme({ ok: true })).toBe(false)
    expect(estPingIcrmConforme({ ok: true, api_version: '  ' })).toBe(false)
    expect(estPingIcrmConforme({ ok: 'true', api_version: '1' })).toBe(false)
    expect(estPingIcrmConforme({ status: 'up' })).toBe(false)
  })

  it('message d’un 2xx non conforme : statut, nature, URL à vérifier, sans rien du corps', () => {
    expect(CODE_REPONSE_NON_CONFORME).toBe('reponse_non_conforme')
    const html = formaterSuccesNonConformeIcrm(200, null)
    expect(html).toMatch(/^I-CRM HTTP 200 : réponse non conforme au contrat \(réponse non JSON\)/)
    expect(html).toMatch(/NON partagé/)
    expect(html).toMatch(/vérifier l'URL API/)
    expect(formaterSuccesNonConformeIcrm(201, { secret: 'x' })).toMatch(/ni status ni projet_id/)
    expect(formaterSuccesNonConformeIcrm(201, { secret: 'x' })).not.toContain('secret')
  })
})
