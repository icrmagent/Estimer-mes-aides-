---
inclusion: manual
---

# Workflows de Développement — Estimer Mes Aides V2

## Workflow 1 — Ajouter un champ au formulaire V2
```
1. Identifier le typeOption dans le design (texte_court, option_unique, etc.)
2. Ajouter la question via POST /api/formulaires/:id/questions (libellé FR obligatoire)
3. Vérifier que FieldRenderer.jsx gère ce typeOption (sinon ajouter le case)
4. Tester le rendu sur tablette (paysage) et mobile (portrait)
5. Vérifier la validation (obligatoire → bloque Suivant)
6. Tester la soumission (valeur présente dans POST /api/enregistrements)
```

## Workflow 2 — Créer un endpoint API V2
```
1. Définir le contrat (méthode, route, body, réponse, auth requis)
2. Créer le schema Zod de validation (body + query + params)
3. Implémenter le handler dans src/routes/ avec jwtAuthV2 + requireRole
4. Format réponse : { success: true, data: ... } ou { success: false, error: { code, message } }
5. Gérer P2002 → 409, P2025 → 404
6. Écrire le test Jest avec jest.unstable_mockModule (pattern ESM)
7. Vérifier que les 72+ tests existants passent toujours
```

## Workflow 3 — Corriger un bug
```
1. Reproduire le bug (étape, input, comportement observé vs attendu)
2. Localiser le composant/service concerné
3. Écrire un test qui échoue (reproduit le bug)
4. Corriger le code
5. Vérifier que le test passe
6. Vérifier que les autres tests ne sont pas cassés
```

## Workflow 4 — Ajouter un composant UI back-office
```
1. Consulter design-system-v2.md pour les tokens CSS (#5B2D8E, dégradé, etc.)
2. Vérifier si un composant similaire existe dans src/backoffice/src/components/
3. Créer dans src/backoffice/src/components/NomComposant.jsx
4. Respecter : touch target ≥48px, pas de hover-only, couleur primaire #5B2D8E
5. Pas de window.open(), alert(), confirm()
```

## Workflow 5 — Publier un formulaire V2
```
1. Créer le formulaire (POST /api/formulaires) → statut: brouillon
2. Ajouter les questions (POST /api/formulaires/:id/questions)
   - Chaque question DOIT avoir libelleQuestion.fr non vide
3. Tenter la publication (PATCH /api/formulaires/:id/statut { statut: 'publie' })
   - Si 422 VALIDATION_PUBLICATION → corriger les questions sans libellé FR
4. Assigner le formulaire à une borne (PUT /api/bornes/:id { formulaireId })
5. Vérifier sur la borne que GET /api/bornes/:id/config retourne le formulaire
```

## Workflow 6 — Tester le partage CRM asynchrone
```
1. Créer un enregistrement (POST /api/enregistrements)
   → Un PartageJob est créé automatiquement avec statut: en_attente
2. Le queueWorker.js traite les jobs toutes les 30 secondes
3. En cas d'échec : retry exponentiel (1min → 5min → 15min)
4. Après 3 échecs : statut echec_definitif + notification Pusher
5. Relance manuelle : POST /api/partage/jobs/:id/relancer
6. Vérifier les notifications Pusher dans le back-office
```

## Workflow 7 — Déploiement V2
```
1. Tests passent en local : npm test (72+ tests)
2. Build backoffice sans erreur : cd src/backoffice && npm run build
3. Build frontend sans erreur : cd src/frontend && npm run build
4. Variables d'env configurées :
   - Railway (backend) : PUSHER_*, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD_TEMP
   - Vercel (backoffice) : VITE_API_URL, VITE_PUSHER_KEY, VITE_PUSHER_CLUSTER
5. Migration Prisma : npx prisma migrate deploy
6. Seed SuperAdmin : npm run prisma:seed (ou script sécurisé en prod)
7. Push → Railway auto-deploy (backend)
8. Push → Vercel auto-deploy (frontend + backoffice + crm-module)
9. Smoke test : login SuperAdmin → créer borne → soumettre formulaire → vérifier enregistrement
```

## Workflow 8 — Tester le mode offline borne
```
1. Charger la config borne (GET /api/bornes/:id/config) → mise en cache localStorage
2. Couper la connexion réseau (DevTools → Offline)
3. Remplir et soumettre le formulaire
   → L'enregistrement doit être stocké en IndexedDB
   → La page de fin doit s'afficher normalement
4. Rétablir la connexion
   → useOfflineSync.js doit détecter navigator.onLine
   → L'enregistrement doit être synchronisé automatiquement
5. Vérifier dans le back-office que l'enregistrement apparaît
```

## Checklist avant chaque commit
```
[ ] Tests passent : npm test (72+ tests)
[ ] Pas de console.log oubliés
[ ] Variables d'env pas dans le code
[ ] Touch targets ≥48px (si UI modifiée)
[ ] Couleur primaire #5B2D8E (pas #5C2DD3)
[ ] Auth vérifiée sur les nouveaux endpoints (jwtAuthV2 + requireRole)
[ ] Format réponse { success: true/false, data/error } respecté
[ ] passwordHash jamais retourné dans les réponses
[ ] synced=false sur les nouvelles soumissions V1
[ ] Pas de window.open() ni alert() dans le frontend
[ ] Tests V1 (29) toujours verts (rétrocompatibilité)
```

## URLs de production
| Service | URL |
|---------|-----|
| Frontend Borne | https://estimer-mes-aides.vercel.app |
| Backend | https://estimer-mes-aides-production.up.railway.app |
| CRM Module | https://crm-module-ivory.vercel.app |
| Railway Dashboard | https://railway.com/project/c33e8de1-9d45-40d2-9a53-6a865dce2b70 |
| Vercel Dashboard | https://vercel.com/icrmagents-projects |
| GitHub | https://github.com/icrmagent/Estimer-mes-aides- |
