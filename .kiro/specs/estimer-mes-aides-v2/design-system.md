# Design System V2 — Estimer Mes Aides (Borne Interactive)
> Source de vérité visuelle — extraite des maquettes de référence ILA26
> Toute déviation doit être validée par le Product Owner

---

## 1. Anatomie de l'écran (maquettes de référence)

> Maquette 1 = schéma annoté FR (zones nommées)
> Maquette 2 = rendu réel en production, mode langue espagnol sur tablette Android

```
+------------------------------------------------------------------+
|  BARRE INFO BORNE (fond #0A0A0A, texte blanc, 36px)              |
|  [ila25]  Filial Master : SANS MASTER  agencia : LEADS TABLETTE  |
|           instalador : ACTEO SERVICES                    [->][=] |
+------------------------------------------------------------------+
|  HEADER DEGRADE (#5B2D8E -> #1A56A0, ~110px)                     |
|                                                                  |
|         Estima tus ayudas.                          [ES flag]    |
|    !PARA LA RENOVACION ENERGETICA DE TU VIVIENDA!                |
|                                                                  |
+------------------------------------------------------------------+
|  BADGE ETAPE + SEPARATEUR                                        |
|  (1) Ubicacion de las obras                                      |
|  ---------------------------------------------------------------- |
+------------------------------------------------------------------+
|                                                                  |
|  ZONE QUESTION (centre, grande taille, fond blanc de page)       |
|  De cuando data la construccion de la vivienda                   |
|  afectada por las obras?                                         |
|                                                                  |
|                    [<]  <- centre sous la question               |
|                                                                  |
|  +------------+  +------------+  +------------+                  |
|  | Menos de   |  | Entre 2 y  |  | Mas de     |                  |
|  |   2 anos   |  |  15 anos   |  |  15 anos   |                  |
|  +------------+  +------------+  +------------+                  |
|                                                                  |
|  Si su vivienda fue construida antes de los anos 1980...         |
|  (texte violet, italique, centre)                                |
|                                                                  |
+------------------------------------------------------------------+
|  BARRE NAVIGATION ANDROID (III o <) -- visible en mode non-kiosque|
+------------------------------------------------------------------+
```

---

## 2. Tokens de couleurs

```css
:root {
  /* Violet principal ILA26 */
  --c-primary:        #5B2D8E;
  --c-primary-dark:   #4A2070;
  --c-primary-light:  #7C3AED;
  --c-primary-bg:     #F0EBFF;

  /* Bleu secondaire ILA26 */
  --c-secondary:      #1A56A0;
  --c-secondary-dark: #124080;

  /* Dégradé header — NE JAMAIS utiliser une couleur unie */
  --gradient-header: linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%);

  /* Barre info borne */
  --c-info-bar-bg:    #1A1A2E;
  --c-info-bar-text:  #FFFFFF;

  /* Surfaces */
  --c-surface:        #FFFFFF;
  --c-surface-2:      #F5F5F5;

  /* Bordures */
  --c-border:         #5B2D8E;   /* bordure boutons options */
  --c-border-idle:    #C4B5E8;   /* bordure repos */

  /* Textes */
  --c-text:           #1A1A2E;
  --c-text-question:  #1A1A2E;
  --c-text-info:      #5B2D8E;   /* paragraphe informatif — violet */
  --c-text-on-dark:   #FFFFFF;
  --c-text-muted:     #6B7280;

  /* Badge étape */
  --c-badge-bg:       #5B2D8E;
  --c-badge-text:     #FFFFFF;

  /* Bouton option — repos */
  --c-option-bg:      #FFFFFF;
  --c-option-border:  #5B2D8E;
  --c-option-text:    #1A1A2E;

  /* Bouton option — sélectionné */
  --c-option-sel-bg:     #5B2D8E;
  --c-option-sel-text:   #FFFFFF;
  --c-option-sel-border: #5B2D8E;

  /* Statuts */
  --c-error:   #EF4444;
  --c-success: #10B981;
  --c-warning: #F59E0B;
}
```

---

## 3. Typographie

```css
:root {
  --font-primary: 'Poppins', 'Inter', 'DM Sans', system-ui, sans-serif;

  --text-xs:   12px;
  --text-sm:   13px;
  --text-md:   15px;
  --text-base: 16px;
  --text-lg:   18px;
  --text-xl:   20px;
  --text-2xl:  24px;
  --text-3xl:  28px;
  --text-4xl:  36px;

  --weight-regular:   400;
  --weight-medium:    500;
  --weight-semibold:  600;
  --weight-bold:      700;
  --weight-extrabold: 800;
}
```

### Hiérarchie typographique (maquettes)

| Élément | Taille | Poids | Couleur | Casse |
|---------|--------|-------|---------|-------|
| Grand titre header | 36-40px | 800 | #FFFFFF | Normal |
| Sous-titre header | 13-14px | 600 | #FFFFFF | MAJUSCULES |
| Barre info borne | 12-13px | 400 | #FFFFFF | Normal |
| Numéro badge étape | 16px | 700 | #FFFFFF | — |
| Libellé étape | 14-15px | 600 | #1A1A2E | Normal |
| Texte question | 22-26px | 700 | #1A1A2E | Normal |
| Texte bouton option | 16-18px | 600 | #1A1A2E / #FFFFFF | Normal |
| Paragraphe informatif | 13-14px | 400 | #5B2D8E | Italique |

---

## 4. Espacement & Rayons

```css
:root {
  --sp-1:  4px;   --sp-2:  8px;   --sp-3:  12px;
  --sp-4:  16px;  --sp-5:  20px;  --sp-6:  24px;
  --sp-8:  32px;  --sp-10: 40px;  --sp-12: 48px;

  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   14px;   /* boutons options */
  --radius-full: 9999px; /* badge étape */

  --shadow-option: 0 2px 8px rgba(91, 45, 142, 0.12);
  --shadow-card:   0 4px 16px rgba(91, 45, 142, 0.10);
  --shadow-btn:    0 4px 16px rgba(91, 45, 142, 0.30);
}
```

---

## 5. Composants — CSS de référence

### 5.1 Barre info borne (InfoBar)

Données dynamiques depuis la config borne :
- `masterFiliale` = `AdminBorne.raisonSociale`
- `regie` = `Borne.regie`
- `installateur` = `Borne.installateur`

```css
.info-bar {
  background: #1A1A2E;
  color: #FFFFFF;
  font-size: 12px;
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 20px;
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 100;
  white-space: nowrap;
  overflow: hidden;
}
.info-bar__logo { height: 18px; }
.info-bar__actions { margin-left: auto; display: flex; gap: 12px; }
```

### 5.2 Header dégradé (AppHeader)

```css
.app-header {
  background: linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%);
  padding: 16px 24px;
  text-align: center;
  position: fixed;
  top: 36px;
  width: 100%;
  z-index: 99;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.app-header__title {
  color: #FFFFFF;
  font-size: clamp(26px, 4vw, 40px);
  font-weight: 800;
  margin: 0 0 4px;
  line-height: 1.2;
}
.app-header__subtitle {
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0;
}
.app-header__lang {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 26px;
  cursor: pointer;
  min-width: 48px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 5.3 Badge d'étape (StepBadge)

```css
.step-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
}
.step-badge__number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #5B2D8E;
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-badge__label {
  font-size: 15px;
  font-weight: 600;
  color: #1A1A2E;
}
.step-separator {
  border: none;
  border-top: 1.5px solid rgba(91, 45, 142, 0.25);
  margin: 0 24px 16px;
}
```

### 5.4 Texte de question

```css
.question-text {
  font-size: clamp(20px, 3vw, 26px);
  font-weight: 700;
  color: #1A1A2E;
  text-align: center;
  padding: 24px 48px 20px;
  line-height: 1.3;
  max-width: 800px;
  margin: 0 auto;
}
```

### 5.5 Boutons de réponse (OptionButton)

```css
.option-btn {
  min-height: 64px;
  padding: 16px 24px;
  border: 2px solid #5B2D8E;
  border-radius: 14px;
  background: #FFFFFF;
  color: #1A1A2E;
  font-size: 17px;
  font-weight: 600;
  font-family: var(--font-primary);
  text-align: center;
  cursor: pointer;
  transition: all 180ms ease;
  box-shadow: 0 2px 8px rgba(91, 45, 142, 0.10);
  width: 100%;
}
.option-btn:hover {
  background: #F0EBFF;
  border-width: 3px;
}
.option-btn.selected {
  background: #5B2D8E;
  color: #FFFFFF;
  border-color: #5B2D8E;
  box-shadow: 0 4px 16px rgba(91, 45, 142, 0.30);
}
.option-btn:active { transform: scale(0.97); }

/* Grille des options */
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  padding: 16px 32px;
  max-width: 900px;
  margin: 0 auto;
}
@media (min-width: 768px) {
  .options-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 480px) {
  .options-grid { grid-template-columns: 1fr; }
}
```

### 5.6 Paragraphe informatif

```css
.info-paragraph {
  font-size: 13px;
  color: #5B2D8E;
  text-align: center;
  padding: 8px 32px 16px;
  line-height: 1.6;
  font-style: italic;
  max-width: 800px;
  margin: 0 auto;
}
```

### 5.7 Flèches de navigation

> Source : maquette 2 (production ES) — la flèche est **centrée sous la question**,
> pas positionnée sur les côtés. C'est un bouton carré à bords arrondis.

```css
/* Conteneur centré sous la question */
.nav-arrows {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 0 8px;
}

.nav-arrow {
  width: 44px;
  height: 44px;
  border-radius: 10px;          /* carré arrondi — pas cercle */
  background: #FFFFFF;
  border: 1.5px solid #E5E7EB;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6B7280;
  font-size: 18px;
  font-weight: 600;
  transition: all 150ms ease;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.nav-arrow:hover  { background: #F5F5F5; color: #1A1A2E; }
.nav-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
```

### 5.8 Sélecteur de langue

```css
.lang-selector {
  display: flex;
  gap: 8px;
}
.lang-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: white;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: all 150ms ease;
}
.lang-btn.active {
  border-color: #5B2D8E;
  box-shadow: 0 2px 12px rgba(91, 45, 142, 0.30);
}
```

---

## 6. Layout global borne (tablette)

```css
.borne-layout {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #F5F5F5;
  position: relative;
}

/* Offset = info-bar(36) + header(110) + step-badge(56) = 202px */
.borne-content {
  flex: 1;
  overflow-y: auto;
  padding-top: 202px;
  padding-bottom: 24px;
  position: relative;
}
```

---

## 7. Données dynamiques de la barre info borne

Les libellés des champs sont traduits selon la langue active (observé dans les maquettes) :

```javascript
// FR (maquette 1) : "Master Filiale : SANS MASTER   regie : LEADS TABLETTE   installateur : ACTEO SERVICES"
// ES (maquette 2) : "Filial Master: SANS MASTER   agencia: LEADS TABLETTE   instalador: ACTEO SERVICES"

const infoBarLabels = {
  fr: { masterFiliale: 'Master Filiale', regie: 'regie',   installateur: 'installateur' },
  es: { masterFiliale: 'Filial Master',  regie: 'agencia', installateur: 'instalador'   },
  en: { masterFiliale: 'Master Branch',  regie: 'agency',  installateur: 'installer'    },
}

// Donnees dynamiques depuis la config borne
const infoBarData = {
  masterFiliale: borne.adminBorne.raisonSociale,  // ex: "SANS MASTER"
  regie:         borne.regie,                      // ex: "LEADS TABLETTE"
  installateur:  borne.installateur,               // ex: "ACTEO SERVICES"
}
```

**Logo** : texte stylise "ila25" / "ila26" en haut gauche de la barre info (pas une image PNG).

---

## 8. Règles immuables (a verifier a chaque commit)

1. **Degrade header** : `linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%)` -- jamais couleur unie
2. **Barre info borne** : fond sombre (`#0A0A0A` ou `#1A1A2E`), donnees dynamiques i18n
3. **Badge etape** : cercle `#5B2D8E` + numero blanc + libelle sombre a droite
4. **Boutons options** : bordure `#5B2D8E` au repos -> fond `#5B2D8E` plein quand selectionne
5. **Paragraphe info** : couleur `#5B2D8E`, italique, centre, sous les options
6. **Fleche navigation** : bouton carre arrondi, centre sous la question (pas sur les cotes)
7. **Selecteur langue** : drapeau dans le header haut droit, toujours visible
8. **Touch targets** : minimum 48px x 48px sur tous les elements interactifs
9. **Couleur primaire V2** : `#5B2D8E` -- PAS `#5C2DD3` (couleur V1 obsolete)
10. **Labels InfoBar** : traduire selon la langue active (Master Filiale / Filial Master / Master Branch)
