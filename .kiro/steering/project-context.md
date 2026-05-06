---
inclusion: always
---

# Estimer Mes Aides — Contexte Projet

## Vue d'ensemble
Plateforme multi-bornes pour l'estimation des aides à la rénovation énergétique. **V2 en cours de développement** — architecture multi-rôles (SuperAdmin / AdminBorne), formulaires dynamiques trilingues (FR/ES/EN), synchronisation CRM asynchrone via Pusher WebSocket.

## Architecture V2
```
[Tablette Android — Mode Kiosque]
        ↕ HTTPS + JWT AdminBorne
[Frontend Borne React/Vite — Vercel]
  https://estimer-mes-aides.vercel.app
        ↕ HTTPS + JWT
[Back-Office React/Vite — Vercel]
  src/backoffice/ (port 5175)
        ↕ HTTPS + JWT
[Backend Node.js/Express — Railway]
  https://estimer-mes-aides-production.up.railway.app
        ↕ SSL PostgreSQL
[Base de données PostgreSQL — Supabase]
        ↑ WebSocket
[Pusher — Notifications temps réel]
        ↑ HTTPS + JWT
[Module CRM V1 — Vercel] (conservé)
  https://crm-module-ivory.vercel.app
```

## Modules du projet
| Dossier | Rôle | Port local |
|---------|------|-----------|
| `src/backend/` | API REST Node.js + Express + Prisma V2 | 3000 |
| `src/frontend/` | SPA React — Front-Office Borne (kiosque) | 5173 |
| `src/backoffice/` | SPA React — Back-Office SuperAdmin + AdminBorne | 5175 |
| `src/crm-module/` | Interface sync CRM V1 (conservé) | 5174 |
| `android-webview/` | Wrapper Android natif (Kotlin) | — |
| `estimermesaidesapp/` | Wrapper Flutter | — |

## Statut V1 (production, ne pas casser)
- ✅ Backend API V1 : `/api/configuration`, `/api/submissions` (29 tests Jest)
- ✅ Frontend WebView V1 : formulaire 15 étapes
- ✅ Module CRM Sync V1

## Statut V2 (en développement — spec `.kiro/specs/estimer-mes-aides-v2/`)
- ✅ Phase 1 : Migration schéma Prisma (nouveaux modèles V2)
- ✅ Phase 2 : Auth multi-rôles (SuperAdmin, AdminBorne, JWT V2)
- ✅ Phase 3 : API CRUD (bornes, admin-bornes, formulaires, questions, enregistrements)
- 🔄 Phase 4 : Back-Office Frontend SuperAdmin
- ⏳ Phase 5 : Back-Office Frontend AdminBorne
- ⏳ Phase 6 : Front-Office Borne (refonte)
- ⏳ Phase 7 : Internationalisation trilingue
- ⏳ Phase 8 : Partage I-CRM asynchrone (Pusher)
- ⏳ Phase 9 : Tests, qualité, déploiement

## Commandes de développement
```bash
# Backend V2 (port 3000)
cd src/backend && npm run dev
cd src/backend && npm test          # 72+ tests Jest (V1 + V2)

# Frontend Borne (port 5173)
cd src/frontend && npm run dev

# Back-Office (port 5175)
cd src/backoffice && npm run dev

# CRM Sync V1 (port 5174)
cd src/crm-module && npm run dev

# Migration DB V2
cd src/backend && npx prisma migrate deploy

# Seed V2 (SuperAdmin + formulaire démo + borne démo)
cd src/backend && npm run prisma:seed
```

## Règles absolues — NE JAMAIS déroger
1. **Mobile-first** — touch targets ≥ 48px, font-size inputs ≥ 16px
2. **Offline-capable** — config en cache localStorage (24h TTL), soumissions en IndexedDB
3. **Vrais field IDs CRM** — utiliser 2087, 2088, 2089, 2090, 2294, 2293, etc. (jamais d'IDs inventés)
4. **Formulaire = 15 étapes** — source de vérité : `docs/CONTEXT.md`
5. **Champs obligatoires** — Nom (2087), Prénom (2088), CP (2089), Ville (2090), Revenu (2294), Statut (2293)
6. **UUID v4** pour tous les IDs
7. **synced=false** par défaut sur toute nouvelle soumission
8. **Couleur primaire V2** — `#5B2D8E` (PAS #5C2DD3 qui est V1 obsolète)
9. **Double validation** — côté client ET côté backend (Zod)
10. **HTTPS obligatoire** sur toutes les routes API en production
11. **Ne jamais casser les 29 tests V1** — rétrocompatibilité obligatoire
12. **Pas de window.open(), alert(), confirm()** dans le frontend (WebView)

## Rôles V2
| Rôle | JWT claim | Accès |
|------|-----------|-------|
| `SUPER_ADMIN` | `role: 'SUPER_ADMIN'` | Tout (bornes, formulaires, enregistrements, AdminBornes) |
| `ADMIN_BORNE` | `role: 'ADMIN_BORNE'` | Ses bornes assignées uniquement |

## Variables d'environnement (ne jamais committer)
```
# src/backend/.env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=978e0d21...
API_KEY_MOBILE=ema_mobile_3eab3e46...
API_KEY_CRM=ema_crm_3331f681...
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=eu
SUPERADMIN_EMAIL=admin@estimer-mes-aides.fr
SUPERADMIN_PASSWORD_TEMP=...

# src/frontend/.env
VITE_API_URL=http://localhost:3000
VITE_API_KEY=ema_mobile_3eab3e46...

# src/backoffice/.env
VITE_API_URL=http://localhost:3000
VITE_PUSHER_KEY=...
VITE_PUSHER_CLUSTER=eu
```
