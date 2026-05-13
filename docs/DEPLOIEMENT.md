# DEPLOIEMENT.md — Estimer Mes Aides
> Récapitulatif complet : architecture, URLs, accès, credentials, commandes de maintenance.
> Dernière mise à jour : 26 avril 2026

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
│              FRONTEND  (Vercel)                                 │
│         https://estimer-mes-aides.vercel.app                    │
│         React 19 + Vite 8 + TailwindCSS v4                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + x-api-key
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND API  (Railway)                             │
│    https://estimer-mes-aides-production.up.railway.app          │
│    Node.js 20 + Express + Prisma v5                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SSL PostgreSQL
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BASE DE DONNÉES  (Supabase)                        │
│         aws-1-eu-north-1.pooler.supabase.com                    │
│         PostgreSQL — projet : zxkshqviyzjigadruody              │
└─────────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTPS + JWT
┌─────────────────────────────────────────────────────────────────┐
│              MODULE CRM  (Vercel)                               │
│              https://crm-module-ivory.vercel.app                │
│              React 19 + Vite 8 + SheetJS                        │
└─────────────────────────────────────────────────────────────────┘
```

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

### API Keys (header `x-api-key`)

| Clé | Valeur | Usage |
|-----|--------|-------|
| Mobile | `ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6` | Frontend → Backend (POST soumissions, GET config) |
| CRM | `ema_crm_3331f681a90fd17d37b2d159f4e353a4` | Réservé (non utilisé en prod actuellement) |

### JWT Secret (signature des tokens CRM)

```
978e0d21dbab0b12d0e3e89d4f3e55d55a83a82d83a9a812132b77e0108c7cb3
```

### Générer un token JWT CRM (valable 24h)

```bash
cd src/backend && node scripts/generate-crm-jwt.js
```

Coller le token généré dans l'écran de connexion de https://crm-module-ivory.vercel.app

### Base de données Supabase

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | `postgresql://postgres.zxkshqviyzjigadruody:****@aws-1-eu-north-1.pooler.supabase.com:6543/postgres` (Transaction pooler — port 6543) |
| `DIRECT_URL` | `postgresql://postgres.zxkshqviyzjigadruody:****@aws-1-eu-north-1.pooler.supabase.com:5432/postgres` (Session pooler — port 5432, pour migrations) |

Mot de passe : `jH%21Bk%3FU9E%3F3%3F%245J` (URL-encodé) = `jH!Bk?U9E?3?$5J` (brut)

---

## Variables d'environnement

### Backend (Railway — configurées dans le dashboard Railway)

```env
DATABASE_URL=postgresql://postgres.zxkshqviyzjigadruody:jH%21Bk%3FU9E%3F3%3F%245J@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.zxkshqviyzjigadruody:jH%21Bk%3FU9E%3F3%3F%245J@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
JWT_SECRET=978e0d21dbab0b12d0e3e89d4f3e55d55a83a82d83a9a812132b77e0108c7cb3
API_KEY_MOBILE=ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6
API_KEY_CRM=ema_crm_3331f681a90fd17d37b2d159f4e353a4
NODE_ENV=production
NIXPACKS_NODE_VERSION=20
```

### Frontend (Vercel — projet estimer-mes-aides)

```env
VITE_API_URL=https://estimer-mes-aides-production.up.railway.app
VITE_API_KEY=ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6
```

### CRM Module (Vercel — projet crm-module)

```env
VITE_BACKEND_URL=https://estimer-mes-aides-production.up.railway.app
```

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

#### Pipeline automatique (recommandé)

**Architecture** : Railway et Vercel sont liés au repo GitHub. Un `push` sur `main` déclenche **en parallèle** :

- Railway → auto-deploy du backend (via son intégration Git, sans token)
- Vercel → auto-deploy des 3 apps (via son intégration Git, sans token)
- GitHub Actions [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) :

```
1. sync         → checkout + vérif lockfiles
2. tests        → npm test (491 tests Jest, V1 + V2)
3. migrate      → prisma migrate deploy sur Supabase (DIRECT_URL pooler 5432)
4. healthcheck  → curl /health (attend Railway max 5 min)
5. build-webview → APK Android (versionName ← src/frontend/package.json)
6. finalize     → tag git `deploy-YYYYMMDD-HHMMSS-<sha>` + summary
```

Déclenchement manuel avec options dans **GitHub → Actions → Deploy Production → Run workflow** :
- `skip_tests` (hotfix d'urgence)
- `skip_migration` (si déjà appliquée)
- `skip_healthcheck` (n'attend pas Railway)
- `skip_webview` (deploy web uniquement)

**Secrets GitHub requis** (Settings → Secrets and variables → Actions) :

| Catégorie | Secret | Statut |
|-----------|--------|--------|
| DB | `DATABASE_URL`, `DIRECT_URL` | obligatoire (migration + tests) |
| Backend | `JWT_SECRET`, `API_KEY_MOBILE`, `API_KEY_CRM`, `BACKEND_URL` | obligatoire (tests + healthcheck) |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | optionnel — sans → APK debug au lieu de release signé |

> **Railway / Vercel** : aucun token nécessaire — ces deux plateformes déploient via leur intégration Git native. Pour redéployer sans push, utiliser leurs dashboards respectifs ou le script local.

#### Pipeline local (scripts/deploy)

Copier [.env.deploy.example](../.env.deploy.example) en `.env.deploy` puis :

```powershell
# Windows
.\scripts\deploy.ps1                      # pipeline complet
.\scripts\deploy.ps1 -SkipWebview         # web uniquement
.\scripts\deploy.ps1 -SkipTests -SkipMigration  # redeploy rapide
```

```bash
# macOS / Linux
./scripts/deploy.sh
./scripts/deploy.sh --skip-webview
```

#### Déploiement par composant (manuel)

```bash
# Backend → Railway
cd src/backend && railway up

# Frontend → Vercel
cd src/frontend && npx vercel --prod

# CRM Module → Vercel
cd src/crm-module && npx vercel --prod

# Back-Office → Vercel
cd src/backoffice && npx vercel --prod

# Migration DB seule
cd src/backend && DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
```

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
