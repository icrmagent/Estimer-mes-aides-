import logger from '../lib/logger.js'

export const requestLogger = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const fields = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'],
      userId: req.user?.id ?? req.user?.sub ?? null,
      duration,
      statusCode: res.statusCode,
    }

    if (duration > 500) {
      logger.warn({ ...fields, message: `SLOW request: ${req.method} ${req.path}` })
    } else {
      logger.info({ ...fields, message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms` })
    }
  })
  next()
}
