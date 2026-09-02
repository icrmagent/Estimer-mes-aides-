/**
 * Lecture des réponses de l'API V2 côté back-office.
 *
 * Les routes paginées renvoient `{ success, data: [...], meta: { page, limit, total } }`
 * (cf. src/backend/src/routes/bornes.js et enregistrements.js). Le total n'est donc
 * jamais à la racine : `res.data.total` vaut `undefined`, ce qui plafonne la liste
 * sans aucun contrôle de pagination. La lecture de `total` passe par cet helper.
 */

/** Total d'éléments d'une réponse paginée, quelle que soit la forme renvoyée. */
export function getMetaTotal(res, fallback = 0) {
  return res?.data?.meta?.total ?? res?.data?.total ?? fallback
}

/** Nombre de pages pour un total et une taille de page donnés. */
export function getTotalPages(total, limit) {
  if (!Number.isFinite(total) || !Number.isFinite(limit) || limit <= 0) return 0
  return Math.ceil(Math.max(0, total) / limit)
}

function serverMessage(err) {
  const value = err?.response?.data?.error
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Message d'authentification lisible par un exploitant.
 *
 * Chaque cause a son message : sans distinction, un backend injoignable est
 * indiscernable d'un mot de passe erroné.
 */
export function describeAuthError(err) {
  const status = err?.response?.status

  // Pas de réponse HTTP : DNS, TLS, CORS, coupure réseau ou timeout axios.
  if (typeof status !== 'number') {
    return 'Service injoignable — vérifiez la connexion réseau, puis réessayez dans une minute.'
  }

  if (status === 401) {
    return 'Identifiants invalides — vérifiez votre e-mail et votre mot de passe.'
  }

  if (status === 429) {
    return serverMessage(err)
      || 'Trop de tentatives de connexion — accès temporairement bloqué. Réessayez dans quelques minutes.'
  }

  if (status >= 500) {
    return `Service indisponible (erreur ${status}) — le serveur redémarre peut-être. Réessayez dans une minute.`
  }

  return serverMessage(err) || `Connexion impossible (erreur ${status}).`
}
