import { test, expect } from '@playwright/test'
import { MOCK_BORNE_CONFIG, BORNE_ID } from '../fixtures/mock-config.js'

/**
 * Visual baseline — capture des écrans clés sur 7 viewports cibles.
 * Phase 0 du plan RESPONSIVE.md : générer la référence pour valider
 * la non-régression à chaque fix (Phases 1-3).
 *
 * Création initiale  : npx playwright test visual-baseline --update-snapshots
 * Validation         : npx playwright test visual-baseline
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

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/bornes\/[^/]+\/config/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BORNE_CONFIG),
    })
  )
  await page.addInitScript((borneId) => {
    try {
      localStorage.setItem('borne_token', 'mock-jwt-e2e-token')
      localStorage.setItem('borne_id', borneId)
    } catch (_) {}
  }, BORNE_ID)
})

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
