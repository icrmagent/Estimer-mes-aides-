/**
 * pusherService.test.js — Unit tests for pusherService
 *
 * Mocks pusher-js so no real WebSocket connections are made.
 * Covers: connect(), disconnect(), onEvent(), offEvent(), EVENTS constants,
 *         subscribe(), unsubscribe(), bindEvent(), getConnectionState(),
 *         fallback polling, and legacy subscribeToBorne().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Build the mock Pusher instance and constructor BEFORE vi.mock() hoisting
// ---------------------------------------------------------------------------

const mockCalls = {
  subscribe: [],
  unsubscribe: [],
  disconnect: [],
  bind: [],
}

let mockConnectionState = 'connected'
const connectionBindHandlers = {}

// Channel factory
function makeMockChannel(name) {
  return {
    name,
    bind: vi.fn((event, cb) => {
      mockCalls.bind.push({ event, cb, channel: name })
    }),
    unbind: vi.fn(),
  }
}

let _mockInstance = null

function MockPusherConstructor(key, options) {
  this.key = key
  this.options = options
  this.subscribe = vi.fn((name) => {
    mockCalls.subscribe.push(name)
    return makeMockChannel(name)
  })
  this.unsubscribe = vi.fn((name) => mockCalls.unsubscribe.push(name))
  this.disconnect = vi.fn(() => mockCalls.disconnect.push(true))
  this.connection = {
    get state() { return mockConnectionState },
    bind: vi.fn((event, handler) => {
      connectionBindHandlers[event] = handler
    }),
    unbind: vi.fn(),
  }
  _mockInstance = this
}

vi.mock('pusher-js', () => ({
  default: MockPusherConstructor,
}))

// ---------------------------------------------------------------------------
// Helper: fresh import of the service (resets singleton between tests)
// ---------------------------------------------------------------------------

async function importService() {
  return import('./pusherService.js')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pusherService', () => {
  beforeEach(() => {
    vi.resetModules()
    mockConnectionState = 'connected'
    _mockInstance = null
    mockCalls.subscribe = []
    mockCalls.unsubscribe = []
    mockCalls.disconnect = []
    mockCalls.bind = []
    Object.keys(connectionBindHandlers).forEach((k) => delete connectionBindHandlers[k])
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // EVENTS constants
  // -------------------------------------------------------------------------

  describe('EVENTS constants', () => {
    it('exports all required event name constants', async () => {
      const { EVENTS } = await importService()
      expect(EVENTS.NEW_ENREGISTREMENT).toBe('new-enregistrement')
      expect(EVENTS.PARTAGE_STATUS_CHANGED).toBe('partage-status-changed')
      expect(EVENTS.FORMULAIRE_UPDATED).toBe('formulaire.updated')
      expect(EVENTS.FORMULAIRE_ARCHIVED).toBe('formulaire.archived')
    })
  })

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('creates a Pusher client and subscribes to admin-notifications', async () => {
      const { connect } = await importService()
      const channel = connect()

      expect(_mockInstance).not.toBeNull()
      expect(_mockInstance.subscribe).toHaveBeenCalledWith('admin-notifications')
      expect(channel).toBeDefined()
      expect(channel.name).toBe('admin-notifications')
    })

    it('initializes Pusher with VITE_PUSHER_KEY and VITE_PUSHER_CLUSTER', async () => {
      const { connect } = await importService()
      connect()

      expect(typeof _mockInstance.key).toBe('string')
      expect(_mockInstance.key.length).toBeGreaterThan(0)
      expect(typeof _mockInstance.options.cluster).toBe('string')
      expect(_mockInstance.options.cluster.length).toBeGreaterThan(0)
    })

    it('sets disableStats: true on the Pusher client', async () => {
      const { connect } = await importService()
      connect()
      expect(_mockInstance.options.disableStats).toBe(true)
    })

    it('reuses the same channel on subsequent connect() calls', async () => {
      const { connect } = await importService()
      const ch1 = connect()
      const ch2 = connect()

      expect(_mockInstance.subscribe).toHaveBeenCalledTimes(1)
      expect(ch1).toBe(ch2)
    })

    it('binds to connection state_change event', async () => {
      const { connect } = await importService()
      connect()
      expect(_mockInstance.connection.bind).toHaveBeenCalledWith('state_change', expect.any(Function))
    })

    it('starts fallback polling immediately when connection is already failed', async () => {
      mockConnectionState = 'failed'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      // Advance 30 s — polling should fire
      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1)
    })

    it('starts fallback polling immediately when connection is unavailable', async () => {
      mockConnectionState = 'unavailable'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1)
    })

    it('does NOT start fallback polling when connection is connected', async () => {
      mockConnectionState = 'connected'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      vi.advanceTimersByTime(60_000)
      expect(pollTick).not.toHaveBeenCalled()
    })

    it('stops fallback polling when state_change fires "connected"', async () => {
      mockConnectionState = 'failed'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      // Polling is running — advance 30 s
      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1)

      // Simulate Pusher reconnecting
      mockConnectionState = 'connected'
      const stateChangeHandler = _mockInstance.connection.bind.mock.calls.find(
        ([evt]) => evt === 'state_change'
      )?.[1]
      stateChangeHandler?.({ current: 'connected' })

      // Advance another 30 s — polling should have stopped
      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1) // still 1, not 2
    })
  })

  // -------------------------------------------------------------------------
  // onEvent()
  // -------------------------------------------------------------------------

  describe('onEvent()', () => {
    it('binds a callback to the given event on admin-notifications channel', async () => {
      const { connect, onEvent } = await importService()
      connect()
      const handler = vi.fn()

      onEvent('new-enregistrement', handler)

      // The channel returned by subscribe is the mock channel
      const channel = _mockInstance.subscribe.mock.results[0].value
      expect(channel.bind).toHaveBeenCalledWith('new-enregistrement', handler)
    })

    it('auto-connects if connect() was not called first', async () => {
      const { onEvent } = await importService()
      const handler = vi.fn()

      onEvent('new-enregistrement', handler)

      expect(_mockInstance).not.toBeNull()
      expect(_mockInstance.subscribe).toHaveBeenCalledWith('admin-notifications')
    })

    it('can bind multiple events', async () => {
      const { connect, onEvent } = await importService()
      connect()
      const h1 = vi.fn()
      const h2 = vi.fn()

      onEvent('new-enregistrement', h1)
      onEvent('partage-status-changed', h2)

      const channel = _mockInstance.subscribe.mock.results[0].value
      expect(channel.bind).toHaveBeenCalledWith('new-enregistrement', h1)
      expect(channel.bind).toHaveBeenCalledWith('partage-status-changed', h2)
    })
  })

  // -------------------------------------------------------------------------
  // offEvent()
  // -------------------------------------------------------------------------

  describe('offEvent()', () => {
    it('unbinds a callback from the admin-notifications channel', async () => {
      const { connect, onEvent, offEvent } = await importService()
      connect()
      const handler = vi.fn()
      onEvent('new-enregistrement', handler)

      offEvent('new-enregistrement', handler)

      const channel = _mockInstance.subscribe.mock.results[0].value
      expect(channel.unbind).toHaveBeenCalledWith('new-enregistrement', handler)
    })

    it('is a no-op when called before connect()', async () => {
      const { offEvent } = await importService()
      expect(() => offEvent('new-enregistrement', vi.fn())).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect()', () => {
    it('unsubscribes from admin-notifications, disconnects, and resets singleton', async () => {
      const { connect, disconnect, getConnectionState } = await importService()
      connect()

      disconnect()

      expect(_mockInstance.unsubscribe).toHaveBeenCalledWith('admin-notifications')
      expect(_mockInstance.disconnect).toHaveBeenCalledOnce()
      expect(getConnectionState()).toBe('disconnected')
    })

    it('stops fallback polling on disconnect', async () => {
      mockConnectionState = 'failed'
      const { connect, disconnect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      disconnect()

      vi.advanceTimersByTime(60_000)
      expect(pollTick).not.toHaveBeenCalled()
    })

    it('is a no-op when called before connect()', async () => {
      const { disconnect } = await importService()
      expect(() => disconnect()).not.toThrow()
    })

    it('creates a fresh client after disconnect + reconnect', async () => {
      const { connect, disconnect } = await importService()
      connect()
      const firstInstance = _mockInstance

      disconnect()
      connect()
      const secondInstance = _mockInstance

      expect(secondInstance).not.toBe(firstInstance)
    })
  })

  // -------------------------------------------------------------------------
  // getConnectionState()
  // -------------------------------------------------------------------------

  describe('getConnectionState()', () => {
    it('returns "disconnected" when no client has been created', async () => {
      const { getConnectionState } = await importService()
      expect(getConnectionState()).toBe('disconnected')
    })

    it('returns "connected" when Pusher is connected', async () => {
      const { connect, getConnectionState } = await importService()
      connect()
      mockConnectionState = 'connected'
      expect(getConnectionState()).toBe('connected')
    })

    it('returns "failed" when Pusher connection has failed', async () => {
      const { connect, getConnectionState } = await importService()
      connect()
      mockConnectionState = 'failed'
      expect(getConnectionState()).toBe('failed')
    })

    it('returns "unavailable" when Pusher is unavailable', async () => {
      const { connect, getConnectionState } = await importService()
      connect()
      mockConnectionState = 'unavailable'
      expect(getConnectionState()).toBe('unavailable')
    })
  })

  // -------------------------------------------------------------------------
  // subscribe() / unsubscribe() / bindEvent() — low-level API
  // -------------------------------------------------------------------------

  describe('subscribe()', () => {
    it('creates a Pusher client on first call and subscribes to the channel', async () => {
      const { subscribe } = await importService()
      const channel = subscribe('admin-notifications')

      expect(_mockInstance).not.toBeNull()
      expect(_mockInstance.subscribe).toHaveBeenCalledWith('admin-notifications')
      expect(channel).toBeDefined()
      expect(channel.name).toBe('admin-notifications')
    })

    it('reuses the same Pusher client singleton on subsequent calls', async () => {
      const { subscribe } = await importService()
      subscribe('channel-a')
      const firstInstance = _mockInstance

      subscribe('channel-b')
      expect(_mockInstance).toBe(firstInstance)
      expect(_mockInstance.subscribe).toHaveBeenCalledTimes(2)
    })
  })

  describe('unsubscribe()', () => {
    it('calls pusher.unsubscribe with the channel name', async () => {
      const { subscribe, unsubscribe } = await importService()
      subscribe('admin-notifications')
      unsubscribe('admin-notifications')

      expect(_mockInstance.unsubscribe).toHaveBeenCalledWith('admin-notifications')
    })
  })

  describe('bindEvent()', () => {
    it('binds a callback to the given event on the channel', async () => {
      const { subscribe, bindEvent } = await importService()
      const channel = subscribe('admin-notifications')
      const handler = vi.fn()

      bindEvent(channel, 'new-enregistrement', handler)

      expect(channel.bind).toHaveBeenCalledWith('new-enregistrement', handler)
    })

    it('can bind multiple events to the same channel', async () => {
      const { subscribe, bindEvent } = await importService()
      const channel = subscribe('admin-notifications')
      const h1 = vi.fn()
      const h2 = vi.fn()

      bindEvent(channel, 'event-a', h1)
      bindEvent(channel, 'event-b', h2)

      expect(channel.bind).toHaveBeenCalledTimes(2)
      expect(channel.bind).toHaveBeenCalledWith('event-a', h1)
      expect(channel.bind).toHaveBeenCalledWith('event-b', h2)
    })
  })

  // -------------------------------------------------------------------------
  // pusherClient singleton export
  // -------------------------------------------------------------------------

  describe('pusherClient', () => {
    it('exposes the Pusher instance via pusherClient.instance', async () => {
      const { subscribe, pusherClient } = await importService()
      subscribe('admin-notifications')

      expect(pusherClient.instance).toBe(_mockInstance)
    })

    it('creates the client lazily on first access', async () => {
      const { pusherClient } = await importService()
      const inst = pusherClient.instance
      expect(inst).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // Fallback polling — 30 s interval (task 13.9)
  // -------------------------------------------------------------------------

  describe('fallback polling (task 13.9)', () => {
    it('fires the poll callback every 30 s when connection is failed', async () => {
      mockConnectionState = 'failed'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)

      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(2)
    })

    it('does not start a second polling interval if already polling', async () => {
      mockConnectionState = 'failed'
      const { connect } = await importService()
      const pollTick = vi.fn()
      connect(pollTick)
      connect(pollTick) // second call — should not double-start

      vi.advanceTimersByTime(30_000)
      expect(pollTick).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Legacy subscribeToBorne() (backward compat)
  // -------------------------------------------------------------------------

  describe('subscribeToBorne() — legacy', () => {
    it('subscribes to borne-{id} channel and binds partage events', async () => {
      const { subscribeToBorne } = await importService()
      const onEvt = vi.fn()

      subscribeToBorne('borne-42', onEvt)

      expect(_mockInstance.subscribe).toHaveBeenCalledWith('borne-borne-42')
      const channel = _mockInstance.subscribe.mock.results[0].value
      expect(channel.bind).toHaveBeenCalledWith('partage.succes', expect.any(Function))
      expect(channel.bind).toHaveBeenCalledWith('partage.echec', expect.any(Function))
    })

    it('returns an unsubscribe function that cleans up the channel', async () => {
      const { subscribeToBorne } = await importService()
      const cleanup = subscribeToBorne('borne-42', vi.fn())

      cleanup()

      expect(_mockInstance.unsubscribe).toHaveBeenCalledWith('borne-borne-42')
    })

    it('forwards partage.succes events with type field', async () => {
      const { subscribeToBorne } = await importService()
      const onEvt = vi.fn()
      subscribeToBorne('borne-42', onEvt)

      const channel = _mockInstance.subscribe.mock.results[0].value
      const succesCall = channel.bind.mock.calls.find(([evt]) => evt === 'partage.succes')
      expect(succesCall).toBeDefined()
      succesCall[1]({ enregistrementId: 'abc' })

      expect(onEvt).toHaveBeenCalledWith({
        type: 'partage.succes',
        enregistrementId: 'abc',
      })
    })

    it('forwards partage.echec events with type field', async () => {
      const { subscribeToBorne } = await importService()
      const onEvt = vi.fn()
      subscribeToBorne('borne-42', onEvt)

      const channel = _mockInstance.subscribe.mock.results[0].value
      const echecCall = channel.bind.mock.calls.find(([evt]) => evt === 'partage.echec')
      expect(echecCall).toBeDefined()
      echecCall[1]({ reason: 'timeout' })

      expect(onEvt).toHaveBeenCalledWith({
        type: 'partage.echec',
        reason: 'timeout',
      })
    })
  })
})
