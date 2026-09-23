import { randomUUID } from 'node:crypto'

/**
 * Stockage des médias d'écran de veille dans Supabase Storage (API REST, sans SDK).
 *
 * Le fichier ne transite jamais par le backend : celui-ci délivre une URL d'envoi
 * signée, le back-office y dépose le fichier en PUT, puis enregistre l'URL publique.
 * Raison : le plan Render free (512 Mo de RAM, disque éphémère, veille) ne peut ni
 * bufferiser une vidéo de 50 Mo ni la conserver.
 *
 * Variables d'environnement (serveur uniquement, jamais VITE_) :
 *   SUPABASE_SERVICE_ROLE_KEY  clé service_role (JWT) ou clé secrète sb_secret_… — contourne
 *                              les RLS, ne jamais l'exposer. Alias acceptés : SUPABASE_SECRET_KEY,
 *                              SUPABASE_SERVICE_KEY, SUPABASE_KEY (nom du .env local du projet).
 *   SUPABASE_URL               ex. https://<projet>.supabase.co — facultative : déduite sinon
 *                              du projet présent dans DATABASE_URL (utilisateur postgres.<ref>).
 *   SUPABASE_STORAGE_BUCKET    optionnel, défaut "ecrans-veille"
 */

const MO = 1024 * 1024

export const MEDIA_RULES = {
  'image/jpeg': { typeMedia: 'image', ext: 'jpg', maxBytes: 10 * MO },
  'image/png': { typeMedia: 'image', ext: 'png', maxBytes: 10 * MO },
  'image/webp': { typeMedia: 'image', ext: 'webp', maxBytes: 10 * MO },
  'image/gif': { typeMedia: 'image', ext: 'gif', maxBytes: 10 * MO },
  'video/mp4': { typeMedia: 'video', ext: 'mp4', maxBytes: 50 * MO },
  'video/webm': { typeMedia: 'video', ext: 'webm', maxBytes: 50 * MO },
}

const BUCKET_MAX_BYTES = 50 * MO

const KEY_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY']

/**
 * URL du projet Supabase déduite de la chaîne Postgres : l'utilisateur du pooler vaut
 * `postgres.<ref>`, l'hôte direct `db.<ref>.supabase.co`. Une référence de projet fait
 * 20 caractères [a-z0-9].
 */
export function projectUrlFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return ''
  try {
    const u = new URL(databaseUrl)
    const ref = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username))?.[1]
      ?? /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname)?.[1]
    return ref ? `https://${ref}.supabase.co` : ''
  } catch {
    return ''
  }
}

function config() {
  const explicitUrl = (process.env.SUPABASE_URL || '').trim()
  const url = explicitUrl || projectUrlFromDatabaseUrl(process.env.DATABASE_URL) || projectUrlFromDatabaseUrl(process.env.DIRECT_URL)
  const keyVar = KEY_VARS.find((name) => (process.env[name] || '').trim())
  return {
    url: url.replace(/\/+$/, ''),
    key: keyVar ? process.env[keyVar].trim() : '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'ecrans-veille',
  }
}

export function isStorageConfigured() {
  const { url, key } = config()
  return Boolean(url && key)
}

function authHeaders(key) {
  return { Authorization: `Bearer ${key}`, apikey: key }
}

let bucketReady = null

/**
 * Crée le bucket public au premier envoi. Idempotent : « déjà existant » est un succès.
 * Les limites de taille et de type sont aussi posées côté bucket, car la taille
 * déclarée par le client lors de la signature n'est pas une garantie.
 */
async function ensureBucket() {
  if (bucketReady) return bucketReady

  bucketReady = (async () => {
    const { url, key, bucket } = config()
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...authHeaders(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: true,
        file_size_limit: BUCKET_MAX_BYTES,
        allowed_mime_types: Object.keys(MEDIA_RULES),
      }),
    })
    if (res.ok) return
    const body = await res.text()
    if (res.status === 409 || /already exists/i.test(body)) return
    throw new Error(`Création du bucket "${bucket}" refusée (HTTP ${res.status}) : ${body.slice(0, 200)}`)
  })()

  try {
    return await bucketReady
  } catch (err) {
    bucketReady = null
    throw err
  }
}

export function publicUrlFor(path) {
  const { url, bucket } = config()
  return `${url}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * @param {{ typeMime: string }} params — typeMime déjà validé contre MEDIA_RULES
 * @returns {Promise<{ uploadUrl: string, publicUrl: string, path: string, typeMedia: string }>}
 */
export async function createSignedUpload({ typeMime }) {
  const rule = MEDIA_RULES[typeMime]
  if (!rule) throw new Error(`Type MIME non autorisé : ${typeMime}`)

  await ensureBucket()

  const { url, key, bucket } = config()
  const now = new Date()
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const path = `${month}/${randomUUID()}.${rule.ext}`

  const res = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: authHeaders(key),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Signature d'envoi refusée (HTTP ${res.status}) : ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data?.url) throw new Error('Réponse Supabase sans URL signée')

  return {
    uploadUrl: `${url}/storage/v1${data.url}`,
    publicUrl: publicUrlFor(path),
    path,
    typeMedia: rule.typeMedia,
  }
}

/** Réservé aux tests : oublie le bucket mémorisé. */
export function __resetStorageForTests() {
  bucketReady = null
}
