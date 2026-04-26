import { Router } from 'express'
import { z } from 'zod'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { jwtAuth } from '../middleware/jwtAuth.js'
import { createSubmission, getSubmissions, markSynced } from '../services/submissionService.js'

export const submissionsRouter = Router()

const submissionValueSchema = z.object({
  fieldId: z.number({ required_error: 'fieldId is required' }),
  value: z.union([z.string(), z.array(z.string())]),
})

const createSubmissionSchema = z.object({
  configVersion: z.string({ required_error: 'configVersion is required' }),
  values: z.array(submissionValueSchema).min(1, 'values must be a non-empty array'),
})

const getSubmissionsSchema = z.object({
  synced: z.enum(['true', 'false']).optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'since must be YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

// POST /api/submissions — App mobile (API Key)
submissionsRouter.post('/', apiKeyAuth, async (req, res) => {
  const result = createSubmissionSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }
  try {
    const submission = await createSubmission(result.data)
    res.status(201).json({
      id: submission.id,
      createdAt: submission.createdAt,
      synced: submission.synced,
      configVersion: submission.configVersion,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create submission' })
  }
})

// GET /api/submissions — CRM (JWT)
submissionsRouter.get('/', jwtAuth, async (req, res) => {
  const result = getSubmissionsSchema.safeParse(req.query)
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message })
  }
  try {
    const data = await getSubmissions(result.data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submissions' })
  }
})

// PUT /api/submissions/:id/sync — CRM (JWT)
submissionsRouter.put('/:id/sync', jwtAuth, async (req, res) => {
  const { id } = req.params
  const { crmProjectId } = req.body || {}
  try {
    const submission = await markSynced(id, crmProjectId)
    res.json({
      id: submission.id,
      synced: submission.synced,
      syncedAt: submission.syncedAt,
      crmProjectId: submission.crmProjectId,
    })
  } catch (err) {
    // P2025 = record not found in Prisma
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: `Submission ${id} not found` })
    }
    res.status(500).json({ error: 'Failed to update submission' })
  }
})
