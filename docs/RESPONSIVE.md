# RESPONSIVE.md — Plan d'exécution Audit & Fixes Frontend

> Plan opérationnel pour atteindre **zéro débordement** sur toutes les cibles d'écran
> sans altérer la charte graphique ni perturber les parties stables.
>
> **Scope** : `src/frontend/` (Front-Office Borne — React 19 + Vite 8 + Tailwind v4)
> **Date** : 2026-05-14
> **Statut** : 📋 Plan validé — prêt à exécuter

---

## 1. Contexte & Objectif

### État actuel par cible

| Cible | Résolution | Conformité actuelle | Objectif |
|---|---|---|---|
| 🌐 **Web** | ≥ 1280px | **95% ✅** | **100% (gelé — preservation totale)** |
| 📺 **Kiosk** | 1024-1919px | **70%** | **100%** |
| 📱 **Tablette** | 640-1023px | **75%** | **100%** |
| 📲 **Mobile** | < 640px | **40%** | **100%** |

### Objectif

1. **Zéro overflow horizontal** sur toutes les cibles
2. **Charte graphique préservée** : couleurs, polices, ombres, arrondis, icônes inchangés
3. **Non-régression** : web 95% reste pixel-identique (tolérance 0.1%)
4. **Touch targets ≥ 48px** (règle absolue CLAUDE.md n°1)
5. **Font-size inputs ≥ 16px** (anti-zoom iOS)

### Contraintes

- ❌ Pas de refonte du système CSS (3 systèmes coexistent : global, modules, inline — on les laisse)
- ❌ Pas de renommage de classes, pas de restructuration JSX
- ❌ Pas de changement de tokens design
- ✅ Modifications **chirurgicales** uniquement, conditionnées par viewport

---

## 2. Audit synthétique — 19 problèmes identifiés

### 📲 MOBILE < 640px (11 problèmes, 60% du chantier)

| ID | Sévérité | Fichier | Problème | Fix |
|---|---|---|---|---|
| **M1** | 🔴 Critique | `components/DialCodePicker.jsx:24` | `dropW = Math.max(rect.width, 160)` déborde de 180px sur 375px | Clamp viewport JS |
| **M2** | 🔴 Critique | `components/PhoneInput.jsx:250` | `dropW = Math.max(rect.width + 200, 300)` déborde à droite | Clamp viewport JS + repositionnement `left` |
| **M3** | 🔴 Critique | `components/ExitButton.jsx:130` | Modal `max-w-sm` (384px) sans clamp viewport | Classe `max-w-[min(384px,calc(100vw-32px))]` |
| **M4** | 🟠 Important | `pages/FormPage.jsx:440` | BorneInfoBar `max-w-[120px]` tronque trop | `max-w-[min(120px,30vw)] sm:max-w-[200px] md:max-w-none` |
| **M5** | 🟠 Important | `components/PhoneInput.module.css:131-141` | `.searchClear` 32×32px viole règle 48px | Passer à 48×48px |
| **M6** | 🟠 Important | `pages/LoginPage.jsx:336-345` | Padding 40px trop large ≤375px | Media query ≤480px : 24px 16px |
| **M7** | 🟠 Important | `pages/FormPage.jsx:357-359` | `paragrapheInfo` sans `break-words` | Ajout classe Tailwind `break-words` |
| **M8** | 🟠 Important | `index.css:739-750` | `pf-option-grid--compact-two` saut discontinu à 380px | Lisser breakpoint à 480px |
| **M9** | 🟡 Mineur | `index.css:436-451` | Step dots × 15 = 110px → débordement 359px | Réduction dot 6→4px <480px |
| **M10** | 🟡 Mineur | `index.css:171-178` | `.app-header-sub` `white-space:nowrap` déborde <375px | Supprimer nowrap <480px |
| **M11** | 🟡 Mineur | `components/LanguageSelector.jsx:103` | Dropdown `minWidth:180` fixe | `min(180px, calc(100vw - 32px))` |

### 📺 KIOSK 1024-1919px (3 problèmes, 20%)

| ID | Sévérité | Fichier | Problème | Fix |
|---|---|---|---|---|
| **K1** | 🟠 Important | `index.css:1067` | `.nav-bar max-width:480px` gap énorme sur 1920px | Media `≥1024px : 960px` |
| **K2** | 🟠 Important | `components/KioskShell.jsx:279` | Modal exit `maxWidth:400` sous-utilisé | `min(500px, calc(100vw - 32px))` |
| **K3** | 🟡 Mineur | `components/KioskShell.jsx:179-191` | Corner zone 40×40px < 48px | Passer à 48×48px |

### 📱 TABLETTE 640-1023px (3 problèmes, 15%)

| ID | Sévérité | Fichier | Problème | Fix |
|---|---|---|---|---|
| **T1** | 🔴 Critique | `pages/FormPage.jsx:298` | Titre `text-[28px] md:text-[40px]` débordement | `clamp(20px, 4vw, 40px)` |
| **T2** | 🟠 Important | `index.css:1645-1767` | `.tablet-nav-prev top:142px` instable clavier | `clamp(120px, 18vh, 180px)` |
| **T3** | 🟡 Mineur | `pages/ConfirmationPage.jsx:84` | Countdown bar `max-w-xs` serré | `max-w-[min(320px,90vw)]` |

### 🌐 WEB ≥ 1280px

✅ **Aucune action** — preservation totale. Tests de non-régression uniquement.

---

## 3. Stratégie d'isolation — Garantie de non-régression

### Principe : chaque modification est **conditionnée**

| Mécanisme autorisé | Garantie | Exemple |
|---|---|---|
| `@media (max-width: 639px)` | N'affecte que mobile | Padding LoginPage |
| `clamp(min, vw, max)` où `max` = valeur web | Web identique au pixel près | Titre FormPage |
| `min(384px, calc(100vw - 32px))` | Réduit seulement si nécessaire | Modal Exit |
| Calcul JS `Math.min(window.innerWidth - 16, baseW)` | N'agit que si overflow | Dropdowns |
| `@media (min-width: 1024px)` | N'affecte que kiosk | Nav-bar largeur |

### Mécanismes INTERDITS

- ❌ Supprimer une dimension fixe sans la remplacer
- ❌ Renommer/refactor de classes existantes
- ❌ Toucher aux tokens design (couleurs, polices)
- ❌ Modifier la structure JSX
- ❌ Ajouter `!important` (symptôme de problème ailleurs)

### Scope d'impact par fix

| Fix | Viewports modifiés | Viewports garantis intacts |
|---|---|---|
| M1, M2 | < 640px (clamp JS seulement) | ≥ 640px (logique inchangée) |
| M3 | < 416px (où viewport - 32 < 384) | ≥ 416px (max-w-sm préservé) |
| M4 | < 640px | ≥ 640px (`sm:` inchangé) |
| M5 | Tous (compliance touch) | Visuel ≥ 640px : pos relative préservée |
| M6 | < 480px | ≥ 480px |
| M7 | Tous (no-op sans débordement) | Pas d'effet sans texte long |
| M8 | < 480px | ≥ 480px |
| M9, M10, M11 | < 480px | ≥ 480px |
| K1 | ≥ 1024px | < 1024px |
| K2 | ≥ 432px (utilise jusqu'à 500) | < 432px (idem ou mieux) |
| K3 | Tous | Visuel : zone +8px en coin |
| T1 | < 1000px (où clamp < 40px) | ≥ 1000px (40px = valeur md actuelle) |
| T2 | 640-1023px | <640px et ≥1024px inchangés |
| T3 | < 356px | ≥ 356px (320px = max-w-xs préservé) |

---

## 4. Phases d'exécution

### 📍 Phase 0 — Préparation & Baseline (1h, lecture seule)

**Objectif** : capturer un point de référence pour valider la non-régression.

| # | Action | Durée |
|---|---|---|
| 0.1 | `git checkout -b feat/responsive-fixes` | 1 min |
| 0.2 | `cd src/frontend && npm run build && npm run preview` | 5 min |
| 0.3 | Créer `src/frontend/e2e/visual-baseline.spec.js` (captures × 7 viewports) | 30 min |
| 0.4 | Lancer captures baseline → `src/frontend/e2e/__screenshots__/baseline/` | 15 min |
| 0.5 | Vérifier que tests backend (`npm test`) passent | 5 min |
| 0.6 | Commit `chore(frontend): baseline visual snapshots` | 2 min |

**Matrice viewports** :
```
375×667    iPhone SE
390×844    iPhone 14
414×896    iPhone 11 Pro Max
768×1024   iPad mini portrait
1024×768   iPad mini paysage / kiosk min
1280×800   kiosk standard
1920×1080  kiosk grand format
```

**Pages capturées** :
- WelcomePage, StartPage, LoginPage
- FormPage étapes 1, 5, 12
- ConfirmationPage
- Modale ExitButton (ouverte)
- Dropdown DialCodePicker (ouvert)
- Dropdown LanguageSelector (ouvert)

→ **42 screenshots de référence** (7 viewports × 6 pages clés).

---

### 📍 Phase 1 — Mobile (4-5h) — 60% du chantier

**Cible** : < 640px (40% → 100%)
**Garantie** : aucun changement visuel ≥ 640px

**Ordre d'exécution** (impact décroissant) :

| Ordre | Fix | Fichier | Type modif | Commit | Gate validation |
|---|---|---|---|---|---|
| 1 | M1 | `DialCodePicker.jsx` | JS — clamp `dropW` viewport | `fix(frontend): M1 clamp dialcode dropdown viewport` | Diff web ≤ 0.1% + zero overflow 375px |
| 2 | M2 | `PhoneInput.jsx` | JS — clamp `dropW` + reposition `left` | `fix(frontend): M2 clamp phone dropdown viewport` | Idem |
| 3 | M3 | `ExitButton.jsx` | Tailwind `min()` | `fix(frontend): M3 exit modal viewport clamp` | Idem |
| 4 | M5 | `PhoneInput.module.css` | CSS taille bouton 32→48px | `fix(frontend): M5 searchClear touch target 48px` | Visuel ≥640px : pos relative inchangée |
| 5 | M7 | `FormPage.jsx` | Classe `break-words` | `fix(frontend): M7 break-words on dynamic text` | Diff web ≤ 0.1% |
| 6 | M4 | `FormPage.jsx` | Classes Tailwind responsive | `fix(frontend): M4 borneinfobar max-w responsive` | Idem |
| 7 | M6 | `LoginPage.jsx` | Media query `≤480px` | `fix(frontend): M6 loginpage padding mobile compact` | Idem |
| 8 | M8 | `index.css` | Media query `≤480px` | `fix(frontend): M8 option-grid breakpoint 480` | Idem |
| 9 | M9-M11 | 3 fichiers | Polish mobile | `fix(frontend): M9-M11 mobile polish` | Idem |

**Workflow par fix** :
```
1. Modifier UN fichier, UNE propriété/bloc
2. Test manuel : viewport cible (375px) → overflow nul ?
3. Test manuel : viewport ≥1280px → identique au baseline ?
4. Lancer test visual-regression
5. Si gate OK → commit + passer au suivant
6. Si gate KO → revert + analyser
```

---

### 📍 Phase 2 — Kiosk (1-2h) — 20%

**Cible** : 1024-1919px (70% → 100%)
**Garantie** : aucun changement visuel < 1024px et web ≥ 1920px

| Ordre | Fix | Fichier | Type modif | Commit |
|---|---|---|---|---|
| 1 | K1 | `index.css:1067` | `@media (min-width:1024px)` | `fix(frontend): K1 nav-bar max-width kiosk` |
| 2 | K2 | `KioskShell.jsx:279` | `min(500px, calc(100vw - 32px))` | `fix(frontend): K2 exit modal kiosk width` |
| 3 | K3 | `KioskShell.jsx:179-191` | Taille corner 40→48px | `fix(frontend): K3 kiosk corner touch target` |

---

### 📍 Phase 3 — Tablette (1-2h) — 15%

**Cible** : 640-1023px (75% → 100%)
**Garantie** : web ≥ 1024px identique (clamp borne haute = valeur actuelle)

| Ordre | Fix | Fichier | Type modif | Commit |
|---|---|---|---|---|
| 1 | T1 | `FormPage.jsx:298` | `clamp(20px, 4vw, 40px)` | `fix(frontend): T1 hero title fluid typography` |
| 2 | T2 | `index.css:1645` | `clamp(120px, 18vh, 180px)` sur `top` | `fix(frontend): T2 tablet nav arrows position` |
| 3 | T3 | `ConfirmationPage.jsx:84` | `max-w-[min(320px,90vw)]` | `fix(frontend): T3 countdown bar responsive` |

---

### 📍 Phase 4 — Validation finale (1h)

| # | Action | Critère |
|---|---|---|
| 4.1 | Tests visual-regression sur 7 viewports × 6 pages | Web (1920/1280) diff ≤ 0.1% vs baseline |
| 4.2 | Tests overflow zéro | `scrollWidth ≤ innerWidth` partout |
| 4.3 | Tests touch targets ≥ 48px | Aucun élément interactif < 48px |
| 4.4 | `cd src/backend && npm test` | 72+ tests Jest verts |
| 4.5 | `npx playwright test` (E2E V1) | 9 tests verts |
| 4.6 | Test manuel kiosk Android WebView | Tests des 15 étapes + dropdowns |
| 4.7 | Commit `chore(frontend): final validation` + PR | — |

---

## 5. Tests automatisés à mettre en place

### Fichier 1 — Visual regression (Phase 0)

**Localisation** : `src/frontend/e2e/visual-baseline.spec.js`

```javascript
import { test, expect } from '@playwright/test'

const VIEWPORTS = [
  { name: 'mobile-se', width: 375, height: 667 },
  { name: 'mobile-14', width: 390, height: 844 },
  { name: 'mobile-pro-max', width: 414, height: 896 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'kiosk-standard', width: 1280, height: 800 },
  { name: 'kiosk-large', width: 1920, height: 1080 },
]

const PAGES = [
  { name: 'welcome', path: '/' },
  { name: 'start', path: '/start' },
  { name: 'form-step-1', path: '/form?step=1' },
  { name: 'form-step-5', path: '/form?step=5' },
  { name: 'form-step-12', path: '/form?step=12' },
  { name: 'confirmation', path: '/confirmation' },
]

const STABLE_VIEWPORTS = ['kiosk-standard', 'kiosk-large', 'tablet-landscape']

for (const vp of VIEWPORTS) {
  for (const pg of PAGES) {
    test(`${vp.name} — ${pg.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(pg.path)
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveScreenshot(`${vp.name}/${pg.name}.png`, {
        maxDiffPixelRatio: STABLE_VIEWPORTS.includes(vp.name) ? 0.001 : 0.5,
        fullPage: true,
      })
    })
  }
}
```

### Fichier 2 — Overflow & touch targets (Phase 4)

**Localisation** : `src/frontend/e2e/responsive-guards.spec.js`

```javascript
import { test, expect } from '@playwright/test'

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]

const PAGES = ['/', '/start', '/form?step=1', '/form?step=5', '/confirmation']

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    test(`Zero overflow ${vp.width}px — ${path}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })

    test(`Touch targets ≥48px ${vp.width}px — ${path}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const failing = await page.$$eval(
        'button, input, a, [role="button"], select',
        els => els
          .filter(e => {
            const r = e.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && (r.width < 48 || r.height < 48)
          })
          .map(e => ({
            tag: e.tagName,
            class: e.className?.toString().slice(0, 60),
            size: `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`,
          }))
      )
      expect(failing).toEqual([])
    })
  }
}
```

---

## 6. Gates de validation (bloquants)

À chaque commit, les conditions suivantes doivent être satisfaites :

| Gate | Condition | Comment vérifier |
|---|---|---|
| **G1 — Pixel-perfect web** | diff ≤ 0.1% sur 1920/1280px vs baseline | `playwright test visual-baseline` |
| **G2 — Zero overflow** | `scrollWidth ≤ innerWidth` sur viewports cibles | `playwright test responsive-guards` |
| **G3 — Touch ≥ 48px** | Aucun élément interactif < 48px | Test automatique inclus |
| **G4 — Backend OK** | 72+ tests Jest passent | `cd src/backend && npm test` |
| **G5 — E2E V1 OK** | 9 tests Playwright verts | `npx playwright test e2e/v1` |

→ Un gate KO = **commit refusé**, revert immédiat, analyse.

---

## 7. Protocole de rollback

**Principe** : 1 fix = 1 commit atomique → revert ciblé sans cascade.

```bash
# En cas de régression détectée
git log --oneline feat/responsive-fixes

# Revert du commit fautif
git revert <sha>

# Push & re-test
git push
```

Aucune dépendance entre fixes → rollback indépendant garanti.

---

## 8. Livrables attendus

À la fin du chantier :

- ✅ Branche `feat/responsive-fixes` mergée sur main
- ✅ 42 screenshots baseline dans `src/frontend/e2e/__screenshots__/`
- ✅ 2 nouveaux fichiers de test : `visual-baseline.spec.js`, `responsive-guards.spec.js`
- ✅ 0 nouveau composant créé (modifications en place uniquement)
- ✅ Web 95% → maintenu à 95%+ (preservation pixel)
- ✅ Mobile 40% → 100%
- ✅ Kiosk 70% → 100%
- ✅ Tablette 75% → 100%
- ✅ Touch targets : 100% conformes à la règle ≥ 48px
- ✅ Documentation à jour : ce fichier `docs/RESPONSIVE.md`

---

## 9. Estimation totale

| Phase | Durée | Type travail |
|---|---|---|
| Phase 0 — Baseline | 1h | Lecture + setup tests |
| Phase 1 — Mobile (11 fixes) | 4-5h | Modifications + validation |
| Phase 2 — Kiosk (3 fixes) | 1-2h | Modifications + validation |
| Phase 3 — Tablette (3 fixes) | 1-2h | Modifications + validation |
| Phase 4 — Validation finale | 1h | Tests automatisés + manuel |
| **TOTAL** | **8-11h** | |

---

## 10. Risques & mitigation

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Régression visuelle web non détectée | Faible | Élevé | Tests visual-regression bloquants sur 1920/1280 |
| Effet de cascade entre fixes | Très faible | Moyen | 1 commit atomique par fix |
| Test Playwright instable (anti-aliasing) | Moyen | Faible | Tolérance `maxDiffPixelRatio: 0.001` |
| Tests V1 cassés par modification CSS | Très faible | Élevé | Gate G5 bloquant + zéro modif structure JSX |
| Clavier virtuel mobile cache éléments | Moyen | Moyen | Test manuel sur device réel Phase 4.6 |
| Différence rendu WebView Android vs Chromium | Moyen | Moyen | Test final sur tablette Android kiosque |

---

## 11. Checklist de démarrage

- [ ] Lire ce document en entier
- [ ] Valider la matrice viewports avec PM
- [ ] Vérifier que `main` est à jour et tests verts
- [ ] Créer branche `feat/responsive-fixes`
- [ ] Démarrer **Phase 0 — Baseline**

---

*Dernière mise à jour : 2026-05-14*
*Auteur : audit responsive frontend — chef de projet*
*Validation : à confirmer avant Phase 0*
