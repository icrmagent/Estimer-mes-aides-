import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'

// ─── Create mock functions BEFORE the mock module ────────────────────────────
// This pattern (from auth.test.js) ensures the same function references are
// used both in the mock factory and in the test assertions.

const mockPrisma = {
  configuration: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  submission: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  superAdmin: { findUnique: jest.fn() },
  adminBorne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  borne: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  formulaire: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  question: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  enregistrement: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  formulaireVersion: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  partageJob: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}

// ─── Mock Prisma (must be before any app import) ──────────────────────────────

jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// Mock authService to prevent real DB calls from auth route
jest.unstable_mockModule('../src/services/authService.js', () => ({
  loginUser: jest.fn(),
  issueAccessToken: jest.fn(),
}))

// Mock refreshTokenService to prevent real DB calls
jest.unstable_mockModule('../src/services/refreshTokenService.js', () => ({
  createRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  cleanupExpiredTokens: jest.fn(),
}))

// Mock tokenBlacklistService — isBlacklisted must return false so JWT tokens pass
const mockIsBlacklisted = jest.fn().mockResolvedValue(false)
jest.unstable_mockModule('../src/services/tokenBlacklistService.js', () => ({
  addToBlacklist: jest.fn(),
  isBlacklisted: mockIsBlacklisted,
  cleanupExpired: jest.fn(),
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../src/app.js')

process.env.JWT_SECRET = 'test_jwt_secret'

const superAdminToken = jwt.sign({ sub: 'uuid-super', role: 'SUPER_ADMIN' }, 'test_jwt_secret', { expiresIn: '1h' })
const adminBorneToken = jwt.sign({ sub: 'uuid-admin', role: 'ADMIN_BORNE' }, 'test_jwt_secret', { expiresIn: '1h' })

const authSA = { Authorization: `Bearer ${superAdminToken}` }
const authAB = { Authorization: `Bearer ${adminBorneToken}` }

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockBorne = {
  id: 'uuid-borne-1',
  idBorne: 'BORNE-001',
  langueDefaut: 'fr',
  adresse: '1 rue Test',
  statut: 'actif',
  adminBorneId: 'uuid-admin',
  formulaireId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockAdminBorne = {
  id: 'uuid-admin',
  nom: 'Test',
  prenom: 'Admin',
  email: 'admin@test.com',
  raisonSociale: 'Test SAS',
  siret: '12345678901234',
  actif: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockFormulaire = {
  id: 'uuid-form-1',
  label: 'Test Form',
  version: '1.0.0',
  statut: 'brouillon',
  dureeRetourAccueil: 30,
  annulationInactivite: 120,
  pageDebutConfig: {},
  pageFinConfig: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockQuestion = {
  id: 'uuid-q-1',
  formulaireId: 'uuid-form-1',
  libelleQuestion: { fr: 'Question test', es: null, en: null },
  typeOption: 'option_unique',
  options: null,
  orderPage: 1,
  obligatoire: false,
  paragrapheInfo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockEnregistrement = {
  id: 'uuid-enr-1',
  borneId: 'uuid-borne-1',
  formulaireId: 'uuid-form-1',
  langueUtilisee: 'fr',
  statutPartage: 'en_attente',
  reponses: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' })

// ─── Reset all mocks before each test ────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── /api/bornes ──────────────────────────────────────────────────────────────

describe('GET /api/bornes', () => {
  it('sans JWT → 401', async () => {
    const res = await request(app).get('/api/bornes')
    expect(res.status).toBe(401)
  })

  it('avec ADMIN_BORNE → 403', async () => {
    const res = await request(app).get('/api/bornes').set(authAB)
    expect(res.status).toBe(403)
  })

  it('avec SUPER_ADMIN → 200 avec data et meta', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([])
    mockPrisma.borne.count.mockResolvedValue(0)

    const res = await request(app).get('/api/bornes').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta).toBeDefined()
    expect(res.body.meta.total).toBe(0)
  })
})

describe('POST /api/bornes', () => {
  it('sans body → 400', async () => {
    const res = await request(app).post('/api/bornes').set(authSA).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('avec données valides → 201 avec la borne créée', async () => {
    mockPrisma.borne.create.mockResolvedValue(mockBorne)

    const res = await request(app)
      .post('/api/bornes')
      .set(authSA)
      .send({ idBorne: 'BORNE-001', adresse: '1 rue Test' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.idBorne).toBe('BORNE-001')
  })

  it('avec idBorne dupliqué → 409 DUPLICATE', async () => {
    mockPrisma.borne.create.mockRejectedValue(p2002Error)

    const res = await request(app)
      .post('/api/bornes')
      .set(authSA)
      .send({ idBorne: 'BORNE-001', adresse: '1 rue Test' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE')
  })
})

describe('PATCH /api/bornes/:id/statut', () => {
  it('avec statut invalide → 400', async () => {
    const res = await request(app)
      .patch('/api/bornes/uuid-borne-1/statut')
      .set(authSA)
      .send({ statut: 'invalide' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('avec statut valide → 200', async () => {
    mockPrisma.borne.update.mockResolvedValue({ ...mockBorne, statut: 'inactif' })

    const res = await request(app)
      .patch('/api/bornes/uuid-borne-1/statut')
      .set(authSA)
      .send({ statut: 'inactif' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.statut).toBe('inactif')
  })
})

// ─── /api/admin-bornes ────────────────────────────────────────────────────────

describe('GET /api/admin-bornes', () => {
  it('sans JWT → 401', async () => {
    const res = await request(app).get('/api/admin-bornes')
    expect(res.status).toBe(401)
  })

  it('avec SUPER_ADMIN → 200', async () => {
    mockPrisma.adminBorne.findMany.mockResolvedValue([])
    mockPrisma.adminBorne.count.mockResolvedValue(0)

    const res = await request(app).get('/api/admin-bornes').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/admin-bornes', () => {
  it('avec email invalide → 400', async () => {
    const res = await request(app)
      .post('/api/admin-bornes')
      .set(authSA)
      .send({
        nom: 'Test',
        prenom: 'Admin',
        email: 'pas-un-email',
        password: 'password123',
        raisonSociale: 'Test SAS',
        siret: '12345678901234',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('avec siret trop court → 400', async () => {
    const res = await request(app)
      .post('/api/admin-bornes')
      .set(authSA)
      .send({
        nom: 'Test',
        prenom: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        raisonSociale: 'Test SAS',
        siret: '123',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('données valides → 201 sans passwordHash dans la réponse', async () => {
    // The route calls bcrypt.hash then prisma.adminBorne.create
    // The sanitize() function strips passwordHash from the returned object
    const adminWithHash = { ...mockAdminBorne, passwordHash: 'hashed_password' }
    mockPrisma.adminBorne.create.mockResolvedValue(adminWithHash)

    const res = await request(app)
      .post('/api/admin-bornes')
      .set(authSA)
      .send({
        nom: 'Test',
        prenom: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        raisonSociale: 'Test SAS',
        siret: '12345678901234',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.passwordHash).toBeUndefined()
    expect(res.body.data.email).toBe('admin@test.com')
  })

  it('email dupliqué → 409', async () => {
    mockPrisma.adminBorne.create.mockRejectedValue(p2002Error)

    const res = await request(app)
      .post('/api/admin-bornes')
      .set(authSA)
      .send({
        nom: 'Test',
        prenom: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        raisonSociale: 'Test SAS',
        siret: '12345678901234',
      })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE')
  })
})

// ─── /api/formulaires ─────────────────────────────────────────────────────────

describe('GET /api/formulaires', () => {
  it('avec SUPER_ADMIN → 200', async () => {
    mockPrisma.formulaire.findMany.mockResolvedValue([])
    mockPrisma.formulaire.count.mockResolvedValue(0)

    const res = await request(app).get('/api/formulaires').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/formulaires', () => {
  it('sans label → 400', async () => {
    const res = await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({ version: '1.0.0' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('données valides → 201', async () => {
    mockPrisma.formulaire.create.mockResolvedValue(mockFormulaire)

    const res = await request(app)
      .post('/api/formulaires')
      .set(authSA)
      .send({ label: 'Test Form' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.label).toBe('Test Form')
  })
})

describe('PATCH /api/formulaires/:id/statut', () => {
  it('publie avec questions sans libellé FR → 422 VALIDATION_PUBLICATION', async () => {
    const questionSansLibelle = { ...mockQuestion, libelleQuestion: { fr: '', es: null, en: null } }
    // The route uses findUniqueOrThrow with include: { questions: true }
    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue({
      ...mockFormulaire,
      questions: [questionSansLibelle],
    })

    const res = await request(app)
      .patch('/api/formulaires/uuid-form-1/statut')
      .set(authSA)
      .send({ statut: 'publie' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_PUBLICATION')
  })

  it('publie avec questions valides → 200', async () => {
    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue({
      ...mockFormulaire,
      questions: [mockQuestion],
    })
    mockPrisma.formulaire.update.mockResolvedValue({ ...mockFormulaire, statut: 'publie', version: '2.0.0', questions: [mockQuestion] })
    mockPrisma.formulaireVersion.create.mockResolvedValue({})

    const res = await request(app)
      .patch('/api/formulaires/uuid-form-1/statut')
      .set(authSA)
      .send({ statut: 'publie' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.statut).toBe('publie')
  })
})

describe('POST /api/formulaires/:id/dupliquer', () => {
  it('→ 201 avec label "(copie)"', async () => {
    // The route uses findUniqueOrThrow with include: { questions: true }
    mockPrisma.formulaire.findUniqueOrThrow.mockResolvedValue({
      ...mockFormulaire,
      questions: [mockQuestion],
    })
    const copie = {
      ...mockFormulaire,
      id: 'uuid-form-2',
      label: 'Test Form (copie)',
      statut: 'brouillon',
      questions: [{ ...mockQuestion, id: 'uuid-q-2', formulaireId: 'uuid-form-2' }],
    }
    mockPrisma.formulaire.create.mockResolvedValue(copie)

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/dupliquer')
      .set(authSA)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.label).toContain('(copie)')
    expect(res.body.data.statut).toBe('brouillon')
  })
})

// ─── /api/formulaires/:id/questions ──────────────────────────────────────────
// questionsRouter is mounted at /api/formulaires with mergeParams: true
// Routes handle /:id/questions — full path: /api/formulaires/:id/questions

describe('GET /api/formulaires/:id/questions', () => {
  it('→ 200 liste triée', async () => {
    // The route calls formulaire.findUnique first to verify existence
    mockPrisma.formulaire.findUnique.mockResolvedValue(mockFormulaire)
    mockPrisma.question.findMany.mockResolvedValue([mockQuestion])

    const res = await request(app)
      .get('/api/formulaires/uuid-form-1/questions')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/formulaires/:id/questions', () => {
  it('sans libelleQuestion.fr → 400', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue(mockFormulaire)

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/questions')
      .set(authSA)
      .send({
        libelleQuestion: { es: 'Pregunta test' },
        typeOption: 'option_unique',
        orderPage: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('données valides → 201', async () => {
    mockPrisma.formulaire.findUnique
      .mockResolvedValueOnce(mockFormulaire)   // getFormulaireOrFail
      .mockResolvedValueOnce(mockFormulaire)   // incrementMinorVersionAndSnapshot
    mockPrisma.question.create.mockResolvedValue(mockQuestion)
    mockPrisma.formulaire.update.mockResolvedValue({ ...mockFormulaire, version: '1.1.0', questions: [mockQuestion] })
    mockPrisma.formulaireVersion.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/formulaires/uuid-form-1/questions')
      .set(authSA)
      .send({
        libelleQuestion: { fr: 'Question test' },
        typeOption: 'option_unique',
        orderPage: 1,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.libelleQuestion.fr).toBe('Question test')
  })
})

describe('DELETE /api/formulaires/:id/questions/:qid', () => {
  it('sur formulaire publié sans ?force → 409 FORMULAIRE_PUBLIE', async () => {
    mockPrisma.formulaire.findUnique.mockResolvedValue({ ...mockFormulaire, statut: 'publie' })

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1/questions/uuid-q-1')
      .set(authSA)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('FORMULAIRE_PUBLIE')
  })

  it('avec ?force=true → 200', async () => {
    mockPrisma.formulaire.findUnique
      .mockResolvedValueOnce({ ...mockFormulaire, statut: 'publie' })   // getFormulaireOrFail
      .mockResolvedValueOnce({ ...mockFormulaire, statut: 'publie' })   // incrementMinorVersionAndSnapshot
    mockPrisma.question.delete.mockResolvedValue(mockQuestion)
    mockPrisma.formulaire.update.mockResolvedValue({ ...mockFormulaire, statut: 'publie', version: '1.1.0', questions: [] })
    mockPrisma.formulaireVersion.create.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/formulaires/uuid-form-1/questions/uuid-q-1?force=true')
      .set(authSA)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.deleted).toBe(true)
  })
})

// ─── /api/enregistrements ─────────────────────────────────────────────────────

describe('POST /api/enregistrements', () => {
  it('avec SUPER_ADMIN → 403 (seul ADMIN_BORNE peut créer)', async () => {
    const res = await request(app)
      .post('/api/enregistrements')
      .set(authSA)
      .send({
        borneId: 'uuid-borne-1',
        formulaireId: 'uuid-form-1',
        reponses: [],
      })

    expect(res.status).toBe(403)
  })

  it('avec ADMIN_BORNE sans borneId → 400', async () => {
    const res = await request(app)
      .post('/api/enregistrements')
      .set(authAB)
      .send({
        formulaireId: 'uuid-form-1',
        reponses: [],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/enregistrements', () => {
  it('avec SUPER_ADMIN → 200', async () => {
    mockPrisma.enregistrement.findMany.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(0)

    const res = await request(app).get('/api/enregistrements').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('avec ADMIN_BORNE → 200 (seulement ses bornes)', async () => {
    // buildWhereClause calls borne.findMany to get the admin's bornes
    mockPrisma.borne.findMany.mockResolvedValue([{ id: 'uuid-borne-1' }])
    mockPrisma.enregistrement.findMany.mockResolvedValue([mockEnregistrement])
    mockPrisma.enregistrement.count.mockResolvedValue(1)

    const res = await request(app).get('/api/enregistrements').set(authAB)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ─── /api/dashboard ───────────────────────────────────────────────────────────

describe('GET /api/dashboard/superadmin', () => {
  it('avec SUPER_ADMIN → 200 avec bornesActives, enregistrements30j, etc.', async () => {
    // Dashboard calls Promise.all with 4 counts, then findMany for graphique
    mockPrisma.borne.count.mockResolvedValue(5)
    mockPrisma.enregistrement.count
      .mockResolvedValueOnce(42)  // enregistrements30j
      .mockResolvedValueOnce(10)  // enAttenteCRM
    mockPrisma.adminBorne.count.mockResolvedValue(3)
    mockPrisma.enregistrement.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/dashboard/superadmin').set(authSA)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.bornesActives).toBe(5)
    expect(res.body.data.enregistrements30j).toBe(42)
    expect(res.body.data.enAttenteCRM).toBe(10)
    expect(res.body.data.adminBornesActifs).toBe(3)
    expect(Array.isArray(res.body.data.graphique)).toBe(true)
  })

  it('avec ADMIN_BORNE → 403', async () => {
    const res = await request(app).get('/api/dashboard/superadmin').set(authAB)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/dashboard/adminborne', () => {
  it('avec ADMIN_BORNE → 200 avec bornes et enAttenteCRM', async () => {
    mockPrisma.borne.findMany.mockResolvedValue([
      { id: 'uuid-borne-1', idBorne: 'BORNE-001', adresse: '1 rue Test', statut: 'actif' },
    ])
    mockPrisma.enregistrement.groupBy.mockResolvedValue([])
    mockPrisma.enregistrement.count.mockResolvedValue(3)

    const res = await request(app).get('/api/dashboard/adminborne').set(authAB)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.bornes)).toBe(true)
    expect(typeof res.body.data.enAttenteCRM).toBe('number')
  })
})
