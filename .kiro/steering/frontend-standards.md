---
inclusion: fileMatch
fileMatchPattern: "src/frontend/**,src/backoffice/**,src/crm-module/**"
---

# Standards Frontend — Estimer Mes Aides V2

## Stack (commun à tous les frontends)
- **Framework** : React 19 + Vite 8
- **CSS** : TailwindCSS v4
- **Routing** : React Router v7
- **HTTP** : Axios
- **Tests** : Vitest + Testing Library

---

## src/frontend/ — Front-Office Borne (kiosque tablette)

### Rôle
Interface visiteur en mode kiosque sur tablette Android. Formulaire dynamique 15 étapes, trilingue (FR/ES/EN), offline-first.

### Structure
```
src/frontend/src/
├── pages/
│   ├── LoginPage.jsx         ← connexion AdminBorne sur la borne
│   ├── StartPage.jsx         ← accueil visiteur (page_debut_config)
│   ├── FormPage.jsx          ← formulaire dynamique V2
│   ├── ConfirmationPage.jsx  ← page de fin (page_fin_config)
│   └── ErrorPage.jsx         ← erreur config
├── components/
│   ├── AppHeader.jsx         ← dégradé #5B2D8E → #1A56A0
│   ├── LanguageSelector.jsx  ← drapeaux FR/ES/EN
│   ├── StepBadge.jsx         ← badge étape numéroté
│   ├── InactivityManager.jsx ← timer inactivité
│   ├── ExitButton.jsx        ← bouton exit + modal mdp
│   └── FieldRenderer.jsx     ← rendu par typeOption V2
├── context/
│   ├── BorneContext.jsx      ← config borne + langue active
│   └── FormContext.jsx       ← state formulaire
├── hooks/
│   ├── useBorneConfig.js     ← chargement + cache config (TTL 24h)
│   ├── useInactivity.js      ← timers annulation + retour accueil
│   └── useOfflineSync.js     ← IndexedDB offline-first
└── services/
    ├── api.js                ← Axios + JWT AdminBorne
    └── offlineStorage.js     ← IndexedDB wrapper
```

### Types de champs V2 (typeOption)
```javascript
texte_court    → <input type="text">
texte_long     → <textarea>
option_unique  → boutons radio custom (grille 3 col tablette / 1 col mobile)
options_multiples → cases à cocher custom
telephone      → <input type="tel">
email          → <input type="email">
```

### Règles kiosque
- Mode plein écran, masquer barre navigation Android
- Pas de window.open(), alert(), confirm()
- Touch targets ≥ 48px, font-size ≥ 16px
- Offline : config en cache localStorage (TTL 24h), enregistrements en IndexedDB
- Inactivité : annulation session après `annulation_inactivite` secondes
- Retour accueil après `duree_retour_accueil` secondes depuis page fin

### Internationalisation
```javascript
// Fonction utilitaire t() — fallback FR si ES/EN manquant
import { t } from '../utils/i18n.js'
const label = t(question.libelleQuestion, langue, 'fr')
// Structure texte i18n : { fr: "...", es: "...", en: "..." }
```

---

## src/backoffice/ — Back-Office SuperAdmin + AdminBorne

### Rôle
Interface d'administration web (desktop). Gestion des bornes, formulaires, enregistrements, AdminBornes.

### Structure
```
src/backoffice/src/
├── pages/
│   ├── LoginPage.jsx
│   ├── superadmin/
│   │   ├── DashboardPage.jsx       ← métriques + graphique recharts
│   │   ├── BornesListPage.jsx
│   │   ├── BorneFormPage.jsx
│   │   ├── AdminBornesListPage.jsx
│   │   ├── AdminBorneFormPage.jsx
│   │   ├── FormulairesListPage.jsx
│   │   ├── FormulaireEditorPage.jsx ← éditeur questions + I18nTextInput
│   │   ├── EnregistrementsListPage.jsx
│   │   └── PartageJobsPage.jsx
│   └── adminborne/
│       ├── DashboardPage.jsx
│       ├── BornesPage.jsx          ← lecture seule
│       └── EnregistrementsPage.jsx
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx
│   │   ├── Sidebar.jsx             ← navigation par rôle
│   │   ├── TopBar.jsx
│   │   └── ProtectedRoute.jsx
│   └── forms/
│       ├── I18nTextInput.jsx       ← saisie trilingue FR/ES/EN avec onglets
│       ├── QuestionEditor.jsx      ← drag-and-drop HTML5
│       └── OptionEditor.jsx
├── context/
│   └── AuthContext.jsx             ← JWT + rôle (SUPER_ADMIN | ADMIN_BORNE)
└── services/
    ├── api.js                      ← Axios + JWT interceptor
    └── pusher.js                   ← client Pusher WebSocket
```

### Auth back-office
```javascript
// AuthContext fournit : token, user, login(token), logout(), isAuthenticated
// user = payload JWT décodé : { sub, role, iat, exp }
// Redirection après login : SUPER_ADMIN → /superadmin/dashboard, ADMIN_BORNE → /adminborne/dashboard
```

### Pusher (notifications temps réel)
```javascript
import { subscribeToBorne } from '../services/pusher.js'
// S'abonner aux événements d'une borne
const unsubscribe = subscribeToBorne(borneId, (event) => {
  // event.type = 'partage.succes' | 'partage.echec'
  // Mettre à jour l'UI sans rechargement
})
// Cleanup : appeler unsubscribe() au unmount
```

### Règles back-office
- Couleur primaire #5B2D8E pour boutons d'action et navigation active
- Pas de window.open(), alert(), confirm() — utiliser modales React
- Touch targets ≥ 48px (accessible tablette aussi)
- Ne jamais afficher `passwordHash` dans les réponses ou l'UI
- Export XLSX via bouton qui appelle GET /api/enregistrements/export

---

## src/crm-module/ — Module CRM V1 (conservé)

### Rôle
Interface de synchronisation manuelle des soumissions V1 vers le CRM externe.

### Stack spécifique
- SheetJS pour export Excel
- JWT CRM (généré par `node scripts/generate-crm-jwt.js`)

---

## Règles communes à tous les frontends

### Couleurs
```
V2 primaire : #5B2D8E  ← TOUJOURS utiliser cette valeur
V2 secondaire : #1A56A0
V1 (obsolète) : #5C2DD3  ← NE PAS utiliser dans le code V2
```

### Accessibilité
- Touch targets ≥ 48px × 48px
- Font-size inputs ≥ 16px (évite zoom iOS)
- Pas de hover-only (tablette = pas de hover)
- Contraste suffisant sur fond dégradé

### Interdictions WebView
```javascript
// ❌ INTERDIT
window.open()
alert() / confirm() / prompt()
<a target="_blank">

// ✅ À utiliser
// Navigation React Router uniquement
// Modales React custom pour confirmations
```
