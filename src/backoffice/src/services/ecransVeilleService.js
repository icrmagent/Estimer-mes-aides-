import axios from 'axios'
import api from './api.js'
import { MEDIA_LIMITS } from '../components/ecranVeille/model.js'

/**
 * ecransVeilleService — CRUD des écrans de veille et envoi des médias.
 *
 * Envoi d'un fichier : le backend signe une URL d'envoi Supabase Storage, puis le
 * navigateur y dépose le fichier directement. On passe par `axios` nu, pas par
 * l'instance `api` : Supabase n'attend ni le Bearer du back-office ni le jeton CSRF.
 */

export class MediaError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MediaError'
    this.code = code
  }
}

function unwrap(res) {
  return res.data?.data ?? res.data
}

/** Vérifie type et taille avant tout appel réseau (le backend revérifie). */
export function checkMediaFile(file, kind) {
  const rule = MEDIA_LIMITS[kind]
  if (!rule) throw new MediaError('KIND', `Type de média inconnu : ${kind}`)
  if (!rule.types.includes(file.type)) {
    const formats = rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ')
    throw new MediaError('TYPE', `Format non accepté (${file.type || 'inconnu'}). Formats : ${formats}.`)
  }
  if (file.size > rule.maxBytes) {
    throw new MediaError('SIZE', `Fichier trop lourd : ${(file.size / 1048576).toFixed(1)} Mo, ${rule.maxBytes / 1048576} Mo maximum.`)
  }
}

export const ecransVeilleService = {
  list() {
    return api.get('/api/ecrans-veille').then(unwrap)
  },

  get(id) {
    return api.get(`/api/ecrans-veille/${id}`).then(unwrap)
  },

  create(payload) {
    return api.post('/api/ecrans-veille', payload).then(unwrap)
  },

  update(id, payload) {
    return api.put(`/api/ecrans-veille/${id}`, payload).then(unwrap)
  },

  duplicate(id) {
    return api.post(`/api/ecrans-veille/${id}/dupliquer`).then(unwrap)
  },

  remove(id) {
    return api.delete(`/api/ecrans-veille/${id}`).then(unwrap)
  },

  /**
   * @param {File} file
   * @param {'image'|'video'} kind
   * @param {{ onProgress?: (ratio: number) => void }} [options]
   * @returns {Promise<string>} URL publique du média
   */
  async uploadMedia(file, kind, { onProgress } = {}) {
    checkMediaFile(file, kind)

    let signature
    try {
      signature = unwrap(await api.post('/api/ecrans-veille/medias/signature', {
        typeMime: file.type,
        taille: file.size,
        nomFichier: file.name,
      }))
    } catch (err) {
      const code = err.response?.data?.error?.code
      if (code === 'STORAGE_NOT_CONFIGURED') {
        throw new MediaError(code, 'Envoi de fichiers indisponible : stockage non configuré sur le serveur. Collez une URL HTTPS.')
      }
      throw new MediaError(code || 'SIGNATURE', err.response?.data?.error?.message || 'Le serveur a refusé l\'envoi.')
    }

    // Même format que supabase-js (uploadToSignedUrl) : multipart, champ sans nom.
    const body = new FormData()
    body.append('cacheControl', '31536000')
    body.append('', file)

    try {
      await axios.put(signature.uploadUrl, body, {
        headers: { 'x-upsert': 'false' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total)
        },
      })
    } catch (err) {
      throw new MediaError('UPLOAD', `Envoi interrompu${err.response ? ` (HTTP ${err.response.status})` : ''}. Réessayez.`)
    }

    return signature.publicUrl
  },
}

export default ecransVeilleService
