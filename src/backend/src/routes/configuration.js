import { Router } from 'express'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { getConfiguration } from '../services/configService.js'

export const configurationRouter = Router()

configurationRouter.get('/', apiKeyAuth, async (req, res) => {
  try {
    const config = await getConfiguration()
    if (!config) {
      return res.status(404).json({ error: 'No configuration found' })
    }

    res.set({
      'Cache-Control': 'public, max-age=3600',
      'ETag': `"${config.version}"`,
    })

    if (req.headers['if-none-match'] === `"${config.version}"`) {
      return res.status(304).end()
    }

    res.json({
      version: config.version,
      updatedAt: config.updatedAt,
      formDefinition: config.formDefinition,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch configuration' })
  }
})
