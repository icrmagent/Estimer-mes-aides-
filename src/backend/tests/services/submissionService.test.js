/**
 * Tests unitaires — submissionService.js
 *
 * Couvre :
 *   - createSubmission : crée une soumission avec ses valeurs
 *   - getSubmissions (getAll) : liste avec filtres synced, since, pagination
 *   - markSynced : marque une soumission comme synchronisée avec le CRM
 */

import { jest } from '@jest/globals'

// ─── Mock Prisma before any service import ────────────────────────────────────

const mockSubmission = {
  create: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
}

const mockPrisma = {
  submission: mockSubmission,
}

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}))

// ─── Import service after mocks ───────────────────────────────────────────────

const {
  createSubmission,
  getSubmissions,
  markSynced,
} = await import('../../src/services/submissionService.js')

// ─── Test data ────────────────────────────────────────────────────────────────

const mockSubmissionRecord = {
  id: 'sub-uuid-1',
  configVersion: '1.0.0',
  synced: false,
  syncedAt: null,
  crmProjectId: null,
  createdAt: new Date('2024-06-01T10:00:00Z'),
  values: [
    { id: 'val-1', fieldId: 2087, value: 'Dupont', submissionId: 'sub-uuid-1' },
    { id: 'val-2', fieldId: 2088, value: 'Jean', submissionId: 'sub-uuid-1' },
  ],
}

// ─── createSubmission ─────────────────────────────────────────────────────────

describe('createSubmission', () => {
  beforeEach(() => jest.clearAllMocks())

  it('appelle prisma.submission.create avec les bonnes données', async () => {
    mockSubmission.create.mockResolvedValue(mockSubmissionRecord)

    const input = {
      configVersion: '1.0.0',
      values: [
        { fieldId: 2087, value: 'Dupont' },
        { fieldId: 2088, value: 'Jean' },
      ],
    }

    const result = await createSubmission(input)

    expect(mockSubmission.create).toHaveBeenCalledTimes(1)
    const callArg = mockSubmission.create.mock.calls[0][0]
    expect(callArg.data.configVersion).toBe('1.0.0')
    expect(callArg.data.values.create).toHaveLength(2)
    expect(callArg.include.values).toBe(true)
    expect(result).toEqual(mockSubmissionRecord)
  })

  it('convertit les valeurs tableau en JSON string', async () => {
    mockSubmission.create.mockResolvedValue(mockSubmissionRecord)

    await createSubmission({
      configVersion: '1.0.0',
      values: [
        { fieldId: 2299, value: ['combles', 'plancher'] },
      ],
    })

    const callArg = mockSubmission.create.mock.calls[0][0]
    const createdValue = callArg.data.values.create[0]
    expect(createdValue.value).toBe('["combles","plancher"]')
  })

  it('convertit les valeurs non-tableau en string', async () => {
    mockSubmission.create.mockResolvedValue(mockSubmissionRecord)

    await createSubmission({
      configVersion: '1.0.0',
      values: [
        { fieldId: 2089, value: 75001 },
      ],
    })

    const callArg = mockSubmission.create.mock.calls[0][0]
    const createdValue = callArg.data.values.create[0]
    expect(createdValue.value).toBe('75001')
  })

  it('retourne la soumission créée avec ses valeurs', async () => {
    mockSubmission.create.mockResolvedValue(mockSubmissionRecord)

    const result = await createSubmission({
      configVersion: '1.0.0',
      values: [{ fieldId: 2087, value: 'Test' }],
    })

    expect(result).toEqual(mockSubmissionRecord)
    expect(result.values).toHaveLength(2)
  })
})

// ─── getSubmissions (getAll) ──────────────────────────────────────────────────

describe('getSubmissions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('retourne toutes les soumissions avec pagination par défaut', async () => {
    mockSubmission.findMany.mockResolvedValue([mockSubmissionRecord])
    mockSubmission.count.mockResolvedValue(1)

    const result = await getSubmissions({})

    expect(mockSubmission.findMany).toHaveBeenCalledTimes(1)
    expect(mockSubmission.count).toHaveBeenCalledTimes(1)
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(50)
  })

  it('filtre par synced=false', async () => {
    mockSubmission.findMany.mockResolvedValue([mockSubmissionRecord])
    mockSubmission.count.mockResolvedValue(1)

    await getSubmissions({ synced: 'false' })

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.where.synced).toBe(false)
  })

  it('filtre par synced=true', async () => {
    mockSubmission.findMany.mockResolvedValue([])
    mockSubmission.count.mockResolvedValue(0)

    await getSubmissions({ synced: 'true' })

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.where.synced).toBe(true)
  })

  it('filtre par since (date ISO)', async () => {
    mockSubmission.findMany.mockResolvedValue([])
    mockSubmission.count.mockResolvedValue(0)

    const since = '2024-06-01T00:00:00Z'
    await getSubmissions({ since })

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.where.createdAt).toEqual({ gte: new Date(since) })
  })

  it('applique la pagination (page et limit)', async () => {
    mockSubmission.findMany.mockResolvedValue([])
    mockSubmission.count.mockResolvedValue(100)

    await getSubmissions({ page: 3, limit: 10 })

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.take).toBe(10)
    expect(findCall.skip).toBe(20) // (3-1) * 10
  })

  it('ordonne par createdAt desc', async () => {
    mockSubmission.findMany.mockResolvedValue([])
    mockSubmission.count.mockResolvedValue(0)

    await getSubmissions({})

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('inclut les valeurs dans les résultats', async () => {
    mockSubmission.findMany.mockResolvedValue([mockSubmissionRecord])
    mockSubmission.count.mockResolvedValue(1)

    await getSubmissions({})

    const findCall = mockSubmission.findMany.mock.calls[0][0]
    expect(findCall.include.values).toBe(true)
  })

  it('retourne un tableau vide si aucune soumission', async () => {
    mockSubmission.findMany.mockResolvedValue([])
    mockSubmission.count.mockResolvedValue(0)

    const result = await getSubmissions({})

    expect(result.data).toHaveLength(0)
    expect(result.total).toBe(0)
  })
})

// ─── markSynced ───────────────────────────────────────────────────────────────

describe('markSynced', () => {
  beforeEach(() => jest.clearAllMocks())

  it('met à jour synced=true et syncedAt pour la soumission donnée', async () => {
    const syncedRecord = {
      ...mockSubmissionRecord,
      synced: true,
      syncedAt: new Date(),
      crmProjectId: 'crm-proj-123',
    }
    mockSubmission.update.mockResolvedValue(syncedRecord)

    const result = await markSynced('sub-uuid-1', 'crm-proj-123')

    expect(mockSubmission.update).toHaveBeenCalledTimes(1)
    const callArg = mockSubmission.update.mock.calls[0][0]
    expect(callArg.where).toEqual({ id: 'sub-uuid-1' })
    expect(callArg.data.synced).toBe(true)
    expect(callArg.data.syncedAt).toBeInstanceOf(Date)
    expect(callArg.data.crmProjectId).toBe('crm-proj-123')
    expect(result).toEqual(syncedRecord)
  })

  it('ne définit pas crmProjectId si non fourni', async () => {
    mockSubmission.update.mockResolvedValue({ ...mockSubmissionRecord, synced: true })

    await markSynced('sub-uuid-1')

    const callArg = mockSubmission.update.mock.calls[0][0]
    expect(callArg.data.crmProjectId).toBeUndefined()
  })

  it('inclut les valeurs dans la réponse', async () => {
    mockSubmission.update.mockResolvedValue({ ...mockSubmissionRecord, synced: true })

    await markSynced('sub-uuid-1', null)

    const callArg = mockSubmission.update.mock.calls[0][0]
    expect(callArg.include.values).toBe(true)
  })

  it('retourne la soumission mise à jour', async () => {
    const updated = { ...mockSubmissionRecord, synced: true, syncedAt: new Date() }
    mockSubmission.update.mockResolvedValue(updated)

    const result = await markSynced('sub-uuid-1', null)

    expect(result.synced).toBe(true)
    expect(result.syncedAt).toBeInstanceOf(Date)
  })
})
