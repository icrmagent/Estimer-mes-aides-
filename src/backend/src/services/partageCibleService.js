/**
 * Cible des jobs de partage — règles communes aux routes et au worker.
 *
 * Un job porte sa CIBLE, figée à sa création (`partage_jobs.entrepriseIcrmId`) :
 * l'entreprise I-CRM de la borne à cet instant, ou NULL (chemin des canaux). Le
 * worker n'envoie un job qu'à SA cible, jamais à la destination courante de la
 * borne : changer l'entreprise d'une borne ne déplace pas son arriéré, sauf
 * redirection explicite (changement de destination avec `redirigerEnvoisEnAttente`,
 * « Rediriger les envois » de la borne, suppression d'une entreprise avec
 * redirection, « Mettre en file » — voir routes/partage.js).
 *
 * Cible inutilisable (entreprise désactivée, supprimée, ou à tester : nouvelle
 * entreprise, URL / clé modifiée) : le job passe au statut `suspendu`. Ce statut
 * est HORS de la file du worker (qui ne lit que en_attente / echec_temporaire) :
 * des milliers de jobs suspendus n'occupent aucune des 10 places d'un cycle.
 * Aucune tentative n'est comptée, aucune notification d'échec n'est émise.
 */
import { prisma } from '../lib/prisma.js'
import {
  STATUT_JOB_SUSPENDU,
  entrepriseIcrmUtilisable,
  urlApiIcrmAcceptable,
  messageEnvoiSuspendu,
} from '../lib/icrmApiKey.js'

// Jobs dans la file du worker
export const STATUTS_JOB_EN_FILE = Object.freeze(['en_attente', 'echec_temporaire'])
// Jobs « en attente » au sens large : en file ou suspendus
export const STATUTS_JOB_EN_ATTENTE = Object.freeze([...STATUTS_JOB_EN_FILE, STATUT_JOB_SUSPENDU])
// Jobs NON LIVRÉS : en attente au sens large + échecs définitifs (relançables).
// Base de tous les décomptes et de toutes les redirections de cible.
export const STATUTS_JOB_NON_LIVRES = Object.freeze([...STATUTS_JOB_EN_ATTENTE, 'echec_definitif'])

// Types de destination (réponses d'API et répartitions)
export const DESTINATION_ENTREPRISE = 'entreprise_icrm'
export const DESTINATION_CANAL = 'canal'

// État d'une entreprise nécessaire pour décider (jamais les identifiants)
export const SELECT_ETAT_ENTREPRISE = Object.freeze({
  id: true, nom: true, actif: true, deletedAt: true, verificationRequise: true,
})

// Taille des lots d'identifiants par updateMany (bornée pour les très gros arriérés)
const TAILLE_LOT = 1000

function parLots(ids) {
  const lots = []
  for (let i = 0; i < ids.length; i += TAILLE_LOT) lots.push(ids.slice(i, i + TAILLE_LOT))
  return lots
}

/**
 * Statut initial d'un job (création ou relance) selon sa cible :
 * cible NULL (canaux) ou entreprise utilisable → en_attente ; sinon suspendu + motif.
 * @param {?object} entreprise état de l'entreprise cible (SELECT_ETAT_ENTREPRISE), null = canaux
 * @returns {{ statut: string, erreur: ?string }}
 */
export function statutPourCible(entrepriseIcrmId, entreprise) {
  if (!entrepriseIcrmId) return { statut: 'en_attente', erreur: null }
  if (entrepriseIcrmUtilisable(entreprise)) return { statut: 'en_attente', erreur: null }
  return {
    statut: STATUT_JOB_SUSPENDU,
    // Ligne introuvable (cas anormal) : traitée comme une entreprise supprimée
    erreur: messageEnvoiSuspendu(entreprise ?? { id: entrepriseIcrmId, deletedAt: new Date() }),
  }
}

/** État des entreprises cibles, indexé par id (une seule requête). */
export async function etatsEntreprises(ids, client = prisma) {
  const uniques = [...new Set(ids.filter(Boolean))]
  if (uniques.length === 0) return new Map()
  const lignes = await client.entrepriseIcrm.findMany({ where: { id: { in: uniques } }, select: SELECT_ETAT_ENTREPRISE })
  return new Map(lignes.map((e) => [e.id, e]))
}

/**
 * Descripteur public d'une cible (jamais d'identifiant de connexion) :
 * `{ type: 'entreprise_icrm', entrepriseIcrmId, nom, actif, supprimee }` ou
 * `{ type: 'canal', entrepriseIcrmId: null, nom: null }` (canaux de la borne).
 */
export function descripteurCible(cibleId, etats) {
  if (!cibleId) return { type: DESTINATION_CANAL, entrepriseIcrmId: null, nom: null }
  const e = etats.get(cibleId)
  return {
    type: DESTINATION_ENTREPRISE,
    entrepriseIcrmId: cibleId,
    nom: e?.nom ?? null,
    actif: e ? e.actif : false,
    supprimee: !e || Boolean(e.deletedAt),
  }
}

/**
 * Répartition d'envois par cible : `[{ ...descripteurCible, total, suspendus, echecs }]`,
 * entreprises par nom puis canaux. Sert à TOUTES les confirmations (« 3 → LENA,
 * 1 → canaux ») : une réponse n'annonce jamais une seule destination quand
 * plusieurs s'appliquent.
 * @param {Array<{ cible: ?string, suspendu?: boolean, echec?: boolean }>} elements
 */
export function repartitionParCible(elements, etats) {
  const parCible = new Map()
  for (const el of elements) {
    const cle = el.cible ?? null
    const ligne = parCible.get(cle) ?? { ...descripteurCible(cle, etats), total: 0, suspendus: 0, echecs: 0 }
    ligne.total += 1
    if (el.suspendu) ligne.suspendus += 1
    if (el.echec) ligne.echecs += 1
    parCible.set(cle, ligne)
  }
  return [...parCible.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === DESTINATION_CANAL ? 1 : -1
    return String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr')
  })
}

/** « 3 → LENA, 1 → canaux » (journaux et messages d'API). */
export function resumeRepartition(destinations) {
  return destinations
    .map((d) => `${d.total} → ${d.type === DESTINATION_CANAL ? 'canaux' : `« ${d.nom ?? d.entrepriseIcrmId} »`}`)
    .join(', ')
}

/**
 * Suspend les jobs en file (en_attente / echec_temporaire) ciblant une entreprise,
 * et reflète le statut sur leurs enregistrements. `inclureSuspendus` met aussi à
 * jour le motif des jobs déjà suspendus (ex. entreprise désactivée puis supprimée).
 * Les échecs définitifs ne sont pas touchés (ils attendent une relance explicite).
 * @returns {Promise<number>} nombre de jobs suspendus
 */
export async function suspendreEnvoisEntreprise(entreprise, { inclureSuspendus = false } = {}) {
  const statuts = inclureSuspendus ? STATUTS_JOB_EN_ATTENTE : STATUTS_JOB_EN_FILE
  const jobs = await prisma.partageJob.findMany({
    where: { entrepriseIcrmId: entreprise.id, statut: { in: [...statuts] } },
    select: { id: true, enregistrementId: true },
  })
  if (jobs.length === 0) return 0
  const motif = messageEnvoiSuspendu(entreprise)
  await prisma.$transaction([
    prisma.partageJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) }, statut: { in: [...statuts] } },
      data: { statut: STATUT_JOB_SUSPENDU, erreur: motif, prochainEssai: null },
    }),
    prisma.enregistrement.updateMany({
      where: { id: { in: jobs.map((j) => j.enregistrementId) }, statutPartage: { not: 'partage' } },
      data: { statutPartage: STATUT_JOB_SUSPENDU, derniereErreur: motif },
    }),
  ])
  return jobs.length
}

/**
 * Remet en file (en_attente) les jobs suspendus d'une entreprise, tentatives
 * inchangées, et leurs enregistrements. À n'appeler que si l'entreprise est
 * utilisable (active, non supprimée, identifiants vérifiés).
 * @returns {Promise<number>} nombre de jobs repris
 */
export async function reprendreEnvoisEntreprise(entrepriseIcrmId) {
  const jobs = await prisma.partageJob.findMany({
    where: { entrepriseIcrmId, statut: STATUT_JOB_SUSPENDU },
    select: { id: true, enregistrementId: true },
  })
  if (jobs.length === 0) return 0
  await prisma.$transaction([
    prisma.partageJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) }, statut: STATUT_JOB_SUSPENDU },
      data: { statut: 'en_attente', erreur: null, prochainEssai: null },
    }),
    prisma.enregistrement.updateMany({
      where: { id: { in: jobs.map((j) => j.enregistrementId) }, statutPartage: STATUT_JOB_SUSPENDU },
      data: { statutPartage: 'en_attente', derniereErreur: null },
    }),
  ])
  return jobs.length
}

/**
 * Balayage du worker (début de chaque cycle) : reprend les jobs `suspendu` dont
 * l'entreprise cible est de nouveau utilisable (active, non supprimée, vérifiée)
 * et dont l'hôte d'URL est autorisé. Rattrape les suspensions « orphelines »
 * (course entre une désactivation et sa réactivation, reprise interrompue,
 * liste d'hôtes rétablie). Une requête sur la petite table des entreprises
 * (EXISTS sur l'index partage_jobs(entrepriseIcrmId, statut)) ; rien à faire = rien d'écrit.
 * @returns {Promise<{ total: number, reprises: Array<{ entrepriseIcrmId: string, jobs: number }> }>}
 */
export async function reprendreEnvoisEntreprisesUtilisables() {
  const entreprises = await prisma.entrepriseIcrm.findMany({
    where: {
      actif: true,
      deletedAt: null,
      verificationRequise: false,
      partageJobs: { some: { statut: STATUT_JOB_SUSPENDU } },
    },
    select: { id: true, apiUrl: true },
  })
  let total = 0
  const reprises = []
  for (const entreprise of entreprises) {
    if (!urlApiIcrmAcceptable(entreprise.apiUrl)) continue
    const jobs = await reprendreEnvoisEntreprise(entreprise.id)
    if (jobs > 0) {
      total += jobs
      reprises.push({ entrepriseIcrmId: entreprise.id, jobs })
    }
  }
  return { total, reprises }
}

// ─── Redirection de cible (plan puis application) ─────────────────────────────

/**
 * Plan de redirection : nouvelle cible et effet sur le statut de chaque job.
 * - échec définitif : seule la cible change (il attend une relance explicite) ;
 * - nouvelle cible inutilisable (entreprise désactivée, supprimée, à tester) :
 *   suspendu, avec son motif ;
 * - nouvelle cible utilisable ou canaux : un job suspendu repart en file
 *   (en_attente) ; en_attente / echec_temporaire gardent leur statut.
 * @param {Array<{ id, enregistrementId, statut, entrepriseIcrmId }>} jobs
 * @param {(job) => ?string} cibleDe nouvelle cible de chaque job (NULL = canaux)
 * @param {Map} etats état des entreprises (etatsEntreprises)
 * @returns {Array<{ job, cible: ?string, action: 'cible'|'suspendre'|'reprendre', erreur: ?string }>}
 */
export function planifierRedirection(jobs, cibleDe, etats) {
  return jobs.map((job) => {
    const cible = cibleDe(job) ?? null
    if (job.statut === 'echec_definitif') return { job, cible, action: 'cible', erreur: null }
    const { statut, erreur } = statutPourCible(cible, etats.get(cible))
    if (statut === STATUT_JOB_SUSPENDU) return { job, cible, action: 'suspendre', erreur }
    if (job.statut === STATUT_JOB_SUSPENDU) return { job, cible, action: 'reprendre', erreur: null }
    return { job, cible, action: 'cible', erreur: null }
  })
}

/** Répartition d'un plan par NOUVELLE cible (suspendus et échecs définitifs à l'arrivée). */
export function repartitionPlan(plan, etats) {
  return repartitionParCible(plan.map((p) => ({
    cible: p.cible,
    suspendu: p.action === 'suspendre',
    echec: p.job.statut === 'echec_definitif',
  })), etats)
}

/** Répartition d'un plan par cible D'ORIGINE (d'où viennent les envois redirigés). */
export function repartitionOrigine(plan, etats) {
  return repartitionParCible(plan.map((p) => ({
    cible: p.job.entrepriseIcrmId ?? null,
    suspendu: p.job.statut === STATUT_JOB_SUSPENDU,
    echec: p.job.statut === 'echec_definitif',
  })), etats)
}

/**
 * Applique un plan en une transaction. Chaque mise à jour est gardée par le
 * statut lu au moment du plan : un job pris entre-temps par le worker (en_cours)
 * ou livré n'est pas modifié.
 * @returns {Promise<number>} nombre de jobs du plan
 */
export async function appliquerRedirection(plan) {
  if (plan.length === 0) return 0
  const groupes = new Map()
  for (const p of plan) {
    const cle = JSON.stringify([p.cible, p.action, p.erreur, p.job.statut])
    const g = groupes.get(cle) ?? { ...p, jobIds: [], enregistrementIds: [] }
    g.jobIds.push(p.job.id)
    g.enregistrementIds.push(p.job.enregistrementId)
    groupes.set(cle, g)
  }
  const operations = []
  for (const g of groupes.values()) {
    const dataJob = { entrepriseIcrmId: g.cible }
    if (g.action === 'suspendre') Object.assign(dataJob, { statut: STATUT_JOB_SUSPENDU, erreur: g.erreur, prochainEssai: null })
    if (g.action === 'reprendre') Object.assign(dataJob, { statut: 'en_attente', erreur: null, prochainEssai: null })
    for (const ids of parLots(g.jobIds)) {
      operations.push(prisma.partageJob.updateMany({ where: { id: { in: ids }, statut: g.job.statut }, data: dataJob }))
    }
    for (const ids of parLots(g.enregistrementIds)) {
      if (g.action === 'suspendre') {
        operations.push(prisma.enregistrement.updateMany({
          where: { id: { in: ids }, statutPartage: { not: 'partage' } },
          data: { statutPartage: STATUT_JOB_SUSPENDU, derniereErreur: g.erreur },
        }))
      } else if (g.action === 'reprendre') {
        operations.push(prisma.enregistrement.updateMany({
          where: { id: { in: ids }, statutPartage: STATUT_JOB_SUSPENDU },
          data: { statutPartage: 'en_attente', derniereErreur: null },
        }))
      }
    }
  }
  await prisma.$transaction(operations)
  return plan.length
}

// Colonnes d'un job lues pour une redirection
const SELECT_JOB_REDIRECTION = Object.freeze({ id: true, enregistrementId: true, statut: true, entrepriseIcrmId: true })

/**
 * Envois NON LIVRÉS d'une borne (en_attente, echec_temporaire, suspendu,
 * echec_definitif), par cible : sert à confirmer un changement de destination et
 * à proposer « Rediriger les envois ». `horsDestination` = ceux dont la cible
 * n'est pas la destination actuelle de la borne.
 * @returns {Promise<{ total: number, horsDestination: number, parEntreprise: Array<{ entrepriseIcrmId: ?string,
 *   nom: ?string, actif: ?boolean, supprimee: boolean, total: number, suspendus: number, echecs: number }> }>}
 */
export async function envoisEnAttenteBorne(borneId, { destinationActuelle } = {}) {
  const groupes = await prisma.partageJob.groupBy({
    by: ['entrepriseIcrmId', 'statut'],
    where: { statut: { in: [...STATUTS_JOB_NON_LIVRES] }, enregistrement: { borneId, deletedAt: null } },
    _count: { _all: true },
  })
  const etats = await etatsEntreprises(groupes.map((g) => g.entrepriseIcrmId))
  const parCible = new Map()
  for (const g of groupes) {
    const cle = g.entrepriseIcrmId ?? null
    const ligne = parCible.get(cle) ?? {
      entrepriseIcrmId: cle,
      nom: cle ? (etats.get(cle)?.nom ?? null) : null,
      actif: cle ? (etats.get(cle)?.actif ?? null) : null,
      supprimee: cle ? Boolean(etats.get(cle)?.deletedAt) || !etats.has(cle) : false,
      total: 0,
      suspendus: 0,
      echecs: 0,
    }
    const n = g._count?._all ?? 0
    ligne.total += n
    if (g.statut === STATUT_JOB_SUSPENDU) ligne.suspendus += n
    if (g.statut === 'echec_definitif') ligne.echecs += n
    parCible.set(cle, ligne)
  }
  const parEntreprise = [...parCible.values()]
  const horsDestination = destinationActuelle === undefined
    ? undefined
    : parEntreprise
      .filter((l) => (l.entrepriseIcrmId ?? null) !== (destinationActuelle ?? null))
      .reduce((s, l) => s + l.total, 0)
  return {
    total: parEntreprise.reduce((s, l) => s + l.total, 0),
    ...(horsDestination === undefined ? {} : { horsDestination }),
    parEntreprise,
  }
}

/**
 * Redirige EXPLICITEMENT les envois non livrés d'une borne vers sa nouvelle
 * destination (changement de destination avec `redirigerEnvoisEnAttente`) : jobs
 * ciblant l'ancienne destination, ou une entreprise supprimée (qui ne recevra plus
 * jamais rien). Cible NULL = chemin des canaux. Effet sur les statuts : voir
 * `planifierRedirection`.
 * @returns {Promise<{ total: number, destinations: Array }>}
 */
export async function redirigerEnvoisBorne(borneId, { ancienneId = null, nouvelleId = null }) {
  const jobs = await prisma.partageJob.findMany({
    where: {
      statut: { in: [...STATUTS_JOB_NON_LIVRES] },
      enregistrement: { borneId },
      OR: [
        { entrepriseIcrmId: ancienneId },
        { entrepriseIcrm: { is: { deletedAt: { not: null } } } },
      ],
    },
    select: SELECT_JOB_REDIRECTION,
  })
  if (jobs.length === 0) return { total: 0, destinations: [] }
  const etats = await etatsEntreprises([nouvelleId])
  const plan = planifierRedirection(jobs, () => nouvelleId, etats)
  await appliquerRedirection(plan)
  return { total: plan.length, destinations: repartitionPlan(plan, etats) }
}

/**
 * « Rediriger les envois » d'une borne : ses envois non livrés dont la cible
 * n'est PAS sa destination actuelle (entreprise I-CRM, sinon canaux) sont
 * reciblés vers elle. Couvre l'impasse d'après une suppression forcée (envois
 * suspendus « entreprise supprimée » sur une borne repassée aux canaux).
 * `simulation` : même réponse, rien n'est écrit.
 * @param {{ id: string, entrepriseIcrmId: ?string }} borne
 * @returns {Promise<{ destinationActuelle: object, total: number, depuis: Array, destinations: Array }>}
 */
export async function redirigerVersDestinationActuelle(borne, { simulation = false } = {}) {
  const destination = borne.entrepriseIcrmId ?? null
  const jobs = await prisma.partageJob.findMany({
    where: {
      statut: { in: [...STATUTS_JOB_NON_LIVRES] },
      enregistrement: { borneId: borne.id, deletedAt: null },
      // « différent de » explicite : en SQL, NULL <> 'x' n'est pas vrai
      ...(destination
        ? { OR: [{ entrepriseIcrmId: null }, { entrepriseIcrmId: { not: destination } }] }
        : { entrepriseIcrmId: { not: null } }),
    },
    select: SELECT_JOB_REDIRECTION,
  })
  const etats = await etatsEntreprises([destination, ...jobs.map((j) => j.entrepriseIcrmId)])
  const plan = planifierRedirection(jobs, () => destination, etats)
  if (!simulation) await appliquerRedirection(plan)
  return {
    destinationActuelle: descripteurCible(destination, etats),
    total: plan.length,
    depuis: repartitionOrigine(plan, etats),
    destinations: repartitionPlan(plan, etats),
  }
}
