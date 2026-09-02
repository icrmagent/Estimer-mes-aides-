import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// tests/e2e n'est pas un paquet ESM : Playwright transpile ce fichier en CJS,
// __dirname est donc disponible. Ne pas utiliser import.meta.url ici, Node
// rebasculerait le module en ESM et le chargement échouerait.
const CONFIG_DIR = __dirname
const VISUAL_SPEC = 'visual-baseline.spec.js'
const VISUAL_SNAPSHOT_DIR = path.join(CONFIG_DIR, 'specs', `${VISUAL_SPEC}-snapshots`)

/**
 * Deux projets, deux natures de tests.
 *
 *  - « functional » : parcours, offline et garde-fous responsive (overflow
 *    horizontal + touch targets >= 48px sur 7 viewports). Ces assertions sont
 *    mesurées dans le DOM, donc identiques sur Windows et sur Linux : elles
 *    tournent partout, CI comprise.
 *
 *  - « visual » : comparaison pixel à pixel. Le rendu des polices dépend du
 *    moteur de l'OS (DirectWrite sur Windows, FreeType sur Linux) : une baseline
 *    enregistrée sur Windows ne peut PAS être comparée à un rendu Linux. Les
 *    seules issues seraient soit de relâcher le seuil au point de ne plus rien
 *    détecter, soit de comparer des baselines enregistrées sur la plateforme
 *    d'exécution. On garde donc le seuil strict (maxDiffPixelRatio 0.005) et on
 *    n'active le projet que si des baselines existent pour la plateforme
 *    courante (suffixe {platform} dans le nom de fichier).
 *
 * Conséquence : sur ubuntu-latest, sans baseline `-linux.png` committée, le
 * projet « visual » n'est pas enregistré — 0 test rouge par construction, aucun
 * test supprimé ni affaibli. Le jour où des baselines Linux sont produites (job
 * CI dédié avec --update-snapshots, ou conteneur mcr.microsoft.com/playwright),
 * il suffit de les committer : la CI les exécutera sans modifier cette config.
 *
 * Bootstrap sur une nouvelle plateforme :
 *   PW_VISUAL=1 npx playwright test --project=visual --update-snapshots
 * Désactivation explicite : PW_VISUAL=0
 */
const platformBaselines = fs.existsSync(VISUAL_SNAPSHOT_DIR)
  ? fs.readdirSync(VISUAL_SNAPSHOT_DIR).filter(f => f.endsWith(`-${process.platform}.png`))
  : []

const recordingBaselines =
  process.env.PW_VISUAL === '1' ||
  process.argv.includes('-u') ||
  process.argv.some(arg => arg === '--update-snapshots' || arg.startsWith('--update-snapshots='))

const visualDisabled = process.env.PW_VISUAL === '0'
const runVisual = !visualDisabled && (recordingBaselines || platformBaselines.length > 0)

// La liste des projets doit être STRICTEMENT identique dans le process principal
// et dans chaque worker, qui recharge ce fichier. Les workers ne reçoivent pas
// les flags CLI (process.argv), donc un `--update-snapshots` sur une plateforme
// encore sans baseline donnerait « Project "visual" not found in the worker
// process ». On propage la décision par l'environnement, hérité au fork.
if (runVisual) process.env.PW_VISUAL = '1'

// Le fichier de config est rechargé par chaque worker : n'avertir que depuis le
// process principal, sinon le message est répété autant de fois qu'il y a de workers.
if (!runVisual && process.env.TEST_WORKER_INDEX === undefined) {
  const raison = visualDisabled
    ? 'désactivé explicitement (PW_VISUAL=0)'
    : `aucune baseline "-${process.platform}.png" dans specs/${VISUAL_SPEC}-snapshots`
  console.warn(
    `[playwright] Projet "visual" non enregistré : ${raison}.\n` +
    `             Les garde-fous responsive (overflow + touch targets) restent actifs sur les 7 viewports.\n` +
    `             Pour enregistrer les baselines de cette plateforme :\n` +
    `               PW_VISUAL=1 npx playwright test --project=visual --update-snapshots`
  )
}

const kioskDevice = { ...devices['Pixel 5'] }

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'functional',
      testIgnore: `**/${VISUAL_SPEC}`,
      use: kioskDevice,
    },
    ...(runVisual
      ? [{
          name: 'visual',
          testMatch: `**/${VISUAL_SPEC}`,
          use: kioskDevice,
          // Nom de baseline indépendant du nom de projet, mais suffixé par la
          // plateforme : `mobile-se-login-win32.png`, `mobile-se-login-linux.png`.
          // Les deux jeux peuvent cohabiter dans le dépôt.
          snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
        }]
      : []),
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../../src/frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // Parité local/CI : en CI il n'y a pas de src/frontend/.env, donc pas de
        // VITE_BORNE_ID. On neutralise la valeur locale pour que le front prenne
        // dans les deux cas le chemin de production (borne_id en localStorage,
        // injecté par la fixture fixtures/borne-session.js).
        VITE_BORNE_ID: '',
        VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:3000',
        VITE_API_KEY: process.env.VITE_API_KEY || 'test-e2e-key',
      },
    },
  ],
})
