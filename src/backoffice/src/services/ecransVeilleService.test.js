/**
 * ecransVeilleService.test.js — envoi des médias vers Supabase Storage.
 *
 * Le fichier ne passe pas par le backend : signature via l'API, puis PUT direct
 * sur l'URL signée, sans le Bearer ni le jeton CSRF du back-office.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('axios', () => ({ default: { put: vi.fn() } }))

const { default: api } = await import('./api.js')
const { default: axios } = await import('axios')
const { ecransVeilleService, checkMediaFile, MediaError } = await import('./ecransVeilleService.js')

function file(name, type, size) {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkMediaFile', () => {
  it('refuse un format hors liste et un fichier trop lourd', () => {
    expect(() => checkMediaFile(file('a.pdf', 'application/pdf', 10), 'image')).toThrow(MediaError)
    expect(() => checkMediaFile(file('a.jpg', 'image/jpeg', 11 * 1048576), 'image')).toThrow(/10 Mo maximum/)
    expect(() => checkMediaFile(file('v.mp4', 'video/mp4', 40 * 1048576), 'video')).not.toThrow()
  })
})

describe('uploadMedia', () => {
  it('signe puis dépose le fichier sur l\'URL signée et renvoie l\'URL publique', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { uploadUrl: 'https://proj.supabase.co/storage/v1/object/upload/sign/b/p.jpg?token=t', publicUrl: 'https://proj.supabase.co/storage/v1/object/public/b/p.jpg' } } })
    axios.put.mockImplementation((_url, _body, config) => {
      config.onUploadProgress({ loaded: 50, total: 100 })
      return Promise.resolve({ status: 200 })
    })
    const onProgress = vi.fn()

    const url = await ecransVeilleService.uploadMedia(file('p.jpg', 'image/jpeg', 2048), 'image', { onProgress })

    expect(url).toBe('https://proj.supabase.co/storage/v1/object/public/b/p.jpg')
    expect(api.post).toHaveBeenCalledWith('/api/ecrans-veille/medias/signature', { typeMime: 'image/jpeg', taille: 2048, nomFichier: 'p.jpg' })
    const [putUrl, body, config] = axios.put.mock.calls[0]
    expect(putUrl).toContain('token=t')
    expect(body).toBeInstanceOf(FormData)
    expect(config.headers.Authorization).toBeUndefined()
    expect(config.headers['X-CSRF-Token']).toBeUndefined()
    expect(onProgress).toHaveBeenCalledWith(0.5)
  })

  it('traduit un stockage non configuré en message actionnable', async () => {
    api.post.mockRejectedValue({ response: { status: 503, data: { error: { code: 'STORAGE_NOT_CONFIGURED' } } } })
    await expect(ecransVeilleService.uploadMedia(file('p.png', 'image/png', 10), 'image'))
      .rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED', message: expect.stringContaining('Collez une URL') })
    expect(axios.put).not.toHaveBeenCalled()
  })

  it('ne contacte pas le serveur pour un fichier invalide', async () => {
    await expect(ecransVeilleService.uploadMedia(file('v.avi', 'video/x-msvideo', 10), 'video')).rejects.toMatchObject({ code: 'TYPE' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('signale un envoi interrompu', async () => {
    api.post.mockResolvedValue({ data: { data: { uploadUrl: 'https://u', publicUrl: 'https://p' } } })
    axios.put.mockRejectedValue({ response: { status: 413 } })
    await expect(ecransVeilleService.uploadMedia(file('p.png', 'image/png', 10), 'image'))
      .rejects.toMatchObject({ code: 'UPLOAD', message: expect.stringContaining('HTTP 413') })
  })
})

describe('CRUD', () => {
  it('déballe l\'enveloppe { success, data } de l\'API', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [{ id: 'e1' }] } })
    await expect(ecransVeilleService.list()).resolves.toEqual([{ id: 'e1' }])
    api.put.mockResolvedValue({ data: { success: true, data: { id: 'e1', actif: false } } })
    await expect(ecransVeilleService.update('e1', { actif: false })).resolves.toEqual({ id: 'e1', actif: false })
    expect(api.put).toHaveBeenCalledWith('/api/ecrans-veille/e1', { actif: false })
  })
})
