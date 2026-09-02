import { test as base, expect } from '@playwright/test'
import { MOCK_BORNE_CONFIG, BORNE_ID } from './mock-config.js'

/**
 * Session borne partagée par tous les specs E2E.
 *
 * Pourquoi c'est indispensable :
 *   src/frontend/src/App.jsx (KioskLayout) résout la borne avec
 *     import.meta.env.VITE_BORNE_ID || localStorage.getItem('borne_id')
 *   Sur un poste de dev, VITE_BORNE_ID vient de src/frontend/.env (non versionné).
 *   En CI ce fichier n'existe pas : sans `borne_id` en localStorage, KioskLayout
 *   rend l'écran « Erreur de configuration » et /start, /form, /confirmation
 *   deviennent inatteignables. C'était la cause des 6 échecs CI de form-journey
 *   et offline.
 *
 * addInitScript (plutôt qu'un page.evaluate après un goto('/login')) garantit que
 * le storage est peuplé AVANT le premier script de l'app, sur chaque navigation,
 * y compris après un page.reload().
 *
 * La route de configuration borne est moquée ici pour tous les specs. Un spec
 * peut la surcharger : Playwright évalue les handlers du dernier enregistré au
 * premier (cf. offline.spec.js qui la coupe pour tester le cache).
 */

export const BORNE_TOKEN = 'mock-jwt-e2e-token'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(({ borneId, token }) => {
      try {
        localStorage.setItem('borne_token', token)
        localStorage.setItem('borne_id', borneId)
      } catch (err) {
        // Origine opaque (about:blank, iframe sandboxée) : localStorage lève.
        // L'app n'y tourne jamais, on trace et on continue.
        console.debug('[e2e] session borne non injectable sur cette origine :', err?.message ?? err)
      }
    }, { borneId: BORNE_ID, token: BORNE_TOKEN })

    await page.route(/\/api\/bornes\/[^/]+\/config/, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BORNE_CONFIG),
      })
    )

    await use(page)
  },
})

export { expect, BORNE_ID }
