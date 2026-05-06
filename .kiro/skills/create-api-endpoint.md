# Skill — Créer un endpoint API backend V2

## Quand utiliser ce skill
Quand tu dois ajouter un nouvel endpoint V2 à l'API Express (routes protégées par rôle JWT).

## Template complet V2

### 1. Route handler (src/backend/src/routes/monEndpoint.js)
```javascript
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const monEndpointRouter = Router()

// Schema de validation Zod
const createSchema = z.object({
  champ1: z.string().min(1),
  champ2: z.number().optional(),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// GET — liste (SuperAdmin uniquement)
monEndpointRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
  }
  const { page, limit } = parsed.data
  const [items, total] = await Promise.all([
    prisma.model.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.model.count(),
  ])
  return res.json({ success: true, data: items, meta: { page, limit, total } })
})

// POST — créer (SuperAdmin uniquement)
monEndpointRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
  }
  try {
    const item = await prisma.model.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: item })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Valeur déjà utilisée' } })
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } })
    console.error('[MON-ENDPOINT ERROR]', err)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' } })
  }
})
```

### 2. Enregistrer dans app.js
```javascript
// src/backend/src/app.js
import { monEndpointRouter } from './routes/monEndpoint.js'
app.use('/api/mon-endpoint', monEndpointRouter)
```

### 3. Test Jest V2 (src/backend/tests/monEndpoint.test.js)
```javascript
import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// Créer les mocks AVANT tout import de l'app
const mockPrisma = {
  model: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
  // Ajouter les autres modèles utilisés par l'app
  configuration: { findFirst: jest.fn() },
  submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
}
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }))
jest.unstable_mockModule('../src/services/authService.js', () => ({ loginUser: jest.fn() }))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

process.env.JWT_SECRET = 'test_jwt_secret'
const superAdminToken = jwt.sign({ sub: 'uuid-super', role: 'SUPER_ADMIN' }, 'test_jwt_secret', { expiresIn: '1h' })
const adminBorneToken = jwt.sign({ sub: 'uuid-admin', role: 'ADMIN_BORNE' }, 'test_jwt_secret', { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${superAdminToken}` }
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

beforeEach(() => jest.clearAllMocks())

describe('GET /api/mon-endpoint', () => {
  it('sans JWT → 401', async () => {
    const res = await request(app).get('/api/mon-endpoint')
    expect(res.status).toBe(401)
  })

  it('avec ADMIN_BORNE → 403', async () => {
    const res = await request(app).get('/api/mon-endpoint').set(authAB)
    expect(res.status).toBe(403)
  })

  it('avec SUPER_ADMIN → 200', async () => {
    mockPrisma.model.findMany.mockResolvedValue([])
    mockPrisma.model.count.mockResolvedValue(0)
    const res = await request(app).get('/api/mon-endpoint').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/mon-endpoint', () => {
  it('sans body → 400', async () => {
    const res = await request(app).post('/api/mon-endpoint').set(authSA).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('données valides → 201', async () => {
    mockPrisma.model.create.mockResolvedValue({ id: 'uuid-1', champ1: 'valeur' })
    const res = await request(app).post('/api/mon-endpoint').set(authSA).send({ champ1: 'valeur' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })
})
```

## Auth à utiliser
- **Routes V2 SuperAdmin** → `jwtAuthV2, requireRole('SUPER_ADMIN')`
- **Routes V2 AdminBorne** → `jwtAuthV2, requireRole('ADMIN_BORNE')`
- **Routes V2 les deux** → `jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE')`
- **App mobile V1** → `apiKeyAuth` (header `x-api-key`)
- **CRM V1** → `jwtAuth` (header `Authorization: Bearer <JWT>`)

## Format réponse obligatoire V2
```javascript
// ✅ Succès
res.json({ success: true, data: { ... } })
res.json({ success: true, data: [...], meta: { page, limit, total } })

// ✅ Erreur
res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '...' } })
res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès refusé' } })
res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '...' } })
res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: '...' } })
res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' } })
```

## Vérification finale
```bash
cd src/backend && npm test   # tous les 72+ tests doivent passer
```
