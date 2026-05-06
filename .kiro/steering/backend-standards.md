---
inclusion: fileMatch
fileMatchPattern: "src/backend/**"
---

# Standards Backend — Estimer Mes Aides V2

## Stack
- **Runtime** : Node.js 20 (ESM modules — `"type": "module"` dans package.json)
- **Framework** : Express 4
- **ORM** : Prisma v5
- **DB** : PostgreSQL via Supabase
- **Validation** : Zod
- **Auth** : JWT V2 (rôles SUPER_ADMIN / ADMIN_BORNE) + API Key header (mobile V1)
- **Tests** : Jest + Supertest (72+ tests — V1 + V2)
- **Packages V2** : bcryptjs, express-rate-limit, exceljs, pusher

## Structure des fichiers
```
src/backend/
├── src/
│   ├── app.js              ← Express config + toutes les routes V1 + V2
│   ├── routes/
│   │   ├── configuration.js    ← V1: GET /api/configuration
│   │   ├── submissions.js      ← V1: POST/GET/PUT /api/submissions
│   │   ├── auth.js             ← V2: POST /api/auth/login
│   │   ├── bornes.js           ← V2: CRUD /api/bornes
│   │   ├── bornes-config.js    ← V2: GET /api/bornes/:id/config
│   │   ├── admin-bornes.js     ← V2: CRUD /api/admin-bornes
│   │   ├── formulaires.js      ← V2: CRUD /api/formulaires
│   │   ├── questions.js        ← V2: CRUD /api/formulaires/:id/questions
│   │   ├── enregistrements.js  ← V2: POST/GET /api/enregistrements
│   │   ├── partage.js          ← V2: GET/POST /api/partage/jobs
│   │   └── dashboard.js        ← V2: GET /api/dashboard/*
│   ├── middleware/
│   │   ├── apiKeyAuth.js       ← V1: auth mobile (x-api-key header)
│   │   ├── jwtAuth.js          ← V1+V2: jwtAuth (V1 compat) + jwtAuthV2
│   │   ├── roleAuth.js         ← V2: requireRole('SUPER_ADMIN'|'ADMIN_BORNE')
│   │   ├── borneOwnership.js   ← V2: checkBorneOwnership (cloisonnement)
│   │   └── requestLogger.js
│   ├── services/
│   │   ├── authService.js      ← V2: loginUser (bcrypt + JWT)
│   │   ├── configService.js    ← V1: getConfiguration
│   │   ├── submissionService.js← V1: createSubmission, getSubmissions, markSynced
│   │   ├── queueWorker.js      ← V2: traitement PartageJob (polling 30s)
│   │   └── pusherService.js    ← V2: notifications WebSocket
│   └── lib/
│       └── prisma.js           ← PrismaClient singleton
├── prisma/
│   ├── schema.prisma           ← V1 + V2 models
│   ├── seed.js                 ← V2 seed (SuperAdmin + formulaire + borne démo)
│   └── migrations/
│       ├── 20260426013429_init/         ← V1 tables
│       └── 20260501000000_v2_schema/    ← V2 tables
├── tests/
│   ├── health.test.js          ← V1 (7 tests)
│   ├── configuration.test.js   ← V1 (6 tests)
│   ├── submissions.test.js     ← V1 (16 tests)
│   ├── auth.test.js            ← V2 (11 tests)
│   └── v2-endpoints.test.js    ← V2 (32 tests)
└── server.js
```

## JWT V2 — Structure du token
```json
{ "sub": "uuid-admin", "role": "SUPER_ADMIN" | "ADMIN_BORNE", "iat": ..., "exp": ... }
```
- SuperAdmin : expire en 8h
- AdminBorne back-office : expire en 8h
- AdminBorne borne (context='borne') : expire en 24h

## Middlewares V2
```javascript
// Protéger une route SuperAdmin uniquement
router.get('/', jwtAuthV2, requireRole('SUPER_ADMIN'), handler)

// Protéger une route accessible aux deux rôles
router.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), handler)

// Vérifier qu'un AdminBorne possède la borne demandée
router.get('/:id/config', jwtAuthV2, requireRole('ADMIN_BORNE'), checkBorneOwnership, handler)
```

## Format de réponse standard V2
```javascript
// Succès liste
res.json({ success: true, data: [...], meta: { page, limit, total } })

// Succès item
res.json({ success: true, data: { ... } })

// Erreur validation
res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '...', details: [...] } })

// Erreur accès
res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Accès refusé' } })

// Erreur doublon
res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: '...' } })
```

## Erreurs Prisma à gérer
```javascript
if (err.code === 'P2002') → 409 DUPLICATE
if (err.code === 'P2025') → 404 NOT_FOUND
```

## Pattern route V2 type
```javascript
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'

export const myRouter = Router()

const schema = z.object({ field: z.string().min(1) })

myRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
  }
  try {
    const result = await prisma.model.create({ data: parsed.data })
    return res.status(201).json({ success: true, data: result })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: '...' } })
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' } })
  }
})
```

## Pattern test V2 (ESM mock)
```javascript
import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

const mockPrisma = { borne: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() } }
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }))
jest.unstable_mockModule('../src/services/authService.js', () => ({ loginUser: jest.fn() }))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

process.env.JWT_SECRET = 'test_jwt_secret'
const superAdminToken = jwt.sign({ sub: 'uuid-super', role: 'SUPER_ADMIN' }, 'test_jwt_secret', { expiresIn: '1h' })
const authSA = { Authorization: `Bearer ${superAdminToken}` }
```

## Endpoints V2 complets
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/login` | — | Login SuperAdmin ou AdminBorne |
| GET/POST | `/api/bornes` | SUPER_ADMIN | Lister/créer bornes |
| GET/PUT | `/api/bornes/:id` | SA + AB | Détail/modifier borne |
| PATCH | `/api/bornes/:id/statut` | SUPER_ADMIN | Activer/désactiver |
| GET | `/api/bornes/:id/config` | ADMIN_BORNE | Config complète borne |
| GET/POST | `/api/admin-bornes` | SUPER_ADMIN | Lister/créer AdminBornes |
| GET/PUT | `/api/admin-bornes/:id` | SUPER_ADMIN | Détail/modifier |
| PATCH | `/api/admin-bornes/:id/statut` | SUPER_ADMIN | Activer/désactiver |
| POST | `/api/admin-bornes/:id/reset-password` | SUPER_ADMIN | Reset mdp |
| GET/POST | `/api/formulaires` | SUPER_ADMIN | Lister/créer |
| GET/PUT | `/api/formulaires/:id` | SUPER_ADMIN | Détail/modifier |
| PATCH | `/api/formulaires/:id/statut` | SUPER_ADMIN | Changer statut (validation FR) |
| POST | `/api/formulaires/:id/dupliquer` | SUPER_ADMIN | Dupliquer |
| GET/POST | `/api/formulaires/:id/questions` | SUPER_ADMIN | Lister/ajouter |
| PUT/DELETE | `/api/formulaires/:id/questions/:qid` | SUPER_ADMIN | Modifier/supprimer |
| PATCH | `/api/formulaires/:id/questions/reorder` | SUPER_ADMIN | Réordonner |
| POST | `/api/enregistrements` | ADMIN_BORNE | Créer enregistrement |
| GET | `/api/enregistrements` | SA + AB | Lister (cloisonné) |
| GET | `/api/enregistrements/export` | SA + AB | Export XLSX |
| GET | `/api/dashboard/superadmin` | SUPER_ADMIN | Métriques SA |
| GET | `/api/dashboard/adminborne` | ADMIN_BORNE | Métriques AB |
| GET | `/api/partage/jobs` | SUPER_ADMIN | File d'attente CRM |
| POST | `/api/partage/jobs/:id/relancer` | SUPER_ADMIN | Relancer job |

## Field IDs CRM (source de vérité — ne jamais inventer)
```
2262 Civilité | 2087 Nom | 2088 Prénom | 2217 Adresse
2089 Code postal | 2090 Ville | 2015 Téléphone | 2016 Email
2294 Revenu fiscal | 2293 Statut propriétaire | 2292 Type logement
2306 Date construction | 2307 Surface | 2296 Type combles
2298 Type plancher | 2300 Trappe accès | 2301 Type chauffage
2302 Isolation souhaitée | 2297 Type isolation | 2299 Travaux souhaités
2303 Disponibilité contact | 2304 Commentaires | 2305 Autres besoins
```
