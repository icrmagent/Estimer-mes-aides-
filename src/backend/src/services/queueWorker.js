import { prisma } from '../lib/prisma.js'
import { notifyPartageSucces, notifyPartageEchec, publishEvent } from './pusherService.js'
import logger from '../lib/logger.js'

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

// Mapping CRM field ID → nom de champ I-CRM API
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

function mapReponsesToICRM(reponses) {
  const payload = {
    dtypes: 1,
    user_id: parseInt(process.env.CRM_USER_ID || '1', 10),
    type_contact_id: 1,
    user_type: 'societe',
  }

  for (const r of reponses) {
    let icrmField = null

    const crmFieldIds = r.question.crmFieldIds
    if (crmFieldIds !== null && crmFieldIds !== undefined) {
      const ids = Array.isArray(crmFieldIds) ? crmFieldIds : [crmFieldIds]
      for (const id of ids) {
        if (FIELD_ID_MAP[id]) {
          icrmField = FIELD_ID_MAP[id]
          break
        }
      }
    }

    if (!icrmField) {
      const labelJson = r.question.libelleQuestion
      const raw = typeof labelJson === 'object' && labelJson !== null
        ? (labelJson.fr || labelJson.FR || Object.values(labelJson)[0] || '')
        : (labelJson || '')
      icrmField = LABEL_MAP[raw.toString().toLowerCase().trim()]
    }

    if (icrmField) {
      const transform = VALUE_TRANSFORMS[icrmField]
      payload[icrmField] = transform ? transform(r.valeur) : r.valeur
    }
  }

  // Vérifier que les champs obligatoires I-CRM sont présents
  if (!payload.last_name || !payload.first_name) {
    throw new Error('Données insuffisantes : Nom et Prénom requis pour créer un contact I-CRM')
  }

  return payload
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
            canaux: {
              where: { actif: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        reponses: {
          include: {
            question: { select: { libelleQuestion: true, orderPage: true, crmFieldIds: true } },
          },
        },
      },
    })

    if (!enregistrement) {
      throw new Error(`Enregistrement ${job.enregistrementId} introuvable`)
    }

    // Sélectionner le canal par canalTransmission (label) si défini, sinon premier canal actif
    const canalLabel = enregistrement.borne?.canalTransmission
    const canal = canalLabel
      ? (enregistrement.borne?.canaux?.find(c => c.label === canalLabel) ?? enregistrement.borne?.canaux?.[0])
      : enregistrement.borne?.canaux?.[0]
    const crmUrl = canal?.apiUrl || process.env.CRM_API_URL
    const crmKey = canal
      ? await getValidToken(canal)
      : process.env.CRM_API_KEY

    if (!crmUrl || !crmKey) {
      throw new Error('Canal I-CRM non configuré pour cette borne — configurer via le back-office')
    }

    const icrmPayload = mapReponsesToICRM(enregistrement.reponses)

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
