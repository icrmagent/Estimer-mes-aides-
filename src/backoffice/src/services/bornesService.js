import api from './api.js'

/**
 * bornesService — CRUD operations for Borne entities.
 * All requests are authenticated via the api.js interceptor.
 */

export const bornesService = {
  /** List all bornes with optional pagination. */
  getAll(params = {}) {
    return api.get('/api/bornes', { params }).then((res) => res.data)
  },

  /** Get a single borne by ID. */
  getById(id) {
    return api.get(`/api/bornes/${id}`).then((res) => res.data)
  },

  /** Create a new borne. */
  create(data) {
    return api.post('/api/bornes', data).then((res) => res.data)
  },

  /** Update an existing borne. */
  update(id, data) {
    return api.put(`/api/bornes/${id}`, data).then((res) => res.data)
  },

  /** Delete a borne (soft delete on backend). */
  delete(id) {
    return api.delete(`/api/bornes/${id}`).then((res) => res.data)
  },

  /** Update the statut (actif / inactif) of a borne. */
  updateStatut(id, statut) {
    return api.patch(`/api/bornes/${id}/statut`, { statut }).then((res) => res.data)
  },

  /** Get the configuration for a borne (formulaire + settings). */
  getConfig(id) {
    return api.get(`/api/bornes/${id}/config`).then((res) => res.data)
  },
}

export default bornesService
