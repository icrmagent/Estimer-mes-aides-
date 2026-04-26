import { test, expect } from '@playwright/test'
import { MOCK_CONFIG, MOCK_SUBMISSION_RESPONSE } from '../fixtures/mock-config.js'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/configuration', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CONFIG) })
  )
  await page.route('**/api/submissions', route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_SUBMISSION_RESPONSE) })
    }
  })
})

const nextBtn  = page => page.locator('[aria-label="Étape suivante"]')
const prevBtn  = page => page.locator('[aria-label="Étape précédente"]')
const sendBtn  = page => page.locator('[aria-label="Envoyer le formulaire"]')

test('welcome page — affiche le titre et le bouton Commencer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Estimez vos aides en 5 minutes')).toBeVisible()
  await expect(page.getByText('Commencer →')).toBeVisible()
})

test('parcours complet — 15 étapes jusqu\'à la confirmation', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Commencer →').click()

  // Étape 1 — Infos personnelles (champs obligatoires)
  await expect(page.locator('#f-2087')).toBeVisible()
  await page.locator('#f-2087').fill('DUPONT')
  await page.locator('#f-2088').fill('JEAN')
  await page.locator('#f-2089').fill('75001')
  await page.locator('#f-2090').fill('PARIS')

  await expect(nextBtn(page)).toBeEnabled()
  await nextBtn(page).click()

  // Étape 2 — Revenu fiscal (obligatoire, radio)
  await expect(page.locator('.option-card').first()).toBeVisible()
  await page.locator('.option-card').first().click()
  await nextBtn(page).click()

  // Étape 3 — Statut propriétaire (obligatoire, radio)
  await expect(page.locator('.option-card').first()).toBeVisible()
  await page.locator('.option-card').first().click()
  await nextBtn(page).click()

  // Étapes 4-14 — tous optionnels, cliquer Suivant
  for (let i = 3; i < 14; i++) {
    await nextBtn(page).waitFor({ state: 'visible' })
    await nextBtn(page).click()
  }

  // Étape 15 — Bouton Envoyer
  await expect(sendBtn(page)).toBeVisible()
  await sendBtn(page).click()

  // Page de confirmation
  await expect(page.getByText('Demande envoyée !')).toBeVisible({ timeout: 10000 })
})

test('validation — Suivant désactivé si champs obligatoires vides', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Commencer →').click()

  await expect(page.locator('#f-2087')).toBeVisible()

  // Sans remplir les champs obligatoires → désactivé
  await expect(nextBtn(page)).toBeDisabled()

  // Remplir seulement Nom + Prénom → toujours désactivé (CP et Ville manquent)
  await page.locator('#f-2087').fill('DUPONT')
  await page.locator('#f-2088').fill('JEAN')
  await expect(nextBtn(page)).toBeDisabled()

  // Remplir CP et Ville → activé
  await page.locator('#f-2089').fill('75001')
  await page.locator('#f-2090').fill('PARIS')
  await expect(nextBtn(page)).toBeEnabled()
})

test('navigation — Précédent revient à l\'étape précédente', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Commencer →').click()

  await page.locator('#f-2087').fill('TEST')
  await page.locator('#f-2088').fill('TEST')
  await page.locator('#f-2089').fill('12345')
  await page.locator('#f-2090').fill('VILLE')
  await nextBtn(page).click()

  // Étape 2 — cliquer Précédent
  await expect(nextBtn(page)).toBeVisible()
  await prevBtn(page).click()

  // Retour à l'étape 1
  await expect(page.locator('#f-2087')).toBeVisible()
})
