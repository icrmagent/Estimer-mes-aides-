const CRM_URL = import.meta.env.VITE_CRM_URL || ''

async function attemptCreateProject(submission) {
  if (!CRM_URL) {
    // Simulation mode — CRM URL non configurée
    await new Promise(r => setTimeout(r, 200))
    return { id: `sim-${submission.id.slice(0, 8)}-${Date.now()}` }
  }

  const fieldValues = (submission.submission_values || []).map(sv => ({
    field_id: sv.field_id,
    value: sv.value
  }))

  const payload = {
    project: {
      source: 'mobile_app',
      created_via: 'sync',
      submission_id: submission.id
    },
    field_values: fieldValues
  }

  const res = await fetch(`${CRM_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`CRM HTTP ${res.status}`)
  return res.json()
}

export async function createCrmProject(submission, retries = 3) {
  let lastError
  for (let i = 0; i < retries; i++) {
    try {
      return await attemptCreateProject(submission)
    } catch (err) {
      lastError = err
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
  throw lastError
}

export function isSimulationMode() {
  return !CRM_URL
}
