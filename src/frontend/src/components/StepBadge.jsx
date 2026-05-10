/**
 * StepBadge — badge d'étape numéroté (R5.3).
 * Cercle violet #5B2D8E + numéro blanc + libellé + séparateur.
 */
export default function StepBadge({ current, total }) {
  return (
    <div className="step-badge-wrap" aria-label={`Étape ${current} sur ${total}`}>
      <div className="pf-progress" aria-hidden="true">
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={`pf-dot${index === current - 1 ? ' on' : ''}${index < current - 1 ? ' done' : ''}`}
          />
        ))}
      </div>
      <span className="step-badge-label">Étape {current} / {total}</span>
    </div>
  )
}
