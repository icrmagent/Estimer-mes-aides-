import { prisma } from '../lib/prisma.js'

let configCache = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60 * 60 * 1000 // 1h

export const getConfiguration = async () => {
  if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache
  }
  configCache = await prisma.configuration.findFirst({ orderBy: { id: 'desc' } })
  configCacheTime = Date.now()
  return configCache
}

export const invalidateConfigCache = () => {
  configCache = null
  configCacheTime = 0
}
