const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export async function getUnsyncedSubmissions(token, params = new URLSearchParams()) {
  params.set('synced', 'false')
  if (!params.has('limit')) params.set('limit', '100')
  const res = await fetch(`${BASE_URL}/api/submissions?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (res.status === 401) throw new Error('Token invalide ou expiré')
  if (!res.ok) throw new Error(`Erreur serveur: ${res.status}`)
  return res.json()
}

export async function markSynced(token, id, crmProjectId) {
  const res = await fetch(`${BASE_URL}/api/submissions/${id}/sync`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ crmProjectId })
  })
  if (!res.ok) throw new Error(`Erreur marquage sync: ${res.status}`)
  return res.json()
}
