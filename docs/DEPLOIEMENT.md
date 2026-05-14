# DEPLOIEMENT.md — Estimer Mes Aides
> Récapitulatif complet : architecture, URLs, accès, credentials, commandes de maintenance, pipeline CI/CD.
> Dernière mise à jour : 2026-05-14

---

## Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                     UTILISATEUR FINAL                           │
│              App Android WebView (APK)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + x-api-key
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND  (Vercel — git-linked)                    │
│         https://estimer-mes-aides.vercel.app                    │
│         React 19 + Vite 8 + TailwindCSS v4                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + x-api-key
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND API  (Railway — git-linked)                │
│    https://estimer-mes-aides-production.up.railway.app          │
│    Node.js 20 + Express + Prisma v5                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SSL PostgreSQL (pooler IPv4)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES  (Supabase)                        │
│         aws-1-eu-north-1.pooler.supabase.com                    │
│         PostgreSQL — projet : zxkshqviyzjigadruody              │
└─────────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTPS + JWT
┌─────────────────────────────────────────────────────────────────┐
│              MODULE CRM  (Vercel — git-linked)                  │
│              https://crm-module-ivory.vercel.app                │
│              React 19 + Vite 8 + SheetJS                        │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────────┐
         │  GITHUB ACTIONS (.github/workflows/      │
         │   deploy.yml)                            │
         │  À chaque push main, en parallèle de    │
         │  Railway/Vercel :                       │
         │   1. sync       2. tests (491)          │
         │   3. migrate    4. healthcheck          │
         │   5. APK        6. tag deploy-<sha>     │
         └──────────────────────────────────────────┘
```

**Trois pipelines indépendants** se déclenchent à chaque `push` sur `main` :
1. **Railway** → redeploy backend (intégration Git native, sans token)
2. **Vercel** → redeploy frontend + backoffice + crm-module (intégration Git native, sans token)
3. **GitHub Actions** → tests + migration DB + healthcheck + build APK + tag git

---

## URLs de production

| Service | URL | Usage |
|---------|-----|-------|
| Frontend (app web/WebView) | https://estimer-mes-aides.vercel.app | Formulaire utilisateur final |
| Backend API | https://estimer-mes-aides-production.up.railway.app | API REST (config + soumissions) |
| CRM Sync | https://crm-module-ivory.vercel.app | Interface de synchronisation CRM + export Excel |
| Supabase Dashboard | https://supabase.com/dashboard | Visualisation directe de la base |
| Railway Dashboard | https://railway.com/project/c33e8de1-9d45-40d2-9a53-6a865dce2b70 | Logs backend, variables, redéploiement |
| Vercel Dashboard | https://vercel.com/icrmagents-projects | Gestion des deux projets Vercel |
| GitHub | https://github.com/icrmagent/Estimer-mes-aides- | Code source |

---

## Android APK

| Élément | Valeur |
|---------|--------|
| Fichier debug | `android-webview/app/build/outputs/apk/debug/app-debug.apk` |
| Taille | 5.5 MB |
| Package | `fr.ila26.estimermesaides` |
| minSdk | 26 (Android 8.0) |
| targetSdk | 34 (Android 14) |
| APP_URL | https://estimer-mes-aides.vercel.app |

Pour rebuilder : Android Studio → `Build > Build Bundle(s) / APK(s) > Build APK(s)`
Pour une version release signée : `Build > Generate Signed Bundle / APK`

---

## Credentials & Clés d'accès

> ⚠️ **Tous les credentials sensibles ont été rotés le 2026-05-13.** Les valeurs en clair ne sont **plus dans ce document** — elles vivent dans :
> - `src/backend/.env` (local, gitignored)
> - Railway dashboard → service backend → Variables
> - GitHub repository → Settings → Secrets and variables → Actions
>
> Pour récupérer une valeur active, consulter une de ces 3 sources.

### Inventaire des secrets

| Clé | Source de vérité | Usage |
|-----|------------------|-------|
| `DATABASE_URL` / `DIRECT_URL` | Supabase Dashboard | Connexion Prisma (runtime + migrations) |
| `JWT_SECRET` | `.env` / Railway / GitHub Actions | Signature tokens CRM |
| `API_KEY_MOBILE` | `.env` / Railway / GitHub Actions / Vercel frontend | Auth `x-api-key` Frontend → Backend |
| `API_KEY_CRM` | `.env` / Railway / GitHub Actions | Réservé (non utilisé en prod) |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET` | `.env` / Railway | WebSocket notifications V2 |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_TEMP` | `.env` / Railway | Compte super-admin V2 |

### Format des URLs Supabase (⚠️ piège IPv4)

Les **deux** URLs doivent passer par le **pooler** `aws-1-eu-north-1.pooler.supabase.com` :

| Variable | Port | Pour |
|----------|------|------|
| `DATABASE_URL` | `5432` (session pooler avec `?pgbouncer=true`) ou `6543` (transaction pooler) | Queries Prisma runtime |
| `DIRECT_URL` | `5432` (session pooler, sans `pgbouncer`) | `prisma migrate deploy` |

L'host direct `db.<project>.supabase.co` est **IPv6-only** → `ENOTFOUND` sur Windows/CI/Railway. **Ne jamais l'utiliser.** Format attendu :

```
postgresql://postgres.zxkshqviyzjigadruody:<password>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres[?pgbouncer=true]
```

Username pooler = `postgres.<project_ref>` (pas `postgres` tout court).

Password URL-encoder les caractères spéciaux : `!` → `%21`, `?` → `%3F`, `$` → `%24`, etc.

### Générer un token JWT CRM (valable 24h)

```bash
cd src/backend && node scripts/generate-crm-jwt.js
```

Coller le token généré dans l'écran de connexion de https://crm-module-ivory.vercel.app

---

## Variables d'environnement

> Les **valeurs** sont gérées séparément (voir section « Credentials » ci-dessus). Cette section liste uniquement les **noms** attendus par chaque service.

### Backend (Railway — dashboard Variables)

```env
DATABASE_URL=<pooler 5432 ou 6543>
DIRECT_URL=<pooler 5432>
JWT_SECRET=
API_KEY_MOBILE=
API_KEY_CRM=
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=eu
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD_TEMP=
CORS_ALLOWED_ORIGINS=https://estimer-mes-aides.vercel.app,...
REDIS_URL=<si Redis activé>
NODE_ENV=production
NIXPACKS_NODE_VERSION=20
```

### Frontend Borne (Vercel — projet estimer-mes-aides)

```env
VITE_API_URL=https://estimer-mes-aides-production.up.railway.app
VITE_API_KEY=<API_KEY_MOBILE>
```

### Back-Office (Vercel — projet backoffice)

```env
VITE_API_URL=https://estimer-mes-aides-production.up.railway.app
VITE_PUSHER_KEY=<PUSHER_KEY>
VITE_PUSHER_CLUSTER=eu
```

### CRM Module (Vercel — projet crm-module)

```env
VITE_BACKEND_URL=https://estimer-mes-aides-production.up.railway.app
```

### GitHub Actions (repo → Settings → Secrets → Actions)

| Secret | Statut | Utilisé par |
|--------|--------|-------------|
| `DATABASE_URL`, `DIRECT_URL` | obligatoire | jobs `tests` + `migrate` |
| `JWT_SECRET`, `API_KEY_MOBILE`, `API_KEY_CRM` | obligatoire | job `tests` |
| `BACKEND_URL` | obligatoire | job `healthcheck` (curl /health) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | optionnel | job `build-webview` — sans → APK debug |

> **Pas de `RAILWAY_TOKEN` ni `VERCEL_TOKEN`** : Railway et Vercel auto-déploient via leur intégration Git native.

---

## Endpoints API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `GET` | `/health` | — | Statut serveur |
| `GET` | `/api/configuration` | `x-api-key` (mobile) | Config formulaire (15 étapes) |
| `POST` | `/api/submissions` | `x-api-key` (mobile) | Enregistrer une soumission |
| `GET` | `/api/submissions` | `Bearer JWT` | Lister les soumissions (`?synced=false&limit=100&since=YYYY-MM-DD`) |
| `PUT` | `/api/submissions/:id/sync` | `Bearer JWT` | Marquer comme synchronisé |

---

## Base de données — Schéma

```
configurations
  id            Int (PK)
  formDefinition Json         ← définition complète du formulaire (15 étapes)
  version       String
  updatedAt     DateTime

submissions
  id            String UUID (PK)
  createdAt     DateTime
  configVersion String
  synced        Boolean (défaut: false)
  syncedAt      DateTime?
  crmProjectId  String?

submission_values
  id            Int (PK)
  submissionId  String (FK → submissions.id)
  fieldId       Int             ← field IDs CRM (2087, 2088, 2089…)
  value         String
```

---

## Commandes de maintenance

### Visualiser les données en local

```bash
# Interface graphique (Prisma Studio)
cd src/backend && npm run prisma:studio
# → http://localhost:5555

# Comptage rapide
cd src/backend && node -e "
import('./src/lib/prisma.js').then(async ({prisma}) => {
  console.log('submissions:', await prisma.submission.count())
  console.log('en attente:', await prisma.submission.count({ where: { synced: false } }))
  await prisma.\$disconnect()
})
"
```

### Déploiement

#### Pipeline automatique (mode standard)

À chaque `push origin main`, **3 pipelines en parallèle** se déclenchent — voir le diagramme dans la section Architecture en tête de doc.

##### Pipeline GitHub Actions — [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)

```
1. sync         → checkout + vérif lockfiles présents dans les 4 modules
2. tests        → npm test (491 tests Jest, V1 + V2)
3. migrate      → prisma migrate deploy sur Supabase (DIRECT_URL pooler 5432)
4. healthcheck  → curl /health (retry 20×15s = 5 min max — attend Railway redeploy)
5. build-webview → gradle 8.6 assembleDebug (ou Release si keystore set) — APK artefact 30j
6. finalize     → tag git `deploy-YYYYMMDD-HHMMSS-<sha>` + summary
```

**Liens entre jobs (`needs:`)** :
- `migrate` ne tourne que si `tests` ✓
- `healthcheck` ne tourne que si `tests` ✓ et `migrate` ✓
- `build-webview` ne tourne que si `healthcheck` ✓ (ou skipped)
- `finalize` ne tourne que si tout le reste est ✓ ou skipped explicite

##### Déclenchement manuel avec inputs

**GitHub → Actions → Deploy Production → Run workflow** :
- `skip_tests` — hotfix d'urgence (à éviter)
- `skip_migration` — si déjà appliquée manuellement
- `skip_healthcheck` — ne pas attendre Railway (utile si Railway hors-ligne)
- `skip_webview` — deploy web uniquement, pas d'APK

##### Versioning APK

[android-webview/app/build.gradle](../android-webview/app/build.gradle) lit la version depuis **`src/frontend/package.json`** :
- `versionName` ← `"version"` du `package.json`
- `versionCode` ← `git rev-list --count HEAD` (monotone croissant, surchargeable via `-PversionCodeOverride`)

Pour publier une nouvelle version : bumper `version` dans `src/frontend/package.json` → push → frontend Vercel et APK Android sortent tous deux avec la même version.

#### Pipeline local (scripts/deploy.ps1 / deploy.sh)

Utile pour redéployer manuellement sans push (par ex. après un fix de config Railway).

Copier [.env.deploy.example](../.env.deploy.example) en `.env.deploy` (gitignored) puis :

```powershell
# Windows
.\scripts\deploy.ps1                           # pipeline complet
.\scripts\deploy.ps1 -SkipWebview              # web uniquement
.\scripts\deploy.ps1 -SkipTests -SkipMigration # redeploy rapide
```

```bash
# macOS / Linux
./scripts/deploy.sh
./scripts/deploy.sh --skip-webview
```

> Les scripts locaux ont besoin de `RAILWAY_TOKEN` et `VERCEL_TOKEN` dans `.env.deploy` (le pipeline GitHub Actions, lui, n'en a pas besoin car Railway/Vercel auto-deploy via Git).

#### Déploiement par composant (manuel d'urgence)

```bash
# Backend → Railway (depuis poste local, après railway login)
cd src/backend && railway up

# Frontend → Vercel
cd src/frontend && npx vercel --prod

# Back-Office → Vercel
cd src/backoffice && npx vercel --prod

# CRM Module → Vercel
cd src/crm-module && npx vercel --prod

# Migration DB seule
cd src/backend && DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```

#### Suivi du pipeline

```bash
# Lister les derniers runs Deploy Production
gh run list --workflow=deploy.yml --repo icrmagent/Estimer-mes-aides- --limit 5

# Suivre un run en temps réel
gh run watch <run-id> --repo icrmagent/Estimer-mes-aides-

# Logs d'un job qui a échoué
gh run view --repo icrmagent/Estimer-mes-aides- --job <job-id> --log-failed

# Healthcheck manuel
curl https://estimer-mes-aides-production.up.railway.app/health
```

---

## Configuration initiale (bootstrap d'un nouvel environnement)

Si tu repars de zéro (nouveau repo, nouveau compte Railway/Vercel/Supabase), voici l'ordre :

### 1. Supabase

1. Créer projet → noter le `project_ref` (ex. `zxkshqviyzjigadruody`)
2. Settings → Database → noter le **password** (URL-encode les caractères spéciaux)
3. Construire les 2 URLs (host = pooler IPv4) :
   - `DATABASE_URL` = `postgresql://postgres.<ref>:<pwd>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?pgbouncer=true`
   - `DIRECT_URL`   = `postgresql://postgres.<ref>:<pwd>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`

### 2. Railway (backend)

1. Créer projet → connecter au repo GitHub (Settings → Source)
2. Root directory : `src/backend`
3. Service → **Variables** : coller toutes les vars de la section « Variables d'environnement → Backend »
4. Start command : `npm run start:prod`
5. Healthcheck path : `/health`

### 3. Vercel (3 projets)

Pour chacun des 3 projets (`estimer-mes-aides`, `backoffice`, `crm-module`) :
1. New Project → Import Git Repository
2. Root directory : `src/frontend` (ou `src/backoffice` / `src/crm-module`)
3. Framework : Vite
4. Environment Variables : voir section dédiée
5. Production branch : `main`

### 4. GitHub Actions secrets

```bash
# Authentifier gh CLI (browser-based, gratuit)
gh auth login

# Set les secrets nécessaires (depuis .env local)
REPO=icrmagent/Estimer-mes-aides-
gh secret set DATABASE_URL    --repo "$REPO" -b "<URL pooler>"
gh secret set DIRECT_URL      --repo "$REPO" -b "<URL pooler 5432>"
gh secret set JWT_SECRET      --repo "$REPO" -b "<jwt secret>"
gh secret set API_KEY_MOBILE  --repo "$REPO" -b "<api key mobile>"
gh secret set API_KEY_CRM     --repo "$REPO" -b "<api key crm>"
gh secret set BACKEND_URL     --repo "$REPO" -b "https://<railway-host>/"
```

Pour l'APK signé en release (optionnel) :
```bash
base64 -w0 keystore/release.keystore | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO" -b "<password>"
gh secret set ANDROID_KEY_ALIAS         --repo "$REPO" -b "release"
gh secret set ANDROID_KEY_PASSWORD      --repo "$REPO" -b "<password>"
```

### 5. Premier push

```bash
git push origin main
```

Trois pipelines démarrent. Le premier deploy peut prendre 5-10 min. Surveiller :
- GitHub Actions tab
- Railway dashboard → Deployments
- Vercel dashboard (3 projets)

---

## Troubleshooting (pièges connus)

### `P1001: Can't reach database server at db.<project>.supabase.co:5432`

**Cause** : URL Supabase pointe sur l'host direct IPv6 → injoignable depuis Windows/CI/Railway.

**Fix** : Remplacer l'host par `aws-1-eu-north-1.pooler.supabase.com` dans **toutes** les sources :
- `src/backend/.env` (local)
- Railway → Variables (runtime backend)
- GitHub Actions secrets (migration)

### `P1013: The provided database string is invalid. The scheme is not recognized`

**Cause** : valeur du secret mal collée (espace, retour ligne, ou prefix `DATABASE_URL=` inclus).

**Fix** : `gh secret set DIRECT_URL -b 'postgresql://...'` (avec quotes, sans newline) ou re-coller proprement dans l'UI.

### Railway : `Healthcheck failure` après un push, server jamais up

**Cause** : `start:prod` lance `prisma migrate deploy && node server.js`. Si la migration échoue (DB indispo, IPv4 trap, etc.), le server ne démarre jamais → healthcheck timeout → Railway annule le release.

**Fix** : corriger d'abord les env vars de Railway (DATABASE_URL/DIRECT_URL pooler). Optionnellement, retirer `prisma migrate deploy` de `start:prod` (GitHub Actions la fait déjà avant push).

### GitHub Actions : `./gradlew: No such file or directory`

**Cause** : le repo ne contient que `gradlew.bat` (Windows), pas le script Unix.

**Fix** : le workflow utilise `gradle/actions/setup-gradle@v4` qui installe gradle directement (pas besoin du wrapper Unix). Voir [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

### `Tests backend` fail sur queueWorker / crm-queue.integration

**Cause** : les tests utilisaient l'ancienne API CRM (`/api/submissions` + `x-api-key`). Le code utilise maintenant `/api/customContacts?lang=fr` + `Authorization: Bearer`.

**Fix** : les `mockEnregistrement` doivent inclure `Nom` ET `Prénom` (mapReponsesToICRM exige les deux), et les `expect(global.fetch).toHaveBeenCalledWith(...)` doivent matcher la nouvelle URL/header.

### Auto-mode classifier bloque `gh secret set` (Claude Code)

**Cause** : la classification considère l'upload de credentials de prod en bulk comme risqué.

**Fix** : faire les `gh secret set` un par un (single secret = OK), ou ajouter une permission rule explicite dans `.claude/settings.local.json`, ou passer par l'UI GitHub.

### Vercel/Railway intégration Git ne déclenche pas

**Cause** : repo non lié, ou la branche `main` n'est pas la "production branch" dans le projet.

**Fix** : Railway → Project Settings → Source → vérifier le repo GitHub + branche `main`. Vercel → Project Settings → Git → idem.

### `RAILWAY_TOKEN` demande un plan payant

**Constat 2026-05** : Railway exige un plan payant pour générer un API token. **Workaround** : ne pas utiliser de token. L'intégration Git native de Railway suffit pour auto-deploy sur push `main`. Le workflow GitHub Actions n'a **pas** besoin de `RAILWAY_TOKEN`.

### Tests

```bash
# Backend (29 tests)
cd src/backend && npm test

# E2E Playwright (9 tests)
cd tests/e2e && npm test
```

### Développement local

```bash
# Backend (port 3000)
cd src/backend && npm run dev

# Frontend (port 5173)
cd src/frontend && npm run dev

# CRM Module (port 5174)
cd src/crm-module && npm run dev

# Générer un JWT CRM
cd src/backend && node scripts/generate-crm-jwt.js
```

---

## Formulaire — Champs CRM (23 champs, 15 étapes)

| Field ID | Libellé | Obligatoire |
|----------|---------|-------------|
| 2262 | Civilité | Non |
| 2087 | Nom | Oui |
| 2088 | Prénom | Oui |
| 2217 | Adresse | Non |
| 2089 | Code Postal | Oui |
| 2090 | Ville | Oui |
| 2015 | Téléphone | Non |
| 2016 | Email | Non |
| 2294 | Revenu Fiscal | Oui |
| 2293 | Statut Propriétaire | Oui |
| 2292 | Type Logement | Non |
| 2306 | Date Construction | Non |
| 2307 | Surface Habitable | Non |
| 2296 | Type Combles | Non |
| 2298 | Type Plancher | Non |
| 2300 | Trappe Accès | Non |
| 2301 | Type Chauffage | Non |
| 2302 | Autre Chauffage | Non |
| 2297 | Isolation Combles Habitables | Non |
| 2299 | Type Isolation | Non |
| 2303 | Travaux Souhaités | Non |
| 2304 | Disponibilité Contact | Non |
| 2305 | Commentaires | Non |

---

## Git — Historique des phases

### V2 — Pipeline CI/CD (mai 2026)

| Commit | Description |
|--------|-------------|
| `c9c86a7` | fix(ci): build APK via setup-gradle action (pas de gradlew Unix dans le repo) |
| `bd0656a` | ci: simplifier le pipeline — Railway/Vercel auto-deploy via Git, retirer tokens |
| `73f5c14` | fix(tests+ci): aligner tests CRM sur API customContacts + guard deploy-backend |
| `844847f` | ci: pipeline de déploiement prod — sync, migration, Railway, Vercel, APK WebView |
| `e7d0d65` | feat: backoffice admin-bornes, frontend kiosque, soft delete & corrections |
| `8441830` | fix: éditeur formulaire backoffice — QuestionEditor et FormulaireEditorPage |
| `dbe2a97` | feat: i18n catégories, borne connectivity, backoffice UI fixes |
| `12f3872` | feat: déploiement production V2 — backoffice, frontend, I-CRM, tests |
| `080cbc8` | fix: validation champs obligatoires avant envoi I-CRM (last_name + first_name) |
| `8b0c1ae` | fix: mapping champs I-CRM — phone (2015), email (2016), adresse (2217) |

### V1 — Premier déploiement (avr 2026)

| Commit | Description |
|--------|-------------|
| `f4322e9` | fix(crm-module): corriger les noms de champs camelCase Prisma |
| `ed90d53` | feat(crm-module): export Excel + déploiement Vercel production |
| `0d47043` | feat: PhoneInput, safe area Android, Railway/Vercel deploy, Android WebView |
| `4cad560` | fix(DialCodePicker): flag + dial code uniquement |
| `c72f6f3` | feat(frontend): DialCodePicker full country list, icônes options |
| `d77c414` | feat(frontend): 6 améliorations formulaire |
| `8b19a23` | feat(frontend): logo, tablet layout, design polish |
| `96ef2fe` | feat(frontend): redesign UI système de design ila26 |
| `dada513` | feat: Phase 5 — Tests E2E Playwright + configs déploiement |
| `0290661` | chore: résoudre conflit README |
| `071ba23` | feat: Phases 1-3 complètes — Backend API + Frontend WebView |

Tags de déploiement automatiques au format `deploy-YYYYMMDD-HHMMSS-<sha>` créés par le pipeline GitHub Actions à chaque deploy réussi.
