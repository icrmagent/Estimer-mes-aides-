/**
 * usePusher.js — React hook for Pusher WebSocket integration
 *
 * Initializes the pusherService on mount and cleans up on unmount.
 * Returns connection state and subscribe/unsubscribe helpers.
 */
import { useCallback, useSyncExternalStore } from 'react'
import {
  subscribe as pusherSubscribe,
  unsubscribe as pusherUnsubscribe,
  disconnect,
  getConnectionState,
} from '../services/pusherService.js'

/**
 * @returns {{ connected: boolean, subscribe: Function, unsubscribe: Function }}
 */
/**
 * Abonnement au client Pusher, au sens useSyncExternalStore : ouvrir la
 * connexion (via le canal admin-notifications), relayer les changements
 * d'état, puis fermer la connexion au démontage.
 * @param {() => void} onConnectionChange
 * @returns {() => void} désabonnement
 */
function subscribeToConnection(onConnectionChange) {
  // Subscribe to admin-notifications to initialize the Pusher client
  const channel = pusherSubscribe('admin-notifications')

  try {
    channel.pusher.connection.bind('state_change', onConnectionChange)
  } catch (err) {
    // pusher-js may not expose this in all environments (e.g. mocks/tests) —
    // l'état reste alors celui renvoyé par getConnectionState().
    console.debug('[usePusher] state_change indisponible :', err?.message ?? err)
  }

  return () => {
    try {
      channel.pusher.connection.unbind('state_change', onConnectionChange)
    } catch {
      // ignore
    }
    disconnect()
  }
}

/** Snapshot booléen (primitif : stable entre deux rendus). */
function getConnectedSnapshot() {
  return getConnectionState() === 'connected'
}

export function usePusher() {
  // Le state Pusher est un store externe : useSyncExternalStore lit le snapshot
  // au rendu ET juste après l'abonnement, sans setState dans un effet.
  const connected = useSyncExternalStore(
    subscribeToConnection,
    getConnectedSnapshot,
    getConnectedSnapshot
  )

  const subscribe = useCallback((channelName) => {
    return pusherSubscribe(channelName)
  }, [])

  const unsubscribe = useCallback((channelName) => {
    pusherUnsubscribe(channelName)
  }, [])

  return { connected, subscribe, unsubscribe }
}
