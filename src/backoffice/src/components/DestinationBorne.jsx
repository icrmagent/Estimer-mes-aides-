import { destinationBorne, LIBELLE_ENVOIS_SUSPENDUS } from './forms/entrepriseIcrmConfig.js'

/** Badge « Envois suspendus (entreprise désactivée / à tester) ». */
export function BadgeEnvoisSuspendus({ libelle = LIBELLE_ENVOIS_SUSPENDUS }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-50 border-orange-200 text-orange-700 whitespace-nowrap"
      data-testid="badge-envois-suspendus"
      title="Rien n'est envoyé (ni à l'entreprise, ni aux canaux) tant que l'entreprise I-CRM n'est pas réactivée ou testée avec succès."
    >
      ⏸ {libelle}
    </span>
  )
}

/**
 * Destination I-CRM des nouveaux enregistrements d'une borne : l'entreprise I-CRM
 * affectée (envois suspendus si elle est désactivée ou à tester), sinon le canal.
 */
export default function DestinationBorne({ borne }) {
  const destination = destinationBorne(borne)
  if (destination.type === 'entreprise') {
    const e = borne.entrepriseIcrm
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span
          className={`inline-flex items-center gap-1 font-semibold ${destination.suspendu ? 'text-gray-500' : 'text-purple-800'}`}
          title={e.nomIcrm ? `I-CRM : ${e.nomIcrm}${e.sousTypeIcrm ? ` — ${e.sousTypeIcrm}` : ''}` : 'Entreprise I-CRM non vérifiée'}
        >
          <span aria-hidden="true">🏢</span>
          {destination.libelle}
        </span>
        {destination.suspendu && <BadgeEnvoisSuspendus libelle={destination.suspendu} />}
      </span>
    )
  }
  return <span className="text-gray-500">{destination.libelle}</span>
}
