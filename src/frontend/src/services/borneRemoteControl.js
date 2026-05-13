/**
 * borneRemoteControl.js
 *
 * Abonnement Pusher au canal borne-{id} pour piloter la borne en temps réel
 * depuis le back-office (SuperAdmin ou AdminBorne).
 *
 * Événements écoutés :
 *   - force-login  → payload { token, email } : la borne est /login → stocke le token et entre en kiosque
 *   - force-logout → quitte le kiosque et retourne sur /login
 *
 * Le canal est public (pas d'auth Pusher) et accepte le no-op si VITE_PUSHER_KEY est absent.
 */
import PusherClient from 'pusher-js'

let client = null
let channel = null
let channelName = null

/**
 * Abonne au canal borne-{borneId} et bind les handlers passés.
 * Retourne une fonction de cleanup à appeler au démontage.
 *
 * @param {string} borneId
 * @param {{ onForceLogin: (data: object) => void, onForceLogout: (data: object) => void }} handlers
 * @returns {() => void} cleanup
 */
export function connectBorneChannel(borneId, { onForceLogin, onForceLogout }) {
  const key = import.meta.env.VITE_PUSHER_KEY
  if (!key || !borneId) {
    return () => {}
  }

  if (!client) {
    client = new PusherClient(key, {
      cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'eu',
      disableStats: true,
    })
  }

  channelName = `borne-${borneId}`
  channel = client.subscribe(channelName)
  channel.bind('force-login', onForceLogin)
  channel.bind('force-logout', onForceLogout)

  return () => {
    if (channel) {
      channel.unbind('force-login', onForceLogin)
      channel.unbind('force-logout', onForceLogout)
    }
    if (client && channelName) {
      client.unsubscribe(channelName)
    }
    channel = null
    channelName = null
  }
}

/**
 * Coupe la connexion Pusher (cleanup global, ex. logout définitif).
 */
export function disconnectBorne() {
  if (client) {
    client.disconnect()
    client = null
    channel = null
    channelName = null
  }
}
