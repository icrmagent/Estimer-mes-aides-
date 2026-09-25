import { prisma } from '../lib/prisma.js'
import { notifyPartageSucces, notifyPartageEchec, publishEvent } from './pusherService.js'
import logger from '../lib/logger.js'
import {
  CANAL_TYPE_ICRM_API_KEY,
  estCanalCleApi,
  urlPointAccesIcrm,
  normaliserUrlApiIcrm,
  enTetesCleApiIcrm,
  estStatutIcrmDefinitif,
  lireCorpsJsonIcrm,
  lireSuccesEnregistrementIcrm,
  formaterErreurIcrm,
  formaterSuccesNonConformeIcrm,
  codeErreurIcrm,
  CODE_REPONSE_NON_CONFORME,
} from '../lib/icrmApiKey.js'
import { validateEmail, validateTelephone, validateCodePostal } from '../lib/contactFormats.js'

const POLL_INTERVAL = 30 * 1000
const MAX_TENTATIVES = 5

const ICRM_AUTH_URL = 'https://auth.dev.ila26.fr/8abd8e97-1720-4fe0-aff1-00abd2d676fb/oauth2/v2.0/token'
const ICRM_CLIENT_ID = '2fd6a486-ec0c-4c67-af2f-00ccf530f3af'
const ICRM_SCOPE = 'https://auth.dev.ila26.fr/98236e68-4156-4a1a-b7b5-be69c87cf1d4/access_as_user'

// Renvoie un access_token valide : le token actuel s'il reste > 5 min, sinon refresh
async function getValidToken(canal) {
  const token = canal.token
  if (!token) return null

  // Décoder l'exp du JWT (si JWS à 3 segments)
  const parts = token.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url'))
      const remainingSec = (payload.exp || 0) - Math.floor(Date.now() / 1000)
      if (remainingSec > 300) return token // encore 5+ min de validité
    } catch { /* pas un JWT standard, utiliser tel quel */ }
  }

  // Token expiré ou proche — essayer de rafraîchir via refresh_token (apiKey)
  const refreshToken = canal.apiKey
  if (!refreshToken) return token // pas de refresh_token, retourner quand même

  try {
    const res = await fetch(ICRM_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ICRM_CLIENT_ID,
        refresh_token: refreshToken,
        scope: ICRM_SCOPE,
      }),
    })
    if (!res.ok) return token
    const data = await res.json()
    if (!data.access_token) return token

    // Persister le nouveau token et refresh_token en DB
    await prisma.canal.update({
      where: { id: canal.id },
      data: {
        token: data.access_token,
        apiKey: data.refresh_token || refreshToken,
      },
    })
    logger.info({ message: '[QUEUE] Token I-CRM rafraîchi automatiquement', canalId: canal.id })
    return data.access_token
  } catch (err) {
    logger.warn({ message: '[QUEUE] Échec refresh token I-CRM', error: err.message, canalId: canal.id })
    return token
  }
}

// Mapping CRM field ID → nom de champ I-CRM API (endpoint POST /api/customContacts)
const FIELD_ID_MAP = {
  2087: 'last_name',
  2088: 'first_name',
  2089: 'code_postale',
  2090: 'ville',
  2262: 'civility',
  2015: 'phone_number',
  2016: 'email_adress',
  2217: 'adresse',
}

/**
 * Libellés métier des field IDs du formulaire V1 — source : docs/CONTEXT.md.
 * Sert UNIQUEMENT à rendre les logs lisibles par un opérateur.
 *
 * ⚠️ Les 15 field IDs ci-dessous n'ont AUCUNE correspondance connue dans l'API
 * I-CRM `customContacts` : son schéma de destination n'est documenté nulle part
 * dans le dépôt (ni docs/, ni .kiro/specs/, ni l'historique git du module V1
 * supprimé, qui ciblait un autre endpoint `POST /api/projects` au format
 * `field_values: [{ field_id, value }]`).
 * Tant que la correspondance n'est pas fournie, ces champs ne sont PAS transmis
 * — mais chaque envoi les journalise en warn (voir mapReponsesToICRM) au lieu
 * de les perdre en silence. Ne PAS inventer de noms de champs cibles ici.
 */
const LIBELLES_CHAMPS_CRM = {
  2015: 'Num. de Téléphone',
  2016: 'Adresse Email',
  2087: 'Nom',
  2088: 'Prénom',
  2089: 'Code postal',
  2090: 'Ville',
  2217: 'Adresse',
  2262: 'Civilité',
  // Non mappés (15) :
  2292: 'Votre projet concerne (type de logement)',
  2293: 'Dans ce logement vous êtes (statut propriétaire)',
  2294: 'Revenu total du foyer fiscal',
  2296: 'Quel type de combles avez-vous',
  2297: 'Combles habitables : que souhaitez-vous isoler',
  2298: 'Combles non habitables : type de plancher',
  2299: "Type d'isolation souhaité",
  2300: "Accès aux combles : trappe d'accès",
  2301: 'Type de chauffage principal',
  2302: 'Autre type de chauffage principal',
  2303: 'Travaux souhaités dans le logement',
  2304: 'Disponibilité pour être contacté',
  2305: 'Commentaires ou informations complémentaires',
  2306: 'Date de construction du logement',
  2307: 'Surface habitable du logement',
}

// Transformation de valeur par champ I-CRM (valeurs radio/select encodées → texte brut)
const VALUE_TRANSFORMS = {
  // "2262-1-mr" → "Mr", "2262-2-mme" → "Mme"
  civility: (v) => {
    const part = v.split('-').pop()
    return part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : v
  },
}

// Fallback : libellé FR normalisé → nom de champ I-CRM API
const LABEL_MAP = {
  'nom': 'last_name',
  'prénom': 'first_name',
  'prenom': 'first_name',
  'email': 'email_adress',
  'e-mail': 'email_adress',
  'adresse email': 'email_adress',
  'téléphone': 'phone_number',
  'telephone': 'phone_number',
  'tél': 'phone_number',
  'tel': 'phone_number',
  'adresse': 'adresse',
  'ville': 'ville',
  'code postal': 'code_postale',
  'civilité': 'civility',
  'civilite': 'civility',
}

function buildPayloadBase() {
  return {
    dtypes: 1,
    user_id: parseInt(process.env.CRM_USER_ID || '1', 10),
    type_contact_id: 1,
    user_type: 'societe',
  }
}

const NB_CHAMPS_TECHNIQUES = Object.keys(buildPayloadBase()).length

function normaliseCrmFieldIds(crmFieldIds) {
  if (crmFieldIds === null || crmFieldIds === undefined) return []
  return (Array.isArray(crmFieldIds) ? crmFieldIds : [crmFieldIds])
    .filter(id => id !== null && id !== undefined && id !== '')
}

function extraireLibelleFr(libelleQuestion) {
  if (typeof libelleQuestion === 'object' && libelleQuestion !== null) {
    return (libelleQuestion.fr || libelleQuestion.FR || Object.values(libelleQuestion)[0] || '').toString()
  }
  return (libelleQuestion ?? '').toString()
}

/**
 * Construit le payload I-CRM à partir des réponses d'un enregistrement.
 *
 * Tout champ dont ni le field ID (FIELD_ID_MAP) ni le libellé (LABEL_MAP) n'a de
 * correspondance connue est ABANDONNÉ côté I-CRM (la donnée reste en base et dans
 * l'export XLSX). Cette perte est journalisée en warn à chaque envoi, avec le
 * contexte fourni (job, enregistrement, canal), pour qu'un opérateur la constate.
 *
 * @param {Array} reponses  Réponses avec `question.crmFieldIds` et `question.libelleQuestion`
 * @param {Object} contexte Champs de contexte ajoutés au log (jobId, enregistrementId, canalId…)
 * @returns {{ payload: Object, champsNonTransmis: Array }}
 */
function mapReponsesToICRM(reponses, contexte = {}) {
  const payload = buildPayloadBase()
  const champsNonTransmis = []

  for (const r of reponses) {
    const ids = normaliseCrmFieldIds(r.question?.crmFieldIds)
    const libelle = extraireLibelleFr(r.question?.libelleQuestion)

    let icrmField = null
    for (const id of ids) {
      if (FIELD_ID_MAP[id]) {
        icrmField = FIELD_ID_MAP[id]
        break
      }
    }

    if (!icrmField) {
      icrmField = LABEL_MAP[libelle.toLowerCase().trim()] || null
    }

    if (icrmField) {
      const transform = VALUE_TRANSFORMS[icrmField]
      payload[icrmField] = transform ? transform(r.valeur) : r.valeur
    } else {
      champsNonTransmis.push({
        crmFieldIds: ids,
        libelle: libelle
          || ids.map(id => LIBELLES_CHAMPS_CRM[id]).filter(Boolean).join(' / ')
          || null,
      })
    }
  }

  if (champsNonTransmis.length > 0) {
    // Seuls les field IDs et libellés sont journalisés — jamais les valeurs saisies (RGPD).
    logger.warn({
      message: '[QUEUE] Champs de la soumission NON transmis à I-CRM (absents de FIELD_ID_MAP et de LABEL_MAP)',
      ...contexte,
      nbChampsNonTransmis: champsNonTransmis.length,
      nbChampsTransmis: Object.keys(payload).length - NB_CHAMPS_TECHNIQUES,
      champsNonTransmis,
    })
  }

  // Vérifier que les champs obligatoires I-CRM sont présents
  if (!payload.last_name || !payload.first_name) {
    throw new Error('Données insuffisantes : Nom et Prénom requis pour créer un contact I-CRM')
  }

  return { payload, champsNonTransmis }
}

// ─── Canal « Clé API I-CRM » (type icrm_api_key) ─────────────────────────────
//
// Le contrat v1 transmet TOUTES les réponses (et plus seulement l'identité) :
// I-CRM crée l'opportunité du sous-type lié à la clé et résout lui-même les
// field IDs (ids CAE España du formulaire) vers les champs du tenant.

const TYPES_A_CHOIX = new Set(['option_unique', 'options_multiples'])
const LANGUES_CONTRAT = new Set(['fr', 'es', 'en'])

function premierNonVide(...valeurs) {
  for (const v of valeurs) {
    if (v === null || v === undefined) continue
    const s = String(v)
    if (s.trim() !== '') return s
  }
  return null
}

// Supprime les clés null / undefined / '' d'un bloc facultatif du contrat.
function compacter(objet) {
  const out = {}
  for (const [cle, valeur] of Object.entries(objet)) {
    if (valeur === null || valeur === undefined) continue
    if (typeof valeur === 'string' && valeur.trim() === '') continue
    out[cle] = valeur
  }
  return out
}

function idsChampsCrmEntiers(crmFieldIds) {
  return normaliseCrmFieldIds(crmFieldIds)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
}

// Même résolution que mapReponsesToICRM (FIELD_ID_MAP puis LABEL_MAP) — dupliquée
// volontairement pour ne pas toucher au chemin historique azure_ad.
function champContactDeLaReponse(ids, libelle) {
  for (const id of ids) {
    if (FIELD_ID_MAP[id]) return FIELD_ID_MAP[id]
  }
  return LABEL_MAP[libelle.toLowerCase().trim()] || null
}

function libelleOption(option, langue) {
  if (!option || typeof option !== 'object') return null
  const label = option.label
  const labelFr = typeof label === 'string' ? label : label?.fr
  const labelLangue = label && typeof label === 'object' && langue ? label[langue] : null
  return premierNonVide(option.crmValue, labelFr, labelLangue, option.id)
}

/**
 * Découpe une valeur « options_multiples » (ids joints par ", ") en tenant compte
 * des ids qui contiennent eux-mêmes ", " (formulaires importés : id = texte CRM).
 * Accepte aussi l'ancien format tableau JSON `["a","b"]`.
 */
function decouperValeurMultiple(valeur, options) {
  const brut = String(valeur)
  if (brut.trim().startsWith('[')) {
    try {
      const tableau = JSON.parse(brut)
      if (Array.isArray(tableau)) return tableau.map(String).filter((v) => v.trim() !== '')
    } catch { /* pas du JSON : découpage classique */ }
  }
  const ids = new Set(options.map((o) => String(o?.id)))
  if (ids.has(brut)) return [brut]
  const morceaux = brut.split(', ')
  const resultat = []
  let i = 0
  while (i < morceaux.length) {
    let fin = i + 1
    for (let j = morceaux.length; j > i + 1; j--) {
      if (ids.has(morceaux.slice(i, j).join(', '))) { fin = j; break }
    }
    const morceau = morceaux.slice(i, fin).join(', ')
    if (morceau.trim() !== '') resultat.push(morceau)
    i = fin
  }
  return resultat
}

/**
 * Libellés humains des options choisies :
 * option.crmValue ?? option.label.fr ?? option.label[langue] ?? id de l'option.
 * Questions texte : [valeur].
 */
function resoudreLibellesValeur(valeur, question, langue) {
  const options = Array.isArray(question?.options) ? question.options : []
  const type = question?.typeOption
  if (!TYPES_A_CHOIX.has(type) && options.length === 0) return [valeur]

  const choisis = type === 'options_multiples' ? decouperValeurMultiple(valeur, options) : [valeur]
  return choisis.map((choix) => {
    const option = options.find((o) => String(o?.id) === String(choix))
    return (option && libelleOption(option, langue)) || choix
  })
}

// Civilité : "Mr." → "Mr". Valeur encodée par le seed sans option résolue
// ("2262-1-mr") : même transformation que le chemin historique.
function normaliserCivilite(libelle, valeurBrute) {
  if (libelle === valeurBrute && /^\d+-\d+-.+/.test(valeurBrute)) {
    return VALUE_TRANSFORMS.civility(valeurBrute)
  }
  return libelle.replace(/\.+$/, '').trim()
}

// Longueurs maximales du bloc `contact` acceptées par I-CRM (EnregistrementValidator).
// Au-delà, I-CRM répond 422 validation_failed — définitif pour EMA : le lead serait perdu.
const LONGUEUR_MAX_CONTACT_ICRM = {
  civility: 32,
  first_name: 255,
  last_name: 255,
  phone_number: 64,
  email_adress: 255,
  adresse: 255,
  code_postale: 20,
  ville: 255,
}

/**
 * Valeur admissible dans le bloc `contact` d'I-CRM, ou motif de mise à l'écart.
 *
 * Les questions reconnues par field ID unique ou par typeOption sont déjà
 * validées/normalisées à la soumission (contactFormats) ; celles reconnues par
 * LIBELLÉ ou par une question groupée ne le sont pas. I-CRM refuse (422) un
 * e-mail mal formé et toute valeur trop longue : ces valeurs sont retirées du
 * contact — jamais du lead — et restent transmises dans `reponses`.
 * Téléphone et code postal : normalisés quand ils sont valides, sinon gardés
 * tels quels (I-CRM n'en contrôle que la longueur ; les écarter pourrait
 * retirer la seule donnée d'identité du visiteur).
 *
 * @returns {{ valeur: string } | { motif: string }}
 */
function valeurContactIcrm(champ, valeur, pays) {
  let v = String(valeur).trim()
  if (champ === 'email_adress') {
    const email = validateEmail(v)
    if (!email.valid) return { motif: email.code || 'EMAIL_INVALIDE' }
    v = email.value
  } else if (champ === 'phone_number') {
    const tel = validateTelephone(v, pays)
    if (tel.valid) v = tel.value
  } else if (champ === 'code_postale') {
    const cp = validateCodePostal(v, pays)
    if (cp.valid) v = cp.value
  }
  if (v === '') return { motif: 'VIDE' }
  const max = LONGUEUR_MAX_CONTACT_ICRM[champ]
  if (max && v.length > max) return { motif: 'TROP_LONG' }
  return { valeur: v }
}

// Les champs I-CRM « Info borne » sont de type Texte (255 caractères) : une valeur
// plus longue est omise plutôt que de risquer un 422 définitif sur tout le lead.
const LONGUEUR_MAX_ADMIN_BORNE_ICRM = 255

/**
 * Bloc `borne.admin` du contrat v1.1 : l'AdminBorne propriétaire de la borne
 * (nom, prénom, e-mail, raison sociale, SIRET), écrit par I-CRM dans le widget
 * « Borne » → « Info borne » de l'opportunité.
 *
 * Membres vides omis ; e-mail envoyé seulement s'il est bien formé (en
 * minuscules) ; valeur de plus de 255 caractères omise. `undefined` quand la
 * borne n'a pas d'admin (borne du SuperAdmin) ou qu'aucun membre n'est renseigné.
 * Données personnelles : ce bloc n'est jamais journalisé (RGPD).
 *
 * @param {?{ nom?: string, prenom?: string, email?: string, raisonSociale?: string, siret?: string }} admin
 * @returns {{ nom?: string, prenom?: string, email?: string, raison_sociale?: string, siret?: string } | undefined}
 */
function blocAdminBorne(admin) {
  if (!admin || typeof admin !== 'object') return undefined
  const texte = (v) => {
    if (v === null || v === undefined) return undefined
    const s = String(v).trim()
    return s !== '' && s.length <= LONGUEUR_MAX_ADMIN_BORNE_ICRM ? s : undefined
  }
  const email = texte(admin.email)
  const emailVerifie = email === undefined ? null : validateEmail(email)
  const bloc = compacter({
    nom: texte(admin.nom),
    prenom: texte(admin.prenom),
    email: emailVerifie?.valid ? emailVerifie.value : undefined,
    raison_sociale: texte(admin.raisonSociale),
    siret: texte(admin.siret),
  })
  return Object.keys(bloc).length > 0 ? bloc : undefined
}

/**
 * `created_at` du contrat : date de création de l'enregistrement EMA
 * (`enregistrement.createdAt`), en ISO-8601 UTC. OBLIGATOIRE depuis la v1.1 :
 * I-CRM la recopie dans le champ « Date et heure de l'enregistrement ». La
 * colonne est NOT NULL en base ; son absence est un défaut qu'un réessai ne
 * corrigera pas → erreur définitive (relance manuelle après correction).
 */
function dateEnregistrementIso(createdAt) {
  const date = createdAt === null || createdAt === undefined || createdAt === ''
    ? null
    : new Date(createdAt)
  if (!date || Number.isNaN(date.getTime())) {
    throw erreurPartage(
      'Enregistrement sans date de création valide : created_at est obligatoire (contrat I-CRM v1.1)',
      { definitif: true },
    )
  }
  return date.toISOString()
}

/**
 * Construit le corps de POST /api/external/estimer-mes-aides/v1/enregistrements
 * (contrat EMA → I-CRM v1 + addendum v1.1). Fonction pure, exportée pour les tests.
 *
 * Les réponses vides sont omises (aucune information) ; les blocs facultatifs
 * (borne, borne.admin, formulaire, contact) ne contiennent que des valeurs
 * renseignées. `created_at` (createdAt en ISO-8601 UTC) est toujours présent.
 *
 * @param {Object} enregistrement Enregistrement chargé avec createdAt,
 *   borne { …, adminBorne { nom, prenom, email, raisonSociale, siret } }, formulaire,
 *   reponses[].question { libelleQuestion, typeOption, options, crmFieldIds }
 * @returns {Object} payload JSON du contrat
 * @throws Error `definitif` si createdAt est absent ou invalide
 */
function buildIcrmEnregistrementPayload(enregistrement) {
  return construirePayloadIcrm(enregistrement).payload
}

/**
 * Payload du contrat + valeurs retirées du bloc contact (champ, motif, question —
 * jamais la valeur, pour pouvoir être journalisé).
 *
 * @returns {{ payload: Object, contactEcarte: Array<{ champ: string, motif: string, question_id: ?string }> }}
 */
function construirePayloadIcrm(enregistrement) {
  const enr = enregistrement || {}
  const langue = LANGUES_CONTRAT.has(enr.langueUtilisee) ? enr.langueUtilisee : undefined
  const paysBorne = enr.borne?.pays
  const contact = {}
  const contactEcarte = []
  const reponses = []

  for (const r of enr.reponses || []) {
    if (r?.valeur === null || r?.valeur === undefined) continue
    const valeur = String(r.valeur)
    if (valeur.trim() === '') continue

    const question = r.question || {}
    const idsBruts = normaliseCrmFieldIds(question.crmFieldIds)
    const crmFieldIds = idsChampsCrmEntiers(question.crmFieldIds)
    const libelleFr = extraireLibelleFr(question.libelleQuestion)
    const libelle = premierNonVide(
      libelleFr,
      idsBruts.map((id) => LIBELLES_CHAMPS_CRM[id]).filter(Boolean).join(' / '),
    )
    const valeurLibelles = resoudreLibellesValeur(valeur, question, langue)

    reponses.push(compacter({
      question_id: r.questionId ?? question.id,
      libelle,
      type: question.typeOption,
      crm_field_ids: crmFieldIds,
      valeur,
      valeur_libelles: valeurLibelles,
    }))

    const champContact = champContactDeLaReponse(idsBruts, libelleFr)
    if (champContact) {
      const aChoix = TYPES_A_CHOIX.has(question.typeOption)
        || (Array.isArray(question.options) && question.options.length > 0)
      let valeurContact = aChoix ? valeurLibelles.join(', ') : valeur
      if (champContact === 'civility') valeurContact = normaliserCivilite(valeurContact, valeur)
      const retenue = valeurContactIcrm(champContact, valeurContact, paysBorne)
      if (retenue.valeur !== undefined) {
        contact[champContact] = retenue.valeur
      } else if (retenue.motif !== 'VIDE') {
        contactEcarte.push({ champ: champContact, motif: retenue.motif, question_id: r.questionId ?? question.id ?? null })
      }
    }
  }

  const borne = enr.borne || {}
  const formulaire = enr.formulaire || {}
  const createdAt = dateEnregistrementIso(enr.createdAt)
  const blocFormulaire = compacter({
    id: enr.formulaireId ?? formulaire.id,
    // Version figée à la soumission, à défaut la version courante du formulaire
    version: enr.formulaireVersion ?? formulaire.version,
    label: formulaire.label,
  })
  const blocBorne = compacter({
    id: borne.id,
    id_borne: borne.idBorne,
    pays: borne.pays,
    adresse: borne.adresse,
    commercant: borne.commercant,
    regie: borne.regie,
    installateur: borne.installateur,
    admin: blocAdminBorne(borne.adminBorne),
  })
  const nonVide = (bloc) => (Object.keys(bloc).length > 0 ? bloc : undefined)

  const payload = compacter({
    external_id: enr.id,
    created_at: createdAt,
    langue,
    formulaire: nonVide(blocFormulaire),
    borne: nonVide(blocBorne),
    contact: nonVide(contact),
    reponses,
  })
  return { payload, contactEcarte }
}

function erreurPartage(message, { definitif = false, httpStatus = null, code = null } = {}) {
  const err = new Error(message)
  err.definitif = definitif
  err.httpStatus = httpStatus
  err.codeIcrm = code
  return err
}

/**
 * Envoie un enregistrement à I-CRM via un canal `icrm_api_key`.
 * Aucun appel Azure (pas de getValidToken). Les redirections ne sont pas suivies
 * (le secret ne doit jamais partir vers un autre hôte).
 *
 * Succès UNIQUEMENT sur un 2xx au corps du contrat (status + projet_id) : un autre
 * 2xx (front en repli SPA, page de proxy, mauvaise URL de base) ne prouve pas que
 * l'opportunité existe et ne doit jamais marquer l'enregistrement « partagé ».
 *
 * @returns {{ crmProjetId: string, crmProjetRef: string|null, statutIcrm: string,
 *             httpStatus: number, warnings: Array }}
 * @throws Error avec `definitif=true` pour 401/403/404/413/422/3xx et 2xx non conforme
 *         (pas de réessai) ; sans `definitif` (backoff) pour un 2xx au corps illisible
 */
async function envoyerViaCleApiIcrm(canal, enregistrement) {
  if (!normaliserUrlApiIcrm(canal.apiUrl) || !canal.apiKey || !canal.token) {
    throw erreurPartage(
      'Canal I-CRM (clé API) incomplet : URL API, clé ou secret manquant — compléter le canal dans le back-office',
      { definitif: true },
    )
  }

  const { payload, contactEcarte } = construirePayloadIcrm(enregistrement)
  if (contactEcarte.length > 0) {
    // Noms de champ et motifs uniquement — jamais la valeur saisie (RGPD).
    logger.warn({
      message: '[QUEUE] Valeurs retirées du bloc contact (format ou longueur refusés par I-CRM) — transmises dans reponses',
      enregistrementId: enregistrement.id,
      canalId: canal.id ?? null,
      contactEcarte,
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30 * 1000)

  let res
  let corps
  try {
    res = await fetch(urlPointAccesIcrm(canal.apiUrl, '/enregistrements'), {
      method: 'POST',
      headers: enTetesCleApiIcrm(canal, {
        'Content-Type': 'application/json',
        'Idempotency-Key': enregistrement.id,
      }),
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: controller.signal,
    })
    // Lecture du corps sous le même délai de 30 s (un corps bloqué ne fige pas le worker)
    try {
      corps = await lireCorpsJsonIcrm(res, { propagerErreurLecture: res.ok })
    } catch (err) {
      // 2xx dont le corps n'a pas pu être lu : I-CRM a peut-être créé l'opportunité.
      // Nouvel essai (idempotent sur external_id → 200 already_processed), jamais « partagé ».
      const cause = err?.name === 'AbortError' ? 'délai de 30 s dépassé' : 'flux interrompu'
      throw erreurPartage(
        `I-CRM HTTP ${res.status} : lecture de la réponse impossible (${cause}) — nouvel essai automatique`,
        { httpStatus: res.status },
      )
    }
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.ok) {
    const succes = lireSuccesEnregistrementIcrm(corps)
    if (!succes) {
      throw erreurPartage(formaterSuccesNonConformeIcrm(res.status, corps), {
        definitif: true,
        httpStatus: res.status,
        code: CODE_REPONSE_NON_CONFORME,
      })
    }
    return {
      crmProjetId: succes.projetId,
      crmProjetRef: succes.projetRef,
      statutIcrm: succes.statut,
      httpStatus: res.status,
      warnings: succes.warnings,
    }
  }

  throw erreurPartage(formaterErreurIcrm(res.status, corps, res), {
    definitif: estStatutIcrmDefinitif(res.status),
    httpStatus: res.status,
    code: codeErreurIcrm(corps),
  })
}

let workerInterval = null
let isRunning = false

/**
 * Calcule le délai de retry avec backoff exponentiel + jitter.
 * Task 30.2 — nextRetryAt = NOW() + 2^tentatives minutes + jitter(0–60s)
 * tentatives=1 → 2min, tentatives=2 → 4min, tentatives=3 → 8min, etc.
 */
function computeNextRetry(tentatives) {
  const baseMs = Math.pow(2, tentatives) * 60 * 1000  // 2^tentatives minutes
  const jitterMs = Math.floor(Math.random() * 60 * 1000) // 0–60s jitter
  return new Date(Date.now() + baseMs + jitterMs)
}

/**
 * Traite un job de partage CRM.
 * Appelle l'API I-CRM externe et met à jour le statut du job.
 */
async function processJob(job) {
  const jobStart = Date.now()

  // Marquer le job comme en cours
  await prisma.partageJob.update({
    where: { id: job.id },
    data: { statut: 'en_cours' },
  })

  try {
    // Récupérer l'enregistrement avec ses réponses et le canal actif de la borne
    const enregistrement = await prisma.enregistrement.findUnique({
      where: { id: job.enregistrementId },
      include: {
        borne: {
          select: {
            id: true,
            idBorne: true,
            canalTransmission: true,
            // Métadonnées transmises par le canal icrm_api_key (bloc « borne » du contrat)
            pays: true,
            adresse: true,
            commercant: true,
            regie: true,
            installateur: true,
            // Bloc « borne.admin » du contrat v1.1 (widget I-CRM « Borne » → « Info borne »).
            // Liste fermée : jamais passwordHash, actif ni les autres colonnes.
            adminBorne: {
              select: { nom: true, prenom: true, email: true, raisonSociale: true, siret: true },
            },
            canaux: {
              where: { actif: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        formulaire: { select: { id: true, label: true, version: true } },
        reponses: {
          include: {
            question: {
              select: {
                id: true,
                libelleQuestion: true,
                orderPage: true,
                crmFieldIds: true,
                typeOption: true,
                options: true,
              },
            },
          },
        },
      },
    })

    if (!enregistrement) {
      throw new Error(`Enregistrement ${job.enregistrementId} introuvable`)
    }

    // Filet de sécurité : un enregistrement soft-deleted ne doit pas être transmis.
    // Le job est supprimé (les routes DELETE le font déjà en transaction, ce cas
    // est défensif pour les jobs créés avant la suppression).
    if (enregistrement.deletedAt) {
      await prisma.partageJob.delete({ where: { id: job.id } })
      logger.info({
        message: '[QUEUE] Job supprimé — enregistrement soft-deleted',
        jobId: job.id,
        enregistrementId: job.enregistrementId,
      })
      return
    }

    // Sélectionner le canal par canalTransmission (label) si défini, sinon premier canal actif
    const canalLabel = enregistrement.borne?.canalTransmission
    const matchedByLabel = canalLabel
      ? enregistrement.borne?.canaux?.find(c => c.label === canalLabel)
      : null
    if (canalLabel && !matchedByLabel) {
      logger.warn({
        message: '[QUEUE] canalTransmission ne correspond à aucun canal actif — fallback sur premier canal',
        canalLabel,
        borneId: enregistrement.borne?.id,
        jobId: job.id,
      })
    }
    const canal = matchedByLabel ?? enregistrement.borne?.canaux?.[0]

    // Canal « Clé API I-CRM » : opportunité complète, sans Azure AD.
    // Tout autre canal (azure_ad, ou lignes antérieures à la colonne `type`)
    // suit le chemin historique ci-dessous, inchangé.
    let envoiCleApi = null
    if (canal && estCanalCleApi(canal)) {
      envoiCleApi = await envoyerViaCleApiIcrm(canal, enregistrement)
    } else {
      const crmUrl = canal?.apiUrl || process.env.CRM_API_URL
      const crmKey = canal
        ? await getValidToken(canal)
        : process.env.CRM_API_KEY

      if (!crmUrl || !crmKey) {
        throw new Error('Canal I-CRM non configuré pour cette borne — configurer via le back-office')
      }

      const { payload: icrmPayload } = mapReponsesToICRM(enregistrement.reponses, {
        jobId: job.id,
        enregistrementId: job.enregistrementId,
        borneId: enregistrement.borne?.id ?? null,
        canalId: canal?.id ?? null,
        canalLabel: canal?.label ?? null,
        canalSource: canal ? 'borne' : 'env',
      })

      // Task 30.1 — 30-second timeout via AbortController
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30 * 1000)

      let crmRes
      try {
        crmRes = await fetch(`${crmUrl}/api/customContacts?lang=fr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${crmKey}`,
          },
          body: JSON.stringify(icrmPayload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!crmRes.ok) {
        const errText = await crmRes.text()
        throw new Error(`CRM API error ${crmRes.status}: ${errText}`)
      }
    }

    // Succès — mettre à jour le job et l'enregistrement
    await prisma.$transaction([
      prisma.partageJob.update({
        where: { id: job.id },
        data: { statut: 'succes', updatedAt: new Date() },
      }),
      prisma.enregistrement.update({
        where: { id: job.enregistrementId },
        data: {
          statutPartage: 'partage',
          partageAt: new Date(),
          // Traçabilité de l'opportunité créée (canal icrm_api_key uniquement)
          ...(envoiCleApi
            ? { crmProjetId: envoiCleApi.crmProjetId, crmProjetRef: envoiCleApi.crmProjetRef }
            : {}),
        },
      }),
    ])

    if (envoiCleApi?.warnings.length > 0) {
      // Codes, field IDs, libellés de question et clés de champ uniquement — jamais
      // `value` (RGPD). v1.1 : `borne_field_missing` porte la clé du champ « Info borne »
      // absent du tenant (ex. projets_ema_admin_email), pas de field ID.
      logger.warn({
        message: '[QUEUE] I-CRM a signalé des réponses non mappées ou options non reconnues',
        jobId: job.id,
        enregistrementId: job.enregistrementId,
        canalId: canal?.id ?? null,
        crmProjetId: envoiCleApi.crmProjetId,
        nbWarnings: envoiCleApi.warnings.length,
        warnings: envoiCleApi.warnings.slice(0, 50).map((w) => ({
          code: w?.code ?? null,
          crm_field_ids: Array.isArray(w?.crm_field_ids) ? w.crm_field_ids : [],
          libelle: typeof w?.libelle === 'string' ? w.libelle : null,
          ...(typeof w?.key === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(w.key) ? { key: w.key } : {}),
        })),
      })
    }

    // Notification Pusher succès
    await notifyPartageSucces(enregistrement.borne?.id, job.enregistrementId)

    // Publish partage-status-changed on admin-notifications
    publishEvent('admin-notifications', 'partage-status-changed', {
      jobId: job.id,
      enregistrementId: job.enregistrementId,
      statut: 'partage',
    }).catch(() => {})

    // Task 30.5 — Structured log with jobId, enregistrementId, status, duration
    logger.info({
      message: `[QUEUE] Job succès`,
      jobId: job.id,
      enregistrementId: job.enregistrementId,
      status: 'succes',
      duration: Date.now() - jobStart,
      ...(envoiCleApi
        ? {
            canalType: CANAL_TYPE_ICRM_API_KEY,
            httpStatus: envoiCleApi.httpStatus,
            statutIcrm: envoiCleApi.statutIcrm,
            crmProjetId: envoiCleApi.crmProjetId,
            crmProjetRef: envoiCleApi.crmProjetRef,
          }
        : {}),
    })
  } catch (err) {
    const newTentatives = job.tentatives + 1
    // err.definitif : réponse I-CRM qu'un réessai ne changera pas (401/403/404/413/422…)
    // → échec définitif immédiat, sans épuiser les MAX_TENTATIVES.
    const isDefinitif = err.definitif === true || newTentatives >= MAX_TENTATIVES

    if (isDefinitif) {
      // Échec définitif
      await prisma.$transaction([
        prisma.partageJob.update({
          where: { id: job.id },
          data: {
            statut: 'echec_definitif',
            tentatives: newTentatives,
            erreur: err.message,
            updatedAt: new Date(),
          },
        }),
        prisma.enregistrement.update({
          where: { id: job.enregistrementId },
          data: { statutPartage: 'echec_definitif', derniereErreur: err.message },
        }),
      ])

      // Récupérer le borneId pour la notification
      const enr = await prisma.enregistrement.findUnique({
        where: { id: job.enregistrementId },
        select: { borneId: true },
      })

      if (enr) {
        await notifyPartageEchec(enr.borneId, job.enregistrementId, err.message)
      }

      publishEvent('admin-notifications', 'partage-status-changed', {
        jobId: job.id,
        enregistrementId: job.enregistrementId,
        statut: 'echec_definitif',
      }).catch(() => {})

      // Task 30.5 — Structured log
      logger.error({
        message: `[QUEUE] Job échec définitif`,
        jobId: job.id,
        enregistrementId: job.enregistrementId,
        status: 'echec_definitif',
        tentatives: newTentatives,
        duration: Date.now() - jobStart,
        error: err.message,
        ...(err.httpStatus ? { httpStatus: err.httpStatus, codeIcrm: err.codeIcrm ?? null } : {}),
      })
    } else {
      // Échec temporaire — backoff exponentiel + jitter (Task 30.2)
      const prochainEssai = computeNextRetry(newTentatives)

      await prisma.partageJob.update({
        where: { id: job.id },
        data: {
          statut: 'echec_temporaire',
          tentatives: newTentatives,
          erreur: err.message,
          prochainEssai,
          updatedAt: new Date(),
        },
      })

      await prisma.enregistrement.update({
        where: { id: job.enregistrementId },
        data: { statutPartage: 'echec_temporaire', derniereErreur: err.message, tentatives: newTentatives },
      })

      // Task 30.5 — Structured log
      logger.warn({
        message: `[QUEUE] Job échec temporaire`,
        jobId: job.id,
        enregistrementId: job.enregistrementId,
        status: 'echec_temporaire',
        tentatives: newTentatives,
        maxTentatives: MAX_TENTATIVES,
        duration: Date.now() - jobStart,
        prochainEssai: prochainEssai.toISOString(),
        error: err.message,
        ...(err.httpStatus ? { httpStatus: err.httpStatus, codeIcrm: err.codeIcrm ?? null } : {}),
      })
    }
  }
}

/**
 * Traite tous les jobs en attente ou prêts pour retry.
 * Task 30.4 — Process up to 10 jobs concurrently using Promise.allSettled()
 */
async function processPendingJobs() {
  if (isRunning) return
  isRunning = true

  try {
    const now = new Date()
    const jobs = await prisma.partageJob.findMany({
      where: {
        OR: [
          { statut: 'en_attente' },
          {
            statut: 'echec_temporaire',
            prochainEssai: { lte: now },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 10, // Traiter max 10 jobs par cycle
    })

    if (jobs.length > 0) {
      logger.info({
        message: `[QUEUE] Traitement de ${jobs.length} job(s)...`,
        jobCount: jobs.length,
      })
      // Task 30.4 — Concurrent processing with Promise.allSettled()
      await Promise.allSettled(jobs.map(job => processJob(job)))
    }
  } catch (err) {
    logger.error({
      message: '[QUEUE] Erreur dans processPendingJobs',
      error: err.message,
      stack: err.stack,
    })
  } finally {
    isRunning = false
  }
}

/**
 * Démarre le queue worker (polling toutes les 30 secondes).
 */
export function startQueueWorker() {
  if (workerInterval) return
  logger.info({ message: '[QUEUE] Worker démarré — polling toutes les 30s' })
  workerInterval = setInterval(processPendingJobs, POLL_INTERVAL)
  // Premier passage immédiat
  processPendingJobs()
}

/**
 * Arrête le queue worker.
 */
export function stopQueueWorker() {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
    logger.info({ message: '[QUEUE] Worker arrêté' })
  }
}

// Exporter pour les tests
export {
  processJob,
  processPendingJobs,
  MAX_TENTATIVES,
  computeNextRetry,
  mapReponsesToICRM,
  FIELD_ID_MAP,
  buildIcrmEnregistrementPayload,
  envoyerViaCleApiIcrm,
}
