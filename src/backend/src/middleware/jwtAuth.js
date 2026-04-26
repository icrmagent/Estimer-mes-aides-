import jwt from 'jsonwebtoken'

export const jwtAuth = (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing JWT' })
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.crm = decoded
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'JWT expired' : 'Invalid JWT'
    res.status(401).json({ error: message })
  }
}
