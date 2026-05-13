# CDC — Estimer Mes Aides V2

*Source de vérité pour la session V2. Dernière mise à jour : 2026-05-12*

---

## 1. Objectif

Plateforme multi-bornes kiosque (tablettes Android) permettant à des passagers d'estimer leurs aides à la rénovation énergétique via un formulaire guidé. Les données sont ensuite partagées vers le CRM I-CRM.

**Deux applications distinctes :**
- **BackOffice** — administration (web)
- **FrontOffice** — borne kiosque (web / tablette Android)

---

## 2. Acteurs

| Acteur | Périmètre |
|--------|-----------|
| **SuperAdmin** | Toutes les bornes, tous les formulaires, tous les enregistrements |
| **AdminBorne** | Ses bornes uniquement (cloisonnement) |
| **Passager** | Utilise la borne kiosque (pas de compte) |

---

## 3. BackOffice

### 3.1 SuperAdmin

#### Dashboard
- Statistiques globales sur les enregistrements (toutes bornes)

#### Gestion des AdminBornes
| Champ | Type |
|-------|------|
| Nom Admin | texte |
| Prénom Admin | texte |
| Email Admin | email (identifiant) |
| Entreprise — Raison sociale | texte |
| Entreprise — SIRET | texte |
| Bornes associées | liste d'IDs borne |

#### Gestion des Bornes
| Champ | Type |
|-------|------|
| ID Borne | UUID |
| Langue par défaut | FR / ES / EN |
| Adresse | texte |
| Commerçant | texte |
| Régie | texte |
| Installateur | texte |
| Formulaire associé | formulaire-ID |

#### Gestion des Enregistrements
- Afficher, exporter, filtrer, rechercher

#### Gestion des Formulaires (CRUD)

**Métadonnées formulaire :**
- Label, description, version

**Configuration globale :**
- Durée avant retour page accueil (secondes)
- Délai d'annulation si inactif (secondes)

**Page Début (configurable) :**
- Titre début
- Sous-titre début
- Paragraphe début

**Questions (CRUD) :**
| Champ | Détail |
|-------|--------|
| Catégorie | regroupement de questions |
| Intitulé question | texte affiché |
| Options de réponse | liste (CRUD) |
| Ordre / numéro de page | entier |
| Obligation | obligatoire / optionnel |
| Paragraphe | texte explicatif ou informatif |
| Type de sélection | option unique / choix multiples |

**Page Fin (configurable) :**
- Titre fin
- Sous-titre fin
- Paragraphe fin

#### Template / Rendu Formulaire

Structure de chaque page du formulaire :

```
[En-tête figé sur toutes les pages]
  • Raison sociale (entreprise de l'AdminBorne)
  • Régie de la borne
  • Installateur de la borne
  • Grand titre des pages
  • Sous-titre des pages

[Contenu dynamique selon le type de page]

  PAGE ACCUEIL (page one) :
    → Titre, sous-titre, paragraphe

  PAGE FIN :
    → Titre, sous-titre, paragraphe
    → Compteur de retour vers page accueil (s)

  PAGE QUESTION :
    → Catégorie question (affiché dans le formulaire)
    → soud-Catégorie question (affiché dans le formulaire)
    → Intitulé de la question
    → Liste des options de réponse
    → Paragraphe explicatif / informatif
```

#### Partage des Enregistrements vers I-CRM

Workflow :
1. Sélectionner une borne
2. Sélectionner une entreprise
3. Saisir le SIRET entreprise
4. Choisir la visibilité des données : `visible` / `cached`
5. configurer api et kye d'envoie 
6. Confirmer → envoi → job asynchrone + Pusher → retour statut (`success` / `fail`)


---

### 3.2 AdminBorne

#### Dashboard
- Statistiques sur ses enregistrements (bornes assignées uniquement)

#### Gestion des Bornes (lecture seule sur ses bornes)
- ID Borne, Langue par défaut, Adresse, Commerçant, Régie, Installateur

#### Gestion des Enregistrements
- Afficher, filtrer, rechercher (ses bornes uniquement)

---

## 4. FrontOffice (Borne Kiosque — Tablette Android)

### Flow principal

```
Page de connexion (AdminBorne)
  ↓ login / mot de passe
Écran d'accueil AdminBorne
  ↓ clic "Démarrer le formulaire"
Résolution config :
  id-adminBorne → id-borne → id-formulaire → id-configuration
  ↓ GET configuration
Formulaire kiosque (saisie par le passager)
  ↓ soumission
Enregistrement créé
  ↓ retour automatique page accueil (compteur)
```

### Mode Exit (sécurisé)

- Petit bouton `[Exit]` visible sur toutes les pages du formulaire
- Clic → saisie mot de passe AdminBorne requise
- **Timeout 60 secondes** : si mot de passe non saisi ou erroné dans ce délai → retour automatique à la page d'accueil du formulaire
- Mot de passe correct → retour à l'écran d'accueil AdminBorne

---

## 5. Stack technique

| Module | Stack | Port |
|--------|-------|------|
| Backend API | Node.js 20 + Express + Prisma 5 + PostgreSQL (Supabase) | 3000 |
| FrontOffice Borne | React 19 + Vite + TailwindCSS 4 | 5173 |
| BackOffice | React 19 + Vite + TailwindCSS 4 | 5175 |
| CRM Sync | React 19 + Vite | 5174 |
| Mobile wrapper | Flutter (tablette Android) | — |
| Temps réel | Pusher WebSocket (cluster EU) | — |
| Auth | JWT multi-rôles (SUPER_ADMIN / ADMIN_BORNE) | — |

---

## 6. Points d'attention V2

- **Couleur primaire** — `#5B2D8E`
- **Touch targets** — ≥ 48px, font-size inputs ≥ 16px (anti-zoom iOS/Android)
- **i18n** — FR / ES / EN, fallback FR
- **Offline-first** — config localStorage TTL 24h, soumissions IndexedDB si API down
- **Timeout exit borne** — exactement 60 secondes, retour automatique si inactif
- **Cloisonnement AdminBorne** — jamais accès aux données d'une autre borne
- **UUID v4** pour tous les IDs
- **Validation double** — Zod backend obligatoire
- **Pusher** — job async pour l'envoi I-CRM, retour statut temps réel
