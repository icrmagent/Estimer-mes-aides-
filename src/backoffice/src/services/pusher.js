import PusherClient from 'pusher-js'

let client = null

function getClient() {
  if (!client) {
    client = new PusherClient(import.meta.env.VITE_PUSHER_KEY || 'placeholder', {
      cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'eu',
    })
  }
  return client
}

export function subscribeToBorne(borneId, onEvent) {
  const channel = getClient().subscribe(`borne-${borneId}`)
  channel.bind('partage.succes', (data) => onEvent({ type: 'partage.succes', ...data }))
  channel.bind('partage.echec', (data) => onEvent({ type: 'partage.echec', ...data }))
  return () => getClient().unsubscribe(`borne-${borneId}`)
}
