import Pusher from 'pusher'

/**
 * Service Pusher — notifications WebSocket temps réel (Design §8.1).
 * Émet des événements sur les canaux borne-{borneId}.
 *
 * Variables d'environnement requises :
 *   PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER
 */

let pusherInstance = null

function getPusher() {
  if (!pusherInstance) {
    // Si les variables Pusher ne sont pas configurées, retourner un mock no-op
    if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY) {
      return {
        trigger: async () => {
          console.warn('[Pusher] Not configured — skipping event emission')
        },
      }
    }

    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'eu',
      useTLS: true,
    })
  }
  return pusherInstance
}

/**
 * Émet un événement de succès de partage CRM sur le canal de la borne.
 * @param {string} borneId
 * @param {string} enregistrementId
 */
export async function notifyPartageSucces(borneId, enregistrementId) {
  try {
    await getPusher().trigger(`borne-${borneId}`, 'partage.succes', {
      enregistrementId,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Pusher] Failed to emit partage.succes:', err.message)
  }
}

/**
 * Émet un événement d'échec définitif de partage CRM sur le canal de la borne.
 * @param {string} borneId
 * @param {string} enregistrementId
 * @param {string} erreur
 */
export async function notifyPartageEchec(borneId, enregistrementId, erreur) {
  try {
    await getPusher().trigger(`borne-${borneId}`, 'partage.echec', {
      enregistrementId,
      erreur,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Pusher] Failed to emit partage.echec:', err.message)
  }
}
