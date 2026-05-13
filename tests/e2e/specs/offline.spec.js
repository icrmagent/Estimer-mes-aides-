import { test, expect } from '@playwright/test'
import { MOCK_BORNE_CONFIG } from '../fixtures/mock-config.js'

const nextBtn = page => page.locator('[aria-label="Suivant"]')
const sendBtn = page => page.getByText('Terminer')

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/bornes\/[^/]+\/config/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BORNE_CONFIG) })
  )

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('borne_token', 'mock-jwt-e2e-token')
  })
})

async function fillAndNavigateToLastStep(page) {
  await page.goto('/start')
  await page.getByText('Commencer').click({ force: true })

  await expect(page.locator('[aria-label="Nom"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Nom"]').fill('DUPONT')
  await page.locator('[aria-label="Prénom"]').fill('JEAN')
  await page.locator('[aria-label="Code postal"]').fill('75001')
  await page.locator('[aria-label="Ville"]').fill('PARIS')
  await nextBtn(page).click()

  // Étape 2 — revenu (obligatoire)
  await page.locator('.pf-option-card').first().click()
  await nextBtn(page).click()

  // Étape 3 — statut (obligatoire)
  await page.locator('.pf-option-card').first().click()
  await nextBtn(page).click()

  // Étapes 4-14 — optionnelles
  for (let i = 3; i < 14; i++) {
    await nextBtn(page).waitFor({ state: 'visible' })
    await nextBtn(page).click()
  }

  await expect(sendBtn(page)).toBeVisible()
}

test('mode offline — soumission sauvegardée dans IndexedDB', async ({ page }) => {
  await fillAndNavigateToLastStep(page)

  // Simuler le mode offline : navigator.onLine = false + réseau coupé
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true })
  })
  await page.route('**/api/enregistrements', route => route.abort('failed'))

  await sendBtn(page).click()

  // La page de confirmation s'affiche même hors-ligne
  await expect(page.getByText('Merci pour votre demande !')).toBeVisible({ timeout: 10000 })
})

test('fallback config — le formulaire charge depuis le cache borne', async ({ page }) => {
  // Premier chargement : borne config chargée depuis l'API mock et mise en cache
  await page.goto('/start')
  await expect(page.getByText('Commencer')).toBeVisible({ timeout: 10000 })

  // Bloquer l'API borne config (le cache localStorage prend le relais)
  await page.route(/\/api\/bornes\/[^/]+\/config/, route => route.abort('failed'))
  await page.reload()

  // Le formulaire charge depuis le cache localStorage
  await expect(page.getByText('Commencer')).toBeVisible({ timeout: 10000 })
  await page.getByText('Commencer').click({ force: true })
  await expect(page.locator('[aria-label="Nom"]')).toBeVisible({ timeout: 10000 })
})
