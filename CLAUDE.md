# CLAUDE.md — Estimer Mes Aides

> Projet : Application mobile WebView pour estimer les aides à la rénovation énergétique.
> Lire `docs/CLAUDE.md` pour le contexte complet. Ce fichier est le point d'entrée rapide.

---

## Statut actuel

```
Phase 1 — Setup & Architecture    ✅ Terminé
Phase 2 — Backend API             ✅ Terminé (4 endpoints, 29 tests)
Phase 3 — Frontend WebView        ✅ Terminé (15 étapes, mobile + tablette)
Phase 4 — Module CRM Sync         ✅ Terminé (src/crm-module/, port 5174)
Phase 5 — Tests E2E & Déploiement ✅ Terminé (9 tests Playwright, CI, Railway, Vercel)
```

**Prochaine action** : déploiement réel → Railway (backend) + Vercel (frontend).

---

## Architecture en 30 secondes

```
[WebView iOS/Android]
       ↕ HTTPS + x-api-key
[Backend Node.js :3000]  ←→  [PostgreSQL Supabase]
       ↕ HTTPS + JWT
[Module CRM :5174]
```

- **Backend** `src/backend/` — Express + Prisma v5 + Zod + JWT
- **Frontend** `src/frontend/` — React 19 + Vite 8 + TailwindCSS v4
- **CRM Sync** `src/crm-module/` — React + Vite (mode simulation si VITE_CRM_URL vide)
- **Tests E2E** `tests/e2e/` — Playwright 9 tests (mocked API)

---

## Règles absolues (ne jamais déroger)

1. **Mobile-first** — touch targets ≥ 48px, font-size inputs ≥ 16px
2. **Offline-capable** — config en cache localStorage, soumissions en IndexedDB
3. **Vrais field IDs CRM** — (2087, 2088, 2089, 2090…) jamais d'IDs inventés
4. **Formulaire = 15 étapes** — source de vérité : `docs/CONTEXT.md`
5. **Champs obligatoires** — Nom (2087), Prénom (2088), CP (2089), Ville (2090), Revenu (2294), Statut (2293)
6. **UUID v4** pour tous les IDs de soumission
7. **synced=false** par défaut sur toute nouvelle soumission
8. **Couleur primaire** — `#5C2DD3` (violet institutionnel)
9. **Double validation** — côté client ET côté backend (Zod)
10. **HTTPS obligatoire** sur toutes les routes API en prod

---

## Commandes rapides

```bash
# Backend (port 3000)
cd src/backend && npm run dev
cd src/backend && npm test          # 29 tests

# Frontend (port 5173)
cd src/frontend && npm run dev

# CRM Sync (port 5174)
cd src/crm-module && npm run dev
cd src/backend && node scripts/generate-crm-jwt.js   # JWT 24h

# Tests E2E
cd tests/e2e && npm test            # 9 tests Playwright
```

---

## Fichiers de référence

| Fichier | Contenu |
|---------|---------|
| `docs/CONTEXT.md` | Source de vérité formulaire (15 étapes, field IDs CRM) |
| `docs/PLAN.md` | Plan phasé, critères de validation |
| `docs/DESIGN.md` | Système de design UI/UX (couleurs, tokens, composants) |
| `docs/AGENTS.md` | Agents spécialisés (@ARCHITECT, @FRONTEND-DEV, etc.) |
| `docs/SKILLS.md` | Patterns techniques (auth, cache, champs dynamiques) |
| `docs/WORKFLOWS.md` | Workflows de développement (ajouter champ, endpoint, etc.) |

---

## Variables d'environnement clés (NON committées)

```bash
# src/backend/.env
DATABASE_URL=postgresql://...@aws-1-eu-north-1.pooler.supabase.com:5432/...
JWT_SECRET=978e0d21dbab0b12d0e3e89d4f3e55d55a83a82d83a9a812132b77e0108c7cb3
API_KEY_MOBILE=ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6
API_KEY_CRM=ema_crm_3331f681a90fd17d37b2d159f4e353a4

# src/frontend/.env
VITE_API_URL=http://localhost:3000
VITE_API_KEY=ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6
```
