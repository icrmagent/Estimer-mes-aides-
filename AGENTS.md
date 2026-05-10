# AGENTS.md — Estimer Mes Aides V2

> Projet : Plateforme multi-bornes pour estimer les aides à la rénovation énergétique.
> Lire `docs/CONTEXT.md` pour le contexte métier complet.

---

## Statut V1 (production, ne pas casser)

```
Phase 1 — Setup & Architecture    ✅ Terminé
Phase 2 — Backend API             ✅ Terminé (4 endpoints, 29 tests Jest)
Phase 3 — Frontend WebView        ✅ Terminé (15 étapes, mobile + tablette)
Phase 4 — Module CRM Sync         ✅ Terminé (src/crm-module/, port 5174)
Phase 5 — Tests E2E & Déploiement ✅ Terminé (9 tests Playwright, CI/CD)
```

## Statut V2 (développement terminé)

```
Phase 1 — Migration schéma DB     ✅ Terminé (9 nouveaux modèles Prisma)
Phase 2 — Auth multi-rôles        ✅ Terminé (SUPER_ADMIN / ADMIN_BORNE)
Phase 3 — API CRUD V2             ✅ Terminé (25+ endpoints, 72+ tests)
Phase 4 — Back-Office SuperAdmin  ✅ Terminé (React + Vite, src/backoffice/)
Phase 5 — Back-Office AdminBorne  ✅ Terminé (cloisonnement données)
Phase 6 — Front-Office Borne      ✅ Terminé (formulaire dynamique, i18n, offline)
Phase 7 — Internationalisation    ✅ Terminé (FR/ES/EN, fallback FR)
Phase 8 — Partage I-CRM async     ✅ Terminé (Pusher + queue worker)
Phase 9 — Tests & Déploiement     ✅ Terminé
```

---

## Architecture V2

```
[Tablette Android — Mode Kiosque]
        ↕ HTTPS + JWT AdminBorne
[Frontend Borne :5173]  ←→  [Back-Office :5175]
        ↕ HTTPS + JWT
[Backend Node.js :3000]  ←→  [PostgreSQL Supabase]
        ↑ WebSocket
[Pusher — Notifications temps réel]
        ↑ HTTPS + JWT
[Module CRM V1 :5174] (conservé)
```

---

## Modules

| Dossier | Rôle | Port |
|---------|------|------|
| `src/backend/` | API REST Node.js + Express + Prisma V2 | 3000 |
| `src/frontend/` | Front-Office Borne (kiosque tablette) | 5173 |
| `src/backoffice/` | Back-Office SuperAdmin + AdminBorne | 5175 |
| `src/crm-module/` | Module CRM Sync V1 (conservé) | 5174 |

---

## Règles absolues (ne jamais déroger)

1. **Mobile-first** — touch targets ≥ 48px, font-size inputs ≥ 16px
2. **Offline-capable** — config localStorage TTL 24h, enregistrements IndexedDB
3. **Vrais field IDs CRM** — 2087, 2088, 2089, 2090, 2294, 2293… jamais d'IDs inventés
4. **Formulaire V1 = 15 étapes** — source de vérité : `docs/CONTEXT.md`
5. **Formulaire V2 = dynamique** — configurable depuis le back-office
6. **UUID v4** pour tous les IDs
7. **synced=false** par défaut sur toute nouvelle soumission V1
8. **Couleur primaire V2** — `#5B2D8E` (PAS #5C2DD3 qui est V1 obsolète)
9. **Double validation** — côté client ET côté backend (Zod)
10. **HTTPS obligatoire** sur toutes les routes API en production
11. **Ne jamais casser les 29 tests V1** — rétrocompatibilité obligatoire

---

## Commandes rapides

```bash
# Backend V2 (port 3000)
cd src/backend && npm run dev
cd src/backend && npm test          # 72+ tests Jest (V1 + V2)

# Frontend Borne (port 5173)
cd src/frontend && npm run dev

# Back-Office (port 5175)
cd src/backoffice && npm install && npm run dev

# CRM Sync V1 (port 5174)
cd src/crm-module && npm run dev

# Migration DB V2
cd src/backend && npx prisma migrate deploy

# Seed V2 (SuperAdmin + formulaire démo + borne démo)
cd src/backend && npm run prisma:seed

# Créer SuperAdmin en production
cd src/backend && node scripts/create-superadmin.js

# Générer un JWT CRM V1 (valable 24h)
cd src/backend && node scripts/generate-crm-jwt.js
```

---

## Variables d'environnement V2

```bash
# src/backend/.env — voir .env.example pour la liste complète
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=...
API_KEY_MOBILE=ema_mobile_...
API_KEY_CRM=ema_crm_...
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=eu
SUPERADMIN_EMAIL=admin@estimer-mes-aides.fr
SUPERADMIN_PASSWORD_TEMP=...

# src/backoffice/.env
VITE_API_URL=http://localhost:3000
VITE_PUSHER_KEY=...
VITE_PUSHER_CLUSTER=eu

# src/frontend/.env
VITE_API_URL=http://localhost:3000
VITE_API_KEY=ema_mobile_...
```

---

## Fichiers de référence

| Fichier | Contenu |
|---------|---------|
| `docs/CONTEXT.md` | Source de vérité formulaire V1 (15 étapes, field IDs CRM) |
| `.kiro/specs/estimer-mes-aides-v2/` | Spec V2 complète (requirements, design, tasks) |
| `.kiro/steering/` | Règles et standards du projet (backend, frontend, design) |
| `src/backend/prisma/schema.prisma` | Schéma DB V1 + V2 |
| `src/backend/src/routes/` | Tous les endpoints API |
