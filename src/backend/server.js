import 'dotenv/config'
import app from './src/app.js'
import { startQueueWorker } from './src/services/queueWorker.js'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — ${process.env.NODE_ENV || 'development'}`)

  // Démarrer le queue worker pour le partage I-CRM asynchrone (Phase 8)
  if (process.env.NODE_ENV !== 'test') {
    startQueueWorker()
  }
})
