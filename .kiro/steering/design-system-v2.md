---
inclusion: fileMatch
fileMatchPattern: "src/frontend/**,src/backoffice/**,*.css,*.jsx,*.tsx"
---

# Design System V2 — Borne Interactive ILA26

## Couleurs (tokens immuables V2)
```
--c-primary:       #5B2D8E   <- violet ILA26 (PAS #5C2DD3 de la V1)
--c-secondary:     #1A56A0   <- bleu ILA26
--gradient-header: linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%)
--c-info-bar-bg:   #1A1A2E   <- barre info borne
--c-surface:       #FFFFFF
--c-surface-2:     #F5F5F5
--c-text:          #1A1A2E
--c-text-info:     #5B2D8E   <- paragraphe informatif
```

## Structure de l'écran (ordre fixe)
1. InfoBar (36px, fond #1A1A2E) — Master Filiale | Régie | Installateur
2. AppHeader (110px, dégradé) — Grand titre + Sous-titre + Drapeau langue
3. StepBadge (56px) — Cercle violet + numéro + libellé étape + séparateur
4. Zone contenu (flex-1, scrollable) — Question + Options + Paragraphe info
5. Flèches navigation (< >) — positionnées sur les côtés

## Règles absolues
- Header : TOUJOURS le dégradé #5B2D8E vers #1A56A0, jamais couleur unie
- Boutons options : bordure #5B2D8E au repos, fond #5B2D8E plein quand sélectionné
- Paragraphe info : couleur #5B2D8E, italique, centré
- Badge étape : cercle #5B2D8E + numéro blanc + libellé sombre
- Touch targets : minimum 48px x 48px
- Font-size inputs : minimum 16px (evite zoom iOS)
- Pas de hover-only (tablette = pas de hover)
- Couleur primaire V2 : #5B2D8E — PAS #5C2DD3 (V1 obsolete)

## Données dynamiques InfoBar (depuis config borne)
- masterFiliale = AdminBorne.raisonSociale (ex: "SANS MASTER")
- regie = Borne.regie (ex: "LEADS TABLETTE")
- installateur = Borne.installateur (ex: "ACTEO SERVICES")
