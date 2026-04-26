# Commandes Slash Personnalisées — Claude Code

## Usage
Ces commandes sont stockées dans .claude/commands/ et utilisables via /[nom] dans Claude Code.

---

## /start
**Démarrage de session standard**
```
Lis CLAUDE.md et tous les fichiers dans docs/.
Affiche un résumé de 3 lignes :
1. Phase actuelle (voir docs/PLAN.md)
2. Ce qui est implémenté
3. Prochaine tâche prioritaire
Attends mes instructions ensuite.
```

---

## /phase [numéro]
**Démarrer une phase précise**
```
Consulte docs/PLAN.md pour la Phase $ARGUMENTS.
Liste toutes les tâches de cette phase.
Commence la première tâche non complétée.
Respecte les critères de validation avant de passer à la suivante.
```

---

## /component [nom]
**Créer un composant React**
```
@FRONTEND-DEV
Crée le composant React $ARGUMENTS dans src/components/$ARGUMENTS/.
Design : tokens de docs/DESIGN.md, mobile-first, touch ≥48px, couleur #5C2DD3.
Ajoute index.jsx + test minimal.
```

---

## /endpoint [MÉTHODE route]
**Créer un endpoint API**
```
@BACKEND-DEV
Crée l'endpoint $ARGUMENTS dans le backend Node.js/Express.
Validation Zod. Auth appropriée (API Key ou JWT selon la route).
Test Supertest inclus.
Respecte les patterns de docs/SKILLS.md > SKILL: Auth API.
```

---

## /fix [description]
**Corriger un bug**
```
Bug à corriger : $ARGUMENTS
Localise la source du bug dans le code.
Écris d'abord un test qui échoue (reproduit le bug).
Corrige le code.
Vérifie que le test passe et que les autres tests ne sont pas cassés.
```

---

## /test
**Lancer tous les tests**
```
Lance les tests :
- Backend : cd backend && npm test
- Frontend : cd frontend && npm test
Affiche le récapitulatif. Si des tests échouent, identifie la cause.
```

---

## /review
**Révision de code**
```
Effectue une révision du code récemment modifié.
Vérifie :
[ ] Touch targets ≥48px (si composants UI)
[ ] Font-size inputs ≥16px (si formulaires)
[ ] Auth bien protégée (si endpoints)
[ ] synced=false sur nouvelles soumissions (si submissions)
[ ] Pas de console.log oubliés
[ ] Variables d'env non hardcodées
[ ] Tests présents pour la nouvelle logique
Signale tout problème trouvé avec la ligne concernée.
```
