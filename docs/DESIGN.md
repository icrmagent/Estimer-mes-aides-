# DESIGN.md — Système de Design UI/UX

## Vision Design
Interface épurée et rassurante pour un public non-technique (particuliers). 
Navigation guidée, progressive, sans ambiguïté. Couleur institutionnelle violette (#5C2DD3) = confiance et sérieux.

**Aesthetic direction** : "Administratif moderne" — clean, professionnel mais chaleureux. 
Pas de fioriture, tout est au service de la saisie rapide et confiante.

---

## 🎨 Tokens de Design (source de vérité)

```css
/* ═══════════════════════════════
   COULEURS
═══════════════════════════════ */
:root {
  /* Primaire */
  --c-primary:       #5C2DD3;
  --c-primary-dark:  #4A1FAF;
  --c-primary-light: #7B4AE2;
  --c-primary-bg:    #F0EBFF;
  --c-primary-muted: rgba(92, 45, 211, 0.12);
  
  /* Neutres */
  --c-surface:       #FFFFFF;
  --c-surface-2:     #F8F7FC;  /* légèrement violacé */
  --c-border:        #E8E4F3;
  --c-border-focus:  #5C2DD3;
  
  /* Texte */
  --c-text:          #1A1030;
  --c-text-2:        #6B6888;
  --c-text-on-dark:  #FFFFFF;
  
  /* Statuts */
  --c-error:         #EF4444;
  --c-error-bg:      #FEF2F2;
  --c-success:       #10B981;
  --c-success-bg:    #F0FDF4;
  --c-warning:       #F59E0B;

/* ═══════════════════════════════
   TYPOGRAPHIE
═══════════════════════════════ */
  --font-display:    'DM Sans', 'Segoe UI', system-ui, sans-serif;
  --font-body:       'DM Sans', 'Segoe UI', system-ui, sans-serif;
  
  --text-xs:         12px;
  --text-sm:         14px;
  --text-md:         16px;  /* base mobile */
  --text-lg:         18px;
  --text-xl:         20px;
  --text-2xl:        24px;
  --text-3xl:        28px;
  
  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  
  --lh-tight:        1.2;
  --lh-normal:       1.5;
  --lh-relaxed:      1.7;

/* ═══════════════════════════════
   ESPACEMENT
═══════════════════════════════ */
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;   /* padding page mobile */
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-8:  32px;
  --sp-10: 40px;
  --sp-12: 48px;   /* touch target minimum */

/* ═══════════════════════════════
   BORDURES & OMBRES
═══════════════════════════════ */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-xl:   20px;
  --radius-full: 9999px;
  
  --shadow-sm:   0 1px 4px rgba(92, 45, 211, 0.06);
  --shadow-md:   0 2px 12px rgba(92, 45, 211, 0.10);
  --shadow-lg:   0 4px 24px rgba(92, 45, 211, 0.15);
  --shadow-btn:  0 4px 16px rgba(92, 45, 211, 0.30);

/* ═══════════════════════════════
   TRANSITIONS
═══════════════════════════════ */
  --ease:        cubic-bezier(0.4, 0, 0.2, 1);
  --duration-sm: 120ms;
  --duration-md: 200ms;
  --duration-lg: 300ms;
}
```

---

## 📐 Layout Mobile (WebView)

```
┌─────────────────────────────┐ ← max-width: 430px, margin: auto
│  HEADER (fixe, 60px)        │ ← bg: #5C2DD3, text: white
│  Logo + Titre + Step X/Y    │
├─────────────────────────────┤
│                             │
│  PROGRESS BAR (4px)         │ ← bg: rgba(255,255,255,0.3) → filled: white
│                             │
├─────────────────────────────┤
│                             │
│  CONTENT (scroll libre)     │ ← padding: 16px, bg: #F8F7FC
│  ┌─────────────────────┐   │
│  │  CARD               │   │ ← bg: white, radius: 16px, shadow-md
│  │  Question label     │   │ ← font-size: 16px, weight: 600
│  │  [Field input]      │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │  CARD (next field)  │   │
│  └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│  NAVIGATION BAR (fixe, 88px)│ ← bg: white, shadow-up
│  [Précédent]  [Suivant →]   │ ← 48px height buttons
└─────────────────────────────┘
```

---

## 🧩 Composants UI

### Header
```
- Background : #5C2DD3
- Hauteur : 60px (fixe)
- Contenu : [logo/icône] + [titre étape] + [sous-titre catégorie]
- Text color : white
- Pas de shadow (la progress bar fait la séparation)
```

### Progress Bar
```
- Hauteur : 6px
- Background track : rgba(255,255,255,0.25)
- Filled : white
- Transition : width 300ms ease
- Calcul : (étapeActuelle / totalÉtapes) * 100%
```

### Card de champ
```css
.field-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 12px;
  box-shadow: 0 2px 12px rgba(92,45,211,0.08);
  border: 1.5px solid transparent;
  transition: border-color 200ms ease;
}
.field-card:focus-within {
  border-color: #5C2DD3;
}
```

### Label de champ
```css
.field-label {
  font-size: 15px;
  font-weight: 600;
  color: #1A1030;
  margin-bottom: 12px;
  display: block;
}
.field-label .required {
  color: #EF4444;
  margin-left: 2px;
}
```

### Input Text / Tel
```css
.field-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 1.5px solid #E8E4F3;
  border-radius: 12px;
  font-size: 16px;  /* évite le zoom auto sur iOS */
  color: #1A1030;
  outline: none;
  transition: border-color 200ms ease;
}
.field-input:focus {
  border-color: #5C2DD3;
  box-shadow: 0 0 0 3px rgba(92,45,211,0.12);
}
```

### Radio Button (custom)
```css
/* Option radio = pill button */
.radio-option {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 12px 16px;
  border: 1.5px solid #E8E4F3;
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 200ms ease;
  gap: 12px;
}
.radio-option.selected {
  border-color: #5C2DD3;
  background: #F0EBFF;
  color: #5C2DD3;
}
.radio-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid #E8E4F3;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.radio-option.selected .radio-dot {
  border-color: #5C2DD3;
  background: #5C2DD3;
}
.radio-dot-inner {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: white;
}
```

### Checkbox (custom)
```css
.checkbox-option {
  /* Même style que radio-option */
  /* Différence : le dot est carré avec checkmark */
}
.check-box {
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 2px solid #E8E4F3;
}
.checkbox-option.selected .check-box {
  background: #5C2DD3;
  border-color: #5C2DD3;
  /* ✓ en blanc centré */
}
```

### Textarea
```css
.field-textarea {
  width: 100%;
  min-height: 120px;
  padding: 14px 16px;
  border: 1.5px solid #E8E4F3;
  border-radius: 12px;
  font-size: 16px;
  font-family: var(--font-body);
  resize: vertical;
  outline: none;
}
```

### Bouton Suivant
```css
.btn-primary {
  height: 52px;
  padding: 0 24px;
  background: #5C2DD3;
  color: white;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  box-shadow: 0 4px 16px rgba(92,45,211,0.30);
  transition: all 150ms ease;
  flex: 1;
}
.btn-primary:active { transform: scale(0.97); }
.btn-primary:disabled {
  background: #C4B5E8;
  box-shadow: none;
  cursor: not-allowed;
}
```

### Bouton Précédent
```css
.btn-ghost {
  height: 52px;
  padding: 0 20px;
  background: transparent;
  color: #6B6888;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  border: none;
}
```

### Message d'erreur de champ
```css
.field-error {
  font-size: 13px;
  color: #EF4444;
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Précédé d'une icône ⚠️ */
```

### Écran de confirmation
```
- Icône ✓ en cercle vert (#10B981) centré
- Titre : "Votre demande a été enregistrée !"
- Sous-titre : numéro de dossier (UUID tronqué)
- Message : "Un conseiller vous contactera prochainement."
- Bouton : "Nouvelle demande" (ghost, secondaire)
```

---

## 🎬 Animations

### Transition entre étapes
```css
/* Slide depuis la droite pour Suivant, gauche pour Précédent */
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes slideInLeft {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
.step-enter { animation: slideInRight 250ms var(--ease); }
.step-enter-back { animation: slideInLeft 250ms var(--ease); }
```

### Loader overlay
```
- Overlay semi-transparent (#5C2DD3 à 15%)
- Spinner animé en #5C2DD3 (CSS border animation)
- Texte : "Enregistrement..."
```

---

## 📱 Checklist Responsive (375px minimum)

```
[ ] Aucun élément dépasse la largeur de l'écran
[ ] Tous les boutons ≥ 48px de hauteur
[ ] Font-size inputs ≥ 16px (évite zoom iOS)
[ ] Padding horizontal : 16px minimum
[ ] Les cartes ne s'écrasent pas sur petit écran
[ ] Le clavier virtuel ne cache pas le bouton Suivant
[ ] Les listes radio longues scrollent verticalement
[ ] Les labels ne sont pas tronqués
```
