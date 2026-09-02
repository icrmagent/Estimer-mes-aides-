import { test, expect } from '../fixtures/borne-session.js'

/**
 * Visual baseline — capture des écrans clés sur 7 viewports cibles.
 * Phase 0 du plan RESPONSIVE.md : générer la référence pour valider
 * la non-régression à chaque fix (Phases 1-3).
 *
 * Projet Playwright « visual » (cf. playwright.config.js) : les baselines sont
 * suffixées par la plateforme d'enregistrement, et le projet ne s'active que là
 * où des baselines existent pour la plateforme courante. Le rendu des polices
 * n'étant pas portable, une baseline Windows n'est jamais comparée à un rendu
 * Linux — le seuil reste strict (0,5 % de pixels).
 *
 * Enregistrement   : PW_VISUAL=1 npx playwright test --project=visual --update-snapshots
 * Validation       : npx playwright test --project=visual
 */

const VIEWPORTS = [
  { name: 'mobile-se',        width: 375,  height: 667  },
  { name: 'mobile-14',        width: 390,  height: 844  },
  { name: 'mobile-pro-max',   width: 414,  height: 896  },
  { name: 'tablet-portrait',  width: 768,  height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768  },
  { name: 'kiosk-standard',   width: 1280, height: 800  },
  { name: 'kiosk-large',      width: 1920, height: 1080 },
]

for (const vp of VIEWPORTS) {
  test.describe(`baseline ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('login', async ({ page }) => {
      await page.goto('/login')
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveScreenshot(`${vp.name}/login.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      })
    })

    test('start', async ({ page }) => {
      await page.goto('/start')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300) // anim hero
      await expect(page).toHaveScreenshot(`${vp.name}/start.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      })
    })

    test('form-step-1', async ({ page }) => {
      await page.goto('/form')
      await page.waitForLoadState('networkidle')
      await page.waitForSelector('[aria-label="Nom"]', { timeout: 10_000 })
      await expect(page).toHaveScreenshot(`${vp.name}/form-step-1.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      })
    })
  })
}
