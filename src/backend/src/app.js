import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { configurationRouter } from './routes/configuration.js'
import { submissionsRouter } from './routes/submissions.js'
import { requestLogger } from './middleware/requestLogger.js'

const app = express()

app.use(helmet())
app.use(compression())
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT'],
}))
app.use(express.json({ limit: '1mb' }))
app.use(requestLogger)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/configuration', configurationRouter)
app.use('/api/submissions', submissionsRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

export default app
