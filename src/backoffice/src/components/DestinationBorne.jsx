import { destinationBorne, LIBELLE_ENVOIS_SUSPENDUS } from './forms/entrepriseIcrmConfig.js'

/** Badge « Envois suspendus (entreprise désactivée) ». */
export function BadgeEnvoisSuspendus() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-50 border-orange-200 text-orange-700 whitespace-nowrap"
      data-testid="badge-envois-suspendus"
      title="La borne est affectée à une entreprise I-CRM désactivée : rien n'est envoyé (ni à l'entreprise, ni aux canaux) jusqu'à sa réactivation."
    >
      ⏸ {LIBELLE_ENVOIS_SUSPENDUS}
    </span>
  )
}

/**
 * Destination I-CRM des enregistrements d'une borne (même règle que le worker) :
 * l'entreprise I-CRM affectée (envois suspendus si elle est désactivée), sinon
 * le canal de la borne.
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
        {destination.suspendu && <BadgeEnvoisSuspendus />}
      </span>
    )
  }
  return <span className="text-gray-500">{destination.libelle}</span>
}
