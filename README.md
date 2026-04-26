# Estimer Mes Aides

Application mobile WebView permettant aux utilisateurs d'estimer leurs aides à la rénovation énergétique, avec backend autonome, base de données dédiée et synchronisation manuelle vers un CRM.

## Structure

```
estimer-mes-aides/
├── src/
│   ├── backend/      # API REST — Node.js / Express / Prisma / PostgreSQL
│   └── frontend/     # SPA WebView — React 19 / Vite / TailwindCSS v4
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
cp .env.example .env   # remplir DATABASE_URL, JWT_SECRET, API_KEY_MOBILE
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

### Tests backend
```bash
cd src/backend
npm test               # 29 tests — configuration, submissions, health
```

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19 + Vite 8 + TailwindCSS v4 |
| Backend | Node.js + Express + Prisma v5 |
| Base de données | PostgreSQL (Supabase) |
| Auth | API Key (mobile) + JWT (CRM) |

## Phases

- [x] Phase 1 — Setup & Architecture
- [x] Phase 2 — Backend API (4 endpoints, 29 tests)
- [x] Phase 3 — Frontend WebView (15 étapes, mobile + tablette)
- [ ] Phase 4 — Module CRM Sync
- [ ] Phase 5 — Tests E2E & Déploiement

## Documentation

Voir le dossier [`docs/`](docs/) pour l'architecture complète, le cahier des charges, le plan de développement et le système de design.
