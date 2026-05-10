import { t } from '../utils/i18n.js'
import FieldRenderer from './FieldRenderer.jsx'

/**
 * StepRenderer — rendu d'une étape du formulaire.
 * Affiche le libellé de la question, le paragraphe d'info, et délègue
 * le rendu du champ à FieldRenderer selon typeOption.
 *
 * typeOption supportés (via FieldRenderer) :
 *   texte_court → <input type="text">
 *   texte_long  → <textarea>
 *   email       → <input type="email">
 *   telephone   → <input type="tel">
 *   option_unique    → radio-style buttons
 *   options_multiples → checkbox-style buttons
 *
 * Règles :
 * - Touch targets ≥ 48px (minHeight: '52px' dans FieldRenderer)
 * - Font-size ≥ 16px sur tous les inputs
 * - Couleur primaire #5B2D8E
 */
export default function StepRenderer({ question, value, onChange, langue }) {
  if (!question) return null

  const libelleQuestion = t(question.libelleQuestion, langue)
  const paragrapheInfo = t(question.paragrapheInfo, langue)

  return (
    <div className="step-renderer">
      {/* Titre de la question */}
      <h2 className="pf-title">
        {libelleQuestion}
      </h2>

      {/* Paragraphe d'information optionnel */}
      {paragrapheInfo && (
        <p className="pf-hint">
          {paragrapheInfo}
        </p>
      )}

      {/* Rendu du champ selon typeOption */}
      <FieldRenderer
        question={question}
        value={value}
        onChange={onChange}
        langue={langue}
      />
    </div>
  )
}
