import { optionsEntreprisesIcrm, libelleSuspension } from './entrepriseIcrmConfig.js'

/**
 * EntrepriseIcrmSelect — choix de l'entreprise (tenant) I-CRM destinataire d'une borne.
 *
 * Props:
 * - value: string — id de l'entreprise choisie ('' = aucune, la borne utilise ses canaux)
 * - onChange: function(id: string)
 * - entreprises: array — entreprises renvoyées par GET /api/entreprises-icrm
 * - etat: 'chargement' | 'erreur' | 'pret' — état du chargement de cette liste :
 *   tant qu'elle n'est pas disponible, le choix est verrouillé sur la valeur
 *   actuelle (jamais « désactivée » à tort, jamais de changement accidentel)
 * - entrepriseActuelle?: object — entreprise actuelle de la borne (affichée même absente de la liste)
 * - disabled?: boolean — lecture seule (AdminBorne : l'affectation est réservée au SuperAdmin)
 * - className / style : classes du champ, comme les autres sélecteurs du formulaire
 */
export default function EntrepriseIcrmSelect({
  value = '',
  onChange,
  entreprises = [],
  etat = 'pret',
  entrepriseActuelle = null,
  disabled = false,
  className = '',
  style,
}) {
  const options = optionsEntreprisesIcrm(entreprises, entrepriseActuelle)
  const actuelleSelectionnee = Boolean(value) && entrepriseActuelle?.id === value
  const suspension = actuelleSelectionnee ? libelleSuspension(entrepriseActuelle) : null
  const indisponible = etat !== 'pret'

  return (
    <div>
      <label htmlFor="borne-entreprise-icrm" className="block text-sm font-semibold text-gray-700 mb-1">
        Entreprise I-CRM destinataire
      </label>
      <select
        id="borne-entreprise-icrm"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={className}
        style={style}
        disabled={disabled || indisponible}
        aria-describedby="borne-entreprise-icrm-aide"
        aria-busy={etat === 'chargement'}
      >
        <option value="">
          {etat === 'chargement' && !value ? 'Chargement des entreprises I-CRM…' : 'Aucune (utiliser les canaux)'}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p id="borne-entreprise-icrm-aide" className="text-xs text-gray-500 mt-1">
        {disabled
          ? "Choisie par le Super Administrateur."
          : "Les nouveaux enregistrements de la borne sont envoyés à cette entreprise, et à elle seule (ses canaux ne sont plus utilisés). Les entreprises se gèrent dans « Entreprises I-CRM »."}
      </p>
      {etat === 'chargement' && (
        <p className="text-xs text-gray-400 mt-1" role="status">Chargement des entreprises I-CRM…</p>
      )}
      {etat === 'erreur' && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          Impossible de charger les entreprises I-CRM : la destination actuelle est conservée (rechargez la page pour la modifier).
        </p>
      )}
      {suspension && (
        <p className="text-xs text-orange-600 mt-1" role="status">
          {entrepriseActuelle.actif === false
            ? "Cette entreprise est désactivée : les envois de la borne sont suspendus (aucun envoi vers ses canaux) jusqu'à sa réactivation."
            : "Cette entreprise doit être testée (URL ou clé modifiée) : les envois de la borne sont suspendus jusqu'à un test réussi."}
        </p>
      )}
    </div>
  )
}
