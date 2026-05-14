# CLAUDE.md — Estimer Mes Aides · WebView Mobile App
> Ce fichier est lu automatiquement par Claude Code à chaque session. Il contient le contexte complet du projet.

---

## 🎯 Projet en une ligne
Application mobile WebView (SPA responsive) permettant aux utilisateurs d'estimer leurs aides à la rénovation énergétique, avec backend autonome, base de données dédiée, et synchronisation manuelle vers un CRM existant.

## 📂 Structure des fichiers de référence
```
estimer-mes-aides/
├── docs/
│   ├── CLAUDE.md          ← CE FICHIER (lu automatiquement)
│   ├── AGENTS.md          ← Définition des agents IA du projet
│   ├── SKILLS.md          ← Skills techniques à maîtriser
│   ├── WORKFLOWS.md       ← Workflows de développement
│   ├── PLAN.md            ← Plan de développement phasé
│   ├── CONTEXT.md         ← Contexte métier complet (SOURCE DE VÉRITÉ formulaire)
│   ├── DESIGN.md          ← Système de design UI/UX
│   ├── USE_CASES.md       ← Cas d'utilisation détaillés
│   ├── COMMANDS.md        ← Commandes Claude Code personnalisées
│   └── OPTIMIZATION.md   ← Optimisation tokens & performance
└── src/
    ├── frontend/          ← Front-Office Borne (React/Vite)
    ├── backend/           ← API REST (Node.js/Express)
    └── backoffice/        ← Back-Office SuperAdmin + AdminBorne (V2)
```

---

## 🏗️ Architecture en un coup d'œil

```
[App Mobile WebView] ←→ [Backend Mobile API] ←→ [Base PostgreSQL]
                                ↑
                         [CRM Existant]
                    (pull synchronisation manuelle)
```

**Flux critiques :**
1. **Config** : CRM → `/api/configuration` → App mobile (cache local)
2. **Saisie** : App mobile → `POST /api/submissions` → PostgreSQL (synced=false)
3. **Sync CRM** : CRM bouton → `GET /api/submissions?synced=false` → intégration → `PUT /api/submissions/{id}/sync`

---

## 🛠️ Stack technique décidée

| Couche | Technologie | Raison |
|--------|-------------|--------|
| Frontend | React + Vite + TailwindCSS | SPA, build optimisé WebView |
| Backend | Node.js + Express + Prisma | API REST légère, ORM typé |
| Base de données | PostgreSQL (Supabase) | Robuste, accessible cloud |
| Auth API | JWT + API Key header | Sécurité backend ↔ CRM |
| Déploiement | Railway / Render | Simple, HTTPS automatique |
| WebView | React Native WebView | Wrapper natif minimal |

---

## 🎨 Design System (immuable)

```css
--color-primary: #5C2DD3;       /* Violet institutionnel */
--color-primary-dark: #4A1FAF;
--color-primary-light: #7B4AE2;
--color-accent: #F0EBFF;
--color-surface: #FFFFFF;
--color-surface-2: #F8F7FC;
--color-text: #1A1030;
--color-muted: #6B6888;
--color-error: #EF4444;
--color-success: #10B981;
--radius-card: 16px;
--radius-button: 12px;
--font-display: 'DM Sans', sans-serif;
--touch-target: 48px;           /* Minimum tactile */
--spacing-mobile: 16px;
```

---

## 📋 Formulaire de référence

> **Source de vérité complète : `docs/CONTEXT.md`**
> Tab ID: 22 | Projet de référence CRM: 933

### Vue d'ensemble : 15 étapes, 3 catégories

| Étape | Sous-cat ID | Catégorie | Champ(s) principal(aux) |
|-------|-------------|-----------|------------------------|
| 1 | 63 | **Informations Personnelles 1/3** | Civilité, **Nom*** (2087), **Prénom*** (2088), Adresse, **CP*** (2089), **Ville*** (2090), Tél, Email |
| 2 | 65 | **Informations Personnelles 2/3** | **Revenu fiscal*** (2294) |
| 3 | 75 | **Informations Personnelles 3/3** | **Statut propriétaire*** (2293) |
| 4 | 59 | **Lieu des Travaux 1/7** | Type de logement (2292) |
| 5 | 60 | **Lieu des Travaux 2/7** | Date de construction (2306) |
| 6 | 61 | **Lieu des Travaux 3/7** | Surface habitable (2307) |
| 7 | 62 | **Lieu des Travaux 4/7** | Type de combles (2296) |
| 8 | 66 | **Lieu des Travaux 5/7** | Type de plancher — non habitables (2298) |
| 9 | 71 | **Lieu des Travaux 6/7** | Trappe d'accès (2300) |
| 10 | 72 | **Lieu des Travaux 7/7** | Type de chauffage (2301) + Autre (2302) |
| 11 | 64 | **Vos Besoins 1/5** | Isolation combles habitables (2297) |
| 12 | 68 | **Vos Besoins 2/5** | Plancher combles non habitables (2298) |
| 13 | 70 | **Vos Besoins 3/5** | Type d'isolation souhaité (2299) |
| 14 | 73 | **Vos Besoins 4/5** | Travaux souhaités (2303) |
| 15 | 74 | **Vos Besoins 5/5** | Disponibilité contact (2304) + Commentaires (2305) |

`*` = obligatoire (règle métier frontend, `required: false` dans le CRM)

### Clés CRM importantes (noms en espagnol, affichage en français)
```
projets_Nombre          → Nom
projets_Apellidos       → Prénom
projets_Ciudad          → Ville
projets_Cdigo_postal    → Code postal
projets_ADRESSE         → Adresse
```

---

## 🔑 Règles absolues (ne jamais déroger)

1. **Mobile-first** : tout élément tactile ≥ 48px de hauteur
2. **Offline-capable** : config en cache localStorage, soumissions en IndexedDB si API down
3. **Validation double** : côté client ET côté backend avant persistance
4. **Jamais de connexion directe App → CRM** : toujours via le backend mobile
5. **UUID v4** pour tous les IDs de soumission
6. **HTTPS obligatoire** sur toutes les routes API
7. **synced=false** par défaut sur toute nouvelle soumission
8. **Champs obligatoires** (`*`) bloquent le bouton Suivant (validation frontend)
9. **Font-size inputs ≥ 16px** pour éviter le zoom automatique sur iOS
10. **Utiliser les vrais field IDs CRM** (2262, 2087…) dans le seed et les soumissions

---

## 🚦 État actuel du projet

> **PHASE** : [x] Setup ✅  [x] Backend ✅  [x] Frontend ✅  [ ] CRM Sync  [ ] Tests E2E  [ ] Deploy
> Prochaine étape : **Phase 4 — Module CRM Sync** (interface sync, import projets CRM, PUT /sync)

---

## 💬 Prompt de démarrage de session Claude Code

Coller ce texte en début de chaque nouvelle session Claude Code :

```
Lis CLAUDE.md et tous les fichiers dans docs/ avant de commencer.
Projet : Estimer Mes Aides — WebView Mobile + Backend API + CRM Sync.
Stack : React/Vite frontend, Node.js/Express/Prisma backend, PostgreSQL.
Couleur principale : #5C2DD3. Mobile-first. Touch targets ≥48px.
Formulaire : 15 étapes (3 catégories). Source de vérité : docs/CONTEXT.md.
Consulte docs/PLAN.md pour connaître la phase en cours.
Respecte les règles absolues dans CLAUDE.md section "Règles absolues".
```

---

*Dernière mise à jour : 26 avril 2026 — v3.0 (corrections structure formulaire + IDs CRM réels)*
