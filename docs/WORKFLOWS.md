# WORKFLOWS.md — Workflows de Développement

## Vue d'ensemble
Workflows standardisés pour chaque type de tâche. Suivre ces workflows garantit la cohérence du code.

---

## 🔄 WORKFLOW 1 — Ajouter un nouveau champ au formulaire

```
1. Identifier le fieldtype_id dans CONTEXT.md
2. S'assurer que FieldRenderer gère ce type (sinon ajouter le case)
3. Ajouter le champ à la config du formulaire (seed ou API config)
4. Tester le rendu sur 375px
5. Vérifier que la validation fonctionne (required → bloque Suivant)
6. Tester la soumission (valeur bien présente dans POST /api/submissions)
```

**Prompt Claude Code** :
```
@FRONTEND-DEV: Ajouter le champ [nom] de type fieldtype_id=[X] à la sous-catégorie [Y].
Options : [liste si radio/checkbox].
Obligatoire : [oui/non].
Vérifie que FieldRenderer gère le type [X], sinon ajoute le rendu.
Teste sur 375px.
```

---

## 🔄 WORKFLOW 2 — Créer un endpoint API

```
1. Définir le contrat (méthode, route, body, réponse, auth)
2. Créer le schema Zod de validation
3. Implémenter le handler dans src/routes/
4. Ajouter le middleware auth approprié (apiKeyAuth ou jwtAuth)
5. Écrire le test Supertest
6. Documenter dans OpenAPI (si Swagger configuré)
```

**Prompt Claude Code** :
```
@BACKEND-DEV: Créer l'endpoint [MÉTHODE] [/api/route].
Body attendu : [schema].
Auth : [api-key / jwt-bearer].
Réponse success : [format].
Erreurs à gérer : [liste].
Ajouter le test Supertest correspondant.
```

---

## 🔄 WORKFLOW 3 — Fix d'un bug

```
1. Reproduire le bug (note exacte : étape, input, comportement observé vs attendu)
2. Localiser le composant/service concerné
3. Écrire un test qui échoue (reproduit le bug)
4. Corriger le code
5. Vérifier que le test passe
6. Vérifier que les autres tests ne sont pas cassés
```

**Prompt Claude Code** :
```
Bug : [description précise]
Étape : [où dans le parcours]
Comportement observé : [ce qui se passe]
Comportement attendu : [ce qui devrait se passer]
@[AGENT concerné]: Localise et corrige ce bug. Écris un test qui valide le fix.
```

---

## 🔄 WORKFLOW 4 — Ajouter un composant UI

```
1. Consulter DESIGN.md pour les tokens CSS
2. Vérifier si un composant similaire existe déjà (réutiliser)
3. Créer le composant dans src/components/NomComposant/
4. index.jsx (composant) + NomComposant.test.jsx (tests)
5. Respecter : touch target ≥48px, pas de hover-only, mobile-first
6. Tester sur 375px et 390px
```

**Prompt Claude Code** :
```
@FRONTEND-DEV: Créer le composant [NomComposant].
Fonction : [description].
Props : [liste avec types].
Design : utilise les tokens de DESIGN.md. Couleur primaire #5C2DD3.
Touch targets ≥48px. Pas de styles hover-only.
Ajoute un test Vitest basique.
```

---

## 🔄 WORKFLOW 5 — Synchronisation CRM (test manuel)

```
1. S'assurer d'avoir des soumissions non synchronisées en base
   GET /api/submissions?synced=false (avec JWT CRM)

2. Vérifier le format des données retournées
   Comparer avec le format field_values CRM (projet 933)

3. Simuler l'import CRM
   POST sur le CRM avec les données transformées

4. Marquer comme synchronisé
   PUT /api/submissions/{id}/sync (avec JWT CRM)

5. Vérifier que synced=true en base
   GET /api/submissions?synced=true (doit apparaître)
```

**Commande de test** :
```bash
# Générer un token JWT CRM pour les tests
node scripts/generate-crm-jwt.js

# Tester la sync manuellement
curl -H "Authorization: Bearer $CRM_JWT" \
  "https://api.estimer-mes-aides.com/api/submissions?synced=false"
```

---

## 🔄 WORKFLOW 6 — Mise en production

```
1. Tests passent en local (npm run test:all)
2. Build frontend sans erreur (npm run build)
3. Variables d'env configurées sur Railway/Vercel
4. Migration Prisma en production (npx prisma migrate deploy)
5. Déploiement backend (git push → Railway auto-deploy)
6. Déploiement frontend (vercel --prod)
7. Smoke test : soumettre un formulaire de bout en bout
8. Vérifier les logs (Railway dashboard)
```

---

## 🔄 WORKFLOW 7 — Mise à jour de la configuration du formulaire

```
1. Modifier la config dans le CRM (interface admin CRM)
2. L'app mobile recharge la config au prochain lancement
   (ou forcer : bouton "Recharger la config" en dev)
3. Vérifier que les nouveaux champs s'affichent correctement
4. Vérifier que la validation reste cohérente
5. Invalider le cache localStorage si version changed
```

**Code de vérification de version** :
```javascript
// Dans useFormConfig.js
const cachedConfig = getCachedConfig();
if (cachedConfig && cachedConfig.version === serverConfig.version) {
  return cachedConfig; // cache encore valide
}
// Sinon : sauvegarder la nouvelle config + invalider l'ancienne
setCachedConfig(serverConfig);
```

---

## 📋 Checklist avant chaque commit

```
[ ] Les tests passent : npm test
[ ] Pas de console.log oubliés
[ ] Les variables d'env ne sont pas dans le code
[ ] Les touch targets font ≥48px (si UI modifiée)
[ ] Pas de scroll horizontal sur 375px (si UI modifiée)
[ ] L'auth est bien vérifiée sur les nouveaux endpoints
[ ] Les champs obligatoires bloquent bien Suivant
[ ] synced=false sur les nouvelles soumissions
```
