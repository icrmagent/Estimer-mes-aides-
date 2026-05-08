import { prisma } from '../lib/prisma.js'
import { notifyPartageSucces, notifyPartageEchec, publishEvent } from './pusherService.js'
import logger from '../lib/logger.js'

const POLL_INTERVAL = 30 * 1000 // 30 secondes
const MAX_TENTATIVES = 5        // Task 30.3 — échec_définitif after 5 failures

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

  // Task 30.6 — Validate CRM_API_URL and CRM_API_KEY exist before processing
  const crmUrl = process.env.CRM_API_URL
  const crmKey = process.env.CRM_API_KEY

  if (!crmUrl || !crmKey) {
    logger.error({
      message: 'CRM_API_URL ou CRM_API_KEY non configuré — job ignoré',
      jobId: job.id,
      enregistrementId: job.enregistrementId,
    })
    return
  }

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

    const fieldValues = enregistrement.reponses.map(r => ({
      field_id: r.questionId,
      value: r.valeur,
    }))

    // Task 30.1 — 30-second timeout via AbortController
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30 * 1000)

    let crmRes
    try {
      crmRes = await fetch(`${crmUrl}/api/submissions`, {
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
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

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
    })
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
export { processJob, processPendingJobs, MAX_TENTATIVES, computeNextRetry }
