import { optionsEntreprisesIcrm } from './entrepriseIcrmConfig.js'

/**
 * EntrepriseIcrmSelect — choix de l'entreprise (tenant) I-CRM destinataire d'une borne.
 *
 * Props:
 * - value: string — id de l'entreprise choisie ('' = aucune, la borne utilise ses canaux)
 * - onChange: function(id: string)
 * - entreprises: array — entreprises renvoyées par GET /api/entreprises-icrm
 * - entrepriseActuelle?: object — entreprise actuelle de la borne (affichée même inactive)
 * - disabled?: boolean — lecture seule (AdminBorne : l'affectation est réservée au SuperAdmin)
 * - className / style : classes du champ, comme les autres sélecteurs du formulaire
 */
export default function EntrepriseIcrmSelect({
  value = '',
  onChange,
  entreprises = [],
  entrepriseActuelle = null,
  disabled = false,
  className = '',
  style,
}) {
  const options = optionsEntreprisesIcrm(entreprises, entrepriseActuelle)
  const inactive = Boolean(value) && entrepriseActuelle?.id === value && entrepriseActuelle.actif === false

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
        disabled={disabled}
        aria-describedby="borne-entreprise-icrm-aide"
      >
        <option value="">Aucune (utiliser les canaux)</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p id="borne-entreprise-icrm-aide" className="text-xs text-gray-500 mt-1">
        {disabled
          ? "Choisie par le Super Administrateur."
          : "Les enregistrements de la borne sont envoyés à cette entreprise (prioritaire sur les canaux). Les entreprises se gèrent dans « Entreprises I-CRM »."}
      </p>
      {inactive && (
        <p className="text-xs text-orange-600 mt-1" role="status">
          Cette entreprise est inactive : la borne utilise ses canaux tant qu'elle n'est pas réactivée ou remplacée.
        </p>
      )}
    </div>
  )
}
