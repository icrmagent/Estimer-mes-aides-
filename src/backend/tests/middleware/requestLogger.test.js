/**
 * Unit tests for requestLogger middleware
 *
 * Tests cover:
 * - Logs method, path, statusCode, duration fields
 * - Does not throw on missing fields
 * - Calls next()
 */

import { jest } from '@jest/globals'

// ─── Mock logger before importing middleware ──────────────────────────────────

const mockLoggerInfo = jest.fn()
const mockLoggerWarn = jest.fn()

jest.unstable_mockModule('../../src/lib/logger.js', () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

describe('requestLogger middleware', () => {
  let requestLogger
  let req
  let res
  let next

  beforeAll(async () => {
    const module = await import('../../src/middleware/requestLogger.js')
    requestLogger = module.requestLogger
  })

  beforeEach(() => {
    jest.clearAllMocks()

    req = {
      method: 'GET',
      path: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn((header) => header === 'user-agent' ? 'test-agent' : undefined),
    }

    // Simulate EventEmitter for res.on('finish', ...)
    const listeners = {}
    res = {
      statusCode: 200,
      on: jest.fn((event, cb) => {
        listeners[event] = cb
      }),
      emit: (event) => {
        if (listeners[event]) listeners[event]()
      },
    }

    next = jest.fn()
  })

  describe('Middleware behavior', () => {
    it('calls next() immediately', () => {
      requestLogger(req, res, next)
      expect(next).toHaveBeenCalledTimes(1)
    })

    it('does not log before the response finishes', () => {
      requestLogger(req, res, next)
      // Before finish event — no log yet
      expect(mockLoggerInfo).not.toHaveBeenCalled()
    })

    it('logs after the response finish event', () => {
      requestLogger(req, res, next)
      res.emit('finish')
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe('Log format and fields', () => {
    it('logs the HTTP method', () => {
      req.method = 'POST'
      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(logArg.method).toBe('POST')
    })

    it('logs the request path', () => {
      req.path = '/api/bornes'
      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(logArg.path).toBe('/api/bornes')
    })

    it('logs the response status code', () => {
      res.statusCode = 201
      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(logArg.statusCode).toBe(201)
    })

    it('logs the duration in milliseconds', () => {
      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(typeof logArg.duration).toBe('number')
      expect(logArg.duration).toBeGreaterThanOrEqual(0)
    })

    it('log contains method, path, statusCode, and duration together', () => {
      req.method = 'GET'
      req.path = '/api/health'
      res.statusCode = 200

      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(logArg.method).toBe('GET')
      expect(logArg.path).toBe('/api/health')
      expect(logArg.statusCode).toBe(200)
      expect(typeof logArg.duration).toBe('number')
    })

    it('logs timestamp, ip, userAgent, userId fields', () => {
      req.user = { sub: 'user-123' }
      requestLogger(req, res, next)
      res.emit('finish')

      const logArg = mockLoggerInfo.mock.calls[0][0]
      expect(logArg.timestamp).toBeDefined()
      expect(logArg.ip).toBe('127.0.0.1')
      expect(logArg.userAgent).toBe('test-agent')
      expect(logArg.userId).toBe('user-123')
    })
  })

  describe('Slow request warning', () => {
    it('emits a warn log for slow requests (> 500ms)', async () => {
      // Mock Date.now to simulate a slow request
      let callCount = 0
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        // First call (start): 0, second call (finish): 600ms later
        return callCount === 1 ? 0 : 600
      })

      requestLogger(req, res, next)
      res.emit('finish')

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
      const logArg = mockLoggerWarn.mock.calls[0][0]
      expect(logArg.message).toContain('SLOW')

      Date.now.mockRestore()
    })

    it('does not emit a warn log for fast requests (< 500ms)', () => {
      requestLogger(req, res, next)
      res.emit('finish')

      expect(mockLoggerWarn).not.toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe('Robustness — missing fields', () => {
    it('does not throw when req.method is undefined', () => {
      req.method = undefined

      expect(() => {
        requestLogger(req, res, next)
        res.emit('finish')
      }).not.toThrow()

      expect(next).toHaveBeenCalled()
    })

    it('does not throw when req.path is undefined', () => {
      req.path = undefined

      expect(() => {
        requestLogger(req, res, next)
        res.emit('finish')
      }).not.toThrow()

      expect(next).toHaveBeenCalled()
    })

    it('does not throw when res.statusCode is undefined', () => {
      res.statusCode = undefined

      expect(() => {
        requestLogger(req, res, next)
        res.emit('finish')
      }).not.toThrow()

      expect(next).toHaveBeenCalled()
    })

    it('still calls next() even with minimal req/res objects', () => {
      const minimalReq = {}
      const minimalListeners = {}
      const minimalRes = {
        on: jest.fn((event, cb) => { minimalListeners[event] = cb }),
        emit: (event) => { if (minimalListeners[event]) minimalListeners[event]() },
      }

      expect(() => {
        requestLogger(minimalReq, minimalRes, next)
        minimalRes.emit('finish')
      }).not.toThrow()

      expect(next).toHaveBeenCalled()
    })
  })
})
