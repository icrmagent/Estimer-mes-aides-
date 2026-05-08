import api from './api.js'

/**
 * enregistrementsService — list and export Enregistrement entities.
 * All requests are authenticated via the api.js interceptor.
 */

export const enregistrementsService = {
  /**
   * List enregistrements with optional filters and pagination.
   * @param {Object} params - { page, limit, borneId, dateDebut, dateFin, statutPartage }
   */
  getAll(params = {}) {
    return api.get('/api/enregistrements', { params }).then((res) => res.data)
  },

  /**
   * Export enregistrements as an Excel (XLSX) file.
   * Returns a Blob that can be used to trigger a browser download.
   * @param {Object} filters - { borneId, dateDebut, dateFin, statutPartage }
   */
  async exportExcel(filters = {}) {
    const params = new URLSearchParams()
    if (filters.borneId) params.set('borneId', filters.borneId)
    if (filters.dateDebut) params.set('dateDebut', filters.dateDebut)
    if (filters.dateFin) params.set('dateFin', filters.dateFin)
    if (filters.statutPartage) params.set('statutPartage', filters.statutPartage)

    const res = await api.get(`/api/enregistrements/export?${params.toString()}`, {
      responseType: 'blob',
    })

    // Trigger browser download
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `enregistrements-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return res.data
  },
}

export default enregistrementsService
