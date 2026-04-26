export const apiKeyAuth = (req, res, next) => {
  const key = req.headers['x-api-key']
  if (!key || key !== process.env.API_KEY_MOBILE) {
    return res.status(401).json({ error: 'Invalid API key' })
  }
  next()
}
