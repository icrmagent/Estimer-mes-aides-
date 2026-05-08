/**
 * Tests unitaires — pusherService.js
 *
 * Couvre :
 *   - publishEvent : succès (trigger appelé avec bons args)
 *   - publishEvent : échec Pusher (erreur loguée, jamais propagée)
 *   - Routage de canal : admin-notifications vs borne-{id}
 *   - notifyPartageSucces / notifyPartageEchec
 *   - pusherService.publish (alias)
 */

import { jest } from '@jest/globals'

// ─── Mock Pusher SDK ──────────────────────────────────────────────────────────

const mockTrigger = jest.fn()

jest.unstable_mockModule('pusher', () => ({
  default: jest.fn().mockImplementation(() => ({
    trigger: mockTrigger,
  })),
}))

// ─── Import du service après le mock ─────────────────────────────────────────

let publishEvent, notifyPartageSucces, notifyPartageEchec, pusherService

beforeAll(async () => {
  const mod = await import('../../src/services/pusherService.js')
  publishEvent = mod.publishEvent
  notifyPartageSucces = mod.notifyPartageSucces
  notifyPartageEchec = mod.notifyPartageEchec
  pusherService = mod.pusherService
})

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  mockTrigger.mockReset()
  process.env.PUSHER_APP_ID = 'test-app-id'
  process.env.PUSHER_KEY = 'test-key'
  process.env.PUSHER_SECRET = 'test-secret'
  process.env.PUSHER_CLUSTER = 'eu'
})

// ─── publishEvent — succès ────────────────────────────────────────────────────

describe('publishEvent — succès', () => {
  test('appelle trigger avec le bon canal, événement et payload', async () => {
    mockTrigger.mockResolvedValueOnce({})

    await publishEvent('admin-notifications', 'new-enregistrement', {
      enregistrementId: 'uuid-1',
      borneId: 'uuid-borne',
    })

    expect(mockTrigger).toHaveBeenCalledTimes(1)
    expect(mockTrigger).toHaveBeenCalledWith(
      'admin-notifications',
      'new-enregistrement',
      { enregistrementId: 'uuid-1', borneId: 'uuid-borne' }
    )
  })

  test('ne lève pas d\'exception en cas de succès', async () => {
    mockTrigger.mockResolvedValueOnce({})
    await expect(
      publishEvent('admin-notifications', 'test-event', {})
    ).resolves.not.toThrow()
  })
})

// ─── publishEvent — échec Pusher ─────────────────────────────────────────────

describe('publishEvent — échec Pusher', () => {
  test('ne propage jamais l\'erreur Pusher (fire-and-forget safe)', async () => {
    mockTrigger.mockRejectedValueOnce(new Error('Pusher connection refused'))

    // Ne doit pas rejeter — la promesse doit se résoudre normalement
    await expect(
      publishEvent('admin-notifications', 'new-enregistrement', { id: '1' })
    ).resolves.toBeUndefined()
  })

  test('logue l\'erreur sans throw', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockTrigger.mockRejectedValueOnce(new Error('Network error'))

    await publishEvent('admin-notifications', 'test-event', {})

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Pusher]'),
      expect.any(String)
    )
    consoleSpy.mockRestore()
  })
})

// ─── Routage de canal ─────────────────────────────────────────────────────────

describe('routage de canal', () => {
  test('publie sur admin-notifications pour formulaire.updated', async () => {
    mockTrigger.mockResolvedValue({})

    await publishEvent('admin-notifications', 'formulaire.updated', { formulaireId: 'f1', version: '1.1.0' })

    expect(mockTrigger).toHaveBeenCalledWith(
      'admin-notifications',
      'formulaire.updated',
      { formulaireId: 'f1', version: '1.1.0' }
    )
  })

  test('publie sur admin-notifications pour formulaire.archived', async () => {
    mockTrigger.mockResolvedValue({})

    await publishEvent('admin-notifications', 'formulaire.archived', { formulaireId: 'f2' })

    expect(mockTrigger).toHaveBeenCalledWith(
      'admin-notifications',
      'formulaire.archived',
      { formulaireId: 'f2' }
    )
  })

  test('publie sur admin-notifications pour partage-status-changed', async () => {
    mockTrigger.mockResolvedValue({})

    await publishEvent('admin-notifications', 'partage-status-changed', {
      jobId: 'job-1',
      enregistrementId: 'enr-1',
      statut: 'partage',
    })

    expect(mockTrigger).toHaveBeenCalledWith(
      'admin-notifications',
      'partage-status-changed',
      { jobId: 'job-1', enregistrementId: 'enr-1', statut: 'partage' }
    )
  })

  test('notifyPartageSucces publie sur le canal borne-{borneId}', async () => {
    mockTrigger.mockResolvedValue({})

    await notifyPartageSucces('borne-uuid-123', 'enr-uuid-456')

    expect(mockTrigger).toHaveBeenCalledWith(
      'borne-borne-uuid-123',
      'partage.succes',
      expect.objectContaining({ enregistrementId: 'enr-uuid-456' })
    )
  })

  test('notifyPartageEchec publie sur le canal borne-{borneId}', async () => {
    mockTrigger.mockResolvedValue({})

    await notifyPartageEchec('borne-uuid-123', 'enr-uuid-456', 'CRM timeout')

    expect(mockTrigger).toHaveBeenCalledWith(
      'borne-borne-uuid-123',
      'partage.echec',
      expect.objectContaining({
        enregistrementId: 'enr-uuid-456',
        erreur: 'CRM timeout',
      })
    )
  })
})

// ─── pusherService.publish (alias) ───────────────────────────────────────────

describe('pusherService.publish', () => {
  test('est un alias de publishEvent et fonctionne identiquement', async () => {
    mockTrigger.mockResolvedValue({})

    await pusherService.publish('admin-notifications', 'formulaire.archived', {
      formulaireId: 'f-archived',
    })

    expect(mockTrigger).toHaveBeenCalledWith(
      'admin-notifications',
      'formulaire.archived',
      { formulaireId: 'f-archived' }
    )
  })
})

// ─── Résilience des helpers ───────────────────────────────────────────────────

describe('notifyPartageSucces — résilience', () => {
  test('ne propage pas l\'erreur si Pusher échoue', async () => {
    mockTrigger.mockRejectedValueOnce(new Error('Pusher down'))

    await expect(
      notifyPartageSucces('borne-id', 'enr-id')
    ).resolves.toBeUndefined()
  })
})

describe('notifyPartageEchec — résilience', () => {
  test('ne propage pas l\'erreur si Pusher échoue', async () => {
    mockTrigger.mockRejectedValueOnce(new Error('Pusher down'))

    await expect(
      notifyPartageEchec('borne-id', 'enr-id', 'some error')
    ).resolves.toBeUndefined()
  })
})
