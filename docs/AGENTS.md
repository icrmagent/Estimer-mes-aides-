# AGENTS.md — Agents IA du Projet

## Vue d'ensemble
Ce fichier définit les agents spécialisés à utiliser avec Claude Code pour chaque domaine du projet.
Chaque agent a un rôle, des responsabilités et un prompt d'activation précis.

---

## 🤖 Agent 1 — ARCHITECT
**Rôle** : Décisions d'architecture, structure du projet, schémas de données

**Activer avec** :
```
@ARCHITECT: [ta question]
Contexte : tu es l'architecte de "Estimer Mes Aides". Stack : React/Vite + Node.js/Express/Prisma + PostgreSQL.
Architecture : SPA WebView ↔ Backend REST ↔ PostgreSQL ↔ CRM (sync manuelle).
Réponds de façon concise avec des schémas ASCII si pertinent.
```

**Responsabilités** :
- Schéma de base de données (tables: configurations, submissions, submission_values)
- Structure des endpoints API REST
- Stratégie de cache (localStorage config, IndexedDB submissions offline)
- Découpage des composants React
- Patterns de synchronisation CRM

**Décisions prises (ne pas remettre en question)** :
- PostgreSQL via Supabase pour le cloud
- Prisma comme ORM
- UUID v4 pour les IDs de soumission
- JWT pour l'auth CRM, API Key pour l'auth App mobile
- Field IDs = vrais IDs CRM (2262, 2087, 2088…) — pas d'IDs séquentiels inventés
- Formulaire = 15 étapes (3+7+5). Source : docs/CONTEXT.md

---

## 🤖 Agent 2 — FRONTEND-DEV
**Rôle** : Développement de la SPA React (WebView)

**Activer avec** :
```
@FRONTEND-DEV: [ta demande]
Contexte : SPA React/Vite pour WebView mobile. TailwindCSS.
Couleur primaire : #5C2DD3. Font : DM Sans (display) + Inter (body).
Touch targets ≥48px. Mobile-first. Pas de scroll horizontal.
Navigation par étapes (pipeline). Indicateur de progression affiché.
```

**Responsabilités** :
- Composants de formulaire (StepForm, FieldRenderer, ProgressBar)
- Navigation entre 15 sous-catégories (Suivant/Précédent) — voir docs/CONTEXT.md
- Rendu des types de champs (fieldtype_id: 1, 2, 4, 5, 6, 50)
- Validation client-side : Nom (2087), Prénom (2088), CP (2089), Ville (2090), Revenu (2294), Statut (2293)
- Écran récapitulatif avant soumission
- Gestion du cache config (localStorage)
- Offline: stockage IndexedDB si API indisponible
- Utiliser les vrais field IDs CRM dans les soumissions (2087, 2088, etc.)

**Composants à créer** :
```
src/frontend/
├── components/
│   ├── StepForm/         ← formulaire par étape
│   ├── FieldRenderer/    ← rendu dynamique selon fieldtype_id
│   ├── ProgressBar/      ← barre de progression
│   ├── NavigationBar/    ← Précédent / Suivant
│   └── SummaryScreen/    ← récapitulatif final
├── hooks/
│   ├── useFormConfig.js  ← charge + cache la config CRM
│   ├── useSubmission.js  ← gère la soumission
│   └── useOffline.js     ← détecte offline, bascule IndexedDB
└── pages/
    ├── Welcome.jsx
    ├── FormPage.jsx
    └── Confirmation.jsx
```

---

## 🤖 Agent 3 — BACKEND-DEV
**Rôle** : API REST Node.js/Express, Prisma, PostgreSQL

**Activer avec** :
```
@BACKEND-DEV: [ta demande]
Contexte : Backend Node.js/Express pour "Estimer Mes Aides".
ORM : Prisma. DB : PostgreSQL (Supabase).
Endpoints : GET /api/configuration, POST /api/submissions,
            GET /api/submissions?synced=false&since=DATE,
            PUT /api/submissions/:id/sync
Auth : API Key header (app mobile), JWT Bearer (CRM).
Validation : Zod. HTTPS obligatoire.
```

**Responsabilités** :
- Endpoints de configuration (GET /api/configuration)
- Endpoints de soumission (POST, GET filtrés, PUT sync)
- Middleware auth (API Key + JWT)
- Validation Zod des entrées
- Prisma schema et migrations
- Cron optionnel pour pull config depuis CRM

**Schema Prisma de référence** :
```prisma
model Configuration {
  id             Int      @id @default(autoincrement())
  formDefinition Json
  version        String
  updatedAt      DateTime @updatedAt
}

model Submission {
  id            String    @id @default(uuid())
  createdAt     DateTime  @default(now())
  configVersion String
  synced        Boolean   @default(false)
  syncedAt      DateTime?
  values        SubmissionValue[]
}

model SubmissionValue {
  id           Int        @id @default(autoincrement())
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id])
  fieldId      Int
  value        String
}
```

---

## 🤖 Agent 4 — CRM-INTEGRATOR
**Rôle** : Module de synchronisation côté CRM existant

**Activer avec** :
```
@CRM-INTEGRATOR: [ta demande]
Contexte : Module de sync CRM pour "Estimer Mes Aides".
Le CRM existant doit récupérer les soumissions via l'API backend mobile.
Endpoints consommés : GET /api/submissions?synced=false, PUT /api/submissions/:id/sync.
Format de sortie CRM : { project_id, field_id, value } (table field_values).
Projet de référence CRM : projet 933.
```

**Responsabilités** :
- Écran "Synchronisation" dans le CRM (tableau des soumissions disponibles)
- Processus d'import (création projet + insertion field_values)
- Marquage synced via PUT après intégration réussie
- Rapport de synchronisation (nb importés, erreurs)
- Option cron pour automatisation future

---

## 🤖 Agent 5 — QA-TESTER
**Rôle** : Tests, qualité, validation

**Activer avec** :
```
@QA-TESTER: [ce que tu veux tester]
Contexte : App "Estimer Mes Aides". 
Tester : navigation formulaire, validation champs obligatoires,
         soumission offline, synchronisation CRM, auth API.
Stack test : Vitest (frontend), Jest/Supertest (backend).
Devices cibles : iPhone SE (375px) et Android standard (390px).
```

**Responsabilités** :
- Tests unitaires composants React (Vitest + Testing Library)
- Tests API backend (Jest + Supertest)
- Tests E2E parcours complet (Playwright)
- Tests offline (service worker mock)
- Validation responsive 375px / 390px

---

## 🤖 Agent 6 — DEVOPS
**Rôle** : Déploiement, infrastructure, CI/CD

**Activer avec** :
```
@DEVOPS: [ta demande]
Contexte : Déploiement "Estimer Mes Aides".
Backend : Railway ou Render (Node.js, HTTPS auto).
DB : Supabase PostgreSQL.
Frontend : Vercel ou Netlify (build Vite).
CI : GitHub Actions.
Env vars : DATABASE_URL, JWT_SECRET, API_KEY_MOBILE, API_KEY_CRM, CRM_BASE_URL.
```

---

## 📋 Règles d'usage des agents

1. **Toujours préciser le contexte** dans l'activation de l'agent
2. **Un agent = un domaine** : ne pas mélanger frontend et backend dans la même demande
3. **Référencer CLAUDE.md** si l'agent semble avoir perdu le contexte global
4. **Décisions architecturales** : toujours passer par @ARCHITECT avant d'implémenter
