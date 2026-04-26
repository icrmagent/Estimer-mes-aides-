# USE_CASES.md — Cas d'Utilisation Détaillés

## Vue d'ensemble
Scénarios d'usage complets pour guider le développement et les tests.

---

## UC-01 — Saisie du formulaire (parcours nominal)

**Acteur** : Utilisateur final (particulier)
**Préconditions** : App ouverte, config chargée, formulaire vierge
**Résultat** : Soumission enregistrée en base (synced=false)

> Formulaire : 15 étapes. Voir docs/CONTEXT.md pour la structure complète.

### Scénario
```
1. L'utilisateur voit l'écran d'accueil
   → Titre "Estimer mes aides", bouton "Commencer"

2. Étape 1/15 — Informations Personnelles 1/3 (sous-cat 63)
   → Champs : Civilité (opt.), Nom* (2087), Prénom* (2088),
     ADRESSE (opt.), Code postal* (2089), Ville* (2090),
     Num. de Téléphone (opt.), Adresse Email (opt.)
   → Bouton "Suivant" GRISÉ tant que Nom, Prénom, Code postal OU Ville sont vides
   → Une fois tous obligatoires remplis → Suivant s'active → tap

3. Étape 2/15 — Informations Personnelles 2/3 (sous-cat 65)
   → Sélectionne revenu fiscal* (radio, obligatoire)
     Options : "1- Inférieur à 23734€" / "2- Entre 23734€ et 30427€" /
               "3- Entre 30428€ et 42848€" / "4- Supérieur à 42849€"
   → Tap sur une option → fond violet → Suivant actif

4. Étape 3/15 — Informations Personnelles 3/3 (sous-cat 75)
   → Sélectionne statut* (radio, obligatoire)
     Options : Propriétaire occupant / Propriétaire Bailleur /
               Propriétaire d'une résidence secondaire / Résident
   → Suivant

5. Étape 4/15 — Lieu des Travaux 1/7 (sous-cat 59)
   → Sélectionne type de logement (optionnel)
     Options : Appartement / Maison
   → Peut passer sans sélectionner → Suivant

6. Étape 5/15 — Lieu des Travaux 2/7 (sous-cat 60)
   → Sélectionne date de construction (optionnel)
     Options : "1- Entre 2 ans et 15 ans" / "2- Plus de 15 ans"
   → Suivant

7. Étape 6/15 — Lieu des Travaux 3/7 (sous-cat 61)
   → Sélectionne surface habitable (optionnel)
     Options : "1- 0 à 70 m2" / "2- 71 à 120 m2" / "3- 121 à 200 m2" / "4- + de 200 m2"
   → Suivant

8. Étape 7/15 — Lieu des Travaux 4/7 (sous-cat 62)
   → Sélectionne type de combles (optionnel)
     Options : "Combles aménagés / habitables" / "Combles perdus / non habitables"
   → Suivant

9. Étape 8/15 — Lieu des Travaux 5/7 (sous-cat 66)
   → Sélectionne type de plancher si combles non habitables (optionnel)
     Options : Bois / Béton / Je ne sais pas / Plafond en placo / Structure métallique
   → Suivant

10. Étape 9/15 — Lieu des Travaux 6/7 (sous-cat 71)
    → Trappe d'accès (optionnel) : NON / OUI
    → Suivant

11. Étape 10/15 — Lieu des Travaux 7/7 (sous-cat 72)
    → Type de chauffage (optionnel) : Bois / Fioul / Gaz / Pompe à chaleur / Électrique
    → Champ texte "Autre" (optionnel)
    → Suivant

12. Étape 11/15 — Vos Besoins 1/5 (sous-cat 64)
    → Que souhaitez-vous isoler si combles habitables (optionnel)
      Options : 1-Rampants / 2-Plafond intérieur / 3-Murs latéraux / 4-Je ne sais pas
    → Suivant

13. Étape 12/15 — Vos Besoins 2/5 (sous-cat 68)
    → Type de plancher si combles non habitables (optionnel — même champ que étape 8)
    → Suivant

14. Étape 13/15 — Vos Besoins 3/5 (sous-cat 70)
    → Type d'isolation souhaité (multi-choix, optionnel)
      Options : Isolation en rouleaux / Isolation soufflée
    → Suivant

15. Étape 14/15 — Vos Besoins 4/5 (sous-cat 73)
    → Travaux souhaités (multi-choix, optionnel)
      Options : 1-Isolation / 2-Chauffage et ECS / 3-Ventilation / 4-Energie Solaire / 5-Rénovation Globale
    → Suivant

16. Étape 15/15 — Vos Besoins 5/5 (sous-cat 74)
    → Disponibilité pour être contacté (optionnel) : 1-Matin / 2-Après-midi / 3-Soir / 4-A tout moment
    → Commentaires (optionnel, textarea)
    → Tap "Terminer"

17. Écran récapitulatif
    → Liste toutes les réponses saisies
    → Bouton "Confirmer et envoyer"

18. POST /api/submissions envoyé
    → Si succès → Écran confirmation "Demande enregistrée !"
    → Si erreur réseau → sauvegarde IndexedDB + message "Sauvegardé, sera envoyé dès reconnexion"
```

**Données de test** (avec vrais field IDs CRM) :
```json
{
  "configVersion": "1.0.0",
  "values": [
    { "fieldId": 2262, "value": "Mr" },
    { "fieldId": 2087, "value": "Dupont" },
    { "fieldId": 2088, "value": "Jean" },
    { "fieldId": 2217, "value": "12 rue de la Paix" },
    { "fieldId": 2089, "value": "75001" },
    { "fieldId": 2090, "value": "Paris" },
    { "fieldId": 2015, "value": "0612345678" },
    { "fieldId": 2016, "value": "jean.dupont@email.fr" },
    { "fieldId": 2294, "value": "2- Entre 23734€ et 30427€" },
    { "fieldId": 2293, "value": "Propriétaire occupant" },
    { "fieldId": 2292, "value": "Maison" },
    { "fieldId": 2306, "value": "2- Plus de 15 ans" },
    { "fieldId": 2303, "value": ["1- Isolation thermique", "3- Ventilation"] }
  ]
}
```

---

## UC-02 — Validation bloquante (champ obligatoire)

**Acteur** : Utilisateur final
**Préconditions** : Sur l'étape 1/15 — "Informations Personnelles 1/3" (sous-cat 63)

### Scénario
```
1. L'utilisateur laisse Prénom (2088) et Nom (2087) vides → tap Suivant
   → Bouton Suivant est DÉSACTIVÉ (grisé) → pas de navigation

2. L'utilisateur saisit "J" dans Prénom, Nom toujours vide
   → Bouton Suivant toujours désactivé

3. L'utilisateur saisit "Dupont" dans Nom, Prénom="Jean",
   Code postal="75001", Ville="Paris"
   → Bouton Suivant s'ACTIVE (couleur #5C2DD3)

4. L'utilisateur efface Code postal
   → Bouton Suivant se DÉSACTIVE à nouveau
```

**Champs obligatoires par étape** :
- Étape 1 (sous-cat 63) : Nom (2087), Prénom (2088), Code postal (2089), Ville (2090)
- Étape 2 (sous-cat 65) : Revenu fiscal (2294)
- Étape 3 (sous-cat 75) : Statut propriétaire (2293)
- Toutes les autres étapes (4-15) : aucun champ obligatoire

**Règle** : Le bouton Suivant est `disabled` si `validateStep(currentFields, currentValues)` retourne des erreurs.

---

## UC-03 — Reprise après fermeture (offline-first)

**Acteur** : Utilisateur final
**Préconditions** : Formulaire partiellement rempli, app fermée et rouverte

### Scénario V1 (sans auth)
```
1. Pas de reprise → formulaire vierge
   (La reprise avec brouillon sera implémentée en V2 avec auth)
```

### Scénario offline
```
1. L'utilisateur remplit tout le formulaire sans connexion
2. Tape "Confirmer et envoyer"
3. L'app détecte !navigator.onLine
4. Sauvegarde dans IndexedDB avec status "pending"
5. Affiche : "Votre demande a été sauvegardée.
             Elle sera transmise dès que vous serez connecté."
6. Lors de la reconnexion → syncOfflineSubmissions() lance automatiquement
7. Les soumissions en attente sont envoyées à l'API
8. IndexedDB est vidé
```

---

## UC-04 — Rechargement de la configuration

**Acteur** : App mobile (système)
**Trigger** : Ouverture de l'app

### Scénario nominal
```
1. App ouvre → useFormConfig se déclenche
2. Cache localStorage vérifié :
   → Existe ET timestamp < 24h → utilise le cache (pas d'appel API)
   → N'existe pas OU expiré → appelle GET /api/configuration
3. Réponse reçue → stocke en localStorage avec timestamp
4. Formulaire construit dynamiquement depuis la config reçue
5. L'utilisateur voit le formulaire à jour
```

### Scénario : nouvelle version de config
```
1. L'opérateur CRM modifie un champ dans le CRM
2. Le backend mobile est mis à jour (cron ou push depuis CRM)
3. À la prochaine ouverture de l'app (> 24h ou cache invalidé)
   → Nouvelle config chargée
   → Nouveau champ visible dans l'app
```

---

## UC-05 — Synchronisation CRM (opérateur)

**Acteur** : Opérateur CRM
**Préconditions** : Des soumissions non synchronisées existent en base

### Scénario
```
1. L'opérateur ouvre l'écran "Synchronisation" dans le CRM

2. Le CRM appelle GET /api/submissions?synced=false
   (avec JWT Bearer du CRM)
   → Liste de soumissions affichée dans le tableau

3. Le tableau montre :
   Date | Prénom Nom | Email | Nb champs | [checkbox] Importer

4. L'opérateur sélectionne toutes les soumissions → "Importer la sélection"

5. Pour chaque soumission :
   a. CRM crée un nouveau projet (même structure que projet 933)
   b. CRM insère les field_values correspondant aux réponses
   c. CRM appelle PUT /api/submissions/{id}/sync
   d. Backend marque synced=true, syncedAt=now()

6. Rapport affiché : "15 soumissions importées, 0 erreur"

7. Prochain appel GET → 0 soumissions (toutes synced=true)
```

### Scénario : erreur d'import partiel
```
1. 15 soumissions à importer
2. Import 1-10 : succès → PUT sync pour chacune
3. Import 11 : erreur (champ CRM invalide)
   → Log l'erreur, continue
4. Import 12-15 : succès
5. Rapport : "14 importées, 1 erreur (soumission ID: abc-123 - raison: ...)"
6. La soumission 11 reste synced=false → sera proposée à nouveau
```

---

## UC-06 — Accès non autorisé à l'API

**Acteur** : Requête non authentifiée
**Résultat** : 401 Unauthorized

### Scénarios
```
a. App mobile sans x-api-key header
   → POST /api/submissions → 401 {"error": "Invalid API key"}

b. CRM sans JWT
   → GET /api/submissions?synced=false → 401 {"error": "Missing JWT"}

c. CRM avec JWT expiré
   → GET /api/submissions → 401 {"error": "JWT expired"}

d. App mobile essaie d'accéder aux endpoints CRM
   → GET /api/submissions (avec API Key mobile, pas JWT) → 401
```

---

## UC-07 — Soumission invalide (validation)

**Acteur** : App mobile (données malformées)
**Résultat** : 400 Bad Request

### Scénarios
```
a. POST /api/submissions sans configVersion
   → 400 {"error": "configVersion is required"}

b. POST /api/submissions avec values vide
   → 400 {"error": "values must be a non-empty array"}

c. POST /api/submissions avec fieldId non-numérique
   → 400 {"error": "values[0].fieldId must be a number"}
```

**Note** : La validation métier (champ obligatoire vide) est faite côté client.
Le backend valide seulement le format/structure des données.

---

## UC-08 — Consultation d'une soumission après sync

**Acteur** : Opérateur CRM
**Contexte** : Vérification qu'une soumission a bien été importée

### Scénario
```
1. L'opérateur cherche la soumission par UUID dans le CRM
2. Le projet CRM associé montre toutes les field_values
3. Le champ "submission_id" dans le projet CRM = UUID de la soumission
4. Dans l'app backend : synced=true, syncedAt=datetime de l'import
5. La soumission n'apparaît plus dans GET /api/submissions?synced=false
   Mais apparaît dans GET /api/submissions?synced=true
```

---

## 📊 Matrice de couverture des tests

| Use Case | Tests unitaires | Tests API | Tests E2E |
|----------|----------------|-----------|-----------|
| UC-01 Parcours nominal | ✓ Composants | ✓ POST submissions | ✓ Playwright |
| UC-02 Validation | ✓ validateStep() | ✗ (client-side) | ✓ Playwright |
| UC-03 Offline | ✓ useOffline hook | ✗ (client-side) | ✓ Playwright network off |
| UC-04 Config | ✓ useFormConfig | ✓ GET configuration | ✗ |
| UC-05 Sync CRM | ✗ | ✓ GET/PUT submissions | ✓ Playwright CRM |
| UC-06 Auth | ✗ | ✓ Middleware auth | ✗ |
| UC-07 Validation API | ✗ | ✓ Zod validation | ✗ |
| UC-08 Post-sync | ✗ | ✓ GET synced=true | ✗ |
