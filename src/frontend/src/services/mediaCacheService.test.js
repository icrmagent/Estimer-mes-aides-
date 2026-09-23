import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { syncMediaCache, resolveMediaUrl } from './mediaCacheService.js'

function fakeCacheStorage() {
  const store = new Map()
  const cache = {
    keys: vi.fn(async () => [...store.keys()].map((url) => ({ url }))),
    match: vi.fn(async (url) => store.get(typeof url === 'string' ? url : url.url)),
    put: vi.fn(async (url, res) => { store.set(url, res) }),
    delete: vi.fn(async (req) => store.delete(req.url)),
  }
  return { store, cache, caches: { open: vi.fn(async () => cache) } }
}

let env

beforeEach(() => {
  env = fakeCacheStorage()
  vi.stubGlobal('caches', env.caches)
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(`bytes:${url}`, { status: url.includes('404') ? 404 : 200 })))
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncMediaCache', () => {
  it('télécharge les médias manquants, ignore ceux déjà en cache, purge les obsolètes', async () => {
    env.store.set('https://cdn/old.jpg', new Response('old'))
    env.store.set('https://cdn/a.jpg', new Response('a'))

    const result = await syncMediaCache(['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/404.jpg'])

    expect(result).toEqual({ cached: 2, failed: ['https://cdn/404.jpg'] })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith('https://cdn/b.jpg', { mode: 'cors', credentials: 'omit' })
    expect([...env.store.keys()].sort()).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg'])
  })

  it('sans Cache API (navigateur ancien), ne fait rien', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(syncMediaCache(['https://cdn/a.jpg'])).resolves.toEqual({ cached: 0, failed: [] })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resolveMediaUrl', () => {
  it('sert une image en cache sous forme d\'URL blob révocable', async () => {
    env.store.set('https://cdn/a.jpg', new Response('a'))
    const { src, revoke } = await resolveMediaUrl('https://cdn/a.jpg', { online: true })
    expect(src).toBe('blob:mock')
    revoke()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('lit une vidéo en réseau tant que la borne est en ligne, depuis le cache sinon', async () => {
    env.store.set('https://cdn/v.mp4', new Response('v'))
    expect((await resolveMediaUrl('https://cdn/v.mp4', { online: true })).src).toBe('https://cdn/v.mp4')
    expect((await resolveMediaUrl('https://cdn/v.mp4', { online: false })).src).toBe('blob:mock')
  })

  it('retombe sur l\'URL réseau quand le média n\'est pas en cache', async () => {
    expect(await resolveMediaUrl('https://cdn/absent.jpg', { online: false })).toEqual({ src: 'https://cdn/absent.jpg', revoke: null })
  })
})
