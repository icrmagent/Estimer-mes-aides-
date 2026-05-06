import { prisma } from '../lib/prisma.js'
import { notifyPartageSucces, notifyPartageEchec } from './pusherService.js'

const POLL_INTERVAL = 30 * 1000 // 30 secondes
const MAX_TENTATIVES = 3

// Délais de retry exponentiels en millisecondes (R7.1 critère 3)
const RETRY_DELAYS = [
  1 * 60 * 1000,   // 1 minute
  5 * 60 * 1000,   // 5 minutes
  15 * 60 * 1000,  // 15 minutes
]

let workerInterval = null
let isRunning = false

/**
 * Traite un job de partage CRM.
 * Appelle l'API I-CRM externe et met à jour le statut du job.
 */
async function processJob(job) {
  // Marquer le job comme en cours
  await prisma.partageJob.update({
    where: { id: job.id },
    data: { statut: 'en_cours' },
  })

  try {
    // Récupérer l'enregistrement avec ses réponses
    const enregistrement = await prisma.enregistrement.findUnique({
      where: { id: job.enregistrementId },
      include: {
        borne: { select: { id: true, idBorne: true } },
        reponses: {
          include: {
            question: { select: { libelleQuestion: true, orderPage: true } },
          },
        },
      },
    })

    if (!enregistrement) {
      throw new Error(`Enregistrement ${job.enregistrementId} introuvable`)
    }

    // Appel API I-CRM (format field_values V1)
    const crmUrl = process.env.CRM_API_URL
    const crmKey = process.env.CRM_API_KEY

    if (!crmUrl || !crmKey) {
      throw new Error('CRM_API_URL ou CRM_API_KEY non configuré')
    }

    const fieldValues = enregistrement.reponses.map(r => ({
      field_id: r.questionId,
      value: r.valeur,
    }))

    const crmRes = await fetch(`${crmUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': crmKey,
      },
      body: JSON.stringify({
        source: 'borne_v2',
        borne_id: enregistrement.borne?.idBorne,
        langue: enregistrement.langueUtilisee,
        field_values: fieldValues,
      }),
    })

    if (!crmRes.ok) {
      const errText = await crmRes.text()
      throw new Error(`CRM API error ${crmRes.status}: ${errText}`)
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
        },
      }),
    ])

    // Notification Pusher succès (R7.2 critère 6)
    await notifyPartageSucces(enregistrement.borne?.id, job.enregistrementId)

    console.log(`[QUEUE] Job ${job.id} — succès (enregistrement ${job.enregistrementId})`)
  } catch (err) {
    const newTentatives = job.tentatives + 1
    const isDefinitif = newTentatives >= MAX_TENTATIVES

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

      // Notification Pusher échec définitif (R7.2 critère 6)
      if (enr) {
        await notifyPartageEchec(enr.borneId, job.enregistrementId, err.message)
      }

      console.error(`[QUEUE] Job ${job.id} — échec définitif après ${newTentatives} tentatives: ${err.message}`)
    } else {
      // Échec temporaire — planifier un retry
      const delai = RETRY_DELAYS[newTentatives - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
      const prochainEssai = new Date(Date.now() + delai)

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

      console.warn(`[QUEUE] Job ${job.id} — échec temporaire (tentative ${newTentatives}/${MAX_TENTATIVES}), retry à ${prochainEssai.toISOString()}`)
    }
  }
}

/**
 * Traite tous les jobs en attente ou prêts pour retry.
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
      console.log(`[QUEUE] Traitement de ${jobs.length} job(s)...`)
      for (const job of jobs) {
        await processJob(job)
      }
    }
  } catch (err) {
    console.error('[QUEUE] Erreur dans processPendingJobs:', err)
  } finally {
    isRunning = false
  }
}

/**
 * Démarre le queue worker (polling toutes les 30 secondes).
 */
export function startQueueWorker() {
  if (workerInterval) return
  console.log('[QUEUE] Worker démarré — polling toutes les 30s')
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
    console.log('[QUEUE] Worker arrêté')
  }
}

// Exporter pour les tests
export { processJob, processPendingJobs, MAX_TENTATIVES, RETRY_DELAYS }
