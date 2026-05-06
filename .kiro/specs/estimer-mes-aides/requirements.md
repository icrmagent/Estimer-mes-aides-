# Requirements — Estimer Mes Aides

## Vue d'ensemble
Application mobile WebView permettant à des particuliers français d'estimer leurs aides à la rénovation énergétique. Le formulaire de 15 étapes collecte les informations du demandeur et les synchronise avec un CRM existant.

---

## R1 — Formulaire multi-étapes (15 étapes)

### R1.1 — Structure des étapes
- Le formulaire est divisé en 3 catégories et 15 sous-catégories (étapes)
- Catégorie 1 — Informations Personnelles : 3 étapes (sous-cats 63, 65, 75)
- Catégorie 2 — Le Lieu des Travaux : 7 étapes (sous-cats 59, 60, 61, 62, 66, 71, 72)
- Catégorie 3 — Vos Besoins : 5 étapes (sous-cats 64, 68, 70, 73, 74)

### R1.2 — Types de champs supportés
- `fieldtype_id: 1` → input text (uppercase si `uppercase: true`)
- `fieldtype_id: 2` → textarea
- `fieldtype_id: 4` → checkboxes multi-sélection
- `fieldtype_id: 5` → radio boutons (option unique)
- `fieldtype_id: 6` → input tel (avec sélecteur indicatif pays)
- `fieldtype_id: 50` → radio boutons (enum, même rendu que type 5)

### R1.3 — Champs obligatoires (règle métier frontend)
Les champs suivants bloquent le bouton "Suivant" s'ils sont vides :
- `2087` Nom
- `2088` Prénom
- `2089` Code postal
- `2090` Ville
- `2294` Revenu fiscal
- `2293` Statut propriétaire

### R1.4 — Navigation
- Bouton "Suivant" désactivé si champs obligatoires non remplis
- Bouton "Précédent" toujours actif (sauf étape 1)
- Animation de transition : slide droite (suivant) / slide gauche (précédent)
- Barre de progression affichant l'avancement (étape X / total)

---

## R2 — Configuration dynamique

### R2.1 — Chargement de la config
- La config du formulaire est chargée depuis `GET /api/configuration`
- Mise en cache dans `localStorage` avec TTL de 24h (clé : `ema_config`)
- Si API indisponible et cache valide → utiliser le cache
- Si API indisponible et pas de cache → afficher message d'erreur + bouton "Réessayer"

### R2.2 — Versioning
- La config inclut un champ `version`
- Si la version serveur diffère du cache → invalider le cache et recharger

---

## R3 — Soumission du formulaire

### R3.1 — Envoi
- `POST /api/submissions` avec `{ configVersion, values: [{fieldId, value}] }`
- Authentification : header `x-api-key`
- Réponse attendue : `{ id (UUID v4), createdAt, synced: false }`

### R3.2 — Mode offline
- Si API indisponible → sauvegarder la soumission dans IndexedDB
- Afficher notification "Sauvegardé hors ligne"
- Synchroniser automatiquement au retour de la connexion

### R3.3 — Confirmation
- Afficher l'écran de confirmation avec le numéro de dossier (UUID tronqué)
- Message : "Un conseiller vous contactera prochainement"
- Bouton "Nouvelle demande" pour recommencer

---

## R4 — Module CRM Sync

### R4.1 — Authentification CRM
- Connexion via token JWT (généré par `node scripts/generate-crm-jwt.js`)
- Token valable 24h
- Stockage du token dans `localStorage`

### R4.2 — Tableau de synchronisation
- Afficher les soumissions non synchronisées (`synced: false`)
- Colonnes : Date, Nom, Prénom, Email, Nb champs, Statut
- Sélection individuelle ou "Tout sélectionner"

### R4.3 — Import CRM
- Pour chaque soumission sélectionnée : créer un projet CRM (référence : projet 933)
- Marquer comme synchronisé via `PUT /api/submissions/:id/sync`
- Rapport final : X importés, Y erreurs

### R4.4 — Export Excel
- Exporter les soumissions sélectionnées en fichier `.xlsx` via SheetJS
- Colonnes : tous les champs CRM avec leurs libellés français

---

## R5 — Design & Accessibilité mobile

### R5.1 — Contraintes WebView
- Pas de `window.open()`, `alert()`, `confirm()`, `<a target="_blank">`
- Navigation interne React Router uniquement
- Viewport : `width=device-width, initial-scale=1, maximum-scale=1`

### R5.2 — Touch & Responsive
- Tous les éléments interactifs : hauteur minimum 48px
- Font-size des inputs : minimum 16px (évite le zoom automatique iOS)
- Pas de scroll horizontal sur 375px (iPhone SE)
- Pas d'interactions hover-only

### R5.3 — Design System
- Couleur primaire : `#5C2DD3` (violet institutionnel)
- Font : DM Sans
- Cards blanches avec shadow sur fond `#F8F7FC`
- Header fixe violet, navigation fixe en bas

---

## R6 — Sécurité & Infrastructure

### R6.1 — Authentification
- App mobile → `x-api-key` header
- Module CRM → `Authorization: Bearer <JWT>`
- Double validation : client (React) + serveur (Zod)

### R6.2 — Déploiement
- Backend : Railway (Node.js 20, HTTPS auto)
- Frontend + CRM : Vercel (build Vite)
- Base de données : Supabase PostgreSQL
- CI/CD : GitHub Actions

### R6.3 — Données
- UUID v4 pour tous les IDs de soumission
- `synced: false` par défaut sur toute nouvelle soumission
- HTTPS obligatoire sur toutes les routes API en production
