import { prisma } from '../lib/prisma.js'

export const createSubmission = async ({ configVersion, values }) => {
  return prisma.submission.create({
    data: {
      configVersion,
      values: {
        create: values.map(({ fieldId, value }) => ({
          fieldId,
          value: Array.isArray(value) ? JSON.stringify(value) : String(value),
        })),
      },
    },
    include: { values: true },
  })
}

export const getSubmissions = async ({ synced, since, limit = 50, page = 1 }) => {
  const where = {}
  if (synced !== undefined) where.synced = synced === 'true' || synced === true
  if (since) where.createdAt = { gte: new Date(since) }

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: { values: true },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.submission.count({ where }),
  ])

  return { data: submissions, total, page: Number(page), limit: Number(limit) }
}

export const markSynced = async (id, crmProjectId) => {
  return prisma.submission.update({
    where: { id },
    data: {
      synced: true,
      syncedAt: new Date(),
      ...(crmProjectId && { crmProjectId }),
    },
    include: { values: true },
  })
}
