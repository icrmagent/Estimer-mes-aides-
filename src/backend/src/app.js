import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { configurationRouter } from './routes/configuration.js'
import { submissionsRouter } from './routes/submissions.js'
import { authRouter } from './routes/auth.js'
import { requestLogger } from './middleware/requestLogger.js'
import { bornesRouter } from './routes/bornes.js'
import { bornesConfigRouter } from './routes/bornes-config.js'
import { adminBornesRouter } from './routes/admin-bornes.js'
import { formulairesRouter } from './routes/formulaires.js'
import { questionsRouter } from './routes/questions.js'
import { enregistrementsRouter } from './routes/enregistrements.js'
import { dashboardRouter } from './routes/dashboard.js'
import { partageRouter } from './routes/partage.js'

const app = express()

app.use(helmet())
app.use(compression())
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))
app.use(express.json({ limit: '1mb' }))
app.use(requestLogger)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// V1 routes (conservés)
app.use('/api/configuration', configurationRouter)
app.use('/api/submissions', submissionsRouter)

// V2 routes
app.use('/api/auth', authRouter)
app.use('/api/bornes', bornesRouter)
app.use('/api/bornes', bornesConfigRouter)       // /api/bornes/:id/config
app.use('/api/admin-bornes', adminBornesRouter)
app.use('/api/formulaires', formulairesRouter)
app.use('/api/formulaires', questionsRouter)     // /api/formulaires/:id/questions
app.use('/api/enregistrements', enregistrementsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/partage', partageRouter)           // /api/partage/jobs

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

export default app
