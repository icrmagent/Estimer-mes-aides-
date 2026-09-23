# PLAN.md — Plan de Développement Phasé

> Dernière mise à jour : **2026-09-23** (écran de veille, voir la section dédiée plus bas).
> Avant cette date, ce fichier datait du 2026-04-26 et ne connaissait que les
> 5 phases V1 : les 9 phases V2, pourtant terminées et déployées depuis mai 2026,
> n'y figuraient pas. Il annonçait aussi la Phase 5 comme « déploiement à faire »
> alors que la production tournait depuis le 2026-05-13.

---

## Méthodologie

Développement en phases séquentielles. Chaque phase est validée avant de passer à
la suivante. Claude Code consulte ce fichier au début de chaque session pour savoir
où en est le projet.

Répartition : **V1 = 5 phases** (application mono-borne, formulaire figé à 15 étapes)
puis **V2 = 9 phases** (plateforme multi-bornes, formulaire configurable).

---

## Suivi de progression

### V1 — Application mono-borne (avr. 2026)

```
Phase 1 — Setup & Architecture     [x] Terminé
Phase 2 — Backend API              [x] Terminé
Phase 3 — Frontend WebView         [x] Terminé
Phase 4 — Module CRM Sync          [x] Terminé, puis SUPPRIMÉ (commit b7585cc, 2026-05-14)
Phase 5 — Tests & Déploiement      [x] Terminé
```

> **Phase 4 : le code n'existe plus.** `src/crm-module/` a été supprimé le 2026-05-14
> (commit `b7585cc`) et remplacé par le partage I-CRM asynchrone du backend
> (V2 Phase 8). Seules survivent les routes legacy `GET /api/submissions` et
> `PUT /api/submissions/:id/sync`, conservées pour la rétrocompatibilité et couvertes
> par les 41 tests de rétrocompat.

### V2 — Plateforme multi-bornes (mai 2026)

```
Phase 1 — Migration schéma DB      [x] Terminé — 9 nouveaux modèles Prisma
Phase 2 — Auth multi-rôles         [x] Terminé — SUPER_ADMIN / ADMIN_BORNE
Phase 3 — API CRUD V2              [x] Terminé — 67 routes sur 13 fichiers
Phase 4 — Back-Office SuperAdmin   [x] Terminé — React + Vite, src/backoffice/
Phase 5 — Back-Office AdminBorne   [x] Terminé — cloisonnement des données
Phase 6 — Front-Office Borne       [x] Terminé — formulaire dynamique, i18n, offline
Phase 7 — Internationalisation     [x] Terminé — FR/ES/EN, fallback FR
Phase 8 — Partage I-CRM async      [x] Terminé — Pusher + queue worker
Phase 9 — Tests & Déploiement      [x] Terminé — pipeline GitHub Actions, 25 deploys
```

---

## État réel vérifié le 2026-09-02

### Tests (mesurés, pas estimés)

| Périmètre | Mesure | Commande |
|-----------|--------|----------|
| Backend Jest — suite complète | 596 tests / 37 suites | `cd src/backend && npm test` |
| Backend Jest — rétrocompat V1 | 41 tests / 3 suites | `--testPathPattern="tests/(submissions\|configuration\|services/submission)"` |
| Frontend Borne — Vitest | 66 tests / 4 fichiers | `cd src/frontend && npm test` |
| Back-Office — Vitest | 36 tests / 1 fichier | `cd src/backoffice && npm test` |
| E2E — Playwright | 69 tests / 4 specs | `cd tests/e2e && npx playwright test --list` |

> Les chiffres « 29 tests backend » et « 9 tests E2E » qui figuraient dans les
> critères de validation V1 sont périmés depuis la V2.

### Production — backend HORS SERVICE, base et frontends sains

| Cible | Mesure `curl` du 2026-09-02 |
|-------|-----------------------------|
| `https://estimer-mes-aides.vercel.app` (front borne) | `HTTP 200` |
| `https://estimer-mes-aides-wjp3.vercel.app` (back-office) | `HTTP 200` |
| `https://estimer-mes-aides-production.up.railway.app/health` | `HTTP 404` — Railway abandonné |
| `https://estimer-mes-aides-api.onrender.com/health` | pas encore déployé |
| Base Supabase `zxkshqviyzjigadruody` | **vivante**, 19 tables, `migrate status` à jour |

> ⚠️ **Correction d'un faux positif.** Un audit antérieur de cette même journée a conclu
> que le projet Supabase avait été supprimé (NXDOMAIN sur trois résolveurs). C'était une
> **panne DNS locale sur le poste de développement** — la même qui a interrompu les agents
> avec `ENOTFOUND`. La base n'a jamais été perdue : son schéma est complet et contient
> `canaux`, `questions.crmFieldIds` et `submissions.borneId`. Ne pas rejouer de procédure
> de reconstruction de base sur la foi de cet audit.

Le backend est le seul maillon manquant : Railway est abandonné au profit de **Render**
(service `estimer-mes-aides-api`, plan free, région Frankfurt). Les frontends servent
leurs assets et pointent déjà vers l'URL Render.

➡️ **Procédure : [DEPLOIEMENT.md § Reprise après sinistre](DEPLOIEMENT.md#reprise-après-sinistre).**

---

## Prochaine phase — Remise en service (en cours)

Tâche d'exploitation ouverte : la remise en ligne du backend sur Render. Côté
fonctionnalités, l'écran de veille est développé et attend son merge (section dédiée).

```
Étape 1 — Base Supabase + migrations              [x] Sans objet — base vivante et à jour
Étape 2 — Variables d'environnement Render        [x] Fait — 17 variables renseignées
Étape 3 — Service Render créé                     [x] Fait — srv-dac30kbm8hqs73eb1d20
Étape 4 — Connecter GitHub à l'espace Render      [ ] BLOQUANT — voir ci-dessous
Étape 5 — Appliquer la migration 20260902000000   [ ] À faire après le 1er déploiement
Étape 6 — Variables Vercel des 2 frontends        [x] Fait — repointées vers Render
Étape 7 — Secrets GitHub Actions                  [x] Fait — 10 secrets, dont BACKEND_URL
Étape 8 — Rotation des credentials Pusher         [ ] À faire — dashboard Pusher, app 2151378
Étape 9 — Rebuild + redistribution de l'APK       [ ] À faire — l'URL d'API a changé
Étape 10 — Validation E2E de bout en bout         [ ] À faire
```

### Étape 4 — le point bloquant

Le service Render a été créé par API **avant** que GitHub soit connecté à l'espace de
travail. Son builder échoue donc au clone avec « It looks like we don't have access to
your repo », y compris sur un dépôt public.

Diagnostic établi par une expérience à trois dépôts : un dépôt public d'un **autre**
propriétaire se déploie en 40 s, tandis que **tous** les dépôts de `icrmagent` échouent —
y compris un dépôt public créé pour le test. Le nom du dépôt et sa visibilité sont hors de
cause.

Correction : dashboard Render → basculer sur l'espace de travail **« Estimer mes aides »**
(et non le compte personnel) → Settings → GitHub → Configure → accorder l'accès à
`Estimer-mes-aides-`. Piège fréquent : l'App est connectée mais en « Only select
repositories » sans le dépôt coché. Contrôle indépendant :
https://github.com/settings/installations.

### Dette identifiée (hors remise en service)

- **Back-Office quasi non testé** : 1 fichier de test pour 39 fichiers source (2026-09-02).
  Ni les pages, ni le cloisonnement AdminBorne ne sont couverts.
- **Aucun tag semver** : `git tag -l 'v*'` renvoie 0 résultat. Les 25 tags existants
  sont tous des `deploy-*` automatiques. Le commit `b8562e4` s'annonce pourtant
  `release(v2.0.0)`.
- **Rate limiting tier-1 absent** : `express-rate-limit` est en dépendance mais n'est
  importé nulle part dans `src/backend/src/app.js`. `trackRateLimitViolation()` est
  exportée et jamais appelée : le tier-2 n'enregistre donc aucune violation, même avec
  Redis opérationnel.
- **`seed.js` réécrit le `.env` du frontend** : `prisma/seed.js` fait un `fs.writeFileSync`
  sur `../../frontend/.env` et y remplace `VITE_BORNE_ID`. Tout `npm run prisma:seed`
  modifie donc silencieusement la configuration du frontend local.
- **21 tests visuels Playwright hors CI** : les baselines n'existent qu'en `-win32.png`,
  elles ne peuvent pas s'exécuter sur le runner `ubuntu-latest`. Les 48 tests
  fonctionnels, eux, tournent partout.

---

## Fonctionnalité — Écran de veille des bornes (2026-09-23, branche `feat/ecran-veille`)

Après `delaiActivation` secondes d'inactivité sur l'écran d'accueil (`/start`), la borne
affiche un diaporama (texte, photo, galerie, vidéo) édité dans le back-office.

Décisions validées par l'utilisateur :
- **Médias** : envoi de fichiers vers Supabase Storage via URL signée (le fichier ne passe
  pas par Render), saisie d'URL HTTPS toujours possible.
- **Portée** : plusieurs diaporamas nommés (`EcranVeille`), chacun affecté à N bornes.
- **Droits** : SuperAdmin seul en écriture ; AdminBorne en lecture de ce qui est affecté à ses bornes.

```
Étape 1 — Base + backend           [x] Terminé — migration 20260923000000_ecran_veille,
                                       7 routes /api/ecrans-veille, config borne étendue,
                                       38 tests (suite complète : 634 tests / 38 suites)
Étape 2 — Back-office SuperAdmin   [x] Terminé — liste, éditeur (séquence / réglages /
                                       bornes), aperçu tablette, lecture plein écran,
                                       envoi Supabase ; 26 tests (82 / 5 fichiers)
Étape 3 — Borne                    [x] Terminé — ScreenSaver sur /start, plage horaire,
                                       cache hors ligne, Pusher ecran-veille.maj ;
                                       20 tests (139 / 11 fichiers)
Étape 4 — Mise en production       [x] Fait — PR #10 mergée (2f36a76), deploy.yml vert,
                                       migration appliquée (16/16), release v2.1.0 (APK 63)
```

Vérifié en production le 2026-09-23 : `/api/ecrans-veille` répond (401 sans jeton,
200 en SuperAdmin), config borne avec `ecranVeille`, bundle back-office à jour, APK signé
avec le même certificat que la 2.0.0 (`a043ba89…63a1`). Les écritures Prisma (création,
DbNull, remplacement de séquence, affectation) ont été rejouées sur la base de production
dans une transaction annulée : toutes passent, aucune trace laissée.

Envoi de fichiers : **actif en production depuis le 2026-09-23**. `SUPABASE_SERVICE_ROLE_KEY`
(JWT `service_role`) est renseignée ; le 503 constaté juste après sa saisie a disparu au
redéploiement de la PR #12 — cause la plus probable : service Render non redémarré après
l'ajout de la variable (le nom exact côté Render n'a pas pu être vérifié, faute de clé API
Render). La PR #12 accepte en plus les alias `SUPABASE_KEY` / `SUPABASE_SECRET_KEY` /
`SUPABASE_SERVICE_KEY` et déduit `SUPABASE_URL` de `DATABASE_URL`.

> Après toute modification de variable dans le dashboard Render, choisir « Save, rebuild,
> and deploy » : une variable enregistrée sans redéploiement n'est pas vue par le service. Parcours réel validé en production (login → CSRF →
signature → PUT multipart → lecture publique identique → suppression) ; bucket
`ecrans-veille` créé, public, 50 Mo, 6 types MIME.

Reste à faire (matériel, hors de portée de Claude) :
1. **Installer l'APK 2.1.0** (release GitHub v2.1.0) sur chaque tablette — mise à jour
   par-dessus, sans désinstallation.

Avant la mise en production : renseigner `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
dans Render (sans elles, l'envoi de fichiers répond 503 et seules les URLs sont acceptées).
La migration est appliquée automatiquement au démarrage (`start:prod`).

---

## Historique des phases — Archive

> Les descriptions ci-dessous sont conservées telles qu'écrites pendant le
> développement. Elles décrivent le **plan d'origine V1**, pas l'état actuel du code.
> Deux écarts notables :
>
> - La Phase 3 mentionne la couleur `#5C2DD3` : c'est la couleur **V1, obsolète**.
>   La couleur primaire V2 est `#5B2D8E` (règle 8 de `CLAUDE.md`).
>   - Le critère « railway.toml prêt » de la Phase 5 est **caduc** : Railway est
>   abandonné. `railway.json` et `railway.toml` ont été supprimés et remplacés par
>   `src/backend/render.yaml`. `src/frontend/vercel.json` et
>   `src/backoffice/vercel.json` sont bien présents.

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
- [x] Tests passent (`npm test`) — 29/29 à l'époque V1 ; **503/503 aujourd'hui** ✅
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

**Critère de validation Phase 5** (état re-vérifié le 2026-09-02) :
- [x] Tests E2E Playwright écrits ✅ — 4 specs aujourd'hui : `form-journey`,
      `offline`, `responsive-guards`, `visual-baseline` (`crm-sync` a disparu avec
      `src/crm-module/`, supprimé au commit `b7585cc`)
- [x] GitHub Actions configuré ✅ — `.github/workflows/ci.yml` + `deploy.yml`
- [x] `vercel.json` présent dans `src/frontend/` **et** `src/backoffice/` ✅
- [x] Configuration Render versionnée ✅ — `src/backend/render.yaml` (blueprint,
      `startCommand`, `healthcheckPath: /health`, restart policy). ⚠️ Les **variables
      d'environnement**, le lien repo et la branche de production ne sont, eux, **pas**
      versionnés : à ressaisir dans le dashboard après un sinistre.
- [x] URL backend accessible en HTTPS ✅ déployée le 2026-05-13 — ⚠️ **HS depuis
      le sinistre 2026-09** (`/health` → `HTTP 404`)
- [x] URL frontend accessible en HTTPS ✅ `https://estimer-mes-aides.vercel.app`
      (`HTTP 200` au 2026-09-02)
- [x] Secrets GitHub Actions configurés ✅ — ⚠️ à régénérer après le sinistre

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
