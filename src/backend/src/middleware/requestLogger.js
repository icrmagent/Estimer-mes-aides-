export const requestLogger = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (duration > 500) {
      console.warn(`SLOW: ${req.method} ${req.path} — ${duration}ms`)
    }
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
}
