import { destinationBorne } from './forms/entrepriseIcrmConfig.js'

/**
 * Destination I-CRM des enregistrements d'une borne (même ordre que le worker) :
 * l'entreprise I-CRM si elle est active, sinon le canal de la borne.
 */
export default function DestinationBorne({ borne }) {
  const destination = destinationBorne(borne)
  if (destination.type === 'entreprise') {
    const e = borne.entrepriseIcrm
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold text-purple-800"
        title={e.nomIcrm ? `I-CRM : ${e.nomIcrm}${e.sousTypeIcrm ? ` — ${e.sousTypeIcrm}` : ''}` : 'Entreprise I-CRM non vérifiée'}
      >
        <span aria-hidden="true">🏢</span>
        {destination.libelle}
      </span>
    )
  }
  return (
    <span className="text-gray-500">
      {destination.libelle}
      {destination.alerte && (
        <span className="block text-orange-600" title={destination.alerte}>⚠ {destination.alerte}</span>
      )}
    </span>
  )
}
