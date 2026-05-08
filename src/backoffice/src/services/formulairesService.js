import api from './api.js'

/**
 * formulairesService — CRUD + questions management for Formulaire entities.
 * All requests are authenticated via the api.js interceptor.
 */

export const formulairesService = {
  /** List all formulaires with optional filters. */
  getAll(params = {}) {
    return api.get('/api/formulaires', { params }).then((res) => res.data)
  },

  /** Get a single formulaire by ID. */
  getById(id) {
    return api.get(`/api/formulaires/${id}`).then((res) => res.data)
  },

  /** Create a new formulaire. */
  create(data) {
    return api.post('/api/formulaires', data).then((res) => res.data)
  },

  /** Update an existing formulaire's metadata. */
  update(id, data) {
    return api.put(`/api/formulaires/${id}`, data).then((res) => res.data)
  },

  /** Delete a formulaire (soft delete on backend). */
  delete(id) {
    return api.delete(`/api/formulaires/${id}`).then((res) => res.data)
  },

  /** Update the statut (brouillon / publie / archive) of a formulaire. */
  updateStatut(id, statut) {
    return api.patch(`/api/formulaires/${id}/statut`, { statut }).then((res) => res.data)
  },

  /** Duplicate a formulaire (creates a new brouillon copy). */
  dupliquer(id) {
    return api.post(`/api/formulaires/${id}/dupliquer`).then((res) => res.data)
  },

  // ── Questions ─────────────────────────────────────────────────────────────

  /** Get all questions for a formulaire, sorted by orderPage. */
  getQuestions(formulaireId) {
    return api.get(`/api/formulaires/${formulaireId}/questions`).then((res) => res.data)
  },

  /** Add a new question to a formulaire. */
  addQuestion(formulaireId, data) {
    return api.post(`/api/formulaires/${formulaireId}/questions`, data).then((res) => res.data)
  },

  /** Update an existing question. */
  updateQuestion(formulaireId, questionId, data) {
    return api
      .put(`/api/formulaires/${formulaireId}/questions/${questionId}`, data)
      .then((res) => res.data)
  },

  /** Delete a question from a formulaire. */
  deleteQuestion(formulaireId, questionId) {
    return api
      .delete(`/api/formulaires/${formulaireId}/questions/${questionId}`)
      .then((res) => res.data)
  },

  /**
   * Reorder questions within a formulaire.
   * @param {string} formulaireId
   * @param {Array<{id: string, orderPage: number}>} order
   */
  reorderQuestions(formulaireId, order) {
    return api
      .patch(`/api/formulaires/${formulaireId}/questions/reorder`, { order })
      .then((res) => res.data)
  },
}

export default formulairesService
