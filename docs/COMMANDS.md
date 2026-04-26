# COMMANDS.md — Commandes Claude Code Personnalisées

## Vue d'ensemble
Commandes prêtes à copier-coller dans Claude Code pour les tâches récurrentes.
Classées par domaine et par fréquence d'usage.

---

## 🚀 DÉMARRAGE DE SESSION

### Commande de démarrage standard (à utiliser à CHAQUE session)
```
Lis CLAUDE.md et tous les fichiers docs/ avant de commencer.
Résume en 3 lignes : (1) état actuel du projet, (2) ce qui est fait, (3) ce qui reste.
Ensuite, attends mes instructions.
```

### Commande de démarrage focalisé (quand on sait ce qu'on fait)
```
Lis CLAUDE.md et docs/PLAN.md.
On est en Phase [X]. On travaille sur [TÂCHE PRÉCISE].
Stack : React/Vite frontend + Node.js/Express/Prisma backend + PostgreSQL.
Couleur primaire : #5C2DD3. Mobile-first. Touch ≥48px.
Commence directement, pas besoin de résumé.
```

---

## ⚙️ COMMANDES BACKEND

### Créer un endpoint
```
@BACKEND-DEV
Crée l'endpoint [MÉTHODE] /api/[route] dans src/routes/[fichier].js.
Body/params : [description du format attendu].
Auth : [x-api-key MOBILE | JWT-Bearer CRM].
Validation Zod : [champs et règles].
Réponse success : [format JSON].
Codes d'erreur : [400 si X, 401 si Y, 404 si Z, 500 si erreur DB].
Ajoute le test Supertest dans tests/[fichier].test.js.
```

### Modifier le schema Prisma
```
@BACKEND-DEV
Modifie prisma/schema.prisma pour [description de la modification].
Génère ensuite la migration : npx prisma migrate dev --name [nom-migration].
Vérifie que les relations sont cohérentes.
Mets à jour le seed si nécessaire.
```

### Générer un token JWT CRM pour les tests
```
@BACKEND-DEV
Crée un script scripts/generate-crm-jwt.js qui génère un token JWT signé avec JWT_SECRET.
Payload : { role: "crm", iat: now, exp: now+1h }.
Affiche le token dans la console.
Usage : node scripts/generate-crm-jwt.js
```

### Seed de la configuration du formulaire
```
@BACKEND-DEV
Crée prisma/seed.js avec la configuration complète du formulaire "Estimer vos aides".
Source de vérité : docs/CONTEXT.md (15 étapes, vrais field IDs CRM).
Format : { formDefinition: { tabs: [...], categories: [...], fields: [...] }, version: "1.0.0" }.
IMPORTANT : utiliser les vrais field IDs CRM (2262, 2087, 2088, 2217, 2089, 2090,
            2015, 2016, 2294, 2293, 2292, 2306, 2307, 2296, 2298, 2300, 2301,
            2302, 2297, 2299, 2303, 2304, 2305) — pas d'IDs inventés.
IMPORTANT : inclure les options possibles pour chaque champ radio/checkbox/enum.
Lance ensuite : npx prisma db seed.
```

---

## ⚛️ COMMANDES FRONTEND

### Créer un composant React
```
@FRONTEND-DEV
Crée le composant [NomComposant] dans src/components/[NomComposant]/index.jsx.
Props : [liste avec types TypeScript JSDoc].
Comportement : [description].
Design : tokens de docs/DESIGN.md, couleur #5C2DD3, mobile-first.
Touch targets ≥48px. Font-size inputs ≥16px.
Ajoute un test minimal dans [NomComposant].test.jsx.
```

### Créer une page
```
@FRONTEND-DEV
Crée la page [NomPage] dans src/pages/[NomPage].jsx.
Route : [chemin React Router].
Données chargées : [via quel hook/API].
Composants utilisés : [liste].
Design : fond #F8F7FC, cards blanches, header violet #5C2DD3.
```

### Implémenter FieldRenderer
```
@FRONTEND-DEV
Crée src/components/FieldRenderer/index.jsx.
Il doit gérer tous les fieldtype_id du projet :
- 1 (texte court) → <input type="text"> min-h-[48px] text-[16px]
- 2 (texte long) → <textarea> min-h-[120px]
- 4 (multi-choix) → CheckboxGroup custom avec style docs/DESIGN.md
- 5 (option unique) → RadioGroup custom avec style docs/DESIGN.md
- 6 (téléphone) → <input type="tel"> min-h-[48px] text-[16px]
- 50 (enum) → RadioGroup (même rendu que type 5)
Props : { field, value, onChange, error }.
Affiche le message d'erreur si error est défini.
```

### Implémenter useFormConfig hook
```
@FRONTEND-DEV
Crée src/hooks/useFormConfig.js.
Ce hook :
1. Vérifie le cache localStorage (clé: "ema_form_config", TTL: 24h)
2. Si cache valide → retourne la config cachée
3. Sinon → appelle GET /api/configuration avec le header x-api-key
4. Stocke en cache avec timestamp
5. Si erreur réseau et cache expiré → retourne null + setError
Retourne : { config, loading, error, reload }.
```

### Implémenter la navigation multi-étapes
```
@FRONTEND-DEV
Crée la logique de navigation dans src/context/FormContext.jsx.
State : { currentStep, totalSteps, values, errors, direction }.
Actions : nextStep(), prevStep(), setFieldValue(fieldId, value), validateStep().
currentStep commence à 0 (Welcome).
Les 10 sous-catégories du formulaire = steps 1 à 10.
Step 11 = Summary, Step 12 = Confirmation.
nextStep() valide les champs required de l'étape en cours avant d'avancer.
direction : "forward" | "backward" (pour l'animation de transition).
```

---

## 🔄 COMMANDES SYNCHRONISATION CRM

### Créer l'écran de synchronisation CRM
```
@CRM-INTEGRATOR
Crée l'interface de synchronisation CRM.
Elle doit :
1. Appeler GET /api/submissions?synced=false avec JWT Bearer
2. Afficher un tableau : Date | Prénom | Nom | Email | Nb champs | Actions
3. Checkbox de sélection par ligne + "Tout sélectionner"
4. Bouton "Importer la sélection"
5. Pour chaque import : créer le projet CRM + field_values + PUT sync
6. Afficher un rapport : "X importés, Y erreurs"
Stack CRM : [préciser selon le CRM existant].
```

---

## 🧪 COMMANDES TESTS

### Lancer tous les tests
```
@QA-TESTER
Lance tous les tests du projet.
Backend : cd backend && npm test (Jest + Supertest)
Frontend : cd frontend && npm test (Vitest + Testing Library)
Affiche un résumé des tests passés/échoués.
Si des tests échouent, identifie la cause et propose un fix.
```

### Tester le parcours complet
```
@QA-TESTER
Simule le parcours complet (15 étapes — voir docs/CONTEXT.md) :
1. Chargement de la config (GET /api/configuration)
2. Remplissage de toutes les étapes (données de test valides avec vrais field IDs CRM)
3. Validation des champs obligatoires frontend :
   Nom (2087), Prénom (2088), Code postal (2089), Ville (2090),
   Revenu fiscal (2294), Statut propriétaire (2293)
4. Soumission (POST /api/submissions)
5. Vérification que synced=false en base
6. Simulation sync CRM (GET soumissions + PUT sync)
7. Vérification que synced=true après sync
Signale tout ce qui ne fonctionne pas.
```

### Test responsive 375px
```
@QA-TESTER
Vérifie que l'interface est correcte sur 375px de large (iPhone SE).
Points à vérifier :
- Aucun débordement horizontal
- Tous les boutons ≥48px de hauteur
- Font-size des inputs ≥16px (pas de zoom iOS)
- Les cartes ont 16px de padding horizontal
- Le header n'est pas coupé
- La barre de navigation bas est fixe et non cachée
Utilise les outils de dev browser ou Playwright viewport: {width: 375, height: 667}.
```

---

## 🚢 COMMANDES DÉPLOIEMENT

### Déployer le backend sur Railway
```
@DEVOPS
Déploie le backend Node.js sur Railway.
- Assure-toi que railway.json ou Procfile est configuré
- Variables d'env nécessaires : DATABASE_URL, JWT_SECRET, API_KEY_MOBILE, API_KEY_CRM, PORT
- Lance la migration Prisma au démarrage : "npx prisma migrate deploy && node server.js"
- Vérifie que le déploiement répond sur HTTPS
- Teste GET /api/configuration après déploiement
```

### Déployer le frontend sur Vercel
```
@DEVOPS
Déploie le frontend React/Vite sur Vercel.
- Build command : npm run build
- Output directory : dist
- Variables d'env : VITE_API_URL (URL Railway prod), VITE_API_KEY
- Vérifie que l'app se charge correctement
- Vérifie que les appels API vers Railway fonctionnent (CORS configuré)
```

---

## 🔧 COMMANDES UTILITAIRES

### Générer la doc API (OpenAPI)
```
@BACKEND-DEV
Génère la documentation OpenAPI 3.0 de l'API dans backend/openapi.yaml.
Inclus tous les endpoints : GET /api/configuration, POST /api/submissions,
GET /api/submissions, PUT /api/submissions/{id}/sync.
Pour chaque endpoint : description, paramètres, body, réponses (200/201/400/401/404).
Ajoute les deux schémas d'auth : x-api-key header et JWT Bearer.
```

### Déboguer une soumission
```
@BACKEND-DEV
Trouve et affiche la soumission avec l'ID [UUID] dans la base de données.
Affiche toutes ses valeurs (submission_values) mappées avec les noms de champs.
Indique si elle est synchronisée ou non et quand.
Utilise Prisma directement : npx prisma studio ou un script de diagnostic.
```

### Vérifier l'état de l'API en prod
```
@DEVOPS
Effectue un health check complet de l'API en production :
1. GET /api/configuration → doit retourner 200 + JSON valide
2. POST /api/submissions avec un payload de test → doit retourner 201
3. GET /api/submissions?synced=false (avec JWT CRM) → doit retourner 200
4. Vérifie les temps de réponse (doivent être < 1s)
5. Vérifie les headers HTTPS et CORS
Signale tout problème détecté.
```
