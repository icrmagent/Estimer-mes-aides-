import { test, expect } from '@playwright/test'
import { MOCK_CONFIG } from '../fixtures/mock-config.js'

const nextBtn = page => page.locator('[aria-label="Étape suivante"]')
const sendBtn = page => page.locator('[aria-label="Envoyer le formulaire"]')

async function fillAndNavigateToLastStep(page) {
  await page.goto('/')
  await page.getByText('Commencer →').click()

  await expect(page.locator('#f-2087')).toBeVisible()
  await page.locator('#f-2087').fill('DUPONT')
  await page.locator('#f-2088').fill('JEAN')
  await page.locator('#f-2089').fill('75001')
  await page.locator('#f-2090').fill('PARIS')
  await nextBtn(page).click()

  // Étape 2 — revenu (obligatoire)
  await page.locator('.option-card').first().click()
  await nextBtn(page).click()

  // Étape 3 — statut (obligatoire)
  await page.locator('.option-card').first().click()
  await nextBtn(page).click()

  // Étapes 4-14 — optionnelles
  for (let i = 3; i < 14; i++) {
    await nextBtn(page).waitFor({ state: 'visible' })
    await nextBtn(page).click()
  }

  await expect(sendBtn(page)).toBeVisible()
}

test('mode offline — soumission sauvegardée dans IndexedDB', async ({ page }) => {
  await page.route('**/api/configuration', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CONFIG) })
  )

  await fillAndNavigateToLastStep(page)

  // Simuler le mode offline : navigator.onLine = false + réseau coupé
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true })
  })
  await page.route('**/api/submissions', route => route.abort('failed'))

  await sendBtn(page).click()

  // Message de confirmation offline
  await expect(page.getByText(/sauvegardée hors-ligne/i)).toBeVisible({ timeout: 10000 })
})

test('fallback config — utilise le cache localStorage si API down', async ({ page }) => {
  // Pré-charger la config dans localStorage
  await page.goto('/')
  await page.evaluate((config) => {
    localStorage.setItem('ema_config', JSON.stringify(config))
    localStorage.setItem('ema_config_etag', config.version)
  }, MOCK_CONFIG)

  // Bloquer toute requête vers la config
  await page.route('**/api/configuration', route => route.abort('failed'))
  await page.reload()

  // Doit démarrer depuis le cache
  await expect(page.getByText('Commencer →')).toBeVisible()
  await page.getByText('Commencer →').click()
  await expect(page.locator('#f-2087')).toBeVisible()
})
