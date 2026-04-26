# CONTEXT.md — Contexte Métier Complet
> Source de vérité : fichiers JSON bruts dans docs/ (réponses API CRM réelles)

## 🏢 Contexte du projet

### Qui utilise l'application ?
| Acteur | Rôle | Interaction |
|--------|------|-------------|
| **Utilisateur final** | Particulier souhaitant estimer ses aides à la rénovation | Remplit le formulaire dans l'app mobile |
| **Opérateur CRM** | Agent de l'entreprise | Déclenche la synchronisation, traite les projets |
| **Système CRM** | Application existante (projet de référence: 933) | Maître de configuration, récepteur des soumissions |

### Problème résolu
Un particulier veut savoir à quelles aides il a droit pour rénover son logement (isolation, chauffage, ventilation, énergie solaire, rénovation globale). L'application guide l'utilisateur en posant des questions sur sa situation personnelle, son logement et ses besoins, puis enregistre sa demande pour qu'un opérateur la traite dans le CRM.

---

## ⚠️ Note sur les clés de champs CRM

Les clés CRM (`key`) utilisent des noms **en espagnol** hérités du CRM d'origine. Ne pas confondre avec les libellés en français :

| Clé CRM | Libellé affiché |
|---------|----------------|
| `projets_Nombre` | Nom |
| `projets_Apellidos` | Prénom |
| `projets_Ciudad` | Ville |
| `projets_Cdigo_postal` | Code postal |
| `projets_ADRESSE` | Adresse |
| `projets_Telfono_Propietario_inicia` | Num. de Téléphone |
| `projets_Correo_electrnico_Propietario_inicia` | Adresse Email |
| `projets_Civilit` | Civilité |

---

## ⚠️ Note sur les champs obligatoires

**Tous les champs ont `required: false` dans l'API CRM** (y compris Nom, Prénom, etc.).

Les champs suivants sont marqués obligatoires par **règle métier frontend** (décision projet, pas une contrainte CRM) :
- Nom (`projets_Nombre`)
- Prénom (`projets_Apellidos`)
- Code postal (`projets_Cdigo_postal`)
- Ville (`projets_Ciudad`)
- Revenu fiscal (`projets__combien_slve_le_revenu_total_de_votre_foyer_fiscal`)
- Statut propriétaire (`projets_Dans_ce_logement_vous_tes`)

Ces champs bloquent le bouton "Suivant" tant qu'ils ne sont pas remplis.

---

## 📋 Structure complète du formulaire (source : API CRM)

**Tab :** ESTIMER VOS AIDES — `id: 22`
**Catégories :** 3 | **Sous-catégories (étapes) :** 15 au total
**Couleur :** `#5C2DD3` | **Platform :** WEBMOBILE | **Display :** linear

---

### CATÉGORIE 1 — Informations Personnelles (`id: 37`)

---

#### Sous-catégorie 1/3 — "Information Personnelle 1/" (`id: 63`)

> Contient à la fois les infos d'identité ET l'adresse complète (même sous-catégorie CRM).

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Uppercase |
|-------|----------|---------|---------|--------------|-------------|-----------|
| 0 | **2262** | Civilité | `projets_Civilit` | 1 (Texte) | Non | Oui |
| 1 | **2087** | Nom | `projets_Nombre` | 1 (Texte) | **Oui (business)** | Oui |
| 2 | **2088** | Prénom | `projets_Apellidos` | 1 (Texte) | **Oui (business)** | Oui |
| 3 | **2217** | ADRESSE | `projets_ADRESSE` | 1 (Texte) | Non | Oui |
| 4 | **2089** | Code postal | `projets_Cdigo_postal` | 1 (Texte) | **Oui (business)** | Oui |
| 5 | **2090** | Ville | `projets_Ciudad` | 1 (Texte) | **Oui (business)** | Oui |
| 6 | **2015** | Num. de Téléphone | `projets_Telfono_Propietario_inicia` | 6 (Téléphone) | Non | Non |
| 7 | **2016** | Adresse Email | `projets_Correo_electrnico_Propietario_inicia` | 1 (Texte) | Non | Non |

---

#### Sous-catégorie 2/3 — "Information Personnelle 2/3" (`id: 65`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2294** | À combien s'élève le revenu total de votre foyer fiscal | `projets__combien_slve_le_revenu_total_de_votre_foyer_fiscal` | 50 (Liste option unique) | **Oui (business)** | voir ci-dessous |

**Options field 2294 :**
- `1- Inférieur à 23734€`
- `2- Entre 23734€ et 30427€`
- `3- Entre 30428€ et 42848€`
- `4- Supérieur à 42849€`

---

#### Sous-catégorie 3/3 — "Information Personnelle 3/3" (`id: 75`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2293** | Dans ce logement vous êtes | `projets_Dans_ce_logement_vous_tes` | 50 (Liste option unique) | **Oui (business)** | voir ci-dessous |

**Options field 2293 :**
- `Propriétaire Bailleur`
- `Propriétaire d'une résidence secondaire`
- `Propriétaire occupant`
- `Résident`

---

### CATÉGORIE 2 — Le Lieu des Travaux (`id: 36`)

> ⚠️ Cette catégorie a **7 sous-catégories** (pas 2 comme indiqué dans des versions antérieures de la doc).

---

#### Sous-catégorie 1/7 — "1- Le lieu des travaux 1/7" (`id: 59`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2292** | Votre projet concerne | `projets_Votre_projet_concerne` | 50 (Liste option unique) | Non | voir ci-dessous |

**Options field 2292 :**
- `Appartement`
- `Maison`

---

#### Sous-catégorie 2/7 — "1- Le lieu des travaux 2/7" (`id: 60`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2306** | Date de construction de votre logement | `projets_Date_de_construction_de_votre_logement` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2306 :**
- `1- Entre 2 ans et 15 ans`
- `2- Plus de 15 ans`

---

#### Sous-catégorie 3/7 — "1- Le lieu des travaux 3/7" (`id: 61`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2307** | Quelle est la surface habitable de votre logement | `projets_Quelle_est_la_surface_habitable_de_votre_logement` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2307 :**
- `1- 0 à 70 m2`
- `2- 71 à 120 m2`
- `3- 121 à 200 m2`
- `4- + de 200 m2`

---

#### Sous-catégorie 4/7 — "1- Le lieu des travaux 4/" (`id: 62`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2296** | Quel type de combles avez-vous | `projets_Quel_type_de_combles_avez-vous` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2296 :**
- `Combles aménagés / habitables (vous pouvez y vivre)`
- `Combles perdus / non habitables (espace vide ou stockage)`

---

#### Sous-catégorie 5/7 — "1- Le lieu des travaux 5/7" (`id: 66`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2298** | Si vos combles sont non habitables : Type de plancher | `projets_Si_vos_combles_sont_non_habitables__Type_de_plancher` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2298 :**
- `Bois`
- `Béton`
- `Je ne sais pas (besoin de conseil)`
- `Plafond en placo / faux plafond`
- `Structure métallique`

---

#### Sous-catégorie 6/7 — "1- Le lieu des travaux 6/7" (`id: 71`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2300** | Accès aux combles, il existe une trappe d'accès ? | `projets_Accs_aux_combles_il_existe_une_trappe_daccs_` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2300 :**
- `NON`
- `OUI`

---

#### Sous-catégorie 7/7 — "1- Le lieu des travaux 7/7" (`id: 72`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2301** | Type de chauffage principal | `projets_Type_de_chauffage_principal` | 5 (Option unique / radio) | Non | voir ci-dessous |
| 1 | **2302** | Autre Type de chauffage principal | `projets_Autre_Type_de_chauffage_principal` | 1 (Texte) | Non | - |

**Options field 2301 :**
- `Bois`
- `Fioul`
- `Gaz`
- `Pompe à chaleur`
- `Électrique`

---

### CATÉGORIE 3 — Vos Besoins (`id: 38`)

---

#### Sous-catégorie 1/5 — "Vos Besoin 1/5" (`id: 64`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2297** | Si vos combles sont habitables : Que souhaitez-vous isoler ? | `projets_Si_vos_combles_sont_habitables__Que_souhaitez-vous_isoler_` | 5 (Option unique / radio) | Non | voir ci-dessous |

**Options field 2297 :**
- `1- Rampants de toiture (sous le toit)`
- `2- Plafond intérieur`
- `3- Murs latéraux`
- `4- Je ne sais pas (besoin de conseil)`

---

#### Sous-catégorie 2/5 — "Vos Besoin 2/5" (`id: 68`)

> ⚠️ Même field (2298) que Lieu des Travaux 5/7 — Type de plancher, répété dans un contexte différent.

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2298** | Si vos combles sont non habitables : Type de plancher | `projets_Si_vos_combles_sont_non_habitables__Type_de_plancher` | 5 (Option unique / radio) | Non | Bois / Béton / Je ne sais pas / Plafond en placo / Structure métallique |

---

#### Sous-catégorie 3/5 — "Vos Besoins 3/5" (`id: 70`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2299** | Type d'isolation souhaité | `projets_Type_disolation_souhait` | 4 (Options multiples) | Non | voir ci-dessous |

**Options field 2299 :**
- `Isolation en rouleaux`
- `Isolation soufflée`

---

#### Sous-catégorie 4/5 — "Vos Besoins 4/5" (`id: 73`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2303** | Quels travaux souhaitez-vous réaliser dans votre logement ? | `projets_Quels_travaux_souhaitez-vous_raliser_dans_votre_logement_` | 4 (Options multiples) | Non | voir ci-dessous |

**Options field 2303 :**
- `1- Isolation thermique`
- `2- Chauffage et ECS`
- `3- Ventilation`
- `4- Energie Solaire`
- `5- Rénovation Globale`

---

#### Sous-catégorie 5/5 — "Vos Besoins 5/5" (`id: 74`)

| Ordre | Field ID | Libellé | Clé CRM | fieldtype_id | Obligatoire | Options |
|-------|----------|---------|---------|--------------|-------------|---------|
| 0 | **2304** | Disponibilité pour être contacté | `projets_Disponibilit_pour_tre_contact` | 5 (Option unique / radio) | Non | voir ci-dessous |
| 1 | **2305** | Commentaires ou informations complémentaires | `projets_Commentaires_ou_informations_complmentaires` | 2 (Texte long) | Non | - |

**Options field 2304 :**
- `1- Matin`
- `2- Après-midi`
- `3- Soir`
- `4- A tout moment`

---

## 🔢 Table récapitulative — Toutes les étapes (15 au total)

| Étape | Sous-cat ID | Nom | Champs (Field IDs) |
|-------|-------------|-----|-------------------|
| 1 | 63 | Info Perso 1/3 — Identité + Adresse | 2262, 2087, 2088, 2217, 2089, 2090, 2015, 2016 |
| 2 | 65 | Info Perso 2/3 — Revenu fiscal | 2294 |
| 3 | 75 | Info Perso 3/3 — Statut propriétaire | 2293 |
| 4 | 59 | Lieu des Travaux 1/7 — Type de logement | 2292 |
| 5 | 60 | Lieu des Travaux 2/7 — Date de construction | 2306 |
| 6 | 61 | Lieu des Travaux 3/7 — Surface habitable | 2307 |
| 7 | 62 | Lieu des Travaux 4/7 — Type de combles | 2296 |
| 8 | 66 | Lieu des Travaux 5/7 — Type de plancher (non habitables) | 2298 |
| 9 | 71 | Lieu des Travaux 6/7 — Trappe d'accès | 2300 |
| 10 | 72 | Lieu des Travaux 7/7 — Type de chauffage | 2301, 2302 |
| 11 | 64 | Vos Besoins 1/5 — Isolation combles habitables | 2297 |
| 12 | 68 | Vos Besoins 2/5 — Plancher combles non habitables | 2298 |
| 13 | 70 | Vos Besoins 3/5 — Type d'isolation souhaité | 2299 |
| 14 | 73 | Vos Besoins 4/5 — Travaux souhaités | 2303 |
| 15 | 74 | Vos Besoins 5/5 — Contact + Commentaires | 2304, 2305 |

---

## 🔗 Mapping fieldtype_id → rendu mobile

| fieldtype_id | Label CRM | Rendu mobile | Composant React |
|-------------|-----------|--------------|-----------------|
| 1 | Texte | `<input type="text">` (uppercase si `uppercase:1`) | `InputField` |
| 2 | Texte long | `<textarea>` | `TextareaField` |
| 4 | Options multiples | Cases à cocher custom | `CheckboxGroup` |
| 5 | Option unique | Boutons radio custom | `RadioGroup` |
| 6 | Téléphone | `<input type="tel">` | `InputField` |
| 50 | Liste option unique (enum) | Boutons radio custom (même rendu que type 5) | `RadioGroup` |

---

## 🔗 Intégration CRM

### Projet de référence : 933
Le CRM crée un projet avec la même structure que le projet 933 lors de chaque import de soumission.

### Format d'intégration
```json
{
  "project": {
    "source": "mobile_app",
    "created_via": "sync",
    "submission_id": "uuid-de-la-soumission"
  },
  "field_values": [
    { "field_id": 2087, "value": "Dupont" },
    { "field_id": 2088, "value": "Jean" },
    { "field_id": 2089, "value": "75001" }
  ]
}
```

---

## 🚫 Contraintes métier

1. **Pas d'envoi direct au CRM** depuis l'app mobile — toujours via le backend
2. **CRM = système maître** pour la configuration du formulaire
3. **Synchronisation manuelle** en V1 (automatique envisagé en V2)
4. **Offline-first** : l'app doit fonctionner sans connexion au backend
5. **Champs obligatoires frontend** : Nom, Prénom, Code postal, Ville, Revenu fiscal, Statut (règle métier, pas CRM)
6. **Configuration dynamique** : le formulaire peut évoluer sans redéployer l'app

---

## 📊 Volumétrie estimée

- Soumissions/jour : ~50-100 (estimation initiale)
- Taille moyenne d'une soumission : ~15 champs (tous fieldtypes confondus)
- Fréquence de sync CRM : 1-2x par jour (manuelle)
- Rétention données non synchronisées : 30 jours maximum
