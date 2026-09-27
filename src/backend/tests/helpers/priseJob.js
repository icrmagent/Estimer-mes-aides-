/**
 * Aide aux tests du queue worker.
 *
 * Le worker prend un job ATOMIQUEMENT (partageJob.updateMany { id, statut ∈ file }
 * → { count: 1 }) puis RELIT sa cible et ses tentatives (partageJob.findUnique).
 * `installerPriseJob` configure ces deux mocks : la prise réussit, et la relecture
 * renvoie l'état du job passé à processJob — ou, pour processPendingJobs, celui du
 * job renvoyé par partageJob.findMany.
 *
 * @param {{ updateMany: Function, findUnique: Function, findMany: Function }} mockPartageJob
 * @returns {(processJob: Function) => (job: object) => Promise} enrobe processJob
 */
export function installerPriseJob(mockPartageJob) {
  const connus = new Map()
  mockPartageJob.updateMany.mockResolvedValue({ count: 1 })
  mockPartageJob.findUnique.mockImplementation(async ({ where }) => {
    let job = connus.get(where.id)
    if (!job) {
      for (const resultat of mockPartageJob.findMany.mock.results) {
        const liste = await resultat.value
        job = Array.isArray(liste) ? liste.find((x) => x?.id === where.id) : undefined
        if (job) break
      }
    }
    return job
      ? { enregistrementId: job.enregistrementId, entrepriseIcrmId: job.entrepriseIcrmId ?? null, tentatives: job.tentatives ?? 0 }
      : null
  })
  return (processJob) => (job) => {
    connus.set(job.id, job)
    return processJob(job)
  }
}

/** Appels de prise (en_cours) du worker, dans l'ordre. */
export function prisesDeJob(mockPartageJob) {
  return mockPartageJob.updateMany.mock.calls
    .map((c) => c[0])
    .filter((arg) => arg?.data?.statut === 'en_cours')
}
