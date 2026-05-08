import api from './api.js'

/**
 * adminBornesService — CRUD + password reset for AdminBorne entities.
 * All requests are authenticated via the api.js interceptor.
 */

export const adminBornesService = {
  /** List all admin bornes with optional filters. */
  getAll(params = {}) {
    return api.get('/api/admin-bornes', { params }).then((res) => res.data)
  },

  /** Get a single admin borne by ID. */
  getById(id) {
    return api.get(`/api/admin-bornes/${id}`).then((res) => res.data)
  },

  /** Create a new admin borne account. */
  create(data) {
    return api.post('/api/admin-bornes', data).then((res) => res.data)
  },

  /** Update an existing admin borne. */
  update(id, data) {
    return api.put(`/api/admin-bornes/${id}`, data).then((res) => res.data)
  },

  /** Delete an admin borne (soft delete on backend). */
  delete(id) {
    return api.delete(`/api/admin-bornes/${id}`).then((res) => res.data)
  },

  /** Update the actif status of an admin borne. */
  updateStatut(id, actif) {
    return api.patch(`/api/admin-bornes/${id}/statut`, { actif }).then((res) => res.data)
  },

  /**
   * Reset the password for an admin borne.
   * Returns an object containing the temporary password.
   */
  resetPassword(id) {
    return api.post(`/api/admin-bornes/${id}/reset-password`).then((res) => res.data)
  },
}

export default adminBornesService
