import { test, expect } from '@playwright/test'
import { MOCK_BORNE_CONFIG, BORNE_ID } from '../fixtures/mock-config.js'

/**
 * Responsive guards — vérifie sur tous les viewports cibles :
 *   1. Zéro overflow horizontal (scrollWidth <= innerWidth)
 *   2. Tous les targets tactiles >= 48px (règle absolue CLAUDE.md n°1)
 *
 * Plan : docs/RESPONSIVE.md Phase 4 gates G2 + G3.
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

const PAGES = [
  { name: 'login',  path: '/login'  },
  { name: 'start',  path: '/start'  },
  { name: 'form',   path: '/form'   },
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
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const pg of PAGES) {
      test(`zero overflow horizontal — ${pg.name}`, async ({ page }) => {
        await page.goto(pg.path)
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - window.innerWidth
        )
        expect(overflow, `scrollWidth excede innerWidth de ${overflow}px sur ${pg.name}`).toBeLessThanOrEqual(0)
      })

      test(`touch targets >= 48px — ${pg.name}`, async ({ page }) => {
        await page.goto(pg.path)
        await page.waitForLoadState('networkidle')
        const failing = await page.$$eval(
          'button:not([aria-hidden="true"]), input, a, select, [role="button"]',
          els => els
            .filter(e => {
              const r = e.getBoundingClientRect()
              // Skip elements not visible or with zero size (hidden)
              if (r.width === 0 || r.height === 0) return false
              // Skip hidden inputs (type=hidden, type=submit hidden, etc.)
              if (e.type === 'hidden') return false
              const style = window.getComputedStyle(e)
              if (style.display === 'none' || style.visibility === 'hidden') return false
              return r.width < 48 || r.height < 48
            })
            .map(e => ({
              tag: e.tagName,
              class: (e.className || '').toString().slice(0, 80),
              label: (e.getAttribute('aria-label') || e.textContent || '').slice(0, 50),
              size: `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`,
            }))
        )
        expect(failing, `Touch targets <48px detectes:\n${JSON.stringify(failing, null, 2)}`).toEqual([])
      })
    }
  })
}
