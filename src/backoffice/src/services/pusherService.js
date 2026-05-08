/**
 * pusherService.js — Singleton Pusher client for the Backoffice
 *
 * Replaces the legacy pusher.js (which only handled borne-specific channels).
 * This service handles the "admin-notifications" channel and provides a full
 * connect/disconnect/onEvent/offEvent API plus fallback polling.
 *
 * Tasks 13.2–13.9:
 *  - connect()    — initialize Pusher and subscribe to "admin-notifications"
 *  - disconnect() — unsubscribe and disconnect
 *  - onEvent()    — bind to a specific event on the admin-notifications channel
 *  - offEvent()   — unbind
 *  - EVENTS       — exported event name constants
 *  - Fallback polling every 30 s when Pusher state is "failed" or "unavailable"
 */
import PusherClient from 'pusher-js'

// ---------------------------------------------------------------------------
// Event name constants (task 13.2)
// ---------------------------------------------------------------------------

export const EVENTS = {
  NEW_ENREGISTREMENT: 'new-enregistrement',
  PARTAGE_STATUS_CHANGED: 'partage-status-changed',
  FORMULAIRE_UPDATED: 'formulaire.updated',
  FORMULAIRE_ARCHIVED: 'formulaire.archived',
}

const ADMIN_NOTIFICATIONS_CHANNEL = 'admin-notifications'
const FALLBACK_POLL_INTERVAL_MS = 30_000

// ---------------------------------------------------------------------------
// Singleton client + channel
// ---------------------------------------------------------------------------

let _client = null
let _adminChannel = null
let _pollingTimer = null
let _pollingCallback = null

function getClient() {
  if (!_client) {
    _client = new PusherClient(import.meta.env.VITE_PUSHER_KEY || 'placeholder', {
      cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'eu',
      // Disable Pusher's own console logging in production
      disableStats: true,
    })
  }
  return _client
}

// Expose the singleton so tests and other services can inspect it
export const pusherClient = {
  get instance() {
    return getClient()
  },
}

// ---------------------------------------------------------------------------
// Fallback polling helpers (task 13.9)
// ---------------------------------------------------------------------------

function _startFallbackPolling(onPollTick) {
  if (_pollingTimer) return
  _pollingCallback = onPollTick
  _pollingTimer = setInterval(() => {
    const state = getConnectionState()
    if (state === 'connected') {
      _stopFallbackPolling()
      return
    }
    if (typeof _pollingCallback === 'function') {
      _pollingCallback()
    }
  }, FALLBACK_POLL_INTERVAL_MS)
}

function _stopFallbackPolling() {
  if (_pollingTimer) {
    clearInterval(_pollingTimer)
    _pollingTimer = null
    _pollingCallback = null
  }
}

// ---------------------------------------------------------------------------
// High-level API (tasks 13.3–13.9)
// ---------------------------------------------------------------------------

/**
 * Initialize Pusher with VITE_PUSHER_KEY and VITE_PUSHER_CLUSTER, and
 * subscribe to the "admin-notifications" channel (tasks 13.3, 13.4).
 * Starts fallback polling if the connection is already failed/unavailable.
 *
 * @param {Function} [onPollTick] - Optional callback invoked every 30 s during fallback polling
 * @returns {import('pusher-js').Channel} The admin-notifications channel
 */
export function connect(onPollTick) {
  const client = getClient()

  if (!_adminChannel) {
    _adminChannel = client.subscribe(ADMIN_NOTIFICATIONS_CHANNEL)
  }

  // Watch for connection state changes to start/stop fallback polling (task 13.9)
  client.connection.bind('state_change', ({ current }) => {
    if (current === 'failed' || current === 'unavailable') {
      _startFallbackPolling(onPollTick)
    } else if (current === 'connected') {
      _stopFallbackPolling()
    }
  })

  // Check current state immediately
  const currentState = client.connection.state
  if (currentState === 'failed' || currentState === 'unavailable') {
    _startFallbackPolling(onPollTick)
  }

  return _adminChannel
}

/**
 * Bind a callback to a specific event on the "admin-notifications" channel.
 * Calls connect() automatically if not already connected.
 *
 * @param {string} eventName - One of EVENTS.*
 * @param {Function} callback
 */
export function onEvent(eventName, callback) {
  const channel = _adminChannel || connect()
  channel.bind(eventName, callback)
}

/**
 * Unbind a callback from a specific event on the "admin-notifications" channel.
 *
 * @param {string} eventName
 * @param {Function} callback
 */
export function offEvent(eventName, callback) {
  if (_adminChannel) {
    _adminChannel.unbind(eventName, callback)
  }
}

/**
 * Unsubscribe from "admin-notifications" and disconnect the Pusher client.
 * Stops fallback polling. Useful for cleanup on logout.
 */
export function disconnect() {
  _stopFallbackPolling()
  if (_client) {
    if (_adminChannel) {
      _client.unsubscribe(ADMIN_NOTIFICATIONS_CHANNEL)
      _adminChannel = null
    }
    _client.disconnect()
    _client = null
  }
}

/**
 * Return the current Pusher connection state.
 * Possible values: "initialized" | "connecting" | "connected" |
 *                  "unavailable" | "failed" | "disconnected"
 * @returns {string}
 */
export function getConnectionState() {
  if (!_client) return 'disconnected'
  return _client.connection.state
}

// ---------------------------------------------------------------------------
// Low-level channel API (kept for notificationService.js compatibility)
// ---------------------------------------------------------------------------

/**
 * Subscribe to any Pusher channel by name.
 * @param {string} channelName
 * @returns {import('pusher-js').Channel}
 */
export function subscribe(channelName) {
  return getClient().subscribe(channelName)
}

/**
 * Unsubscribe from a Pusher channel by name.
 * @param {string} channelName
 */
export function unsubscribe(channelName) {
  getClient().unsubscribe(channelName)
}

/**
 * Bind an event handler to a channel object.
 * @param {import('pusher-js').Channel} channel
 * @param {string} eventName
 * @param {Function} callback
 */
export function bindEvent(channel, eventName, callback) {
  channel.bind(eventName, callback)
}

// ---------------------------------------------------------------------------
// Legacy borne-channel support (kept for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use notificationService.subscribeToAdminNotifications() instead.
 * Kept so existing callers of the old pusher.js are not broken.
 */
export function subscribeToBorne(borneId, onEvt) {
  const channel = getClient().subscribe(`borne-${borneId}`)
  channel.bind('partage.succes', (data) => onEvt({ type: 'partage.succes', ...data }))
  channel.bind('partage.echec', (data) => onEvt({ type: 'partage.echec', ...data }))
  return () => getClient().unsubscribe(`borne-${borneId}`)
}
