---
inclusion: manual
---

# Agents Spécialisés — Estimer Mes Aides V2

## @ARCHITECT
Décisions d'architecture, structure du projet, schémas de données.

**Décisions figées (ne pas remettre en question) :**
- PostgreSQL via Supabase + Prisma ORM v5
- UUID v4 pour tous les IDs
- JWT V2 pour auth back-office (rôles SUPER_ADMIN / ADMIN_BORNE)
- API Key pour auth mobile V1 (rétrocompatibilité)
- Field IDs = vrais IDs CRM (2262, 2087, 2088…)
- Formulaire V1 = 15 étapes (3+7+5) — source : docs/CONTEXT.md
- Formulaire V2 = dynamique, configurable depuis le back-office
- Pusher pour notifications WebSocket temps réel

---

## @FRONTEND-BORNE
SPA React/Vite pour tablette en mode kiosque (src/frontend/).

**Contexte d'activation :**
- TailwindCSS v4, couleur primaire **#5B2D8E** (PAS #5C2DD3)
- Touch targets ≥48px, mobile-first, pas de scroll horizontal
- Formulaire dynamique V2 : questions depuis BorneContext (config API)
- Internationalisation FR/ES/EN avec fallback FR (fonction t())
- Offline-first : config localStorage TTL 24h, enregistrements IndexedDB
- Gestion inactivité : useInactivity.js (annulation + retour accueil)
- Pas de window.open(), alert(), confirm() ni target="_blank"
- Mode kiosque : masquer barre navigation Android

---

## @BACKOFFICE-DEV
SPA React/Vite pour le back-office (src/backoffice/).

**Contexte d'activation :**
- TailwindCSS v4, couleur primaire **#5B2D8E**
- Deux rôles : SUPER_ADMIN (accès complet) et ADMIN_BORNE (cloisonné)
- AuthContext : JWT stocké en localStorage, décodage payload pour rôle
- Pusher client : abonnement aux canaux borne-{id} pour notifications temps réel
- I18nTextInput : saisie trilingue FR/ES/EN avec onglets
- QuestionEditor : drag-and-drop HTML5 pour réordonnancement
- Export XLSX via GET /api/enregistrements/export
- Pas de window.open(), alert(), confirm()

---

## @BACKEND-DEV
API REST Node.js/Express, Prisma, PostgreSQL (src/backend/).

**Contexte d'activation :**
- ESM modules, Express 4, Prisma v5, Zod validation
- V1 (conservé) : GET /api/configuration, POST/GET/PUT /api/submissions
- V2 (nouveau) : auth, bornes, admin-bornes, formulaires, questions, enregistrements, dashboard, partage
- Auth V2 : jwtAuthV2 + requireRole + checkBorneOwnership
- Format réponse : { success: true/false, data/error }
- Tests : Jest + Supertest, pattern jest.unstable_mockModule (ESM)
- Ne jamais casser les 29 tests V1

---

## @CRM-INTEGRATOR
Module de synchronisation CRM V1 (src/crm-module/).

**Contexte d'activation :**
- Consomme GET /api/submissions?synced=false + PUT /api/submissions/:id/sync
- Format CRM : { project_id, field_id, value }
- Projet de référence CRM : 933
- Auth : JWT Bearer (généré par scripts/generate-crm-jwt.js)
- V2 : partage asynchrone via PartageJob + queueWorker.js

---

## @QA-TESTER
Tests, qualité, validation.

**Contexte d'activation :**
- Jest + Supertest (backend) — 72+ tests (V1 + V2)
- Vitest + Testing Library (frontend)
- Playwright (E2E)
- Devices cibles : tablette paysage (1024px) + mobile portrait (375px)
- Tester : auth multi-rôles, cloisonnement données, offline borne, i18n fallback, inactivité

---

## @DEVOPS
Déploiement, infrastructure, CI/CD.

**Contexte d'activation :**
- Backend : Railway (Node.js, HTTPS auto)
- Frontend + Back-Office + CRM : Vercel (build Vite)
- DB : Supabase PostgreSQL
- CI : GitHub Actions
- Env vars V2 : PUSHER_*, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD_TEMP, VITE_PUSHER_KEY, VITE_PUSHER_CLUSTER
- Migration : npx prisma migrate deploy (avant chaque déploiement backend)
