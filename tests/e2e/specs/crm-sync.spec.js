import { test, expect } from '@playwright/test'
import { MOCK_SUBMISSIONS_LIST } from '../fixtures/mock-config.js'

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNjE2MjM5MDIyfQ.test'

function mockBackendApi(page, { loginFails = false } = {}) {
  page.route(/\/api\/submissions/, async route => {
    const url = route.request().url()
    const method = route.request().method()

    // PUT /api/submissions/:id/sync
    if (method === 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-sub-1', synced: true, syncedAt: new Date().toISOString(), crmProjectId: 'sim-123' }),
      })
    }

    // GET login validation : ?synced=false&limit=1 (exact App.jsx call)
    if (url.includes('synced=false&limit=1')) {
      if (loginFails) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, limit: 1 }),
      })
    }

    // GET liste des soumissions non synchronisées
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SUBMISSIONS_LIST),
    })
  })
}

test('login — connexion avec JWT valide', async ({ page }) => {
  mockBackendApi(page)
  await page.goto('/')

  await expect(page.getByText('CRM Sync')).toBeVisible()
  await page.locator('textarea').fill(FAKE_TOKEN)
  await page.getByRole('button', { name: 'Connexion' }).click()

  await expect(page.getByText('Synchronisation CRM')).toBeVisible({ timeout: 5000 })
})

test('import tout — synchronise les soumissions et affiche le rapport', async ({ page }) => {
  mockBackendApi(page)

  // Auto-login via localStorage
  await page.goto('/')
  await page.evaluate((token) => localStorage.setItem('crm_jwt_token', token), FAKE_TOKEN)
  await page.reload()

  await expect(page.getByText('Synchronisation CRM')).toBeVisible({ timeout: 5000 })

  // Attendre que les soumissions se chargent (bouton enabled)
  await expect(page.getByRole('button', { name: /Importer tout \(1\)/ })).toBeEnabled({ timeout: 8000 })

  // Cliquer "Importer tout (1)"
  await page.getByRole('button', { name: /Importer tout \(1\)/ }).click()

  // Rapport de synchronisation
  await expect(page.getByText('Synchronisation terminée')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('1 soumission traitée')).toBeVisible()
})

test('login invalide — affiche message d\'erreur', async ({ page }) => {
  mockBackendApi(page, { loginFails: true })

  await page.goto('/')
  await page.locator('textarea').fill('token-invalide')
  await page.getByRole('button', { name: 'Connexion' }).click()

  await expect(page.getByText(/Token invalide ou expiré/)).toBeVisible()
})
