# Design — Estimer Mes Aides

## Architecture technique

```
[App Android WebView]  [App iOS WebView]  [Flutter App]
          ↕                   ↕                ↕
    ┌─────────────────────────────────────────────┐
    │         Frontend SPA (Vercel)               │
    │   React 19 + Vite 8 + TailwindCSS v4        │
    │   https://estimer-mes-aides.vercel.app       │
    └──────────────────┬──────────────────────────┘
                       │ HTTPS + x-api-key
    ┌──────────────────▼──────────────────────────┐
    │         Backend API (Railway)               │
    │   Node.js 20 + Express + Prisma v5          │
    │   https://...production.up.railway.app       │
    └──────────────────┬──────────────────────────┘
                       │ SSL PostgreSQL
    ┌──────────────────▼──────────────────────────┐
    │         Base de données (Supabase)          │
    │   PostgreSQL — aws-1-eu-north-1             │
    └─────────────────────────────────────────────┘
                       ▲
                       │ HTTPS + JWT Bearer
    ┌──────────────────┴──────────────────────────┐
    │         Module CRM (Vercel)                 │
    │   React 19 + Vite 8 + SheetJS               │
    │   https://crm-module-ivory.vercel.app        │
    └─────────────────────────────────────────────┘
```

---

## Schéma de base de données

```prisma
model Configuration {
  id             Int      @id @default(autoincrement())
  formDefinition Json     // définition complète du formulaire
  version        String   // ex: "1.0.0"
  updatedAt      DateTime @updatedAt
  @@map("configurations")
}

model Submission {
  id            String            @id @default(uuid())
  createdAt     DateTime          @default(now())
  configVersion String
  synced        Boolean           @default(false)
  syncedAt      DateTime?
  crmProjectId  String?
  values        SubmissionValue[]
  @@index([synced, createdAt])
  @@map("submissions")
}

model SubmissionValue {
  id           Int        @id @default(autoincrement())
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  fieldId      Int        // vrai ID CRM (2087, 2088, etc.)
  value        String
  @@index([submissionId])
  @@index([fieldId])
  @@map("submission_values")
}
```

---

## Structure des composants React (Frontend)

```
src/frontend/src/
├── App.jsx                    ← Router + FormProvider
├── pages/
│   ├── WelcomePage.jsx        ← écran d'accueil avec logo
│   ├── FormPage.jsx           ← orchestrateur du formulaire
│   ├── ConfirmationPage.jsx   ← succès après soumission
│   └── PhoneInputDemo.jsx     ← démo sélecteur téléphone
├── components/
│   ├── AppHeader/             ← header fixe violet avec titre étape
│   ├── ProgressBar/           ← barre de progression animée
│   ├── FieldRenderer/         ← rendu dynamique par fieldtype_id
│   ├── NavigationBar/         ← boutons Précédent / Suivant
│   ├── Icons/                 ← icônes SVG du projet
│   └── PhoneInput/            ← input téléphone avec indicatif pays
├── context/
│   └── FormContext.jsx        ← state global (config, values, step)
├── hooks/
│   ├── useFormConfig.js       ← charge + cache config API
│   └── useOffline.js          ← détection offline + IndexedDB
├── services/
│   └── api.js                 ← client Axios configuré
└── data/                      ← config statique (fallback)
```

---

## Flux de données — Soumission formulaire

```
1. WelcomePage → clic "Commencer" → navigate('/form')
2. FormPage monte → useFormConfig() charge GET /api/configuration
   └─ cache localStorage valide ? → utiliser cache
   └─ sinon → fetch API → stocker en cache
3. FormContext.setConfig(config) → allSteps calculés (15 étapes)
4. Utilisateur navigue étape par étape
   └─ setValue(fieldId, value) → state.values mis à jour
   └─ isStepValid calculé → bouton Suivant activé/désactivé
5. Dernière étape → bouton "Envoyer"
   └─ submitForm(version, values) → POST /api/submissions
   └─ online → réponse { id, synced: false } → navigate('/confirmation')
   └─ offline → saveOfflineSubmission(IndexedDB) → navigate('/confirmation')
6. ConfirmationPage → affiche UUID tronqué + message
```

---

## API — Contrats d'interface

### GET /api/configuration
```json
// Réponse 200
{
  "version": "1.0.0",
  "updatedAt": "2026-04-26T00:00:00Z",
  "formDefinition": {
    "categories": [
      {
        "id": 37,
        "name": "Informations Personnelles",
        "subcategories": [
          {
            "id": 63,
            "name": "Information Personnelle 1/3",
            "fields": [
              { "id": 2087, "name": "Nom", "fieldtype_id": 1, "required": true, "uppercase": true }
            ]
          }
        ]
      }
    ]
  }
}
```

### POST /api/submissions
```json
// Body
{ "configVersion": "1.0.0", "values": [{ "fieldId": 2087, "value": "Dupont" }] }
// Réponse 201
{ "id": "uuid-v4", "createdAt": "ISO8601", "synced": false, "configVersion": "1.0.0" }
```

### GET /api/submissions
```json
// Query params: ?synced=false&since=2026-04-01&limit=50&page=1
// Réponse 200
{ "data": [...], "total": 42, "page": 1, "limit": 50 }
```

### PUT /api/submissions/:id/sync
```json
// Body (optionnel): { "crmProjectId": "crm-933" }
// Réponse 200
{ "id": "uuid", "synced": true, "syncedAt": "ISO8601", "crmProjectId": "crm-933" }
```

---

## Design System — Tokens

```css
/* Couleurs */
--c-primary:    #5C2DD3   /* NE PAS MODIFIER */
--c-surface:    #FFFFFF
--c-surface-2:  #F8F7FC
--c-text:       #1A1030
--c-error:      #EF4444
--c-success:    #10B981

/* Espacement */
--sp-4: 16px   /* padding page */
--sp-12: 48px  /* touch target minimum */

/* Typographie */
font-family: 'DM Sans', system-ui, sans-serif
font-size inputs: minimum 16px (évite zoom iOS)
```

---

## Déploiement

| Service | Plateforme | URL |
|---------|-----------|-----|
| Frontend | Vercel | https://estimer-mes-aides.vercel.app |
| Backend | Railway | https://estimer-mes-aides-production.up.railway.app |
| CRM Module | Vercel | https://crm-module-ivory.vercel.app |
| Base de données | Supabase | aws-1-eu-north-1.pooler.supabase.com |
