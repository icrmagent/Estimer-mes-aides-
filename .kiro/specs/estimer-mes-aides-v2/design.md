# Document de Design Technique — Estimer Mes Aides V2

## Introduction

Ce document décrit l'architecture technique complète de la V2 de la plateforme « Estimer Mes Aides ». Il couvre le schéma de base de données étendu, les nouveaux endpoints API, l'architecture des composants React pour les back-offices et le front-office borne, les flux de données, et la stratégie de migration depuis la V1.

La V2 réutilise au maximum l'infrastructure V1 (Node.js 20 + Express + Prisma v5 + PostgreSQL, React 19 + Vite + TailwindCSS v4) et l'étend sans rupture de compatibilité.

---

## 1. Schéma Prisma V2

### 1.1 Modèles existants (conservés et étendus)

```prisma
// Conservé de la V1 — étendu avec borneId
model Submission {
  id            String              @id @default(uuid())
  createdAt     DateTime            @default(now())
  configVersion String
  synced        Boolean             @default(false)
  syncedAt      DateTime?
  crmProjectId  String?
  borneId       String?             // NOUVEAU — lien vers la borne
  borne         Borne?              @relation(fields: [borneId], references: [id])
  values        SubmissionValue[]
  enregistrement Enregistrement?   // NOUVEAU — lien vers le nouveau modèle

  @@index([synced, createdAt])
  @@map("submissions")
}
```

### 1.2 Nouveaux modèles

```prisma
// Administrateur d'un parc de bornes
model AdminBorne {
  id            String    @id @default(uuid())
  nom           String
  prenom        String
  email         String    @unique
  passwordHash  String    // bcrypt, facteur >= 12
  raisonSociale String
  siret         String
  actif         Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  bornes        Borne[]

  @@map("admin_bornes")
}

// Terminal physique (tablette) déployé sur le terrain
model Borne {
  id            String      @id @default(uuid())
  idBorne       String      @unique  // identifiant métier lisible
  langueDefaut  String      @default("fr") // fr | es | en
  adresse       String
  commercant    String?
  regie         String?
  installateur  String?
  statut        String      @default("actif") // actif | inactif
  formulaireId  String?
  formulaire    Formulaire? @relation(fields: [formulaireId], references: [id])
  adminBorneId  String?
  adminBorne    AdminBorne? @relation(fields: [adminBorneId], references: [id])
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  submissions   Submission[]
  enregistrements Enregistrement[]

  @@index([statut])
  @@index([adminBorneId])
  @@map("bornes")
}

// Définition dynamique d'un formulaire
model Formulaire {
  id                   String      @id @default(uuid())
  label                String
  version              String      @default("1.0.0")
  statut               String      @default("brouillon") // brouillon | publie | archive
  dureeRetourAccueil   Int         @default(30)  // secondes
  annulationInactivite Int         @default(120) // secondes
  pageDebutConfig      Json        // { fr: {...}, es: {...}, en: {...} }
  pageFinConfig        Json        // { fr: {...}, es: {...}, en: {...} }
  createdAt            DateTime    @default(now())
  updatedAt            DateTime    @updatedAt
  questions            Question[]
  bornes               Borne[]
  enregistrements      Enregistrement[]

  @@index([statut])
  @@map("formulaires")
}

// Question d'un formulaire avec libellés trilingues
model Question {
  id              String    @id @default(uuid())
  formulaireId    String
  formulaire      Formulaire @relation(fields: [formulaireId], references: [id], onDelete: Cascade)
  libelleQuestion Json      // { fr: "...", es: "...", en: "..." }
  typeOption      String    // texte_court | texte_long | option_unique | options_multiples | telephone | email
  options         Json?     // [{ id: "uuid", label: { fr: "...", es: "...", en: "..." } }]
  orderPage       Int
  obligatoire     Boolean   @default(false)
  paragrapheInfo  Json?     // { fr: "...", es: "...", en: "..." }
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  reponses        EnregistrementReponse[]

  @@index([formulaireId, orderPage])
  @@map("questions")
}

// Soumission d'un visiteur sur une borne (nouveau modèle V2)
model Enregistrement {
  id              String    @id @default(uuid())
  borneId         String
  borne           Borne     @relation(fields: [borneId], references: [id])
  formulaireId    String
  formulaire      Formulaire @relation(fields: [formulaireId], references: [id])
  langueUtilisee  String    @default("fr")
  statutPartage   String    @default("en_attente") // en_attente | en_cours | partage | echec_temporaire | echec_definitif
  tentatives      Int       @default(0)
  derniereErreur  String?
  partageAt       DateTime?
  submissionId    String?   @unique // lien V1 pour migration
  submission      Submission? @relation(fields: [submissionId], references: [id])
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  reponses        EnregistrementReponse[]

  @@index([borneId, createdAt])
  @@index([statutPartage])
  @@map("enregistrements")
}

// Réponse individuelle à une question dans un enregistrement
model EnregistrementReponse {
  id               String        @id @default(autoincrement()) @map("id")
  enregistrementId String
  enregistrement   Enregistrement @relation(fields: [enregistrementId], references: [id], onDelete: Cascade)
  questionId       String
  question         Question      @relation(fields: [questionId], references: [id])
  valeur           String        // valeur textuelle ou ID d'option

  @@index([enregistrementId])
  @@map("enregistrement_reponses")
}

// SuperAdmin (stocké séparément pour isolation des rôles)
model SuperAdmin {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   // bcrypt, facteur >= 12
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("super_admins")
}

// Job de partage I-CRM dans la queue
model PartageJob {
  id               String    @id @default(uuid())
  enregistrementId String
  statut           String    @default("en_attente") // en_attente | en_cours | succes | echec_temporaire | echec_definitif
  tentatives       Int       @default(0)
  prochainEssai    DateTime?
  erreur           String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([statut, prochainEssai])
  @@map("partage_jobs")
}
```

---

## 2. Structure JSON trilingue standard

Tous les champs de texte affichés aux visiteurs utilisent la structure suivante :

```json
{
  "fr": "Texte en français",
  "es": "Texto en español",
  "en": "Text in English"
}
```

### 2.1 Structure pageDebutConfig

```json
{
  "fr": {
    "titre": "Estimez vos aides à la rénovation",
    "sousTitre": "Répondez à quelques questions pour découvrir vos aides",
    "labelBouton": "Commencer"
  },
  "es": {
    "titre": "Estime sus ayudas para la renovación",
    "sousTitre": "Responda algunas preguntas para descubrir sus ayudas",
    "labelBouton": "Comenzar"
  },
  "en": {
    "titre": "Estimate your renovation grants",
    "sousTitre": "Answer a few questions to discover your grants",
    "labelBouton": "Start"
  }
}
```

### 2.2 Structure pageFinConfig

```json
{
  "fr": {
    "titre": "Merci pour votre demande !",
    "message": "Un conseiller vous contactera dans les 48 heures.",
    "dureeAffichage": 10
  },
  "es": {
    "titre": "¡Gracias por su solicitud!",
    "message": "Un asesor le contactará en 48 horas.",
    "dureeAffichage": 10
  },
  "en": {
    "titre": "Thank you for your request!",
    "message": "An advisor will contact you within 48 hours.",
    "dureeAffichage": 10
  }
}
```

---

## 3. Architecture des endpoints API V2

### 3.1 Structure des routes

```
src/backend/src/routes/
├── auth.js              ← POST /api/auth/login (SuperAdmin + AdminBorne)
├── bornes.js            ← CRUD /api/bornes (SuperAdmin)
├── bornes-config.js     ← GET /api/bornes/:id/config (borne authentifiée)
├── admin-bornes.js      ← CRUD /api/admin-bornes (SuperAdmin)
├── formulaires.js       ← CRUD /api/formulaires (SuperAdmin)
├── questions.js         ← CRUD /api/formulaires/:id/questions (SuperAdmin)
├── enregistrements.js   ← POST/GET /api/enregistrements (borne + back-office)
├── partage.js           ← GET/POST /api/partage (SuperAdmin)
├── configuration.js     ← GET /api/configuration (V1 — conservé)
└── submissions.js       ← POST/GET/PUT /api/submissions (V1 — conservé)
```

### 3.2 Tableau complet des endpoints V2

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/login` | — | Connexion SuperAdmin ou AdminBorne |
| POST | `/api/auth/refresh` | JWT | Renouvellement du token |
| GET | `/api/bornes` | JWT SuperAdmin | Lister toutes les bornes |
| POST | `/api/bornes` | JWT SuperAdmin | Créer une borne |
| GET | `/api/bornes/:id` | JWT SuperAdmin/AdminBorne | Détail d'une borne |
| PUT | `/api/bornes/:id` | JWT SuperAdmin | Modifier une borne |
| PATCH | `/api/bornes/:id/statut` | JWT SuperAdmin | Activer/désactiver une borne |
| GET | `/api/bornes/:id/config` | JWT AdminBorne (borne) | Config complète borne + formulaire |
| GET | `/api/admin-bornes` | JWT SuperAdmin | Lister les AdminBorne |
| POST | `/api/admin-bornes` | JWT SuperAdmin | Créer un AdminBorne |
| GET | `/api/admin-bornes/:id` | JWT SuperAdmin | Détail d'un AdminBorne |
| PUT | `/api/admin-bornes/:id` | JWT SuperAdmin | Modifier un AdminBorne |
| PATCH | `/api/admin-bornes/:id/statut` | JWT SuperAdmin | Activer/désactiver un AdminBorne |
| POST | `/api/admin-bornes/:id/reset-password` | JWT SuperAdmin | Réinitialiser le mot de passe |
| GET | `/api/formulaires` | JWT SuperAdmin | Lister les formulaires |
| POST | `/api/formulaires` | JWT SuperAdmin | Créer un formulaire |
| GET | `/api/formulaires/:id` | JWT SuperAdmin | Détail d'un formulaire avec questions |
| PUT | `/api/formulaires/:id` | JWT SuperAdmin | Modifier un formulaire |
| PATCH | `/api/formulaires/:id/statut` | JWT SuperAdmin | Changer le statut |
| POST | `/api/formulaires/:id/dupliquer` | JWT SuperAdmin | Dupliquer un formulaire |
| GET | `/api/formulaires/:id/questions` | JWT SuperAdmin | Lister les questions |
| POST | `/api/formulaires/:id/questions` | JWT SuperAdmin | Ajouter une question |
| PUT | `/api/formulaires/:id/questions/:qid` | JWT SuperAdmin | Modifier une question |
| DELETE | `/api/formulaires/:id/questions/:qid` | JWT SuperAdmin | Supprimer une question |
| PATCH | `/api/formulaires/:id/questions/reorder` | JWT SuperAdmin | Réordonner les questions |
| POST | `/api/enregistrements` | JWT AdminBorne (borne) | Créer un enregistrement |
| GET | `/api/enregistrements` | JWT SuperAdmin/AdminBorne | Lister les enregistrements |
| GET | `/api/enregistrements/:id` | JWT SuperAdmin/AdminBorne | Détail d'un enregistrement |
| GET | `/api/enregistrements/export` | JWT SuperAdmin/AdminBorne | Export XLSX |
| GET | `/api/partage/jobs` | JWT SuperAdmin | Lister les jobs de partage |
| POST | `/api/partage/jobs/:id/relancer` | JWT SuperAdmin | Relancer un job en échec |
| GET | `/api/dashboard/superadmin` | JWT SuperAdmin | Métriques tableau de bord |
| GET | `/api/dashboard/adminborne` | JWT AdminBorne | Métriques tableau de bord |

### 3.3 Format de réponse standard

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

### 3.4 Format d'erreur standard

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides",
    "details": [...]
  }
}
```

### 3.5 Payload GET /api/bornes/:id/config

```json
{
  "borne": {
    "id": "uuid",
    "idBorne": "BORNE-001",
    "langueDefaut": "fr",
    "adresse": "12 rue de la Paix, 75001 Paris",
    "commercant": "Brico Pro",
    "regie": null,
    "installateur": "EcoInstall"
  },
  "formulaire": {
    "id": "uuid",
    "label": "Estimer Mes Aides 2026",
    "version": "2.0.0",
    "dureeRetourAccueil": 30,
    "annulationInactivite": 120,
    "pageDebutConfig": { "fr": {...}, "es": {...}, "en": {...} },
    "pageFinConfig": { "fr": {...}, "es": {...}, "en": {...} },
    "questions": [
      {
        "id": "uuid",
        "libelleQuestion": { "fr": "...", "es": "...", "en": "..." },
        "typeOption": "option_unique",
        "options": [
          { "id": "opt-1", "label": { "fr": "Appartement", "es": "Apartamento", "en": "Apartment" } }
        ],
        "orderPage": 1,
        "obligatoire": false,
        "paragrapheInfo": { "fr": null, "es": null, "en": null }
      }
    ]
  }
}
```

---

## 4. Architecture des composants React

### 4.1 Structure des applications frontend

```
src/
├── backend/                    ← API Node.js (existant, étendu)
├── frontend/                   ← Front-Office Borne (existant, refactorisé)
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx         ← NOUVEAU — connexion AdminBorne
│       │   ├── StartPage.jsx         ← NOUVEAU — page de début visiteur
│       │   ├── FormPage.jsx          ← MODIFIÉ — formulaire dynamique
│       │   ├── ConfirmationPage.jsx  ← MODIFIÉ — page de fin configurable
│       │   └── ErrorPage.jsx         ← NOUVEAU — erreur config
│       ├── components/
│       │   ├── AppHeader.jsx         ← MODIFIÉ — dégradé V2 + barre info borne
│       │   ├── LanguageSelector.jsx  ← NOUVEAU — sélecteur FR/ES/EN
│       │   ├── StepBadge.jsx         ← NOUVEAU — badge étape numéroté
│       │   ├── InactivityManager.jsx ← NOUVEAU — gestion inactivité
│       │   ├── ExitButton.jsx        ← NOUVEAU — bouton exit + modal
│       │   ├── FieldRenderer.jsx     ← MODIFIÉ — rendu dynamique par typeOption
│       │   ├── ProgressBar.jsx       ← CONSERVÉ
│       │   └── NavigationBar.jsx     ← CONSERVÉ
│       ├── context/
│       │   ├── FormContext.jsx       ← MODIFIÉ — support i18n + borne
│       │   └── BorneContext.jsx      ← NOUVEAU — config borne + langue
│       ├── hooks/
│       │   ├── useBorneConfig.js     ← NOUVEAU — chargement config borne
│       │   ├── useInactivity.js      ← NOUVEAU — timer inactivité
│       │   └── useOfflineSync.js     ← NOUVEAU — sync IndexedDB
│       └── services/
│           ├── api.js                ← MODIFIÉ — nouveaux endpoints
│           └── offlineStorage.js     ← NOUVEAU — IndexedDB wrapper
│
├── backoffice/                 ← NOUVEAU — Back-Office SuperAdmin + AdminBorne
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── superadmin/
│       │   │   ├── DashboardPage.jsx
│       │   │   ├── BornesListPage.jsx
│       │   │   ├── BorneFormPage.jsx
│       │   │   ├── AdminBornesListPage.jsx
│       │   │   ├── AdminBorneFormPage.jsx
│       │   │   ├── FormulairesListPage.jsx
│       │   │   ├── FormulaireEditorPage.jsx
│       │   │   ├── EnregistrementsListPage.jsx
│       │   │   └── PartageJobsPage.jsx
│       │   └── adminborne/
│       │       ├── DashboardPage.jsx
│       │       ├── BornesPage.jsx
│       │       └── EnregistrementsPage.jsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   ├── TopBar.jsx
│       │   │   └── ProtectedRoute.jsx
│       │   ├── forms/
│       │   │   ├── I18nTextInput.jsx   ← saisie trilingue avec onglets
│       │   │   ├── QuestionEditor.jsx  ← éditeur de question
│       │   │   └── OptionEditor.jsx    ← éditeur d'options
│       │   ├── tables/
│       │   │   ├── DataTable.jsx
│       │   │   └── ExportButton.jsx
│       │   └── charts/
│       │       └── EnregistrementsChart.jsx
│       ├── context/
│       │   └── AuthContext.jsx         ← JWT + rôle
│       └── services/
│           ├── api.js
│           └── pusher.js               ← client Pusher WebSocket
│
└── crm-module/                 ← CONSERVÉ (V1)
```

### 4.2 Composant BorneContext (Front-Office)

```jsx
// Fournit : config borne, langue active, setLangue, formulaire, questions
const BorneContext = createContext(null)

const initial = {
  borne: null,          // données de la borne
  formulaire: null,     // formulaire actif
  questions: [],        // questions triées par orderPage
  langue: 'fr',         // langue active du visiteur
  configLoaded: false,
  configError: null,
}
```

### 4.3 Hook useInactivity

```javascript
// Surveille l'inactivité et déclenche les callbacks configurés
function useInactivity({ 
  delaiAnnulation,    // annulation_inactivite en secondes
  delaiRetourAccueil, // duree_retour_accueil en secondes
  onAnnulation,       // callback : annuler la session
  onRetourAccueil,    // callback : retour page de début
  actif = true        // activer/désactiver la surveillance
})
```

---

## 5. Flux de données

### 5.1 Flux de démarrage de la borne

```
1. Borne démarre
2. Vérification JWT en cache → valide ?
   ├── OUI → charger config depuis cache (si TTL < 24h) ou API
   └── NON → afficher LoginPage AdminBorne
3. AdminBorne saisit email + password
4. POST /api/auth/login → JWT (24h, rôle ADMIN_BORNE, borneId)
5. GET /api/bornes/:id/config → config complète
6. Stocker config dans localStorage avec timestamp
7. Afficher StartPage (page de début)
```

### 5.2 Flux de session visiteur

```
1. Visiteur arrive sur StartPage
2. Sélection langue (optionnel, défaut = langue_defaut de la borne)
3. Appui sur "Commencer" → démarrer session + timer inactivité
4. Navigation question par question (orderPage)
5. Réponse à chaque question → stocker dans FormContext
6. Dernière question → appui "Terminer"
7. Créer enregistrement en IndexedDB (offline-first)
8. POST /api/enregistrements → succès ou échec réseau
9. Afficher PageFin (page_fin_config dans la langue du visiteur)
10. Après duree_retour_accueil secondes → retour StartPage
```

### 5.3 Flux de partage I-CRM asynchrone

```
1. Enregistrement créé → PartageJob créé (statut: en_attente)
2. Queue Worker (setInterval ou cron) → récupère jobs en_attente
3. Appel API I-CRM externe (format field_values V1)
4. Succès → statut: partage, Pusher event "partage.succes"
5. Échec → tentatives++
   ├── tentatives < 3 → statut: echec_temporaire, planifier retry
   │   Délais : 1 min → 5 min → 15 min (exponentiel)
   └── tentatives >= 3 → statut: echec_definitif, Pusher event "partage.echec"
6. Back-office reçoit événement Pusher → mise à jour UI temps réel
```

### 5.4 Flux de synchronisation offline

```
1. Enregistrement soumis hors ligne → stocké dans IndexedDB
2. Service Worker / useOfflineSync surveille navigator.onLine
3. Connexion rétablie → récupérer enregistrements IndexedDB non synchronisés
4. POST /api/enregistrements pour chaque enregistrement en attente
5. Succès → supprimer de IndexedDB, marquer comme synchronisé
```

---

## 6. Stratégie de migration V1 → V2

### 6.1 Principes

- **Zéro perte de données** : les tables V1 (submissions, submission_values, configurations) sont conservées intactes.
- **Rétrocompatibilité API** : les endpoints V1 (`/api/configuration`, `/api/submissions`) restent fonctionnels.
- **Migration progressive** : les nouvelles bornes utilisent le modèle V2 (Enregistrement), les anciennes soumissions V1 restent accessibles via le module CRM existant.

### 6.2 Script de migration Prisma

```sql
-- Migration 001 : Ajout des nouveaux modèles
-- Les tables existantes ne sont pas modifiées
-- Ajout de borneId nullable sur submissions (rétrocompatible)
ALTER TABLE submissions ADD COLUMN borne_id UUID REFERENCES bornes(id);

-- Création des nouvelles tables
CREATE TABLE super_admins (...);
CREATE TABLE admin_bornes (...);
CREATE TABLE bornes (...);
CREATE TABLE formulaires (...);
CREATE TABLE questions (...);
CREATE TABLE enregistrements (...);
CREATE TABLE enregistrement_reponses (...);
CREATE TABLE partage_jobs (...);
```

### 6.3 Seed V2

Le script de seed V2 crée :
1. Un SuperAdmin par défaut (email + mot de passe temporaire)
2. Un formulaire V2 équivalent au formulaire V1 hardcodé (15 questions, trilingue)
3. Une borne de démonstration liée au formulaire V2

### 6.4 Réutilisation du module CRM existant

Le module CRM (`src/crm-module/`) est conservé sans modification pour la synchronisation manuelle des soumissions V1. Les enregistrements V2 utilisent le nouveau flux de partage I-CRM asynchrone.

---

## 7. Sécurité et authentification

### 7.1 Structure du JWT

```json
{
  "sub": "uuid-admin",
  "role": "SUPER_ADMIN" | "ADMIN_BORNE",
  "borneId": "uuid-borne",  // uniquement pour ADMIN_BORNE
  "iat": 1234567890,
  "exp": 1234567890
}
```

### 7.2 Middleware d'autorisation

```javascript
// src/backend/src/middleware/roleAuth.js
export function requireRole(...roles) {
  return (req, res, next) => {
    const { role } = req.user  // injecté par jwtAuth
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Accès refusé' })
    }
    next()
  }
}

// src/backend/src/middleware/borneOwnership.js
// Vérifie que l'AdminBorne a accès à la borne demandée
export async function checkBorneOwnership(req, res, next) {
  if (req.user.role === 'SUPER_ADMIN') return next()
  const borne = await prisma.borne.findFirst({
    where: { id: req.params.borneId, adminBorneId: req.user.sub }
  })
  if (!borne) return res.status(403).json({ error: 'Accès refusé' })
  next()
}
```

### 7.3 Rate limiting

```javascript
// Appliqué sur /api/auth/login
import rateLimit from 'express-rate-limit'
const authLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,
  message: { error: 'Trop de tentatives, réessayez dans 1 minute' }
})
```

---

## 8. Intégration Pusher WebSocket

### 8.1 Configuration

```javascript
// Backend : pusher-js server
import Pusher from 'pusher'
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
})

// Émettre un événement lors d'un changement de statut
await pusher.trigger(`borne-${borneId}`, 'partage.succes', {
  enregistrementId,
  timestamp: new Date().toISOString()
})
```

### 8.2 Client back-office

```javascript
// src/backoffice/src/services/pusher.js
import PusherClient from 'pusher-js'
const client = new PusherClient(process.env.VITE_PUSHER_KEY, {
  cluster: process.env.VITE_PUSHER_CLUSTER
})

export function subscribeToBorne(borneId, onEvent) {
  const channel = client.subscribe(`borne-${borneId}`)
  channel.bind('partage.succes', onEvent)
  channel.bind('partage.echec', onEvent)
  return () => client.unsubscribe(`borne-${borneId}`)
}
```

---

## 9. Variables d'environnement V2

```bash
# src/backend/.env (ajouts V2)
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=eu
SUPERADMIN_EMAIL=admin@estimer-mes-aides.fr
SUPERADMIN_PASSWORD_TEMP=...  # généré au premier déploiement

# src/backoffice/.env
VITE_API_URL=https://estimer-mes-aides-production.up.railway.app
VITE_PUSHER_KEY=...
VITE_PUSHER_CLUSTER=eu

# src/frontend/.env (ajouts V2)
VITE_API_URL=https://estimer-mes-aides-production.up.railway.app
VITE_API_KEY=ema_mobile_...  # conservé pour rétrocompatibilité
```
