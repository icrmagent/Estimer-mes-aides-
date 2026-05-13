import axios from 'axios'
import { get, set } from 'idb-keyval'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const BASE = API_URL
const KEY  = import.meta.env.VITE_API_KEY  || ''

const client = axios.create({
  baseURL: BASE,
  headers: { 'x-api-key': KEY },
  timeout: 10_000,
})

export const fetchConfiguration = async () => {
  const cached        = localStorage.getItem('ema_config')
  const cachedVersion = localStorage.getItem('ema_config_etag')

  try {
    const headers = cachedVersion ? { 'If-None-Match': `"${cachedVersion}"` } : {}
    const res     = await client.get('/api/configuration', { headers })
    const config  = res.data
    localStorage.setItem('ema_config',      JSON.stringify(config))
    localStorage.setItem('ema_config_etag', config.version)
    return config
  } catch (err) {
    if (err.response?.status === 304 && cached) return JSON.parse(cached)
    if (cached) return JSON.parse(cached)
    throw err
  }
}

export const submitForm = async (configVersion, values) => {
  try {
    const res = await client.post('/api/submissions', { configVersion, values })
    return { ok: true, data: res.data }
  } catch (err) {
    if (!navigator.onLine || err.code === 'ERR_NETWORK') {
      const queue = (await get('ema_offline_queue')) || []
      queue.push({ configVersion, values, savedAt: new Date().toISOString() })
      await set('ema_offline_queue', queue)
      return { ok: true, offline: true }
    }
    return { ok: false, error: err.response?.data?.error || err.message }
  }
}
