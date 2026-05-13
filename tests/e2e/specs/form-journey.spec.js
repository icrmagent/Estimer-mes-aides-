import { test, expect } from '@playwright/test'
import { MOCK_SUBMISSION_RESPONSE, MOCK_BORNE_CONFIG } from '../fixtures/mock-config.js'

const MOCK_ENREGISTREMENT_RESPONSE = { success: true, data: { id: 'enr-e2e-uuid', statutPartage: 'en_attente' } }

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/bornes\/[^/]+\/config/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BORNE_CONFIG) })
  )
  await page.route('**/api/enregistrements', route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_ENREGISTREMENT_RESPONSE) })
    }
  })

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('borne_token', 'mock-jwt-e2e-token')
  })
})

const nextBtn = page => page.locator('[aria-label="Suivant"]')
const prevBtn = page => page.locator('[aria-label="Précédent"]')
const sendBtn = page => page.getByText('Terminer')

test('welcome page — affiche le titre et le bouton Commencer', async ({ page }) => {
  await page.goto('/start')
  await expect(page.getByText('Estimez vos aides', { exact: false })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Commencer')).toBeVisible()
})

test('parcours complet — 15 étapes jusqu\'à la confirmation', async ({ page }) => {
  await page.goto('/start')
  await page.getByText('Commencer').click({ force: true })

  // Étape 1 — Infos personnelles (champs obligatoires)
  await expect(page.locator('[aria-label="Nom"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Nom"]').fill('DUPONT')
  await page.locator('[aria-label="Prénom"]').fill('JEAN')
  await page.locator('[aria-label="Code postal"]').fill('75001')
  await page.locator('[aria-label="Ville"]').fill('PARIS')

  await expect(nextBtn(page)).toBeEnabled()
  await nextBtn(page).click()

  // Étape 2 — Revenu fiscal (obligatoire, radio)
  await expect(page.locator('.pf-option-card').first()).toBeVisible()
  await page.locator('.pf-option-card').first().click()
  await nextBtn(page).click()

  // Étape 3 — Statut propriétaire (obligatoire, radio)
  await expect(page.locator('.pf-option-card').first()).toBeVisible()
  await page.locator('.pf-option-card').first().click()
  await nextBtn(page).click()

  // Étapes 4-14 — tous optionnels, cliquer Suivant
  for (let i = 3; i < 14; i++) {
    await nextBtn(page).waitFor({ state: 'visible' })
    await nextBtn(page).click()
  }

  // Étape 15 — Bouton Terminer
  await expect(sendBtn(page)).toBeVisible()
  await sendBtn(page).click()

  // Page de confirmation
  await expect(page.getByText('Merci pour votre demande !')).toBeVisible({ timeout: 10000 })
})

test('validation — Suivant désactivé si champs obligatoires vides', async ({ page }) => {
  await page.goto('/start')
  await page.getByText('Commencer').click({ force: true })

  await expect(page.locator('[aria-label="Nom"]')).toBeVisible({ timeout: 10000 })

  // Sans remplir les champs obligatoires → désactivé
  await expect(nextBtn(page)).toBeDisabled()

  // Remplir seulement Nom + Prénom → toujours désactivé (CP et Ville manquent)
  await page.locator('[aria-label="Nom"]').fill('DUPONT')
  await page.locator('[aria-label="Prénom"]').fill('JEAN')
  await expect(nextBtn(page)).toBeDisabled()

  // Remplir CP et Ville → activé
  await page.locator('[aria-label="Code postal"]').fill('75001')
  await page.locator('[aria-label="Ville"]').fill('PARIS')
  await expect(nextBtn(page)).toBeEnabled()
})

test('navigation — Précédent revient à l\'étape précédente', async ({ page }) => {
  await page.goto('/start')
  await page.getByText('Commencer').click({ force: true })

  await page.locator('[aria-label="Nom"]').fill('TEST')
  await page.locator('[aria-label="Prénom"]').fill('TEST')
  await page.locator('[aria-label="Code postal"]').fill('12345')
  await page.locator('[aria-label="Ville"]').fill('VILLE')
  await nextBtn(page).click()

  // Étape 2 — cliquer Précédent
  await expect(nextBtn(page)).toBeVisible()
  await prevBtn(page).click()

  // Retour à l'étape 1
  await expect(page.locator('[aria-label="Nom"]')).toBeVisible()
})
