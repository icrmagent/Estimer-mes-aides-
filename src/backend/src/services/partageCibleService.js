/**
 * Cible des jobs de partage — règles communes aux routes et au worker.
 *
 * Un job porte sa CIBLE, figée à sa création (`partage_jobs.entrepriseIcrmId`) :
 * l'entreprise I-CRM de la borne à cet instant, ou NULL (chemin des canaux). Le
 * worker n'envoie un job qu'à SA cible, jamais à la destination courante de la
 * borne : changer l'entreprise d'une borne ne déplace pas son arriéré, sauf
 * redirection explicite (`redirigerEnvoisBorne`).
 *
 * Cible inutilisable (entreprise désactivée, supprimée, ou à retester après un
 * changement d'URL / de clé) : le job passe au statut `suspendu`. Ce statut est
 * HORS de la file du worker (qui ne lit que en_attente / echec_temporaire) :
 * des milliers de jobs suspendus n'occupent aucune des 10 places d'un cycle.
 * Aucune tentative n'est comptée, aucune notification d'échec n'est émise.
 */
import { prisma } from '../lib/prisma.js'
import {
  STATUT_JOB_SUSPENDU,
  entrepriseIcrmUtilisable,
  messageEnvoiSuspendu,
} from '../lib/icrmApiKey.js'

// Jobs « en attente » au sens large (pas encore livrés, pas en échec définitif)
export const STATUTS_JOB_EN_ATTENTE = Object.freeze(['en_attente', 'echec_temporaire', STATUT_JOB_SUSPENDU])
// Jobs que la suspension d'une entreprise retire de la file du worker
const STATUTS_JOB_A_SUSPENDRE = Object.freeze(['en_attente', 'echec_temporaire'])

// État d'une entreprise nécessaire pour décider (jamais les identifiants)
export const SELECT_ETAT_ENTREPRISE = Object.freeze({
  id: true, nom: true, actif: true, deletedAt: true, verificationRequise: true,
})

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
 * Suspend les jobs en file (en_attente / echec_temporaire) ciblant une entreprise,
 * et reflète le statut sur leurs enregistrements. `inclureSuspendus` met aussi à
 * jour le motif des jobs déjà suspendus (ex. entreprise désactivée puis supprimée).
 * @returns {Promise<number>} nombre de jobs suspendus
 */
export async function suspendreEnvoisEntreprise(entreprise, { inclureSuspendus = false } = {}) {
  const statuts = inclureSuspendus ? STATUTS_JOB_EN_ATTENTE : STATUTS_JOB_A_SUSPENDRE
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
 * Envois pas encore livrés d'une borne (en_attente, echec_temporaire, suspendu),
 * par cible : sert à la confirmation d'un changement de destination.
 * @returns {Promise<{ total: number, parEntreprise: Array<{ entrepriseIcrmId: ?string,
 *   nom: ?string, actif: ?boolean, supprimee: boolean, total: number, suspendus: number }> }>}
 */
export async function envoisEnAttenteBorne(borneId) {
  const groupes = await prisma.partageJob.groupBy({
    by: ['entrepriseIcrmId', 'statut'],
    where: { statut: { in: [...STATUTS_JOB_EN_ATTENTE] }, enregistrement: { borneId, deletedAt: null } },
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
    }
    const n = g._count?._all ?? 0
    ligne.total += n
    if (g.statut === STATUT_JOB_SUSPENDU) ligne.suspendus += n
    parCible.set(cle, ligne)
  }
  const parEntreprise = [...parCible.values()]
  return { total: parEntreprise.reduce((s, l) => s + l.total, 0), parEntreprise }
}

/**
 * Redirige EXPLICITEMENT les envois pas encore livrés d'une borne vers sa nouvelle
 * destination : jobs ciblant l'ancienne destination (ou une entreprise supprimée,
 * qui ne recevra plus jamais rien). Cible NULL = chemin des canaux.
 * Nouvelle cible utilisable (ou canaux) → les suspendus repartent en file ;
 * nouvelle cible inutilisable → tous suspendus avec son motif.
 * @returns {Promise<number>} nombre de jobs redirigés
 */
export async function redirigerEnvoisBorne(borneId, { ancienneId = null, nouvelleId = null, nouvelle = null }) {
  const jobs = await prisma.partageJob.findMany({
    where: {
      statut: { in: [...STATUTS_JOB_EN_ATTENTE] },
      enregistrement: { borneId },
      OR: [
        { entrepriseIcrmId: ancienneId },
        { entrepriseIcrm: { is: { deletedAt: { not: null } } } },
      ],
    },
    select: { id: true, enregistrementId: true, statut: true },
  })
  const aRediriger = jobs
  if (aRediriger.length === 0) return 0

  const { statut, erreur } = statutPourCible(nouvelleId, nouvelle)
  const ids = aRediriger.map((j) => j.id)
  const operations = [prisma.partageJob.updateMany({ where: { id: { in: ids } }, data: { entrepriseIcrmId: nouvelleId } })]
  if (statut === STATUT_JOB_SUSPENDU) {
    operations.push(
      prisma.partageJob.updateMany({ where: { id: { in: ids } }, data: { statut, erreur, prochainEssai: null } }),
      prisma.enregistrement.updateMany({
        where: { id: { in: aRediriger.map((j) => j.enregistrementId) }, statutPartage: { not: 'partage' } },
        data: { statutPartage: statut, derniereErreur: erreur },
      }),
    )
  } else {
    const suspendus = aRediriger.filter((j) => j.statut === STATUT_JOB_SUSPENDU)
    if (suspendus.length > 0) {
      operations.push(
        prisma.partageJob.updateMany({
          where: { id: { in: suspendus.map((j) => j.id) } },
          data: { statut: 'en_attente', erreur: null, prochainEssai: null },
        }),
        prisma.enregistrement.updateMany({
          where: { id: { in: suspendus.map((j) => j.enregistrementId) }, statutPartage: STATUT_JOB_SUSPENDU },
          data: { statutPartage: 'en_attente', derniereErreur: null },
        }),
      )
    }
  }
  await prisma.$transaction(operations)
  return aRediriger.length
}
