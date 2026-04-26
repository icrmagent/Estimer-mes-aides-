# PLAN.md — Plan de Développement Phasé

## Méthodologie
Développement en 5 phases séquentielles. Chaque phase doit être validée avant de passer à la suivante.
Claude Code doit consulter ce fichier au début de chaque session pour savoir où on en est.

---

## 📍 Suivi de progression

```
Phase 1 — Setup & Architecture     [ ] En cours  [x] Terminé ✅
Phase 2 — Backend API              [ ] En cours  [x] Terminé ✅
Phase 3 — Frontend WebView         [ ] En cours  [x] Terminé ✅
Phase 4 — Module CRM Sync          [ ] En cours  [ ] Terminé
Phase 5 — Tests & Déploiement      [ ] En cours  [ ] Terminé
```

> ⚠️ Mettre à jour les cases ci-dessus après chaque phase terminée.

---

## PHASE 1 — Setup & Architecture (Jour 1-2)

### Objectif
Infrastructure de base opérationnelle, projet initialisé, base de données créée.

### Tâches

**1.1 Initialisation des projets**
```bash
# Backend
mkdir estimer-mes-aides && cd estimer-mes-aides
mkdir backend frontend crm-module
cd backend
npm init -y
npm install express prisma @prisma/client zod jsonwebtoken dotenv cors helmet

# Frontend
cd ../frontend
npm create vite@latest . -- --template react
npm install axios idb-keyval

# Init Prisma
cd ../backend
npx prisma init
```

**1.2 Schema Prisma**
- Créer `backend/prisma/schema.prisma` (voir SKILLS.md > Agent BACKEND-DEV)
- Créer la base Supabase
- `npx prisma migrate dev --name init`

**1.3 Variables d'environnement**
```bash
# backend/.env
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
API_KEY_MOBILE="ema_mobile_..."
API_KEY_CRM="ema_crm_..."
CRM_BASE_URL="https://..."
PORT=3000

# frontend/.env
VITE_API_URL="http://localhost:3000"
VITE_API_KEY="ema_mobile_..."
```

**1.4 Structure de dossiers complète**
```
backend/
├── src/
│   ├── routes/
│   │   ├── configuration.js
│   │   ├── submissions.js
│   │   └── auth.js
│   ├── middleware/
│   │   ├── apiKeyAuth.js
│   │   └── jwtAuth.js
│   ├── services/
│   │   ├── configService.js
│   │   └── submissionService.js
│   └── app.js
├── prisma/
│   └── schema.prisma
└── server.js
```

**Critère de validation Phase 1** :
- [ ] `npx prisma migrate dev` réussit
- [ ] Serveur Express démarre sur le port 3000
- [ ] Structure de fichiers créée

---

## PHASE 2 — Backend API (Jour 3-5)

### Objectif
API REST complète et testée avec tous les endpoints du cahier des charges.

### Tâches

**2.1 Endpoint GET /api/configuration**
```
- Retourne la config du formulaire (depuis DB ou CRM pull)
- Seed de la config initiale (données du cahier des charges §4)
- Auth : x-api-key (app mobile)
- Cache : ETag + Last-Modified
```

**2.2 Endpoint POST /api/submissions**
```
- Valide avec Zod : { configVersion, values: [{fieldId, value}] }
- Génère UUID v4
- Persiste en DB (synced=false)
- Retourne 201 + { id, createdAt, synced }
- Auth : x-api-key (app mobile)
```

**2.3 Endpoint GET /api/submissions**
```
- Paramètres : ?synced=false&since=YYYY-MM-DD&limit=100
- Retourne tableau de soumissions avec leurs valeurs
- Auth : JWT Bearer (CRM uniquement)
```

**2.4 Endpoint PUT /api/submissions/:id/sync**
```
- Met à jour synced=true, syncedAt=now()
- Optionnel : body { crmProjectId } pour référence croisée
- Auth : JWT Bearer (CRM uniquement)
- Retourne 200 + soumission mise à jour
```

**2.5 Seed de la configuration initiale**
```javascript
// Seed du formulaire "Estimer vos aides" (onglet ID 22)
// Données complètes : voir docs/CONTEXT.md (SOURCE DE VÉRITÉ)
// 15 sous-catégories, vrais field IDs CRM (2262, 2087, 2088, ...)
// Script : backend/prisma/seed.js
// ATTENTION : utiliser les field IDs CRM réels, pas des IDs séquentiels
```

**2.6 Tests backend**
```
- Jest + Supertest pour chaque endpoint
- Tests auth (clé invalide → 401)
- Tests validation Zod (données manquantes → 400)
- Tests métier (synced=false par défaut)
```

**Critère de validation Phase 2** :
- [x] Tous les endpoints répondent correctement (curl vérifié) ✅
- [x] Auth fonctionne (API Key + JWT) ✅
- [x] Tests passent (`npm test`) — 29/29 ✅
- [x] Seed chargé en base ✅

---

## PHASE 3 — Frontend WebView (Jour 6-10)

### Objectif
SPA React complète, responsive mobile, navigation formulaire fonctionnelle.

### Tâches

**3.1 Structure React de base**
```
- React Router : / (Welcome) → /form (FormPage) → /confirmation
- Context : FormContext (config + values + currentStep)
- Hook : useFormConfig (charge config API + cache localStorage)
```

**3.2 Composants core**
```
- WelcomeScreen : logo, titre, bouton "Commencer"
- ProgressBar : affiche "Catégorie Xème sous-cat Y/N"
- FieldRenderer : rendu selon fieldtype_id (1, 2, 4, 5, 6, 50)
- StepForm : composition d'une sous-catégorie
- NavigationBar : Précédent / Suivant (Suivant désactivé si erreurs)
- SummaryScreen : récapitulatif avant envoi
- ConfirmationScreen : succès / erreur
```

**3.3 Logique de formulaire**
```
- Chargement config depuis API (avec fallback cache localStorage)
- Navigation entre sous-catégories (15 étapes au total — voir docs/CONTEXT.md)
  · Informations Personnelles : 3 étapes (sous-cats 63, 65, 75)
  · Le Lieu des Travaux       : 7 étapes (sous-cats 59, 60, 61, 62, 66, 71, 72)
  · Vos Besoins               : 5 étapes (sous-cats 64, 68, 70, 73, 74)
- Validation par étape (champs required bloquent Suivant)
  · Obligatoires frontend : Nom (2087), Prénom (2088), CP (2089), Ville (2090),
    Revenu fiscal (2294), Statut (2293)
  · Tous les autres champs sont optionnels
- Accumulation des valeurs dans le state (FormContext) avec les vrais field IDs CRM
- Soumission finale : POST /api/submissions
- Offline : si API down → IndexedDB + notification "Sauvegardé offline"
```

**3.4 Design (couleurs #5C2DD3)**
```
- Header fixe violet avec titre et progress
- Cards blanches avec shadow pour chaque groupe de champs
- Radio buttons stylisés (pas les radio natifs)
- Checkboxes personnalisées
- Animations de transition entre étapes (slide)
- Loader overlay pendant les appels API
```

**3.5 Responsive & WebView**
```
- Viewport : width=device-width, initial-scale=1, maximum-scale=1
- Pas de scroll horizontal
- Tous les boutons ≥ 48px de hauteur
- Pas de hover-only interactions (tout accessible au touch)
- Keyboard-aware (formulaire ne cache pas sous le clavier virtuel)
```

**Critère de validation Phase 3** :
- [ ] Parcours complet fonctionne (Welcome → 15 étapes → Confirmation)
- [ ] Validation bloque Suivant si champ obligatoire vide (Nom, Prénom, CP, Ville, Revenu, Statut)
- [ ] Soumission POST réussit et retourne vers Confirmation
- [ ] Rendu correct sur 375px (iPhone SE) et 390px (Android)
- [ ] WebView Android + iOS testés

---

## PHASE 4 — Module CRM Sync (Jour 11-13)

### Objectif
Interface CRM de synchronisation complète et fonctionnelle.

### Tâches

**4.1 Écran "Synchronisation" dans le CRM**
```
- Tableau listant les soumissions non synchronisées
- Colonnes : Date, Prénom/Nom, Email, Nb champs, Status
- Filtres : plage de dates, statut
- Actions : Importer (sélection) / Importer tout
```

**4.2 Processus d'import**
```
- Appel GET /api/submissions?synced=false (JWT Bearer)
- Pour chaque soumission : création projet CRM + insertion field_values
- Même structure que projet 933 (référence CRM)
- Confirmation individuelle par PUT /api/submissions/:id/sync
- Rapport : X importés, Y erreurs
```

**4.3 Gestion des erreurs d'import**
```
- Erreur réseau : retry 3x
- Erreur validation CRM : log erreur + continuer les suivantes
- Afficher le rapport détaillé en fin de sync
```

**Critère de validation Phase 4** :
- [ ] Bouton "Synchroniser" dans CRM déclenche l'import
- [ ] Les projets sont créés dans le CRM avec les bonnes valeurs
- [ ] Les soumissions sont marquées synced=true après import
- [ ] Rapport affiché (nb importés, erreurs)

---

## PHASE 5 — Tests & Déploiement (Jour 14-16)

### Objectif
Application en production, stable, sécurisée, documentée.

### Tâches

**5.1 Tests E2E (Playwright)**
```
- Parcours complet formulaire → soumission
- Test offline (network disabled)
- Test import CRM
```

**5.2 Déploiement**
```
- Backend : Railway (Node.js, HTTPS auto)
- Frontend : Vercel (Vite build)
- DB : Supabase (déjà cloud)
- Variables env : configurées dans les dashboards
```

**5.3 Documentation finale**
```
- README.md avec instructions d'installation
- Documentation API (Swagger/OpenAPI ou Postman collection)
- Guide d'intégration WebView native
```

**Critère de validation Phase 5** :
- [ ] URL backend accessible en HTTPS
- [ ] URL frontend accessible en HTTPS
- [ ] Tests E2E passent en CI (GitHub Actions)
- [ ] WebView native pointe sur l'URL de prod

---

## ⚡ Commandes de démarrage rapide par phase

```bash
# Phase 1 - Setup
npm run setup         # script d'init tout-en-un

# Phase 2 - Backend dev
npm run dev:backend   # nodemon sur backend/

# Phase 3 - Frontend dev
npm run dev:frontend  # vite sur frontend/

# Phase 4 - CRM dev
npm run dev:crm       # selon stack du CRM existant

# Phase 5 - Tests
npm run test:all      # backend + frontend tests
npm run test:e2e      # playwright
npm run deploy        # deploy via CLI Railway + Vercel
```
