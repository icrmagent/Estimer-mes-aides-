# CLAUDE.md — Estimer Mes Aides V2

> Projet : Plateforme multi-bornes pour estimer les aides à la rénovation énergétique.
> Lire `docs/CONTEXT.md` pour le contexte métier complet.

---

## Statut V1 (production, ne pas casser)

```
Phase 1 — Setup & Architecture    ✅ Terminé
Phase 2 — Backend API             ✅ Terminé (4 endpoints V1, 41 tests Jest de rétrocompat)
Phase 3 — Frontend WebView        ✅ Terminé (15 étapes, mobile + tablette)
Phase 4 — Module CRM Sync         ✅ Terminé (déprécié 2026-05 → supprimé, remplacé par partage I-CRM async V2 Phase 8)
Phase 5 — Tests E2E & Déploiement ✅ Terminé (69 tests Playwright / 4 specs, CI/CD)
```

## Statut V2 (développement terminé)

```
Phase 1 — Migration schéma DB     ✅ Terminé (9 nouveaux modèles Prisma)
Phase 2 — Auth multi-rôles        ✅ Terminé (SUPER_ADMIN / ADMIN_BORNE)
Phase 3 — API CRUD V2             ✅ Terminé (67 routes / 13 fichiers, 596 tests)
Phase 4 — Back-Office SuperAdmin  ✅ Terminé (React + Vite, src/backoffice/)
Phase 5 — Back-Office AdminBorne  ✅ Terminé (cloisonnement données)
Phase 6 — Front-Office Borne      ✅ Terminé (formulaire dynamique, i18n, offline)
Phase 7 — Internationalisation    ✅ Terminé (FR/ES/EN, fallback FR)
Phase 8 — Partage I-CRM async     ✅ Terminé (Pusher + queue worker)
Phase 9 — Tests & Déploiement     ✅ Terminé
```

## Évolutions post-V2

```
Écran de veille des bornes        ✅ En production 2026-09-23 — v2.1.0 (PR #10, 2f36a76)
                                     APK 2.1.0 / build 63 publié en release GitHub v2.1.0
Canal I-CRM par clé API           🚧 Branche feat/canal-icrm-cle-api (2026-09-25), non mergée
                                     → opportunités BORNE TACTILE, voir docs/INTEGRATION-ICRM.md
                                     + contrat v1.1 (2026-09-26) : widget I-CRM « Borne » →
                                       « Info borne » (borne.admin, created_at obligatoire)
```

Diaporama (texte, photo, galerie, vidéo) affiché par la borne après une période
d'inactivité sur l'écran d'accueil, édité dans le back-office (menu « Écrans de veille »)
et affecté borne par borne. Médias : URL HTTPS ou envoi direct vers **Supabase Storage**
par URL signée (le fichier ne transite pas par Render). Détail : `docs/PLAN.md`.

✅ **Envoi de fichiers actif en production** depuis le 2026-09-23 (PR #12) : bucket public
`ecrans-veille` (50 Mo, JPEG/PNG/WebP/GIF/MP4/WebM), parcours réel validé de bout en bout.
La clé Supabase est lue sous `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_SERVICE_KEY` ou `SUPABASE_KEY` (format `sb_secret_…` accepté) ; `SUPABASE_URL`
est déduite de `DATABASE_URL` si absente. Les tablettes n'ont la veille qu'après
installation de l'APK 2.1.0.

---

## Chiffres de référence (mesurés le 2026-09-23)

> Source unique de vérité pour les volumétries de tests. Toute autre valeur citée
> ailleurs dans la doc est obsolète. Re-mesurer avec les commandes ci-dessous
> avant de modifier ce tableau.

| Périmètre | Valeur | Commande de mesure |
|-----------|--------|--------------------|
| Backend — suite complète | **799 tests / 41 suites** (re-mesuré 2026-09-26, branche `feat/canal-icrm-cle-api` ; 1 échec environnemental connu : `tests/security/rate-limit.test.js:369`) | `cd src/backend && npm test` |
| Backend — rétrocompat V1 | **41 tests / 3 suites** | `cd src/backend && npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --forceExit --testPathPattern="tests/(submissions\|configuration\|services/submission)"` |
| Frontend Borne (Vitest) | **139 tests / 11 fichiers** | `cd src/frontend && npm test` |
| Back-Office (Vitest) | **117 tests / 7 fichiers** ⚠️ (re-mesuré 2026-09-26) | `cd src/backoffice && npm test` |
| E2E Playwright | **69 tests / 4 specs** | `cd tests/e2e && npx playwright test --list` |
| Routes API backend | **74 handlers / 14 fichiers** | voir `docs/DEPLOIEMENT.md` § « Chiffres de référence » |

> ⚠️ Le total backend a évolué pendant l'audit lui-même (491 → 596 tests, toujours
> 35 suites) : des tests ont été ajoutés à une suite existante en parallèle. Ce nombre
> est un **plancher qui monte** — en cas de doute, c'est la commande qui fait foi, pas
> le chiffre écrit ici.

⚠️ **Back-Office sous-testé** : 5 fichiers de test, dont 2 pour l'écran de veille
(`components/ecranVeille/model.test.js`, `services/ecransVeilleService.test.js`). Les
pages et le cloisonnement AdminBorne restent non couverts : c'est le trou de couverture
le plus large du dépôt.

---

## Production (2026-09-02)

| Cible | URL / valeur |
|-------|--------------|
| Backend API | **https://estimer-mes-aides-api.onrender.com** — **Render**, service `estimer-mes-aides-api` (`srv-dac30kbm8hqs73eb1d20`), plan free, région frankfurt, `rootDir: src/backend`, health check `/health`, autoDeploy sur `main` |
| Front borne | https://estimer-mes-aides.vercel.app (Vercel) |
| Back-office | https://estimer-mes-aides-wjp3.vercel.app (Vercel) |
| Base de données | Supabase `aws-1-eu-north-1.pooler.supabase.com` — **vivante**, 19 tables, schéma complet |

⚠️ **Railway est abandonné.** `src/backend/railway.json` et `railway.toml` ont été
supprimés, remplacés par **`src/backend/render.yaml`**. L'URL
`https://estimer-mes-aides-production.up.railway.app` est morte : ne jamais la réutiliser.

⚠️ **Plan free Render — veille et réveil.** Le service s'endort après **15 min** sans
trafic ; le réveil prend **~50 s**. Une borne démarrée après une période creuse attendra
donc ce délai sur sa première requête. C'est un **choix assumé**, pas un défaut à
corriger : documenter et attendre, ne pas conclure à une panne. Interroger `/health`
avec `--max-time 90`, jamais avec un timeout court.

✅ **La base Supabase n'a jamais été supprimée.** Un ancien audit l'a déclarée
supprimée sur la foi d'un `NXDOMAIN` causé par une **panne DNS locale**. Le verdict qui
fait foi est `cd src/backend && npx prisma migrate status`. Ne lancer aucune procédure
de recréation de base sur la foi d'un échec de résolution DNS.

Détail complet : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

---

## Architecture V2

```
[Tablette Android — Mode Kiosque]
        ↕ HTTPS + JWT AdminBorne
[Frontend Borne :5173]  ←→  [Back-Office :5175]
        ↕ HTTPS + JWT
[Backend Node.js :3000]  ←→  [PostgreSQL Supabase]
   (prod : Render, plan free)      (prod : pooler IPv4, 19 tables)
        ↑ WebSocket
[Pusher — Notifications temps réel]
        ↓ Queue worker async
[I-CRM externe] (partage automatique V2)
```

---

## Modules

| Dossier | Rôle | Port |
|---------|------|------|
| `src/backend/` | API REST Node.js + Express + Prisma V2 | 3000 |
| `src/frontend/` | Front-Office Borne (kiosque tablette) | 5173 |
| `src/backoffice/` | Back-Office SuperAdmin + AdminBorne | 5175 |

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
11. **Ne jamais casser les 41 tests de rétrocompatibilité V1** — obligatoire

---

## Commandes rapides

```bash
# Backend V2 (port 3000)
cd src/backend && npm run dev
cd src/backend && npm test          # 634 tests Jest / 38 suites (V1 + V2)

# Frontend Borne (port 5173)
cd src/frontend && npm run dev

# Back-Office (port 5175)
cd src/backoffice && npm install && npm run dev

# Migration DB V2
cd src/backend && npx prisma migrate deploy

# Seed V2 (SuperAdmin + formulaire démo + borne démo)
# ⚠️ réécrit VITE_BORNE_ID dans src/frontend/.env — voir avertissement sous ce bloc
cd src/backend && npm run prisma:seed

# Créer SuperAdmin en production
cd src/backend && node scripts/create-superadmin.js

# Générer un JWT CRM V1 (valable 24h)
cd src/backend && node scripts/generate-crm-jwt.js
```

> ⚠️ **`npm run prisma:seed` modifie `src/frontend/.env` sans prévenir.**
> `src/backend/prisma/seed.js` résout `../../frontend/.env` (ligne 10) et y réécrit
> `VITE_BORNE_ID` avec l'id de la borne de démo (`fs.writeFileSync`, ligne 1176).
> Le fichier étant gitignoré, la modification n'apparaît dans aucun `git status` :
> après un seed, le front local pointe sur la borne de démo, pas sur celle sur laquelle
> on travaillait. Sauvegarder `src/frontend/.env` avant, le vérifier après — et ne
> jamais lancer `prisma:seed` depuis un poste dont `src/backend/.env` pointe sur la
> base de production.

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
# Médias de l'écran de veille (sans clé : envoi de fichier = 503, URLs acceptées)
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # JWT service_role (ou alias SUPABASE_KEY=sb_secret_...) — serveur uniquement
SUPABASE_URL=https://<projet>.supabase.co   # facultative : déduite de DATABASE_URL

# src/backoffice/.env
VITE_API_URL=http://localhost:3000
VITE_PUSHER_KEY=...
VITE_PUSHER_CLUSTER=eu

# src/frontend/.env
VITE_API_URL=http://localhost:3000
VITE_API_KEY=ema_mobile_...
```

> **En production**, ces valeurs ne vivent pas dans le dépôt :
> - backend → dashboard **Render**, service `estimer-mes-aides-api` → *Environment*
>   (`src/backend/render.yaml` déclare les clés en `sync: false`, jamais les valeurs) ;
> - frontends → dashboard **Vercel** → *Settings → Environment Variables*, avec
>   `VITE_API_URL=https://estimer-mes-aides-api.onrender.com`.
>
> `PUSHER_SECRET` et `SUPABASE_SERVICE_ROLE_KEY` sont des variables **serveur
> uniquement** : jamais de `VITE_` devant, jamais dans un projet Vercel — un bundle
> front est public.

---

## Fichiers de référence

| Fichier | Contenu |
|---------|---------|
| `docs/CONTEXT.md` | Source de vérité formulaire V1 (15 étapes, field IDs CRM) |
| `.kiro/specs/estimer-mes-aides-v2/` | Spec V2 complète (requirements, design, tasks) |
| `.kiro/steering/` | Règles et standards du projet (backend, frontend, design) |
| `src/backend/prisma/schema.prisma` | Schéma DB V1 + V2 |
| `src/backend/src/routes/` | Tous les endpoints API |
| `src/backend/render.yaml` | Blueprint Render du backend de production (remplace `railway.json`/`railway.toml`, supprimés) |
| `docs/DEPLOIEMENT.md` | Architecture prod, URLs, variables, pipeline, reprise après sinistre, pièges |
| `CHANGELOG.md` | Historique des versions et des incidents |
