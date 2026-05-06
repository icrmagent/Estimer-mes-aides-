/**
 * StepBadge — badge d'étape numéroté (R5.3).
 * Cercle violet #5B2D8E + numéro blanc + libellé + séparateur.
 */
export default function StepBadge({ current, total }) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        {/* Cercle numéroté */}
        <div
          className="flex items-center justify-center rounded-full text-white font-bold text-sm flex-shrink-0"
          style={{
            width: '32px',
            height: '32px',
            background: '#5B2D8E',
            fontSize: '14px',
          }}
        >
          {current}
        </div>

        {/* Libellé étape */}
        <span className="text-gray-700 font-semibold text-sm">
          Étape {current} / {total}
        </span>

        {/* Barre de progression */}
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(current / total) * 100}%`,
              background: '#5B2D8E',
            }}
          />
        </div>
      </div>
    </div>
  )
}
