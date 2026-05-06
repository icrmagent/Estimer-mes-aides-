---
inclusion: manual
---

# Données CRM — Source de Vérité Formulaire

## Mapping complet des champs CRM

### Catégorie 1 — Informations Personnelles

| Field ID | Clé CRM | Libellé FR | Type | Obligatoire |
|----------|---------|-----------|------|-------------|
| 2262 | `projets_Civilit` | Civilité | radio (1) | Non |
| 2087 | `projets_Nombre` | Nom | text (1) | **Oui** |
| 2088 | `projets_Apellidos` | Prénom | text (1) | **Oui** |
| 2217 | `projets_ADRESSE` | Adresse | text (1) | Non |
| 2089 | `projets_Cdigo_postal` | Code postal | text (1) | **Oui** |
| 2090 | `projets_Ciudad` | Ville | text (1) | **Oui** |
| 2015 | `projets_Telfono_Propietario_inicia` | Téléphone | tel (6) | Non |
| 2016 | `projets_Correo_electrnico_Propietario_inicia` | Email | text (1) | Non |
| 2294 | `projets__combien_slve_le_revenu_total_de_votre_foyer_fiscal` | Revenu fiscal | enum (50) | **Oui** |
| 2293 | `projets_Dans_ce_logement_vous_tes` | Statut propriétaire | enum (50) | **Oui** |

### Options field 2294 (Revenu fiscal)
- `1- Inférieur à 23734€`
- `2- Entre 23734€ et 30427€`
- `3- Entre 30428€ et 42848€`
- `4- Supérieur à 42849€`

### Options field 2293 (Statut propriétaire)
- `Propriétaire occupant`
- `Propriétaire bailleur`
- `Locataire`

### Catégorie 2 — Le Lieu des Travaux

| Field ID | Libellé FR | Type |
|----------|-----------|------|
| 2292 | Type de logement | enum (50) |
| 2306 | Date de construction | enum (50) |
| 2307 | Surface habitable | enum (50) |
| 2296 | Type de combles | enum (50) |
| 2298 | Type de plancher bas | enum (50) |
| 2300 | Trappe d'accès aux combles | enum (50) |
| 2301 | Type de chauffage | enum (50) |

### Catégorie 3 — Vos Besoins

| Field ID | Libellé FR | Type |
|----------|-----------|------|
| 2302 | Isolation souhaitée | checkbox (4) |
| 2297 | Type d'isolation | enum (50) |
| 2299 | Travaux souhaités | checkbox (4) |
| 2303 | Disponibilité pour contact | enum (50) |
| 2304 | Commentaires | textarea (2) |
| 2305 | Autres besoins | checkbox (4) |

## Projet CRM de référence
- **Projet ID** : 933
- **Tab ID** : 22 (ESTIMER VOS AIDES)
- **Couleur** : `#5C2DD3`
- **Platform** : WEBMOBILE
- **Display** : linear

## Note sur les clés CRM
Les clés utilisent des noms **en espagnol** (héritage du CRM d'origine) :
- `projets_Nombre` = Nom (pas Prénom !)
- `projets_Apellidos` = Prénom (pas Nom !)
- `projets_Ciudad` = Ville
- `projets_Cdigo_postal` = Code postal (accent manquant intentionnel)

## Auth CRM
- **Header** : `Authorization: Bearer <JWT>`
- **JWT Secret** : voir `.env` (ne jamais exposer)
- **Durée** : 24h
- **Générer** : `cd src/backend && node scripts/generate-crm-jwt.js`
