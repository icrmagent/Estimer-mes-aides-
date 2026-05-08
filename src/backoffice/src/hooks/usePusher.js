/**
 * usePusher.js — React hook for Pusher WebSocket integration
 *
 * Initializes the pusherService on mount and cleans up on unmount.
 * Returns connection state and subscribe/unsubscribe helpers.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  subscribe as pusherSubscribe,
  unsubscribe as pusherUnsubscribe,
  disconnect,
  getConnectionState,
} from '../services/pusherService.js'

/**
 * @returns {{ connected: boolean, subscribe: Function, unsubscribe: Function }}
 */
export function usePusher() {
  const [connected, setConnected] = useState(() => getConnectionState() === 'connected')

  useEffect(() => {
    // Subscribe to admin-notifications to initialize the Pusher client
    const channel = pusherSubscribe('admin-notifications')

    // Track connection state changes
    const handleStateChange = (states) => {
      setConnected(states.current === 'connected')
    }

    try {
      channel.pusher.connection.bind('state_change', handleStateChange)
      // Set initial state
      setConnected(channel.pusher.connection.state === 'connected')
    } catch {
      // pusher-js may not expose this in all environments (e.g. mocks/tests)
    }

    return () => {
      try {
        channel.pusher.connection.unbind('state_change', handleStateChange)
      } catch {
        // ignore
      }
      disconnect()
    }
  }, [])

  const subscribe = useCallback((channelName) => {
    return pusherSubscribe(channelName)
  }, [])

  const unsubscribe = useCallback((channelName) => {
    pusherUnsubscribe(channelName)
  }, [])

  return { connected, subscribe, unsubscribe }
}
