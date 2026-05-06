---
inclusion: fileMatch
fileMatchPattern: "src/frontend/**,src/crm-module/**,*.css,*.jsx,*.tsx"
---

# Design System — Estimer Mes Aides

## Couleurs (tokens immuables)
```css
--c-primary:       #5C2DD3   /* violet institutionnel — NE PAS CHANGER */
--c-primary-dark:  #4A1FAF
--c-primary-light: #7B4AE2
--c-primary-bg:    #F0EBFF
--c-primary-muted: rgba(92, 45, 211, 0.12)
--c-surface:       #FFFFFF
--c-surface-2:     #F8F7FC
--c-border:        #E8E4F3
--c-text:          #1A1030
--c-text-2:        #6B6888
--c-error:         #EF4444
--c-success:       #10B981
```

## Typographie
- Font : **DM Sans** (display + body)
- Base mobile : 16px (jamais moins sur les inputs → évite le zoom iOS)
- Poids : 400 regular / 500 medium / 600 semibold / 700 bold

## Espacement (base 4px)
`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48px`

## Touch targets
- **Minimum 48px** de hauteur sur tous les éléments interactifs
- Padding horizontal minimum 16px sur les pages mobiles

## Rayons
`8px (sm) | 12px (md) | 16px (lg) | 20px (xl) | 9999px (full)`

## Ombres
```css
--shadow-card:   0 2px 12px rgba(92,45,211,0.08)
--shadow-button: 0 4px 16px rgba(92,45,211,0.3)
```

## Composants de référence

### Button
```jsx
// variant: 'primary' | 'secondary' | 'ghost'
// Toujours min-h-[48px], rounded-[12px], w-full sur mobile
<button className="min-h-[48px] px-6 rounded-[12px] font-semibold text-base
  bg-[#5C2DD3] text-white shadow-[0_4px_16px_rgba(92,45,211,0.3)]
  active:scale-[0.98] transition-all duration-150
  disabled:opacity-40 disabled:cursor-not-allowed">
```

### Input
```jsx
// font-size MINIMUM 16px (évite zoom iOS)
// min-h-[48px] obligatoire
<input className="w-full min-h-[48px] px-4 text-[16px]
  border border-[#E8E4F3] rounded-[12px]
  focus:border-[#5C2DD3] focus:ring-2 focus:ring-[#5C2DD3]/20
  outline-none transition-all" />
```

### Card
```jsx
<div className="bg-white rounded-[16px] p-4
  shadow-[0_2px_12px_rgba(92,45,211,0.08)]
  border border-[#E8E4F3]">
```

## Règles UI strictes
- Pas de `hover:` only (mobile = pas de hover)
- Pas de `window.open()` ni `<a target="_blank">` (WebView)
- Pas de `alert()` / `confirm()` natifs → utiliser des modales React
- Pas de scroll horizontal sur 375px
- Header fixe en haut, navigation fixe en bas
