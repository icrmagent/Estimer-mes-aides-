import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { jwtAuthV2 } from '../middleware/jwtAuth.js'
import { requireRole } from '../middleware/roleAuth.js'
import logger from '../lib/logger.js'
import { cacheService } from '../services/cacheService.js'
import { publishEvent } from '../services/pusherService.js'
import { MEDIA_RULES, isStorageConfigured, createSignedUpload } from '../services/storageService.js'

export const ecransVeilleRouter = Router()

// ─── Validation ───────────────────────────────────────────────────────────────

const texteCourt = z.string().trim().max(200)

const i18nSchema = z.object({
  fr: texteCourt.optional(),
  es: texteCourt.optional(),
  en: texteCourt.optional(),
}).strict()

const httpsUrl = z.string().trim().max(2048).url('URL invalide')
  .refine((u) => u.startsWith('https://'), 'URL HTTPS requise')

const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue (#RRGGBB)')
const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM')
const ajustement = z.enum(['couvrir', 'contenir']).default('couvrir')

const styleSchema = z.object({
  position: z.enum(['haut', 'centre', 'bas']).default('centre'),
  alignement: z.enum(['gauche', 'centre', 'droite']).default('centre'),
  couleurTexte: couleur.default('#FFFFFF'),
  opaciteVoile: z.number().int().min(0).max(90).default(35),
}).strict()

const diapoBase = z.object({
  duree: z.number().int().min(3).max(300).default(8),
  actif: z.boolean().default(true),
  titre: i18nSchema.nullable().optional(),
  sousTitre: i18nSchema.nullable().optional(),
  style: styleSchema.optional(),
  dateDebut: z.string().datetime({ offset: true }).nullable().optional(),
  dateFin: z.string().datetime({ offset: true }).nullable().optional(),
})

const diapositiveSchema = z.discriminatedUnion('type', [
  diapoBase.extend({
    type: z.literal('texte'),
    contenu: z.object({
      fond: z.object({
        type: z.enum(['couleur', 'degrade', 'image']).default('couleur'),
        couleur: couleur.default('#5B2D8E'),
        couleur2: couleur.optional(),
        angle: z.number().int().min(0).max(360).optional(),
        imageUrl: httpsUrl.optional(),
      }).strict(),
    }).strict(),
  }),
  diapoBase.extend({
    type: z.literal('image'),
    contenu: z.object({
      imageUrl: httpsUrl,
      ajustement,
      effetZoom: z.boolean().default(true),
    }).strict(),
  }),
  diapoBase.extend({
    type: z.literal('galerie'),
    contenu: z.object({
      images: z.array(httpsUrl).min(2, 'Une galerie contient au moins 2 images').max(20),
      dureeParImage: z.number().int().min(2).max(60).default(4),
      ajustement,
    }).strict(),
  }),
  diapoBase.extend({
    type: z.literal('video'),
    contenu: z.object({
      videoUrl: httpsUrl,
      posterUrl: httpsUrl.optional(),
      lireJusquaFin: z.boolean().default(true),
    }).strict(),
  }),
]).superRefine((d, ctx) => {
  if (d.type === 'texte' && !d.titre?.fr) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['titre', 'fr'], message: 'Titre (FR) requis pour une diapositive texte' })
  }
  if (d.type === 'texte' && d.contenu.fond.type === 'image' && !d.contenu.fond.imageUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contenu', 'fond', 'imageUrl'], message: 'Image de fond requise' })
  }
  if (d.dateDebut && d.dateFin && new Date(d.dateFin) <= new Date(d.dateDebut)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateFin'], message: 'La date de fin doit suivre la date de début' })
  }
})

const ecranFields = {
  nom: z.string().trim().min(1, 'Le nom est requis').max(120),
  description: z.string().trim().max(500).nullable().optional(),
  actif: z.boolean(),
  delaiActivation: z.number().int().min(10).max(3600),
  transition: z.enum(['fondu', 'glissement', 'zoom', 'aucune']),
  ordreAleatoire: z.boolean(),
  afficherCta: z.boolean(),
  texteCta: i18nSchema.nullable().optional(),
  afficherLogo: z.boolean(),
  afficherHorloge: z.boolean(),
  heureDebut: heure.nullable().optional(),
  heureFin: heure.nullable().optional(),
  diapositives: z.array(diapositiveSchema).max(50),
  borneIds: z.array(z.string().uuid()).max(500),
}

function refinePlage(data, ctx) {
  const debut = data.heureDebut ?? null
  const fin = data.heureFin ?? null
  if ((debut === null) !== (fin === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['heureFin'], message: 'Renseigner les deux bornes de la plage horaire, ou aucune' })
  } else if (debut !== null && debut === fin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['heureFin'], message: 'La plage horaire ne peut pas être vide' })
  }
}

const createSchema = z.object({
  ...ecranFields,
  actif: ecranFields.actif.default(true),
  delaiActivation: ecranFields.delaiActivation.default(60),
  transition: ecranFields.transition.default('fondu'),
  ordreAleatoire: ecranFields.ordreAleatoire.default(false),
  afficherCta: ecranFields.afficherCta.default(true),
  afficherLogo: ecranFields.afficherLogo.default(true),
  afficherHorloge: ecranFields.afficherHorloge.default(false),
  diapositives: ecranFields.diapositives.default([]),
  borneIds: ecranFields.borneIds.default([]),
}).strict().superRefine(refinePlage)

// La plage horaire se valide sur l'état fusionné (existant + patch), dans le handler.
const updateSchema = z.object(ecranFields).partial().strict()

const signatureSchema = z.object({
  typeMime: z.string().refine((t) => t in MEDIA_RULES, {
    message: `Types acceptés : ${Object.keys(MEDIA_RULES).join(', ')}`,
  }),
  taille: z.number().int().positive(),
  nomFichier: z.string().max(255).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ECRAN_SCALARS = [
  'nom', 'description', 'actif', 'delaiActivation', 'transition', 'ordreAleatoire',
  'afficherCta', 'texteCta', 'afficherLogo', 'afficherHorloge', 'heureDebut', 'heureFin',
]

const BORNE_SELECT = { id: true, idBorne: true, adresse: true, statut: true, adminBorneId: true }

// Prisma refuse `null` brut sur une colonne Json : il faut DbNull pour vider texteCta.
function pickScalars(data) {
  return Object.fromEntries(ECRAN_SCALARS.filter((k) => k in data).map((k) => [
    k,
    k === 'texteCta' && data[k] === null ? Prisma.DbNull : data[k],
  ]))
}

// Galerie : la durée de la diapo découle du nombre d'images, pas de la saisie.
function toDiapositiveData(d, ordre) {
  const duree = d.type === 'galerie' ? d.contenu.images.length * d.contenu.dureeParImage : d.duree
  return {
    ordre,
    type: d.type,
    duree,
    actif: d.actif,
    titre: d.titre ?? undefined,
    sousTitre: d.sousTitre ?? undefined,
    contenu: d.contenu,
    style: d.style ?? undefined,
    dateDebut: d.dateDebut ? new Date(d.dateDebut) : null,
    dateFin: d.dateFin ? new Date(d.dateFin) : null,
  }
}

function toSummary(ecran) {
  const { diapositives = [], bornes = [], ...rest } = ecran
  const actives = diapositives.filter((d) => d.actif)
  return {
    ...rest,
    nbDiapositives: diapositives.length,
    nbDiapositivesActives: actives.length,
    dureeTotale: actives.reduce((s, d) => s + d.duree, 0),
    apercu: actives[0] ?? diapositives[0] ?? null,
    bornes: bornes.map(({ adminBorneId: _omit, ...b }) => b),
  }
}

function toDetail(ecran) {
  const { bornes = [], ...rest } = ecran
  return { ...rest, bornes: bornes.map(({ adminBorneId: _omit, ...b }) => b) }
}

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Données invalides', details: error.flatten() },
  })
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Écran de veille introuvable' },
  })
}

function serverError(res, err, context) {
  logger.error({ message: `[ECRANS-VEILLE] ${context}`, error: err.message, code: err.code })
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur serveur' },
  })
}

/** Refuse toute borne inconnue ou supprimée : sinon l'affectation échouerait en silence. */
async function assertBornesExist(borneIds) {
  if (borneIds.length === 0) return null
  const found = await prisma.borne.findMany({
    where: { id: { in: borneIds }, deletedAt: null },
    select: { id: true },
  })
  const known = new Set(found.map((b) => b.id))
  const missing = borneIds.filter((id) => !known.has(id))
  return missing.length > 0 ? missing : null
}

/**
 * Invalide la config en cache des bornes touchées et les prévient en temps réel.
 * Une borne hors ligne récupérera la nouvelle version à son prochain chargement.
 */
async function notifierBornes(borneIds, ecranVeilleId) {
  const ids = [...new Set(borneIds)]
  await Promise.all(ids.map(async (borneId) => {
    await cacheService.delete(`borne-config:${borneId}`)
    await publishEvent(`borne-${borneId}`, 'ecran-veille.maj', { ecranVeilleId })
  }))
}

async function loadDetail(id) {
  return prisma.ecranVeille.findFirst({
    where: { id, deletedAt: null },
    include: {
      diapositives: { orderBy: { ordre: 'asc' } },
      bornes: { where: { deletedAt: null }, select: BORNE_SELECT, orderBy: { idBorne: 'asc' } },
    },
  })
}

// ─── POST /api/ecrans-veille/medias/signature ─────────────────────────────────
// Délivre une URL d'envoi signée Supabase Storage. Le fichier part du navigateur
// directement vers Supabase (PUT), le backend ne le voit jamais.

ecransVeilleRouter.post('/medias/signature', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = signatureSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)

  const { typeMime, taille } = parsed.data
  const rule = MEDIA_RULES[typeMime]
  if (taille > rule.maxBytes) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `Fichier trop volumineux : ${Math.round(rule.maxBytes / (1024 * 1024))} Mo maximum pour ce type`,
      },
    })
  }

  if (!isStorageConfigured()) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'STORAGE_NOT_CONFIGURED',
        message: 'Stockage des médias non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Utilisez une URL.',
      },
    })
  }

  try {
    const data = await createSignedUpload({ typeMime })
    return res.json({ success: true, data })
  } catch (err) {
    logger.error({ message: '[ECRANS-VEILLE] Signature média échouée', error: err.message })
    return res.status(502).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: 'Le service de stockage a refusé la demande' },
    })
  }
})

// ─── GET /api/ecrans-veille ───────────────────────────────────────────────────
// SuperAdmin : tous. AdminBorne : lecture seule des écrans affectés à ses bornes.

ecransVeilleRouter.get('/', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  const isAdminBorne = req.user.role === 'ADMIN_BORNE'
  const borneScope = isAdminBorne
    ? { deletedAt: null, adminBorneId: req.user.sub }
    : { deletedAt: null }

  try {
    const ecrans = await prisma.ecranVeille.findMany({
      where: {
        deletedAt: null,
        ...(isAdminBorne ? { bornes: { some: borneScope } } : {}),
      },
      include: {
        diapositives: {
          orderBy: { ordre: 'asc' },
          select: { duree: true, actif: true, type: true, titre: true, sousTitre: true, contenu: true, style: true },
        },
        bornes: { where: borneScope, select: BORNE_SELECT, orderBy: { idBorne: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return res.json({ success: true, data: ecrans.map(toSummary) })
  } catch (err) {
    return serverError(res, err, 'Liste')
  }
})

// ─── GET /api/ecrans-veille/:id ───────────────────────────────────────────────

ecransVeilleRouter.get('/:id', jwtAuthV2, requireRole('SUPER_ADMIN', 'ADMIN_BORNE'), async (req, res) => {
  try {
    const ecran = await loadDetail(req.params.id)
    if (!ecran) return notFound(res)

    if (req.user.role === 'ADMIN_BORNE') {
      const siennes = ecran.bornes.filter((b) => b.adminBorneId === req.user.sub)
      if (siennes.length === 0) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Accès refusé' },
        })
      }
      return res.json({ success: true, data: toDetail({ ...ecran, bornes: siennes }) })
    }

    return res.json({ success: true, data: toDetail(ecran) })
  } catch (err) {
    return serverError(res, err, 'Détail')
  }
})

// ─── POST /api/ecrans-veille ──────────────────────────────────────────────────

ecransVeilleRouter.post('/', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)

  const { diapositives, borneIds } = parsed.data

  try {
    const missing = await assertBornesExist(borneIds)
    if (missing) {
      return res.status(400).json({
        success: false,
        error: { code: 'BORNE_NOT_FOUND', message: 'Borne(s) introuvable(s)', details: { borneIds: missing } },
      })
    }

    const id = await prisma.$transaction(async (tx) => {
      const ecran = await tx.ecranVeille.create({
        data: {
          ...pickScalars(parsed.data),
          diapositives: { create: diapositives.map((d, i) => toDiapositiveData(d, i)) },
        },
        select: { id: true },
      })
      if (borneIds.length > 0) {
        await tx.borne.updateMany({ where: { id: { in: borneIds } }, data: { ecranVeilleId: ecran.id } })
      }
      return ecran.id
    })

    await notifierBornes(borneIds, id)
    const ecran = await loadDetail(id)
    return res.status(201).json({ success: true, data: toDetail(ecran) })
  } catch (err) {
    return serverError(res, err, 'Création')
  }
})

// ─── PUT /api/ecrans-veille/:id ───────────────────────────────────────────────
// Mise à jour partielle. `diapositives` fourni = remplacement complet de la séquence
// (ordre = position dans le tableau). `borneIds` fourni = liste exacte des bornes affectées.

ecransVeilleRouter.put('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)

  const { id } = req.params
  const { diapositives, borneIds } = parsed.data

  try {
    const existing = await prisma.ecranVeille.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, heureDebut: true, heureFin: true, bornes: { select: { id: true } } },
    })
    if (!existing) return notFound(res)

    const plage = z.object({}).passthrough().superRefine(refinePlage).safeParse({
      heureDebut: 'heureDebut' in parsed.data ? parsed.data.heureDebut : existing.heureDebut,
      heureFin: 'heureFin' in parsed.data ? parsed.data.heureFin : existing.heureFin,
    })
    if (!plage.success) return validationError(res, plage.error)

    if (borneIds) {
      const missing = await assertBornesExist(borneIds)
      if (missing) {
        return res.status(400).json({
          success: false,
          error: { code: 'BORNE_NOT_FOUND', message: 'Borne(s) introuvable(s)', details: { borneIds: missing } },
        })
      }
    }

    const anciennes = existing.bornes.map((b) => b.id)

    await prisma.$transaction(async (tx) => {
      await tx.ecranVeille.update({ where: { id }, data: pickScalars(parsed.data) })

      if (diapositives) {
        await tx.diapositiveVeille.deleteMany({ where: { ecranVeilleId: id } })
        if (diapositives.length > 0) {
          await tx.diapositiveVeille.createMany({
            data: diapositives.map((d, i) => ({ ...toDiapositiveData(d, i), ecranVeilleId: id })),
          })
        }
      }

      if (borneIds) {
        await tx.borne.updateMany({
          where: { ecranVeilleId: id, id: { notIn: borneIds } },
          data: { ecranVeilleId: null },
        })
        if (borneIds.length > 0) {
          await tx.borne.updateMany({ where: { id: { in: borneIds } }, data: { ecranVeilleId: id } })
        }
      }
    })

    // Une borne réaffectée depuis un autre écran change aussi de contenu : on la prévient.
    await notifierBornes([...anciennes, ...(borneIds ?? [])], id)
    const ecran = await loadDetail(id)
    return res.json({ success: true, data: toDetail(ecran) })
  } catch (err) {
    return serverError(res, err, 'Mise à jour')
  }
})

// ─── POST /api/ecrans-veille/:id/dupliquer ────────────────────────────────────
// Copie les réglages et la séquence, jamais les affectations de bornes.

ecransVeilleRouter.post('/:id/dupliquer', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const source = await prisma.ecranVeille.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { diapositives: { orderBy: { ordre: 'asc' } } },
    })
    if (!source) return notFound(res)

    const copie = await prisma.ecranVeille.create({
      data: {
        ...pickScalars(source),
        nom: `${source.nom} (copie)`.slice(0, 120),
        diapositives: {
          create: source.diapositives.map((d) => ({
            ordre: d.ordre,
            type: d.type,
            duree: d.duree,
            actif: d.actif,
            titre: d.titre ?? undefined,
            sousTitre: d.sousTitre ?? undefined,
            contenu: d.contenu,
            style: d.style ?? undefined,
            dateDebut: d.dateDebut,
            dateFin: d.dateFin,
          })),
        },
      },
      select: { id: true },
    })

    const ecran = await loadDetail(copie.id)
    return res.status(201).json({ success: true, data: toDetail(ecran) })
  } catch (err) {
    return serverError(res, err, 'Duplication')
  }
})

// ─── DELETE /api/ecrans-veille/:id ────────────────────────────────────────────
// Soft delete + désaffectation : une borne ne doit jamais diffuser un écran supprimé.

ecransVeilleRouter.delete('/:id', jwtAuthV2, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { id } = req.params

  try {
    const existing = await prisma.ecranVeille.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, bornes: { select: { id: true } } },
    })
    if (!existing) return notFound(res)

    await prisma.$transaction([
      prisma.borne.updateMany({ where: { ecranVeilleId: id }, data: { ecranVeilleId: null } }),
      prisma.ecranVeille.update({ where: { id }, data: { deletedAt: new Date() } }),
    ])

    await notifierBornes(existing.bornes.map((b) => b.id), null)
    return res.json({ success: true, data: { id, bornesDesaffectees: existing.bornes.length } })
  } catch (err) {
    return serverError(res, err, 'Suppression')
  }
})
