# Skill — Ajouter une question au formulaire V2

## Quand utiliser ce skill
Quand tu dois ajouter une nouvelle question au formulaire dynamique V2 (via l'API ou le back-office).

## Étapes

### 1. Identifier le typeOption
```
texte_court      → <input type="text">
texte_long       → <textarea>
option_unique    → boutons radio custom
options_multiples → cases à cocher custom
telephone        → <input type="tel">
email            → <input type="email">
```

### 2. Créer la question via l'API
```bash
POST /api/formulaires/:id/questions
Authorization: Bearer <SUPER_ADMIN_JWT>

{
  "libelleQuestion": {
    "fr": "Libellé en français (OBLIGATOIRE)",
    "es": "Etiqueta en español (optionnel)",
    "en": "Label in English (optionnel)"
  },
  "typeOption": "option_unique",
  "options": [
    { "id": "opt-1", "label": { "fr": "Option 1", "es": "Opción 1", "en": "Option 1" } },
    { "id": "opt-2", "label": { "fr": "Option 2", "es": "Opción 2", "en": "Option 2" } }
  ],
  "orderPage": 16,
  "obligatoire": false,
  "paragrapheInfo": { "fr": null, "es": null, "en": null }
}
```

### 3. Vérifier que FieldRenderer.jsx gère le typeOption
```jsx
// src/frontend/src/components/FieldRenderer.jsx
// Vérifier que le switch/case couvre le typeOption
// Si manquant → ajouter le case
switch (question.typeOption) {
  case 'texte_court': return <input type="text" ... />
  case 'texte_long': return <textarea ... />
  case 'option_unique': return <RadioGroup options={question.options} ... />
  case 'options_multiples': return <CheckboxGroup options={question.options} ... />
  case 'telephone': return <input type="tel" ... />
  case 'email': return <input type="email" ... />
}
```

### 4. Utiliser la fonction t() pour les libellés
```javascript
// src/frontend/src/utils/i18n.js
import { t } from '../utils/i18n.js'

// Dans le composant :
const label = t(question.libelleQuestion, langue, 'fr')
// Si langue='es' et libelleQuestion.es est vide → retourne libelleQuestion.fr
```

### 5. Publier le formulaire (si en brouillon)
```bash
PATCH /api/formulaires/:id/statut
{ "statut": "publie" }
# → 422 si une question n'a pas de libelleQuestion.fr
# → 200 si toutes les questions ont un libellé FR
```

### 6. Tester
```bash
cd src/backend && npm test          # 72+ tests doivent passer
cd src/frontend && npm run dev      # tester visuellement sur tablette
```

## Règles
- `libelleQuestion.fr` est OBLIGATOIRE pour publier le formulaire
- `libelleQuestion.es` et `libelleQuestion.en` sont optionnels (fallback FR)
- Les options doivent avoir des IDs stables (pas générés aléatoirement)
- Pour les champs CRM V1, utiliser les vrais field IDs (2087, 2088, etc.)
- `obligatoire: true` bloque le bouton "Suivant" si non rempli

## Correspondance V1 → V2 (field IDs CRM)
```
2087 Nom           → typeOption: texte_court, obligatoire: true
2088 Prénom        → typeOption: texte_court, obligatoire: true
2089 Code postal   → typeOption: texte_court, obligatoire: true
2090 Ville         → typeOption: texte_court, obligatoire: true
2294 Revenu fiscal → typeOption: option_unique, obligatoire: true
2293 Statut prop.  → typeOption: option_unique, obligatoire: true
2292 Type logement → typeOption: option_unique
2301 Chauffage     → typeOption: option_unique
2299 Travaux       → typeOption: options_multiples
2015 Téléphone     → typeOption: telephone
2016 Email         → typeOption: email
2305 Commentaires  → typeOption: texte_long
```
