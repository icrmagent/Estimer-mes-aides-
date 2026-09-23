# DEPLOIEMENT.md — Estimer Mes Aides
> Récapitulatif complet : architecture, URLs, accès, credentials, commandes de maintenance, pipeline CI/CD.
> Dernière mise à jour : 2026-09-02 (bascule Railway → Render, correction du faux
> positif « Supabase supprimé »)

> ✅ **CORRECTION 2026-09-02 — le projet Supabase n'a JAMAIS été supprimé.**
> Une version antérieure de ce document affirmait le contraire. C'était un **faux
> positif** : l'audit concluait à la suppression sur la foi d'un `NXDOMAIN` lors de la
> résolution de l'host Supabase, causé par une **panne DNS du poste d'audit** — pas par
> une suppression côté Supabase.
>
> Re-mesuré le 2026-09-02 depuis le dépôt (`src/backend` + `.env` local) :
>
> ```
> $ npx prisma migrate status
> Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-eu-north-1.pooler.supabase.com:5432"
> 15 migrations found in prisma/migrations
> Following migration have not yet been applied:
> 20260902000000_fix_schema_drift_canaux_crmfieldids_borneid
>
> $ SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
> TABLES_PUBLIC=19
> _prisma_migrations, admin_bornes, bornes, canaux, categories_question, configurations,
> enregistrement_reponses, enregistrements, formulaire_versions, formulaires,
> login_attempts, partage_jobs, questions, refresh_tokens, revoked_tokens,
> sous_categories_question, submission_values, submissions, super_admins
> ```
>
> **La base de production est vivante et son schéma est complet (19 tables).** Les 14
> premières migrations sont appliquées ; seule `20260902000000_fix_schema_drift_…`
> reste à déployer. **Aucune procédure de recréation de base ne doit être lancée.**

> ⚠️ **Railway est abandonné — le backend est hébergé sur Render.**
> Le service Railway est détaché et ne reviendra pas.
>
> | Paramètre | Valeur |
> |-----------|--------|
> | URL backend de production | **https://estimer-mes-aides-api.onrender.com** |
> | Service Render | `estimer-mes-aides-api` (id `srv-dac30kbm8hqs73eb1d20`) |
> | Plan / région | **free** / **frankfurt** |
> | Root directory | `src/backend` |
> | Health check path | `/health` |
> | Auto-deploy | `autoDeployTrigger: commit` sur `main`, dépôt public `icrmagent/Estimer-mes-aides-` |
> | Blueprint versionné | `src/backend/render.yaml` (remplace `railway.json` / `railway.toml`, supprimés) |
>
> Les deux frontends restent sur Vercel (`estimer-mes-aides` et
> `estimer-mes-aides-wjp3`) et leurs variables pointent déjà sur l'URL Render.
> Contrainte du plan free à connaître avant exploitation :
> [Plan free Render — veille et réveil](#plan-free-render--veille-et-réveil).

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
│         BACKEND API  (Render — git-linked, plan free)           │
│         https://estimer-mes-aides-api.onrender.com              │
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
│              (Module CRM V1 supprimé 2026-05 —                  │
│               remplacé par partage async backend + I-CRM)       │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────────┐
         │  GITHUB ACTIONS (.github/workflows/      │
         │   deploy.yml)                            │
         │  À chaque push main, en parallèle de    │
         │  Render/Vercel :                        │
         │   1. sync       2. tests (503)          │
         │   3. migrate    4. healthcheck          │
         │   5. APK        6. tag deploy-<sha>     │
         └──────────────────────────────────────────┘
```

**Trois pipelines indépendants** se déclenchent à chaque `push` sur `main` :
1. **Render** → redeploy backend (autoDeploy Git natif sur `main`, sans token)
2. **Vercel** → redeploy frontend + backoffice (intégration Git native, sans token)
3. **GitHub Actions** → tests + migration DB + healthcheck + build APK + tag git

---

## URLs de production

| Service | URL | Usage | Note (2026-09-02) |
|---------|-----|-------|-------------------|
| Frontend Borne (app web/WebView) | https://estimer-mes-aides.vercel.app | Formulaire utilisateur final | Vercel |
| **Back-Office** (SuperAdmin + AdminBorne) | **https://estimer-mes-aides-wjp3.vercel.app** | Administration bornes, formulaires, enregistrements | Vercel |
| **Backend API** | **https://estimer-mes-aides-api.onrender.com** | API REST (config + soumissions) | **Render**, plan free — 1er appel après veille : ~50 s |
| Supabase Dashboard | https://supabase.com/dashboard | Visualisation directe de la base | **projet vivant** — 19 tables, schéma complet |
| Render Dashboard | https://dashboard.render.com | Logs backend, variables, redéploiement | service `estimer-mes-aides-api` (`srv-dac30kbm8hqs73eb1d20`) |
| Vercel Dashboard | https://vercel.com/icrmagents-projects | Gestion des deux projets Vercel | inchangé |
| GitHub | https://github.com/icrmagent/Estimer-mes-aides- | Code source | dépôt public |

> ❌ **URLs mortes — ne plus jamais les réutiliser** :
> `https://estimer-mes-aides-production.up.railway.app` (backend Railway, service
> détaché) et le dashboard Railway associé. Toute occurrence restante dans le dépôt
> est un vestige à corriger, pas une adresse de secours.

> **Provenance de l'URL back-office** : le nom de projet Vercel est lu dans
> [src/backoffice/.vercel/project.json](../src/backoffice/.vercel/project.json)
> (`"projectName":"estimer-mes-aides-wjp3"`) et confirmé par
> `src/backend/.env.example` qui autorise `https://estimer-mes-aides-wjp3.vercel.app`
> dans `CORS_ALLOWED_ORIGINS`.

> ❌ **URL obsolète — `https://backoffice.estimer-mes-aides.vercel.app` n'existe pas.**
> `curl` échoue en erreur 35 (échec de handshake TLS, aucun certificat servi).
> Ce nom d'hôte traîne encore dans `src/backend/README.md` (ligne 59, exemple
> `CORS_ALLOWED_ORIGINS`) : ne jamais le réutiliser, il ne pointe sur rien.

---

## Plan free Render — veille et réveil

Le service backend tourne sur le **plan free** de Render. C'est un **choix assumé**,
pas un défaut à corriger — mais il impose une contrainte d'exploitation à connaître :

| Comportement | Valeur |
|--------------|--------|
| Mise en veille de l'instance | après **15 minutes** sans aucune requête HTTP |
| Réveil au premier appel suivant | **~50 secondes** |
| Appels suivants | latence normale, tant que le trafic ne s'interrompt pas 15 min |

**Conséquences concrètes**

- Une **borne allumée après une période creuse** (nuit, week-end, réouverture d'un
  point de vente) verra sa toute première requête — `GET /api/bornes/:id/config` —
  mettre environ 50 s à répondre. La borne n'est pas en panne : elle attend le réveil.
  Prévoir un écran d'attente et ne pas conclure trop vite à une coupure réseau.
- Le job `healthcheck` du pipeline GitHub Actions absorbe déjà ce délai : il boucle
  `20 × 15 s` (5 min max), largement au-dessus des ~50 s de réveil.
- Un `curl /health` « à froid » qui met ~50 s à répondre est **nominal**. Seul un
  échec après ce délai signale un vrai incident.
- Le cache de configuration côté borne (localStorage, TTL 24 h) et la file offline
  IndexedDB amortissent la veille : une borne déjà initialisée continue de
  fonctionner et rejoue ses envois au réveil du backend.

> Pour supprimer la veille il faudrait passer sur un plan payant Render. Tant que ce
> n'est pas décidé, **documenter et attendre** est la conduite correcte.

---

## Android APK

> Section re-vérifiée le 2026-09-02 : chemin, taille et URL chargée corrigés
> (les trois valeurs précédemment documentées étaient fausses).

| Élément | Valeur | Source vérifiée |
|---------|--------|-----------------|
| APK livré (release) | `android-webview/app/build/outputs/apk/release/EstimerMesAides.apk` | `find` sur le dépôt |
| Taille | **1 836 858 octets** (1,75 Mio) | `stat -c %s` |
| Dernier APK produit | `artifacts/apk-prod-806b69c/release/EstimerMesAides v2.apk` — 1 838 658 octets, 2026-05-24, commit `806b69c` | `find -printf '%s'` |
| Package | `fr.ila26.estimermesaides` (`applicationId`, build.gradle:44) | `android-webview/app/build.gradle` |
| minSdk / targetSdk / compileSdk | 26 (Android 8.0) / 34 (Android 14) / 34 | `android-webview/app/build.gradle` |
| versionName | lu dans `src/frontend/package.json` → **2.0.0** | `build.gradle:16-21` |
| versionCode | `-PversionCodeOverride` sinon `git rev-list --count HEAD` (**59** au 2026-09-02) | `build.gradle:23-36` |
| **URL chargée par la WebView** | **`https://appassets.androidplatform.net/index.html`** — assets **embarqués dans l'APK**, pas l'URL Vercel | [MainActivity.kt:24](../android-webview/app/src/main/java/fr/ila26/estimermesaides/MainActivity.kt) |

### ⚠️ L'APK ne charge PAS l'URL Vercel

`MainActivity.kt` ligne 24 :

```kotlin
private val APP_URL = "https://appassets.androidplatform.net/index.html"
```

`appassets.androidplatform.net` est le domaine virtuel de `WebViewAssetLoader`
(déclaré ligne 86 : `.setDomain("appassets.androidplatform.net")`). Il **ne sort
jamais sur le réseau** : il sert le contenu de `android-webview/app/src/main/assets/`,
c'est-à-dire le build Vite du front borne, copié dans l'APK par le job
`build-webview` du pipeline :

```yaml
# .github/workflows/deploy.yml — étape « Copy frontend dist → android assets »
rm -rf android-webview/app/src/main/assets
mkdir -p android-webview/app/src/main/assets
cp -r src/frontend/dist/* android-webview/app/src/main/assets/
```

**Conséquence opérationnelle** : redéployer Vercel ne met **pas** à jour les bornes.
Le seul lien de l'APK vers l'infra est `VITE_API_URL` / `VITE_API_KEY`, figés **au
moment du `npm run build`** dans le bundle JS embarqué. Changer d'URL backend impose
donc de **rebuilder et redistribuer l'APK**.

> 🛑 **Les assets APK versionnés pointent encore sur l'URL Railway morte.** Vérifié le
> 2026-09-02 :
>
> ```bash
> $ grep -o "https://[a-z0-9.-]*railway[a-z0-9.-]*" \
>     android-webview/app/src/main/assets/assets/index-4YduKVL2.js | sort -u
> https://estimer-mes-aides-production.up.railway.app
> ```
>
> Tant que le front n'est pas rebuildé avec
> `VITE_API_URL=https://estimer-mes-aides-api.onrender.com` puis recopié dans
> `android-webview/app/src/main/assets/`, **toute borne installée avec cet APK appelle
> un backend qui n'existe plus**. C'est l'étape 7 de la reprise après sinistre, et elle
> est bloquante pour la livraison terrain.

### Chemins de build

| Variante | Chemin de sortie | Présent dans le dépôt ? |
|----------|------------------|--------------------------|
| release (keystore présent) | `android-webview/app/build/outputs/apk/release/` | oui |
| debug (pas de keystore) — `applicationIdSuffix .debug`, `versionNameSuffix -debug` | `android-webview/app/build/outputs/apk/debug/` | **non — répertoire inexistant** |

Le chemin `android-webview/app/build/outputs/apk/debug/app-debug.apk` documenté
jusqu'ici n'existe pas dans l'arborescence.

### Rebuild

```bash
# 1. Build du front avec les variables de la cible (elles sont figées dans le bundle)
cd src/frontend
VITE_API_URL=<url backend> VITE_API_KEY=<API_KEY_MOBILE> npm run build

# 2. Copie du dist dans les assets Android
cd ../..
rm -rf android-webview/app/src/main/assets
mkdir -p android-webview/app/src/main/assets
cp -r src/frontend/dist/* android-webview/app/src/main/assets/

# 3. Build APK (le dépôt ne contient que gradlew.bat — pas de wrapper Unix)
cd android-webview
gradle assembleRelease --no-daemon -PversionCodeOverride=$(git rev-list --count HEAD)
# sans keystore/keystore.properties → gradle assembleDebug
```

Alternative : GitHub → Actions → **Deploy Production** → *Run workflow* (le job
`build-webview` fait les 3 étapes et publie l'APK en artefact, rétention 30 j).
Via Android Studio : `Build > Generate Signed Bundle / APK` — mais **après** avoir
copié le `dist` du front à l'étape 2, sinon l'APK embarque un front périmé.

---

## Chiffres de référence (mesurés le 2026-09-02)

> Ces valeurs sont **mesurées**, pas estimées. Les chiffres qui circulaient
> auparavant dans la doc (29 tests backend, 72+ tests V2, 9 tests E2E) étaient faux
> ou périmés. Re-lancer les commandes ci-dessous avant de modifier ce tableau.
>
> **Re-mesuré le 2026-09-23** (écran de veille) : tests, routes et migrations.
> Tags et commits sont restés à la mesure du 2026-09-02.

| Périmètre | Mesure | Commande |
|-----------|--------|----------|
| Backend Jest — suite complète | **634 tests / 38 suites** | `cd src/backend && npm test` |
| Backend Jest — rétrocompat V1 | **41 tests / 3 suites** | `npx jest --testPathPattern="tests/(submissions\|configuration\|services/submission)"` |
| Frontend Borne — Vitest | **139 tests / 11 fichiers** | `cd src/frontend && npm test` |
| Back-Office — Vitest | **82 tests / 5 fichiers** | `cd src/backoffice && npm test` |
| E2E — Playwright | **69 tests / 4 specs** | `cd tests/e2e && npx playwright test --list` |
| Routes API backend | **74 handlers / 14 fichiers** | voir bloc ci-dessous |
| Migrations Prisma | **16** | `ls -d src/backend/prisma/migrations/*/ \| wc -l` |
| Tags git | **25**, tous `deploy-*`, **0 semver** | `git tag -l \| wc -l` |
| Commits sur `main` | **59** | `git rev-list --count HEAD` |

> ⚠️ Le total backend a évolué pendant l'audit lui-même (491 → 596 tests, toujours
> 35 suites) : des tests ont été ajoutés à une suite existante en parallèle. Ce nombre
> est un **plancher qui monte** — en cas de doute, c'est la commande qui fait foi, pas
> le chiffre écrit ici.

Comptage des routes — le motif doit exiger un **littéral de chemin** après la
parenthèse, sinon il ramasse aussi des appels comme `cacheService.delete(...)` :

```bash
grep -rhoE "\.(get|post|put|patch|delete)\(['\"]" src/backend/src/routes | wc -l   # 74
grep -rcE  "\.(get|post|put|patch|delete)\(['\"]" src/backend/src/routes          # détail par fichier
```

Tous les matches sont bien des définitions `<nom>Router.<méthode>('/chemin')`.

### Écarts de couverture connus

- **Back-Office : 1 seul fichier testé (`src/services/pusherService.test.js`) pour
  39 fichiers source.** Aucune page, aucun composant, aucun garde-fou de
  cloisonnement AdminBorne n'est couvert. C'est le plus gros trou du dépôt.
  Compté le 2026-09-02 avec :
  `find src/backoffice/src -name '*.jsx' -o -name '*.js' | grep -v '.test.' | wc -l`
- La règle projet « ne jamais casser les tests V1 » porte sur **41** tests, pas 29.
  Le libellé « 29 » venait de la Phase 2 V1 et n'a jamais été remis à jour.

### Sortie brute de référence

```
Test Suites: 35 passed, 35 total          # src/backend — npm test
Tests:       503 passed, 503 total

Test Suites: 3 passed, 3 total            # src/backend — rétrocompat V1
Tests:       41 passed, 41 total

 Test Files  4 passed (4)                 # src/frontend — npm test
      Tests  66 passed (66)

 Test Files  1 passed (1)                 # src/backoffice — npm test
      Tests  36 passed (36)

Total: 69 tests in 4 files                # tests/e2e — playwright test --list
```

---

## Credentials & Clés d'accès

> ⚠️ **Tous les credentials sensibles ont été rotés le 2026-05-13.** Les valeurs en clair ne sont **plus dans ce document** — elles vivent dans :
> - `src/backend/.env` (local, gitignored)
> - Render dashboard → service `estimer-mes-aides-api` → **Environment**
> - GitHub repository → Settings → Secrets and variables → Actions
>
> Pour récupérer une valeur active, consulter une de ces 3 sources.

### Inventaire des secrets

| Clé | Source de vérité | Usage |
|-----|------------------|-------|
| `DATABASE_URL` / `DIRECT_URL` | Supabase Dashboard | Connexion Prisma (runtime + migrations) |
| `JWT_SECRET` | `.env` / Render / GitHub Actions | Signature tokens CRM |
| `API_KEY_MOBILE` | `.env` / Render / GitHub Actions / Vercel frontend | Auth `x-api-key` Frontend → Backend |
| `API_KEY_CRM` | `.env` / Render / GitHub Actions | Réservé (non utilisé en prod) |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET` | `.env` / Render | WebSocket notifications V2 |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_TEMP` | `.env` / Render | Compte super-admin V2 |

### Format des URLs Supabase (⚠️ piège IPv4)

Les **deux** URLs doivent passer par le **pooler** `aws-1-eu-north-1.pooler.supabase.com` :

| Variable | Port | Pour |
|----------|------|------|
| `DATABASE_URL` | `5432` (session pooler avec `?pgbouncer=true`) ou `6543` (transaction pooler) | Queries Prisma runtime |
| `DIRECT_URL` | `5432` (session pooler, sans `pgbouncer`) | `prisma migrate deploy` |

L'host direct `db.<project>.supabase.co` est **IPv6-only** → `ENOTFOUND` sur Windows/CI/Render. **Ne jamais l'utiliser.** Format attendu :

```
postgresql://postgres.zxkshqviyzjigadruody:<password>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres[?pgbouncer=true]
```

Username pooler = `postgres.<project_ref>` (pas `postgres` tout court).

Password URL-encoder les caractères spéciaux : `!` → `%21`, `?` → `%3F`, `$` → `%24`, etc.

### Générer un token JWT CRM legacy (valable 24h)

```bash
cd src/backend && node scripts/generate-crm-jwt.js
```

Utilité résiduelle : tests manuels d'auth Bearer sur les routes legacy `GET /api/submissions?synced=false` et `PUT /api/submissions/:id/sync`. Le module CRM frontend (V1) qui consommait ces routes a été supprimé en 2026-05 — remplacé par le partage I-CRM async backend (V2 Phase 8, [src/backend/src/services/queueWorker.js](../src/backend/src/services/queueWorker.js)).

---

## Variables d'environnement

> Les **valeurs** sont gérées séparément (voir section « Credentials » ci-dessus). Cette section liste uniquement les **noms** attendus par chaque service.

### Backend (Render — dashboard → service `estimer-mes-aides-api` → Environment)

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
SUPABASE_URL=https://<projet>.supabase.co     # optionnel — médias écran de veille
SUPABASE_SERVICE_ROLE_KEY=                    # optionnel — serveur uniquement
REDIS_URL=<si Redis activé>
NODE_ENV=production
```

> `NIXPACKS_NODE_VERSION=20` était **spécifique au builder Nixpacks de Railway** :
> sans objet sur Render. Côté Render, `src/backend/render.yaml` déclare
> `NODE_VERSION: "20"` et `buildCommand: npm ci` (le `postinstall` du `package.json`
> déclenche `prisma generate`). Les autres variables y sont en `sync: false` :
> **leurs valeurs se saisissent dans le dashboard, jamais dans le dépôt**.

### Frontend Borne (Vercel — projet estimer-mes-aides)

```env
VITE_API_URL=https://estimer-mes-aides-api.onrender.com
VITE_API_KEY=<API_KEY_MOBILE>
```

### Back-Office (Vercel — projet backoffice)

```env
VITE_API_URL=https://estimer-mes-aides-api.onrender.com
VITE_PUSHER_KEY=<PUSHER_KEY>
VITE_PUSHER_CLUSTER=eu
```

### GitHub Actions (repo → Settings → Secrets → Actions)

| Secret | Statut | Utilisé par |
|--------|--------|-------------|
| `DATABASE_URL`, `DIRECT_URL` | obligatoire | jobs `tests` + `migrate` |
| `JWT_SECRET`, `API_KEY_MOBILE`, `API_KEY_CRM` | obligatoire | job `tests` |
| `BACKEND_URL` | obligatoire | job `healthcheck` (curl /health) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | optionnel | job `build-webview` — sans → APK debug |

> **Aucun token de déploiement n'est nécessaire** (ni côté Render, ni côté Vercel) :
> les deux plateformes auto-déploient via leur intégration Git native — `autoDeploy`
> sur `main` pour le service Render `estimer-mes-aides-api`.

---

## Endpoints API

> Le tableau ci-dessous ne couvre que les **5 routes V1** (rétrocompatibilité).
> Le backend en expose **74 au total sur 14 fichiers** de `src/backend/src/routes/`
> (bornes, formulaires, questions, canaux, enregistrements, partage, dashboard,
> admin-bornes, ecrans-veille, auth…). Référence exhaustive : `src/backend/src/routes/`.

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
2. tests        → npm test (596 tests Jest, V1 + V2)
3. migrate      → prisma migrate deploy sur Supabase (DIRECT_URL pooler 5432)
4. healthcheck  → curl /health (retry 20×15s = 5 min max — attend le redeploy Render,
                  et absorbe le réveil ~50 s du plan free)
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
- `skip_healthcheck` — ne pas attendre Render (utile si le service est hors-ligne)
- `skip_webview` — deploy web uniquement, pas d'APK

##### Versioning APK

[android-webview/app/build.gradle](../android-webview/app/build.gradle) lit la version depuis **`src/frontend/package.json`** :
- `versionName` ← `"version"` du `package.json`
- `versionCode` ← `git rev-list --count HEAD` (monotone croissant, surchargeable via `-PversionCodeOverride`)

Pour publier une nouvelle version : bumper `version` dans `src/frontend/package.json` → push → frontend Vercel et APK Android sortent tous deux avec la même version.

#### Pipeline local (scripts/deploy.ps1 / deploy.sh)

Utile pour redéployer manuellement sans push (par ex. après un fix de config Render).

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

> ⚠️ **Ces scripts datent de l'ère Railway.** `scripts/deploy.ps1` (ligne 79) et
> `scripts/deploy.sh` (lignes 54-55) exigent encore `RAILWAY_TOKEN` et lancent
> `npx @railway/cli up` ; `.env.deploy.example` (ligne 8) déclare toujours
> `RAILWAY_TOKEN=`. Railway étant abandonné, **l'étape backend de ces scripts est
> caduque** : le backend se déploie par `git push origin main` (autoDeploy Render).
> Le pipeline GitHub Actions, lui, n'a jamais eu besoin du moindre token.

#### Déploiement par composant (manuel d'urgence)

```bash
# Backend → Render : aucune CLI requise, autoDeploy sur push `main`.
# Redeploy manuel : dashboard Render → estimer-mes-aides-api → Manual Deploy
git push origin main

# Frontend → Vercel
cd src/frontend && npx vercel --prod

# Back-Office → Vercel
cd src/backoffice && npx vercel --prod

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
curl https://estimer-mes-aides-api.onrender.com/health   # ~50 s si l'instance dormait
```

---

## Configuration initiale (bootstrap d'un nouvel environnement)

Si tu repars de zéro (nouveau repo, nouveau compte Render/Vercel/Supabase), voici l'ordre :

### 1. Supabase

1. Créer projet → noter le `project_ref` (ex. `zxkshqviyzjigadruody`)
2. Settings → Database → noter le **password** (URL-encode les caractères spéciaux)
3. Construire les 2 URLs (host = pooler IPv4) :
   - `DATABASE_URL` = `postgresql://postgres.<ref>:<pwd>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?pgbouncer=true`
   - `DIRECT_URL`   = `postgresql://postgres.<ref>:<pwd>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`

### 2. Render (backend)

> ⚠️ **À faire AVANT de créer le service** : connecter GitHub à l'espace de travail
> Render (Dashboard → Settings → GitHub → *Configure*). Un service créé avant cette
> connexion ne peut pas cloner le dépôt — piège détaillé à
> l'[Étape 4 de la reprise après sinistre](#étape-4--recréer-le-service-render-backend).

1. New → **Web Service** → *Build and deploy from a Git repository* → `icrmagent/Estimer-mes-aides-`
2. **Root Directory** : `src/backend`
3. Région **frankfurt**, branche `main`, plan **free**
4. **Environment** : coller toutes les vars de la section « Variables d'environnement → Backend »
5. Build command `npm ci`, start command `npm run start:prod`, **Health Check Path** `/health`
6. Ces réglages sont portés par le blueprint versionné `src/backend/render.yaml`
   (`railway.json` et `railway.toml` ont été supprimés du dépôt)

### 3. Vercel (3 projets)

Pour chacun des 2 projets (`estimer-mes-aides`, `backoffice`) :
1. New Project → Import Git Repository
2. Root directory : `src/frontend` (ou `src/backoffice`)
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
gh secret set BACKEND_URL     --repo "$REPO" -b "https://estimer-mes-aides-api.onrender.com/"
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
- Render dashboard → service `estimer-mes-aides-api` → Events / Logs
- Vercel dashboard (3 projets)

---

## Reprise après sinistre

> ⚠️ **Cette section est une procédure de secours, PAS un état des lieux.**
> Elle avait été écrite en supposant un « incident 2026-09 : projet Supabase supprimé
> + service Railway détaché ». Un seul de ces deux points était vrai :
>
> | Affirmation d'origine | Réalité vérifiée le 2026-09-02 |
> |-----------------------|--------------------------------|
> | Projet Supabase supprimé | **FAUX** — base vivante, 19 tables, schéma complet. Le constat reposait sur un `NXDOMAIN` dû à une panne DNS locale. |
> | Service Railway détaché | **VRAI** — Railway est abandonné ; le backend est passé sur **Render**. |
>
> Les étapes 1 et 2 (recréation puis migration de la base) **ne sont donc pas à jouer
> aujourd'hui** : elles restent documentées pour le jour où une base serait
> réellement perdue.
>
> Chaque étape ci-dessous référence un fichier ou un script qui **existe réellement**
> dans le dépôt. Durée estimée bout en bout : 60 à 90 min.

### Ce qui est perdu vs ce qui est récupérable

> Tableau **hypothétique** : il décrit ce qui se passerait si la base était réellement
> perdue. Au 2026-09-02, elle ne l'est pas — voir l'état réel sous le tableau.

| Élément | État si la base était réellement perdue | Récupération |
|---------|------------------------------------------|--------------|
| Code applicatif | intact (git) | rien à faire |
| Schéma DB | intact | 15 migrations dans `src/backend/prisma/migrations/` |
| **Données de production** (bornes, enregistrements, utilisateurs) | perdues sans dump Supabase | irrécupérables sans sauvegarde externe |
| Secrets | perdus avec le projet | à **régénérer** (étape 3) |
| Front borne / back-office Vercel | assets encore servis | redeploy après changement de `VITE_API_URL` |
| APK installés sur les bornes | pointent sur l'ancienne URL backend, figée au build | **rebuild + redistribution obligatoires** si l'URL change |

**État réel au 2026-09-02** : base Supabase vivante (19 tables), 14 migrations sur 15
appliquées, backend migré de Railway vers Render. Seuls les points liés à
l'**hébergement backend** (étapes 4, 6, 7, 8) ont réellement été rejoués.

---

### Étape 0 — Constat

```bash
curl -o /dev/null -w "%{http_code}\n" https://estimer-mes-aides.vercel.app
curl -o /dev/null -w "%{http_code}\n" https://estimer-mes-aides-wjp3.vercel.app
curl -o /dev/null -w "%{http_code} en %{time_total}s\n" --max-time 90 https://estimer-mes-aides-api.onrender.com/health
```

`/health` doit renvoyer `200`.

⚠️ **Deux faux positifs à écarter avant de conclure au sinistre :**

1. **Réveil du plan free Render** — la première requête après 15 min d'inactivité met
   ~50 s à revenir. Toujours interroger `/health` avec `--max-time 90` : un timeout
   court produirait un « backend HS » purement imaginaire.
2. **Résolution DNS du poste** — un `NXDOMAIN` sur l'host Supabase ou Render ne prouve
   **rien** sur l'état du service distant. C'est exactement l'erreur qui a fait
   déclarer, à tort, le projet Supabase supprimé. Contrôler d'abord :

```bash
nslookup aws-1-eu-north-1.pooler.supabase.com
nslookup estimer-mes-aides-api.onrender.com
cd src/backend && npx prisma migrate status   # verdict qui fait foi pour l'état de la base
```

Ce n'est qu'après ces deux contrôles qu'un code autre que `200` (404, 502, timeout
au-delà de 90 s) vaut constat de panne.

---

### Étape 1 — Recréer la base Supabase

> 🛑 **NE PAS EXÉCUTER aujourd'hui.** La base de production est vivante (19 tables,
> schéma complet). Créer un nouveau projet Supabase ferait perdre les données réelles.
> Cette étape ne vaut que si `npx prisma migrate status` échoue **après** avoir écarté
> le faux positif DNS de l'Étape 0.

1. Nouveau projet Supabase, région **eu-north-1** (cohérente avec le host pooler documenté).
2. Noter le `project_ref` et le mot de passe DB — URL-encoder les caractères spéciaux
   (`!` → `%21`, `?` → `%3F`, `$` → `%24`, `@` → `%40`, `#` → `%23`).
3. Construire les 2 URLs — **host pooler obligatoire**. L'host direct
   `db.<ref>.supabase.co` est IPv6-only et donne `P1001` depuis Windows / CI / Render :

```
DATABASE_URL = postgresql://postgres.<ref>:<pwd>@aws-1-<region>.pooler.supabase.com:5432/postgres?pgbouncer=true
DIRECT_URL   = postgresql://postgres.<ref>:<pwd>@aws-1-<region>.pooler.supabase.com:5432/postgres
```

4. Vérifier la connexion depuis le poste local avant d'aller plus loin :

```bash
cd src/backend
npx prisma migrate status    # doit lister les 15 migrations comme non appliquées
```

---

### Étape 2 — Appliquer le schéma

```bash
cd src/backend
npm ci
npx prisma generate
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```

> `migrate deploy` **doit** passer par `DIRECT_URL` (pooler session, port 5432).
> Le port 6543 (transaction pooler) ne supporte pas les migrations.

Contrôle : `npx prisma migrate status` doit répondre « Database schema is up to date! ».

> **État mesuré le 2026-09-02 sur la base de production** : 14 des 15 migrations sont
> appliquées ; il reste `20260902000000_fix_schema_drift_canaux_crmfieldids_borneid`.
> Sortie brute :
>
> ```
> 15 migrations found in prisma/migrations
> Following migration have not yet been applied:
> 20260902000000_fix_schema_drift_canaux_crmfieldids_borneid
> ```
>
> Cette migration est **idempotente** et ne supprime ni colonne ni donnée (elle rattrape
> 5 écarts de schéma : `submissions.borneId`, `questions."crmFieldIds"`, table `canaux`,
> index unique résiduel `categories_question_nom_key`, renommage
> `enregistrements_createdAt_idx`). Le job `migrate` du pipeline l'applique au prochain
> push sur `main`.

---

### Étape 3 — Régénérer les secrets

Aucun secret ne doit être réutilisé après un sinistre. Régénérer, ne pas recopier :

| Variable | Comment la produire | Contrainte |
|----------|---------------------|------------|
| `JWT_SECRET` | 48 octets aléatoires en hex (`crypto.randomBytes(48).toString('hex')`) | **>= 32 caractères**, contrôlé au démarrage en production |
| `API_KEY_MOBILE` | préfixe `ema_mobile_` + 24 octets aléatoires en hex | doit être identique à `VITE_API_KEY` côté front |
| `API_KEY_CRM` | préfixe `ema_crm_` + idem | requis même si non utilisé en prod |
| `SUPERADMIN_PASSWORD_TEMP` | mot de passe fort | **>= 8 caractères** (contrôlé par `scripts/create-superadmin.js`) |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` | dashboard Pusher — nouvelle app si l'ancienne est perdue | `PUSHER_CLUSTER=eu` |

Variables **requises au démarrage** — leur absence provoque un `process.exit(1)` dans
[src/backend/src/lib/validateEnv.js](../src/backend/src/lib/validateEnv.js) :

```
DATABASE_URL  DIRECT_URL  JWT_SECRET  API_KEY_MOBILE  API_KEY_CRM
PUSHER_APP_ID  PUSHER_KEY  PUSHER_SECRET  PUSHER_CLUSTER
CORS_ALLOWED_ORIGINS  NODE_ENV  SUPERADMIN_EMAIL
```

Optionnelles (warning seulement) : `REDIS_URL`, `SENTRY_DSN`, `PRIMARY_COLOR`
(défaut `#5B2D8E`).

Optionnelles, non vérifiées au démarrage : la clé Supabase — lue sous
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_KEY` ou
`SUPABASE_KEY`, format JWT ou `sb_secret_…` —, `SUPABASE_URL` (déduite de `DATABASE_URL`
si absente) et `SUPABASE_STORAGE_BUCKET` (défaut `ecrans-veille`). Sans elles,
`POST /api/ecrans-veille/medias/signature` répond **503 `STORAGE_NOT_CONFIGURED`** et le
back-office n'accepte que des URLs HTTPS pour les médias de l'écran de veille. Le bucket
public est créé automatiquement au premier envoi.

Liste complète des noms attendus : [src/backend/.env.example](../src/backend/.env.example).

---

### Étape 4 — Recréer le service Render (backend)

> 🕳️ **PIÈGE VÉCU — à lire avant de créer quoi que ce soit.**
> Un service Render créé **par l'API** alors que GitHub n'est pas encore connecté à
> l'espace de travail **ne peut pas cloner le dépôt**. Le déploiement échoue sur :
>
> ```
> It looks like we don't have access to your repo
> ```
>
> Le message ne dit **pas où corriger** : la connexion GitHub ne se règle ni dans le
> service, ni dans le blueprint, mais au niveau de l'**espace de travail** — Render
> Dashboard → **Settings → GitHub → Configure** → autoriser le dépôt
> `icrmagent/Estimer-mes-aides-`. Une fois l'autorisation posée, relancer un deploy
> suffit : le service n'est pas à recréer.
>
> **Ordre correct : connecter GitHub à l'espace de travail D'ABORD, créer le service
> ENSUITE.** Le dépôt est public, ce qui ne dispense pas de l'autorisation.

1. Render Dashboard → **New → Web Service** → *Build and deploy from a Git repository*
   → `icrmagent/Estimer-mes-aides-` (GitHub déjà connecté, cf. encadré ci-dessus).
2. **Name** : `estimer-mes-aides-api` — **Root Directory** : `src/backend`
3. **Region** : `frankfurt` — **Branch** : `main` — **Instance type** : `free`
4. **Health Check Path** : `/health` — **Auto-Deploy** : activé (`autoDeployTrigger: commit`)
5. **Environment** → coller toutes les variables de l'étape 3, **plus** :
   - `CORS_ALLOWED_ORIGINS=https://estimer-mes-aides.vercel.app,https://estimer-mes-aides-wjp3.vercel.app`
   - `NODE_ENV=production`
   - (`NIXPACKS_NODE_VERSION` était propre à Railway : **ne pas la reporter**)
6. Noter l'URL publique : `https://estimer-mes-aides-api.onrender.com`
   (service id `srv-dac30kbm8hqs73eb1d20`).

> **Ce qui est versionné vs ce qui ne l'est pas.** `src/backend/render.yaml` porte le
> blueprint de build et de déploiement (service, plan, région, `rootDir`,
> `healthCheckPath: /health`, `autoDeploy`, start command `npm run start:prod` =
> `prisma migrate deploy && node server.js`). Les anciens `src/backend/railway.json` et
> `src/backend/railway.toml` ont été **supprimés** : ils décrivaient le builder Nixpacks
> de Railway et n'ont plus aucun effet.
> En revanche, **rien de ce qui suit n'est dans le dépôt** et doit être fait à la main
> dans le dashboard : les **valeurs des variables d'environnement**, la **connexion
> GitHub de l'espace de travail** et l'**autorisation du dépôt**. Un `git push` seul
> ne reconstruit donc pas le service.

Contrôle :

```bash
curl -fsS --max-time 90 https://estimer-mes-aides-api.onrender.com/health
```

Rappel plan free : la toute première réponse après une veille prend ~50 s — ce n'est
pas un échec. Si le healthcheck échoue **au-delà** de ce délai et que le serveur ne
démarre jamais, `start:prod` bloque sur `prisma migrate deploy` : corriger
`DATABASE_URL` / `DIRECT_URL` d'abord (voir Troubleshooting `P1001`).

---

### Étape 5 — Seed et compte SuperAdmin

Depuis un poste dont `src/backend/.env` porte les mêmes valeurs que Render :

```bash
cd src/backend

# 1. Configuration formulaire V1 + jeu de démo V2
npm run prisma:seed                  # prisma/seed.js

# 2. Compte SuperAdmin — idempotent, met à jour le mot de passe s'il existe déjà
#    Requiert SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD_TEMP
node scripts/create-superadmin.js

# 3. Optionnel — borne + AdminBorne de démo
node scripts/seed-borne.js

# 4. Optionnel — formulaire métier personnalisé
node scripts/seed-custom-form.js
```

> **PIÈGE — `npm run prisma:seed` réécrit `src/frontend/.env` sans prévenir.**
> `src/backend/prisma/seed.js` résout `path.resolve(__dirname, '../../frontend/.env')`
> (ligne 10) puis, en fin de seed, **écrit dans ce fichier** :
>
> ```js
> const nextLine = `VITE_BORNE_ID="${borneId}"`                   // seed.js:1168
> envContent = envContent.replace(/VITE_BORNE_ID=.*/, nextLine)   // seed.js:1171
> fs.writeFileSync(frontendEnvPath, envContent)                   // seed.js:1176
> ```
>
> Autrement dit : **quiconque lance `npm run prisma:seed` modifie silencieusement la
> configuration du frontend local**, en pointant la borne du poste sur la borne de démo
> qui vient d'être créée. Le seul indice est une ligne de log
> (« Frontend .env mis à jour avec le VITE_BORNE_ID de la borne demo »).
>
> Conséquences pratiques :
> - un `npm run dev` du front après un seed ouvre la **borne de démo**, pas celle sur
>   laquelle on travaillait ;
> - si `src/frontend/.env` est absent, le script se contente d'un avertissement
>   (« Frontend .env introuvable ») et ne crée rien ;
> - `src/frontend/.env` étant gitignoré, la modification ne remonte dans aucun
>   `git status` — elle passe totalement inaperçue.
>
> **Réflexe** : sauvegarder `src/frontend/.env` avant un seed et vérifier
> `VITE_BORNE_ID` après. Ne jamais lancer `prisma:seed` depuis un poste dont
> `src/backend/.env` pointe sur la base de production.

Contrôle : se connecter au back-office avec `SUPERADMIN_EMAIL`, puis changer le mot de
passe temporaire immédiatement.

---

### Étape 6 — Redéployer les frontends (Vercel)

Les deux projets Vercel survivent au sinistre mais **pointent sur l'ancienne URL
backend**, figée dans le bundle au moment du build. Il faut mettre à jour la variable
**puis forcer un rebuild** — un redeploy depuis le cache ne suffit pas.

| Projet Vercel | Root directory | Variables à mettre à jour |
|---------------|----------------|---------------------------|
| `estimer-mes-aides` (front borne) | `src/frontend` | `VITE_API_URL`, `VITE_API_KEY` |
| `estimer-mes-aides-wjp3` (back-office) | `src/backoffice` | `VITE_API_URL`, `VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER` |

```bash
# Dashboard : Settings → Environment Variables, puis
# Deployments → ... → Redeploy en décochant « Use existing Build Cache »

# ou en CLI :
cd src/frontend   && npx vercel --prod
cd src/backoffice && npx vercel --prod
```

Le routing SPA est assuré par les `vercel.json` présents dans les deux modules.

Contrôle : ouvrir le back-office et se connecter. S'il affiche les bornes, la chaîne
front → backend → DB est rétablie.

---

### Étape 7 — Rebuild et redistribution de l'APK

**Obligatoire dès que l'URL backend change** : l'APK embarque le front et son
`VITE_API_URL` (voir la section Android APK). Les bornes déjà déployées restent
inutilisables tant qu'elles n'ont pas reçu le nouvel APK.

```bash
cd src/frontend
VITE_API_URL=https://estimer-mes-aides-api.onrender.com VITE_API_KEY=<API_KEY_MOBILE> npm run build

cd ../..
rm -rf android-webview/app/src/main/assets
mkdir -p android-webview/app/src/main/assets
cp -r src/frontend/dist/* android-webview/app/src/main/assets/

cd android-webview
gradle assembleRelease --no-daemon -PversionCodeOverride=$(git rev-list --count HEAD)
```

Ou via **GitHub → Actions → Deploy Production → Run workflow**, une fois le secret
`BACKEND_URL` mis à jour : le job `build-webview` publie l'APK en artefact (rétention 30 j).

Puis installer l'APK sur chaque tablette borne (sideload ou MDM).

---

### Étape 8 — Remettre le pipeline en état

Secrets GitHub Actions à réécrire (repo → Settings → Secrets and variables → Actions) :

```bash
REPO=icrmagent/Estimer-mes-aides-
gh secret set DATABASE_URL   --repo "$REPO"   # pooler
gh secret set DIRECT_URL     --repo "$REPO"   # pooler port 5432
gh secret set JWT_SECRET     --repo "$REPO"
gh secret set API_KEY_MOBILE --repo "$REPO"
gh secret set API_KEY_CRM    --repo "$REPO"
gh secret set BACKEND_URL    --repo "$REPO"   # https://estimer-mes-aides-api.onrender.com/
```

> Les poser **un par un** : le classifieur auto-mode de Claude Code bloque les uploads
> de credentials en bulk.

Déclencher ensuite un run `workflow_dispatch` avec `skip_webview: true` et vérifier que
la chaîne `sync → tests → migrate → healthcheck → finalize` passe.

---

### Étape 9 — Validation de bout en bout

```bash
# 1. Suites de tests (aucune régression V1)
cd src/backend   && npm test        # attendu : 503 passed / 35 suites
cd ../frontend   && npm test        # attendu : 66 passed / 4 fichiers
cd ../backoffice && npm test        # attendu : 36 passed / 1 fichier

# 2. Parcours utilisateur réel
cd ../../tests/e2e && npm test      # attendu : 69 tests

# 3. Contrôles manuels
#    - back-office : login SuperAdmin, création d'une borne
#    - front borne : parcours formulaire complet jusqu'à la confirmation
#    - back-office : l'enregistrement remonte bien
#    - APK sur tablette : mêmes contrôles hors Wi-Fi, puis reconnexion (sync offline)
```

---

### Prévenir la prochaine fois

- [ ] Activer les **sauvegardes automatiques** Supabase — aucune n'est exploitable à ce jour. (La suppression du projet, elle, n'a jamais eu lieu : c'était un faux positif DNS. L'absence de sauvegarde, en revanche, est bien réelle.)
- [ ] **Avant de déclarer un service mort, écarter le DNS du poste** : un `NXDOMAIN` local avait fait conclure à tort à la suppression du projet Supabase.
- [ ] Exporter un dump régulier hors Supabase : `pg_dump "$DIRECT_URL" > backup-$(date +%F).sql`.
- [ ] Conserver l'inventaire des secrets dans un gestionnaire dédié : ni dans le repo, ni dans ce fichier.
- [ ] Poser un tag semver à chaque release (`git tag -a vX.Y.Z`) : il n'en existe aucun aujourd'hui.
- [ ] Ne jamais supprimer un projet Supabase ni un service Render sans avoir relu ce document.

---

## Troubleshooting (pièges connus)

### `P1001: Can't reach database server at db.<project>.supabase.co:5432`

**Cause** : URL Supabase pointe sur l'host direct IPv6 → injoignable depuis Windows/CI/Render.

**Fix** : Remplacer l'host par `aws-1-eu-north-1.pooler.supabase.com` dans **toutes** les sources :
- `src/backend/.env` (local)
- Render → service `estimer-mes-aides-api` → Environment (runtime backend)
- GitHub Actions secrets (migration)

### `P1013: The provided database string is invalid. The scheme is not recognized`

**Cause** : valeur du secret mal collée (espace, retour ligne, ou prefix `DATABASE_URL=` inclus).

**Fix** : `gh secret set DIRECT_URL -b 'postgresql://...'` (avec quotes, sans newline) ou re-coller proprement dans l'UI.

### Render : `Health check failed` après un push, server jamais up

**Cause** : `start:prod` lance `prisma migrate deploy && node server.js`. Si la migration échoue (DB indispo, piège IPv4, etc.), le serveur ne démarre jamais → health check en échec → Render annule le déploiement.

**Fix** : corriger d'abord les variables du service Render (`DATABASE_URL` / `DIRECT_URL` sur le pooler). Optionnellement, retirer `prisma migrate deploy` de `start:prod` (le job `migrate` de GitHub Actions l'exécute déjà).

**À ne pas confondre** avec le réveil du plan free : un premier appel qui met ~50 s puis répond `200` est nominal.

### Render : « It looks like we don't have access to your repo »

**Cause** : le service a été créé — typiquement via l'API — alors que **GitHub n'était pas connecté à l'espace de travail** Render. Render ne peut alors pas cloner `icrmagent/Estimer-mes-aides-`, même si le dépôt est public.

**Piège** : le message ne dit pas où corriger. L'autorisation ne se règle ni dans le service, ni dans `render.yaml`, mais au niveau de l'espace de travail.

**Fix** : Render Dashboard → **Settings → GitHub → Configure** → autoriser le dépôt, puis relancer un deploy. Le service n'est pas à recréer.

### Faux positif : un `NXDOMAIN` pris pour une suppression de projet

**Cause** : une panne DNS **locale au poste d'audit** fait échouer la résolution de l'host Supabase (ou Render). L'outil en conclut « projet supprimé / service injoignable » alors que rien n'a bougé côté fournisseur. C'est l'erreur qui a fait écrire, à tort, que le projet Supabase avait été supprimé.

**Contrôle** avant tout diagnostic :

```bash
nslookup aws-1-eu-north-1.pooler.supabase.com
nslookup estimer-mes-aides-api.onrender.com
cd src/backend && npx prisma migrate status     # seule sortie qui fait foi pour la base
```

Un `migrate status` qui répond est la preuve que la base est vivante, quoi qu'en dise le résolveur DNS du poste.

### `npm run prisma:seed` a changé la borne de mon front local

**Cause** : `src/backend/prisma/seed.js` écrit `VITE_BORNE_ID` dans `src/frontend/.env` (`fs.writeFileSync`, ligne 1176 ; chemin résolu ligne 10). Le fichier étant gitignoré, la modification n'apparaît dans aucun `git status`.

**Fix** : rouvrir `src/frontend/.env` et remettre le `VITE_BORNE_ID` voulu. Détail complet : [Reprise après sinistre, Étape 5](#étape-5--seed-et-compte-superadmin).

### GitHub Actions : `./gradlew: No such file or directory`

**Cause** : le repo ne contient que `gradlew.bat` (Windows), pas le script Unix.

**Fix** : le workflow utilise `gradle/actions/setup-gradle@v4` qui installe gradle directement (pas besoin du wrapper Unix). Voir [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

### `Tests backend` fail sur queueWorker / crm-queue.integration

**Cause** : les tests utilisaient l'ancienne API CRM (`/api/submissions` + `x-api-key`). Le code utilise maintenant `/api/customContacts?lang=fr` + `Authorization: Bearer`.

**Fix** : les `mockEnregistrement` doivent inclure `Nom` ET `Prénom` (mapReponsesToICRM exige les deux), et les `expect(global.fetch).toHaveBeenCalledWith(...)` doivent matcher la nouvelle URL/header.

### Auto-mode classifier bloque `gh secret set` (Claude Code)

**Cause** : la classification considère l'upload de credentials de prod en bulk comme risqué.

**Fix** : faire les `gh secret set` un par un (single secret = OK), ou ajouter une permission rule explicite dans `.claude/settings.local.json`, ou passer par l'UI GitHub.

### Vercel/Render : l'intégration Git ne déclenche pas

**Cause** : dépôt non lié, ou la branche `main` n'est pas la branche de déploiement du projet.

**Fix** : Render → service `estimer-mes-aides-api` → Settings → *Repository* / *Branch*, et **Auto-Deploy** activé. Vercel → Project Settings → Git → idem.

### Historique : `RAILWAY_TOKEN` demandait un plan payant

**Constat 2026-05**, conservé pour mémoire : Railway exigeait un plan payant pour générer un token API ; le contournement était de s'appuyer sur l'intégration Git native, sans token.

**Aujourd'hui sans objet** : Railway est abandonné. Render auto-déploie de la même façon sur push `main`, et le workflow GitHub Actions n'a besoin d'**aucun** token de déploiement — seulement du secret `BACKEND_URL` pour le job `healthcheck`.

### Tests

Chiffres re-mesurés le 2026-09-02 — voir la section
[Chiffres de référence](#chiffres-de-référence-mesurés-le-2026-09-02).

```bash
# Backend — 634 tests / 38 suites (V1 + V2)
cd src/backend && npm test

# Backend — rétrocompatibilité V1 seule : 41 tests / 3 suites
cd src/backend && npx cross-env NODE_OPTIONS=--experimental-vm-modules   npx jest --forceExit --testPathPattern="tests/(submissions|configuration|services/submission)"

# Frontend Borne — 66 tests / 4 fichiers (Vitest)
cd src/frontend && npm test

# Back-Office — 36 tests / 1 fichier (Vitest)
cd src/backoffice && npm test

# E2E Playwright — 69 tests / 4 specs
cd tests/e2e && npm test
```

### Développement local

```bash
# Backend (port 3000)
cd src/backend && npm run dev

# Frontend Borne (port 5173)
cd src/frontend && npm run dev

# Back-Office (port 5175)
cd src/backoffice && npm run dev

# Générer un JWT CRM legacy (pour tester routes /api/submissions Bearer)
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

> 📌 Les messages de commit ci-dessous mentionnent Railway : c'était l'hébergeur
> **de l'époque**. Ce sont des libellés git réels, conservés tels quels. Depuis le
> 2026-09-02, le backend est sur **Render** — voir l'en-tête de ce document.

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

> ⚠️ Les SHAs listés ici jusqu'au 2026-09-02 (`f4322e9`, `ed90d53`, `0d47043`,
> `4cad560`, `c72f6f3`, `d77c414`, `8b19a23`, `96ef2fe`, `dada513`, `0290661`)
> **ne sont plus atteignables depuis `main`** — vérifié avec
> `git merge-base --is-ancestor <sha> main`. Ce sont des commits orphelins d'un
> rebase. Les SHAs ci-dessous sont ceux de l'historique réel de `main`.

| Commit | Date | Description |
|--------|------|-------------|
| `10a5d16` | 2026-04-26 | feat(ios): projet WebView iOS — SwiftUI + WKWebView |
| `55c70d0` | 2026-04-26 | docs: récapitulatif complet déploiement |
| `951b792` | 2026-04-26 | fix(crm-module): noms de champs camelCase Prisma |
| `5dbe0df` | 2026-04-26 | feat(crm-module): export Excel + déploiement Vercel production |
| `27a17d7` | 2026-04-26 | feat: PhoneInput, safe area Android, Railway/Vercel deploy, Android WebView |
| `17dc867` | 2026-04-26 | fix(DialCodePicker): flag + dial code uniquement |
| `1ebcd45` | 2026-04-26 | feat(frontend): DialCodePicker full country list, icônes options |
| `bf1ca3f` | 2026-04-26 | feat(frontend): 6 améliorations formulaire |
| `7c72d1a` | 2026-04-26 | feat(frontend): logo, tablet layout, design polish |
| `e14c093` | 2026-04-26 | feat(frontend): redesign UI système de design ila26 |
| `df040ab` | 2026-04-26 | feat: Phase 5 — Tests E2E Playwright + configs déploiement |
| `471bd36` | 2026-04-26 | chore: résoudre conflit README |
| `071ba23` | 2026-04-26 | feat: Phases 1-3 complètes — Backend API + Frontend WebView |
| `29c1201` | 2026-04-24 | Initial commit |

### Tags

25 tags au 2026-09-02 (`git tag -l | wc -l`), **tous** au format
`deploy-YYYYMMDD-HHMMSS-<sha>` posés par le job `finalize` du pipeline.
Du premier `deploy-20260513-234223-c9c86a7` au dernier
`deploy-20260524-055603-806b69c`.

⚠️ **Aucun tag semver.** `git tag -l 'v*'` renvoie 0 résultat, alors que le commit
`b8562e4` est intitulé `release(v2.0.0)` et que `src/frontend/package.json` déclare
`"version": "2.0.0"`. La version 2.0.0 n'est donc identifiable que par le message de
commit — poser `git tag -a v2.0.0 b8562e4` reste à faire.

Historique détaillé : voir [CHANGELOG.md](../CHANGELOG.md).
