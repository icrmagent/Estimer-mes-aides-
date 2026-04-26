# Estimer Mes Aides

Application mobile WebView permettant aux utilisateurs d'estimer leurs aides à la rénovation énergétique, avec backend autonome, base de données dédiée et synchronisation manuelle vers un CRM.

## Structure

```
estimer-mes-aides/
├── src/
│   ├── backend/      # API REST — Node.js / Express / Prisma / PostgreSQL
│   ├── frontend/     # SPA WebView — React 19 / Vite / TailwindCSS v4
│   └── crm-module/   # Module sync CRM — React / Vite
├── tests/
│   └── e2e/          # Tests Playwright (form journey, offline, CRM sync)
├── docs/             # Documentation complète du projet
└── README.md
```

## Démarrage rapide

### Prérequis
- Node.js ≥ 20
- PostgreSQL (Supabase recommandé)

### Backend
```bash
cd src/backend
cp .env.example .env   # remplir DATABASE_URL, JWT_SECRET, API_KEY_MOBILE, API_KEY_CRM
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev            # http://localhost:3000
```

### Frontend
```bash
cd src/frontend
cp .env.example .env   # remplir VITE_API_URL, VITE_API_KEY
npm install
npm run dev            # http://localhost:5173
```

### Module CRM Sync
```bash
cd src/crm-module
cp .env.example .env   # remplir VITE_BACKEND_URL
npm install
npm run dev            # http://localhost:5174

# Générer un JWT pour le login CRM
cd ../backend && node scripts/generate-crm-jwt.js
```

## Tests

### Tests backend (Jest — 29 tests)
```bash
cd src/backend
npm test
```

### Tests E2E (Playwright)
```bash
cd tests/e2e
npm install
npx playwright install chromium
npm test            # tous les tests
npm run test:ui     # mode interactif
npm run report      # voir le dernier rapport HTML
```

Les tests E2E mock l'API backend — aucun backend réel n'est requis.

## Déploiement

### Backend → Railway

1. Connecter le dépôt GitHub à [Railway](https://railway.app)
2. Sélectionner le dossier `src/backend` comme root
3. Configurer les variables d'environnement :
   - `DATABASE_URL` — connection string Supabase (Session Pooler)
   - `JWT_SECRET`
   - `API_KEY_MOBILE`
   - `API_KEY_CRM`
   - `CORS_ORIGIN` — URL du frontend déployé
4. Railway détecte `railway.toml` et exécute `npm run prisma:deploy && npm start`

### Frontend → Vercel

1. Importer le dépôt sur [Vercel](https://vercel.com)
2. Définir **Root Directory** : `src/frontend`
3. Configurer les variables d'environnement :
   - `VITE_API_URL` — URL du backend Railway (ex: `https://estimer-mes-aides.railway.app`)
   - `VITE_API_KEY` — valeur de `API_KEY_MOBILE`
4. Le `vercel.json` configure automatiquement les rewrites SPA

### GitHub Actions CI

Les secrets à configurer dans **Settings → Secrets and variables → Actions** :

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Connection string Supabase |
| `JWT_SECRET` | Secret JWT backend |
| `API_KEY_MOBILE` | Clé API mobile |
| `API_KEY_CRM` | Clé API CRM |
| `VITE_API_URL` | URL backend prod (pour le build frontend) |
| `VITE_API_KEY` | Clé API mobile (pour le build frontend) |

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19 + Vite 8 + TailwindCSS v4 |
| Backend | Node.js + Express + Prisma v5 |
| Base de données | PostgreSQL (Supabase) |
| Auth | API Key (mobile) + JWT (CRM) |
| Tests unitaires | Jest + Supertest |
| Tests E2E | Playwright |
| CI | GitHub Actions |
| Deploy backend | Railway |
| Deploy frontend | Vercel |

## Phases

- [x] Phase 1 — Setup & Architecture
- [x] Phase 2 — Backend API (4 endpoints, 29 tests)
- [x] Phase 3 — Frontend WebView (15 étapes, mobile + tablette)
- [x] Phase 4 — Module CRM Sync
- [x] Phase 5 — Tests E2E & Déploiement

## Documentation

Voir le dossier [`docs/`](docs/) pour l'architecture complète, le cahier des charges, le plan de développement et le système de design.
