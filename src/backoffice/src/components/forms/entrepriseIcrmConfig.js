/**
 * entrepriseIcrmConfig.js — règles « Entreprise I-CRM » (sans React, testables).
 *
 * Une entreprise (tenant) I-CRM est enregistrée une fois avec la clé API émise
 * par I-CRM (identifiant « emak_… » + secret), puis choisie borne par borne.
 * Le backend refait les mêmes contrôles (double validation) : voir
 * src/backend/src/routes/entreprises-icrm.js.
 */
import { CLE_API_REGEX, SECRET_API_REGEX } from './canalConfig.js'

export const NOM_ENTREPRISE_MAX = 120

/** true si l'édition remplace l'identifiant de clé : le secret émis avec elle est alors obligatoire. */
export function estNouvelleCleEntreprise({ isEdit, apiKey, apiKeyInitiale = '' }) {
  const cle = (apiKey || '').trim()
  return Boolean(isEdit) && cle !== '' && cle !== (apiKeyInitiale || '')
}

function urlApiAcceptable(url) {
  return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
}

/**
 * Valide la saisie. Retourne un message d'erreur en français, ou null si valide.
 * En création, la clé et le secret sont obligatoires ; en édition, un champ
 * vide n'est pas modifié (sauf le secret d'une NOUVELLE clé).
 */
export function validerSaisieEntreprise({ isEdit, nom, apiUrl, apiKey, token, apiKeyInitiale = '' }) {
  const n = (nom || '').trim()
  const url = (apiUrl || '').trim()
  const cle = (apiKey || '').trim()
  const secret = (token || '').trim()

  if (!n) return "Le nom de l'entreprise est requis"
  if (n.length > NOM_ENTREPRISE_MAX) return `Le nom ne doit pas dépasser ${NOM_ENTREPRISE_MAX} caractères`
  if (!url) return "L'URL API I-CRM est requise"
  if (!urlApiAcceptable(url)) return "L'URL API I-CRM doit commencer par https://"
  if (!isEdit && !cle) return 'La clé API I-CRM est requise'
  if (!isEdit && !secret) return 'Le secret API I-CRM est requis'
  if (estNouvelleCleEntreprise({ isEdit, apiKey: cle, apiKeyInitiale }) && !secret) {
    return 'Nouvelle clé API : saisissez aussi le secret émis avec cette clé par I-CRM'
  }
  if (cle && !CLE_API_REGEX.test(cle)) return 'Clé API invalide : « emak_ » suivi de 24 caractères alphanumériques'
  if (secret && !SECRET_API_REGEX.test(secret)) return 'Secret invalide : 48 caractères alphanumériques attendus'
  return null
}

/**
 * Corps de POST /api/entreprises-icrm (création) ou PUT /api/entreprises-icrm/:id.
 * En édition, la clé n'est envoyée que si elle a changé et le secret que s'il est saisi.
 */
export function construireRequeteEntreprise({ isEdit, nom, apiUrl, apiKey, token, actif, apiKeyInitiale = '' }) {
  const cle = (apiKey || '').trim()
  const secret = (token || '').trim()
  const base = { nom: (nom || '').trim(), apiUrl: (apiUrl || '').trim(), actif: Boolean(actif) }
  if (!isEdit) return { ...base, apiKey: cle, token: secret }
  const patch = { ...base }
  if (cle && cle !== (apiKeyInitiale || '')) patch.apiKey = cle
  if (secret) patch.token = secret
  return patch
}

/** « Nom — entreprise I-CRM (sous-type) », tel qu'affiché dans le choix de la borne. */
export function libelleEntrepriseIcrm(entreprise) {
  if (!entreprise) return ''
  const icrm = entreprise.nomIcrm
    ? `${entreprise.nomIcrm}${entreprise.sousTypeIcrm ? ` (${entreprise.sousTypeIcrm})` : ''}`
    : 'non vérifiée'
  return `${entreprise.nom} — ${icrm}`
}

export const LIBELLE_ENVOIS_SUSPENDUS = 'Envois suspendus (entreprise désactivée)'

/** Texte d'avertissement : bornes suspendues tant que l'entreprise est désactivée. */
export function messageBornesSuspendues(nbBornes) {
  const n = Number(nbBornes) || 0
  if (n <= 0) return null
  return `${n} borne${n > 1 ? 's' : ''} suspendue${n > 1 ? 's' : ''} tant que l'entreprise est désactivée`
}

/**
 * Options du choix « Entreprise I-CRM destinataire » d'une borne : entreprises
 * actives, plus l'entreprise actuelle de la borne si elle est désactivée (sinon
 * le choix afficherait « Aucune » alors que la borne est affectée et suspendue).
 * @returns {Array<{ value: string, label: string }>}
 */
export function optionsEntreprisesIcrm(entreprises = [], entrepriseActuelle = null) {
  const options = entreprises
    .filter((e) => e && e.actif !== false)
    .map((e) => ({ value: e.id, label: libelleEntrepriseIcrm(e) }))
  if (entrepriseActuelle?.id && !options.some((o) => o.value === entrepriseActuelle.id)) {
    options.push({ value: entrepriseActuelle.id, label: `${libelleEntrepriseIcrm(entrepriseActuelle)} — désactivée` })
  }
  return options
}

// Libellés des statuts mémorisés par le test de connexion (dernierStatut)
const LIBELLES_STATUT = {
  ok: 'Connectée',
  invalid_credentials: 'Clé ou secret refusé',
  client_disabled: 'Client API désactivé',
  subscription_inactive: 'Abonnement inactif',
  reponse_non_conforme: "URL à vérifier (ce n'est pas l'API I-CRM)",
  not_found: 'URL introuvable (404)',
  timeout: 'Délai dépassé',
  injoignable: 'Injoignable',
}

/**
 * Résultat du dernier test de connexion, pour le tableau des entreprises.
 * @returns {{ texte: string, ton: 'ok'|'erreur'|'neutre' }}
 */
export function statutVerification(entreprise) {
  const statut = entreprise?.dernierStatut
  if (!statut) return { texte: 'Non vérifiée', ton: 'neutre' }
  if (statut === 'ok') return { texte: LIBELLES_STATUT.ok, ton: 'ok' }
  if (LIBELLES_STATUT[statut]) return { texte: LIBELLES_STATUT[statut], ton: 'erreur' }
  const http = /^http_(\d{3})$/.exec(statut)
  return { texte: http ? `Échec HTTP ${http[1]}` : `Échec (${statut})`, ton: 'erreur' }
}

/**
 * Destination des enregistrements d'une borne, pour l'affichage (même règle
 * que le worker) : une borne affectée à une entreprise I-CRM n'envoie qu'à elle
 * — désactivée, ses envois sont SUSPENDUS (jamais de repli sur les canaux) ;
 * une borne sans entreprise utilise ses canaux.
 * @returns {{ type: 'entreprise'|'canal', libelle: string, suspendu?: true }}
 */
export function destinationBorne(borne) {
  const entreprise = borne?.entrepriseIcrm
  if (entreprise) {
    return {
      type: 'entreprise',
      libelle: entreprise.nom,
      ...(entreprise.actif === false ? { suspendu: true } : {}),
    }
  }
  const canal = borne?.canalTransmission
  return { type: 'canal', libelle: canal ? `Canal « ${canal} »` : 'Canaux de la borne' }
}
