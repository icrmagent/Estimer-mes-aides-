# Plan de Projet — Estimer Mes Aides
> Dernière mise à jour : Mai 2026
> Statut global : Production déployée ✅ — Phase d'amélioration continue

---

## Légende
- `[x]` Terminé ✅
- `[-]` En cours 🔄
- `[ ]` À faire
- `[ ]*` Optionnel

---

## PHASE 1 — Setup & Architecture ✅

- [x] 1.1 Initialisation des projets (backend, frontend, crm-module)
- [x] 1.2 Schéma Prisma (Configuration, Submission, SubmissionValue)
- [x] 1.3 Variables d'environnement (.env backend + frontend)
- [x] 1.4 Structure de dossiers complète
- [x] 1.5 Configuration Railway (railway.toml)
- [x] 1.6 Configuration Vercel (vercel.json)

---

## PHASE 2 — Backend API ✅

- [x] 2.1 GET /api/configuration (avec cache ETag)
- [x] 2.2 POST /api/submissions (validation Zod, UUID v4, synced=false)
- [x] 2.3 GET /api/submissions (filtres synced, since, limit, page)
- [x] 2.4 PUT /api/submissions/:id/sync (avec crmProjectId optionnel)
- [x] 2.5 Middleware apiKeyAuth (x-api-key header)
- [x] 2.6 Middleware jwtAuth (Bearer JWT)
- [x] 2.7 Seed de la configuration formulaire (15 étapes, vrais field IDs CRM)
- [x] 2.8 Tests Jest + Supertest (29 tests — tous passent)
- [x] 2.9 Script generate-crm-jwt.js

---

## PHASE 3 — Frontend WebView ✅

- [x] 3.1 WelcomePage (logo, titre, bouton "Commencer")
- [x] 3.2 FormPage (orchestrateur 15 étapes)
- [x] 3.3 ConfirmationPage (UUID tronqué, message conseiller)
- [x] 3.4 FormContext (state global : config, values, currentStep)
- [x] 3.5 useFormConfig hook (cache localStorage 24h)
- [x] 3.6 FieldRenderer (types 1, 2, 4, 5, 6, 50)
- [x] 3.7 AppHeader (fixe, violet, titre étape)
- [x] 3.8 ProgressBar (animée, % avancement)
- [x] 3.9 NavigationBar (Précédent / Suivant, désactivé si invalide)
- [x] 3.10 PhoneInput (sélecteur indicatif pays)
- [x] 3.11 Validation client (champs obligatoires bloquent Suivant)
- [x] 3.12 Mode offline (IndexedDB via idb-keyval)
- [x] 3.13 Responsive 375px (iPhone SE) + 390px (Android)
- [x] 3.14 Design system #5C2DD3 appliqué

---

## PHASE 4 — Module CRM Sync ✅

- [x] 4.1 LoginScreen (saisie JWT, validation contre API)
- [x] 4.2 SyncDashboard (tableau soumissions non synchronisées)
- [x] 4.3 Import CRM (sélection + import batch)
- [x] 4.4 Marquage synced=true via PUT /api/submissions/:id/sync
- [x] 4.5 Export Excel (.xlsx via SheetJS)
- [x] 4.6 Rapport de synchronisation (X importés, Y erreurs)

---

## PHASE 5 — Tests E2E & Déploiement ✅

- [x] 5.1 Tests Playwright (9 tests E2E)
- [x] 5.2 GitHub Actions CI (backend tests + E2E + frontend build)
- [x] 5.3 Déploiement Railway (backend production)
- [x] 5.4 Déploiement Vercel (frontend + crm-module production)
- [x] 5.5 APK Android WebView (5.5 MB, minSdk 26)

---

## PHASE 6 — Améliorations & Maintenance (En cours)

### 6.1 — Qualité & Tests
- [ ] 6.1.1 Ajouter tests Vitest pour les composants React (FieldRenderer, NavigationBar)
- [ ] 6.1.2 Augmenter la couverture de tests backend (edge cases)
- [ ] 6.1.3 Tests E2E pour le module CRM Sync
- [ ]* 6.1.4 Tests de performance (Lighthouse mobile)

### 6.2 — UX & Accessibilité
- [ ] 6.2.1 Ajouter un écran de récapitulatif avant soumission finale
- [ ] 6.2.2 Améliorer les messages d'erreur de validation (plus descriptifs)
- [ ] 6.2.3 Ajouter des animations de transition entre étapes (slide)
- [ ]* 6.2.4 Support mode sombre
- [ ]* 6.2.5 Accessibilité ARIA (labels, roles, focus management)

### 6.3 — Fonctionnalités
- [ ] 6.3.1 Sauvegarde automatique du formulaire en cours (localStorage)
- [ ] 6.3.2 Reprise de formulaire interrompu
- [ ]* 6.3.3 Synchronisation CRM automatique (cron job)
- [ ]* 6.3.4 Notifications push (soumission reçue)
- [ ]* 6.3.5 Dashboard analytics (nb soumissions/jour, taux de complétion)

### 6.4 — Infrastructure
- [ ] 6.4.1 Monitoring Railway (alertes si API down)
- [ ] 6.4.2 Rate limiting sur les endpoints API
- [ ]* 6.4.3 Logs structurés (JSON) avec niveau de log configurable
- [ ]* 6.4.4 Backup automatique Supabase

### 6.5 — Documentation
- [ ] 6.5.1 Documentation OpenAPI 3.0 (swagger.yaml)
- [ ]* 6.5.2 Guide d'intégration WebView native (iOS + Android)
- [ ]* 6.5.3 Runbook de maintenance (procédures opérationnelles)

---

## Prochaines actions prioritaires

1. **6.1.1** — Tests Vitest composants React (impact qualité élevé)
2. **6.2.1** — Écran récapitulatif avant soumission (UX critique)
3. **6.3.1** — Sauvegarde automatique formulaire en cours (UX critique)
4. **6.4.1** — Monitoring Railway (fiabilité production)
5. **6.5.1** — Documentation OpenAPI (facilite les intégrations futures)

---

## Métriques de qualité actuelles

| Métrique | Valeur | Cible |
|---------|--------|-------|
| Tests backend | 29/29 ✅ | ≥ 29 |
| Tests E2E | 9/9 ✅ | ≥ 9 |
| Tests frontend | 0 ⚠️ | ≥ 20 |
| Couverture backend | ~70% | ≥ 80% |
| Lighthouse mobile | Non mesuré | ≥ 90 |
| Temps réponse API | < 500ms | < 200ms |
