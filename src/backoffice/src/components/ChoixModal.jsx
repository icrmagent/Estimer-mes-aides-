/**
 * ChoixModal — confirmation à plusieurs issues explicites (ex. « garder les envois
 * pour l'ancienne entreprise » / « les envoyer vers la nouvelle »).
 *
 * Props:
 * - titre, message: textes
 * - details?: node — contenu complémentaire (liste de bornes, décomptes…)
 * - choix: Array<{ label, onClick, variante?: 'recommande'|'secondaire'|'danger', testId? }>
 * - onAnnuler: function
 * - saving?: boolean — désactive les boutons pendant l'appel
 */
const VARIANTES = {
  recommande: 'text-white bg-[#5B2D8E] hover:opacity-90',
  secondaire: 'text-gray-800 bg-white border border-gray-300 hover:bg-gray-50',
  danger: 'text-white bg-red-600 hover:bg-red-700',
}

export default function ChoixModal({ titre, message, details = null, choix = [], onAnnuler, saving = false }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="choix-modal-titre">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div>
          <h2 id="choix-modal-titre" className="text-base font-bold text-gray-900">{titre}</h2>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
          {details && <div className="text-xs text-gray-500 mt-2">{details}</div>}
        </div>
        <div className="flex flex-col gap-2">
          {choix.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              disabled={saving}
              data-testid={c.testId}
              className={`w-full px-4 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors text-left ${VARIANTES[c.variante || 'secondaire']}`}
              style={{ minHeight: '44px' }}
            >
              {saving ? 'En cours…' : c.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onAnnuler}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50"
            style={{ minHeight: '40px' }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
