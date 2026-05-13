export const BORNE_ID = '8b581903-700d-493d-b50b-4b4583c1c011'

const V2_QUESTIONS = [
  // Page 1 — champs obligatoires texte
  { id: 'q-nom',    formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Nom', es: 'Nombre', en: 'Last Name' },       typeOption: 'texte_court', obligatoire: true,  orderPage: 1,  ordreDansPage: 0, options: null, crmFieldIds: [2087] },
  { id: 'q-prenom', formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Prénom', es: 'Nombre', en: 'First Name' },    typeOption: 'texte_court', obligatoire: true,  orderPage: 1,  ordreDansPage: 1, options: null, crmFieldIds: [2088] },
  { id: 'q-cp',     formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Code postal', es: 'CP', en: 'Postcode' },     typeOption: 'texte_court', obligatoire: true,  orderPage: 1,  ordreDansPage: 2, options: null, crmFieldIds: [2089] },
  { id: 'q-ville',  formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Ville', es: 'Ciudad', en: 'City' },           typeOption: 'texte_court', obligatoire: true,  orderPage: 1,  ordreDansPage: 3, options: null, crmFieldIds: [2090] },
  // Page 2 — radio obligatoire
  { id: 'q-revenu', formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Revenu fiscal', es: 'Renta', en: 'Income' },  typeOption: 'option_unique', obligatoire: true, orderPage: 2, ordreDansPage: 0,
    options: [{ id: 'moins', label: { fr: 'Moins de 23 734€', es: 'Menos de 23 734€', en: 'Less than 23,734€' } }, { id: 'plus', label: { fr: 'Plus de 23 734€', es: 'Más de 23 734€', en: 'More than 23,734€' } }], crmFieldIds: [2294] },
  // Page 3 — radio obligatoire
  { id: 'q-statut', formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Statut propriétaire', es: 'Estado', en: 'Status' }, typeOption: 'option_unique', obligatoire: true, orderPage: 3, ordreDansPage: 0,
    options: [{ id: 'prop', label: { fr: 'Propriétaire', es: 'Propietario', en: 'Owner' } }, { id: 'loc', label: { fr: 'Locataire', es: 'Inquilino', en: 'Tenant' } }], crmFieldIds: [2293] },
  // Pages 4-14 — radios optionnels
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `q-p${i + 4}`, formulaireId: 'form-e2e-uuid',
    libelleQuestion: { fr: `Question ${i + 4}`, es: `Pregunta ${i + 4}`, en: `Question ${i + 4}` },
    typeOption: 'option_unique', obligatoire: false, orderPage: i + 4, ordreDansPage: 0,
    options: [{ id: 'o1', label: { fr: 'Option 1', es: 'Opción 1', en: 'Option 1' } }, { id: 'o2', label: { fr: 'Option 2', es: 'Opción 2', en: 'Option 2' } }],
    crmFieldIds: [],
  })),
  // Page 15 — texte optionnel (dernière page → bouton Terminer)
  { id: 'q-comm', formulaireId: 'form-e2e-uuid', libelleQuestion: { fr: 'Commentaires', es: 'Comentarios', en: 'Comments' }, typeOption: 'texte_long', obligatoire: false, orderPage: 15, ordreDansPage: 0, options: null, crmFieldIds: [2305] },
]

export const MOCK_BORNE_CONFIG = {
  data: {
    borne: { id: BORNE_ID, idBorne: 'BORNE-E2E', langueDefaut: 'fr', adresse: '1 rue Test E2E' },
    formulaire: { id: 'form-e2e-uuid', label: 'Formulaire E2E', version: '1.0.0', dureeRetourAccueil: 30, questions: V2_QUESTIONS, pageDebutConfig: {}, pageFinConfig: {} },
  },
}

export const MOCK_CONFIG = {
  version: '1.0.0',
  updatedAt: '2026-04-26T00:00:00.000Z',
  formDefinition: {
    tab: { id: 22, name: 'ESTIMER VOS AIDES', couleur: '#5C2DD3', platform: 'WEBMOBILE', display_style: 'linear' },
    categories: [
      {
        id: 37,
        name: 'Informations Personnelles',
        order: 1,
        subcategories: [
          {
            id: 63,
            name: 'Information Personnelle 1/3',
            order: 0,
            fields: [
              { id: 2262, ordre: 0, name: 'Civilité', key: 'projets_Civilit', fieldtype_id: 1, required: false, uppercase: true },
              { id: 2087, ordre: 1, name: 'Nom', key: 'projets_Nombre', fieldtype_id: 1, required: true, uppercase: true },
              { id: 2088, ordre: 2, name: 'Prénom', key: 'projets_Apellidos', fieldtype_id: 1, required: true, uppercase: true },
              { id: 2217, ordre: 3, name: 'Adresse', key: 'projets_ADRESSE', fieldtype_id: 1, required: false, uppercase: true },
              { id: 2089, ordre: 4, name: 'Code postal', key: 'projets_Cdigo_postal', fieldtype_id: 1, required: true, uppercase: true },
              { id: 2090, ordre: 5, name: 'Ville', key: 'projets_Ciudad', fieldtype_id: 1, required: true, uppercase: true },
              { id: 2015, ordre: 6, name: 'Num. de Téléphone', key: 'projets_Tel', fieldtype_id: 6, required: false, uppercase: false },
              { id: 2016, ordre: 7, name: 'Adresse Email', key: 'projets_Email', fieldtype_id: 1, required: false, uppercase: false },
            ],
          },
          {
            id: 65,
            name: 'Information Personnelle 2/3',
            order: 1,
            fields: [
              {
                id: 2294, ordre: 0, name: "À combien s'élève le revenu total de votre foyer fiscal",
                key: 'projets_revenu', fieldtype_id: 50, required: true, uppercase: false,
                options: [
                  { id: '1- Inférieur à 23734€', name: '1- Inférieur à 23734€' },
                  { id: '2- Entre 23734€ et 30427€', name: '2- Entre 23734€ et 30427€' },
                  { id: '3- Entre 30428€ et 42848€', name: '3- Entre 30428€ et 42848€' },
                  { id: '4- Supérieur à 42849€', name: '4- Supérieur à 42849€' },
                ],
              },
            ],
          },
          {
            id: 75,
            name: 'Information Personnelle 3/3',
            order: 2,
            fields: [
              {
                id: 2293, ordre: 0, name: 'Dans ce logement vous êtes',
                key: 'projets_statut', fieldtype_id: 50, required: true, uppercase: false,
                options: [
                  { id: 'Propriétaire Bailleur', name: 'Propriétaire Bailleur' },
                  { id: "Propriétaire d'une résidence secondaire", name: "Propriétaire d'une résidence secondaire" },
                  { id: 'Propriétaire occupant', name: 'Propriétaire occupant' },
                  { id: 'Résident', name: 'Résident' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 36,
        name: 'Le Lieu des Travaux',
        order: 2,
        subcategories: [
          {
            id: 59, name: '1- Le lieu des travaux 1/7', order: 0,
            fields: [{
              id: 2292, ordre: 0, name: 'Votre projet concerne',
              key: 'projets_type_logement', fieldtype_id: 50, required: false, uppercase: false,
              options: [{ id: 'Appartement', name: 'Appartement' }, { id: 'Maison', name: 'Maison' }],
            }],
          },
          {
            id: 60, name: '1- Le lieu des travaux 2/7', order: 1,
            fields: [{
              id: 2306, ordre: 0, name: 'Date de construction de votre logement',
              key: 'projets_date_construction', fieldtype_id: 5, required: false, uppercase: false,
              options: [{ id: '1- Entre 2 ans et 15 ans', name: '1- Entre 2 ans et 15 ans' }, { id: '2- Plus de 15 ans', name: '2- Plus de 15 ans' }],
            }],
          },
          {
            id: 61, name: '1- Le lieu des travaux 3/7', order: 2,
            fields: [{
              id: 2307, ordre: 0, name: 'Quelle est la surface habitable de votre logement',
              key: 'projets_surface', fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- 0 à 70 m2', name: '1- 0 à 70 m2' },
                { id: '2- 71 à 120 m2', name: '2- 71 à 120 m2' },
                { id: '3- 121 à 200 m2', name: '3- 121 à 200 m2' },
                { id: '4- + de 200 m2', name: '4- + de 200 m2' },
              ],
            }],
          },
          {
            id: 62, name: '1- Le lieu des travaux 4/7', order: 3,
            fields: [{
              id: 2296, ordre: 0, name: 'Quel type de combles avez-vous',
              key: 'projets_type_combles', fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Combles aménagés / habitables (vous pouvez y vivre)', name: 'Combles aménagés / habitables (vous pouvez y vivre)' },
                { id: 'Combles perdus / non habitables (espace vide ou stockage)', name: 'Combles perdus / non habitables (espace vide ou stockage)' },
              ],
            }],
          },
          {
            id: 66, name: '1- Le lieu des travaux 5/7', order: 4,
            fields: [{
              id: 2298, ordre: 0, name: 'Si vos combles sont non habitables : Type de plancher',
              key: 'projets_plancher', fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Bois', name: 'Bois' }, { id: 'Béton', name: 'Béton' },
                { id: 'Je ne sais pas (besoin de conseil)', name: 'Je ne sais pas (besoin de conseil)' },
                { id: 'Plafond en placo / faux plafond', name: 'Plafond en placo / faux plafond' },
                { id: 'Structure métallique', name: 'Structure métallique' },
              ],
            }],
          },
          {
            id: 71, name: '1- Le lieu des travaux 6/7', order: 5,
            fields: [{
              id: 2300, ordre: 0, name: "Accès aux combles, il existe une trappe d'accès ?",
              key: 'projets_trappe', fieldtype_id: 5, required: false, uppercase: false,
              options: [{ id: 'NON', name: 'NON' }, { id: 'OUI', name: 'OUI' }],
            }],
          },
          {
            id: 72, name: '1- Le lieu des travaux 7/7', order: 6,
            fields: [
              {
                id: 2301, ordre: 0, name: 'Type de chauffage principal',
                key: 'projets_chauffage', fieldtype_id: 5, required: false, uppercase: false,
                options: [
                  { id: 'Bois', name: 'Bois' }, { id: 'Fioul', name: 'Fioul' },
                  { id: 'Gaz', name: 'Gaz' }, { id: 'Pompe à chaleur', name: 'Pompe à chaleur' },
                  { id: 'Électrique', name: 'Électrique' },
                ],
              },
              { id: 2302, ordre: 1, name: 'Autre Type de chauffage principal', key: 'projets_chauffage_autre', fieldtype_id: 1, required: false, uppercase: true },
            ],
          },
        ],
      },
      {
        id: 38,
        name: 'Vos Besoins',
        order: 3,
        subcategories: [
          {
            id: 64, name: 'Vos Besoin 1/5', order: 0,
            fields: [{
              id: 2297, ordre: 0, name: 'Si vos combles sont habitables : Que souhaitez-vous isoler ?',
              key: 'projets_isolation', fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- Rampants de toiture (sous le toit)', name: '1- Rampants de toiture (sous le toit)' },
                { id: '2- Plafond intérieur', name: '2- Plafond intérieur' },
                { id: '3- Murs latéraux', name: '3- Murs latéraux' },
                { id: '4- Je ne sais pas (besoin de conseil)', name: '4- Je ne sais pas (besoin de conseil)' },
              ],
            }],
          },
          {
            id: 68, name: 'Vos Besoin 2/5', order: 1,
            fields: [{
              id: 2298, ordre: 0, name: 'Si vos combles sont non habitables : Type de plancher',
              key: 'projets_plancher2', fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Bois', name: 'Bois' }, { id: 'Béton', name: 'Béton' },
                { id: 'Je ne sais pas (besoin de conseil)', name: 'Je ne sais pas (besoin de conseil)' },
                { id: 'Plafond en placo / faux plafond', name: 'Plafond en placo / faux plafond' },
                { id: 'Structure métallique', name: 'Structure métallique' },
              ],
            }],
          },
          {
            id: 70, name: 'Vos Besoins 3/5', order: 2,
            fields: [{
              id: 2299, ordre: 0, name: "Type d'isolation souhaité",
              key: 'projets_type_isolation', fieldtype_id: 4, required: false, uppercase: false,
              options: [
                { id: 'Isolation en rouleaux', name: 'Isolation en rouleaux' },
                { id: 'Isolation soufflée', name: 'Isolation soufflée' },
              ],
            }],
          },
          {
            id: 73, name: 'Vos Besoins 4/5', order: 3,
            fields: [{
              id: 2303, ordre: 0, name: 'Quels travaux souhaitez-vous réaliser dans votre logement ?',
              key: 'projets_travaux', fieldtype_id: 4, required: false, uppercase: false,
              options: [
                { id: '1- Isolation thermique', name: '1- Isolation thermique' },
                { id: '2- Chauffage et ECS', name: '2- Chauffage et ECS' },
                { id: '3- Ventilation', name: '3- Ventilation' },
                { id: '4- Energie Solaire', name: '4- Energie Solaire' },
                { id: '5- Rénovation Globale', name: '5- Rénovation Globale' },
              ],
            }],
          },
          {
            id: 74, name: 'Vos Besoins 5/5', order: 4,
            fields: [
              {
                id: 2304, ordre: 0, name: 'Disponibilité pour être contacté',
                key: 'projets_disponibilite', fieldtype_id: 5, required: false, uppercase: false,
                options: [
                  { id: '1- Matin', name: '1- Matin' }, { id: '2- Après-midi', name: '2- Après-midi' },
                  { id: '3- Soir', name: '3- Soir' }, { id: '4- A tout moment', name: '4- A tout moment' },
                ],
              },
              { id: 2305, ordre: 1, name: 'Commentaires ou informations complémentaires', key: 'projets_commentaires', fieldtype_id: 2, required: false, uppercase: false },
            ],
          },
        ],
      },
    ],
  },
}

export const MOCK_SUBMISSION_RESPONSE = {
  id: 'test-uuid-e2e',
  createdAt: new Date().toISOString(),
  synced: false,
  configVersion: '1.0.0',
}

export const MOCK_SUBMISSIONS_LIST = {
  data: [
    {
      id: 'test-sub-1',
      configVersion: '1.0.0',
      createdAt: '2026-04-26T10:00:00.000Z',
      synced: false,
      syncedAt: null,
      crmProjectId: null,
      values: [
        { fieldId: 2087, value: 'DUPONT' },
        { fieldId: 2088, value: 'JEAN' },
        { fieldId: 2089, value: '75001' },
        { fieldId: 2090, value: 'PARIS' },
        { fieldId: 2016, value: 'jean.dupont@test.com' },
      ],
    },
  ],
  total: 1,
  page: 1,
  limit: 100,
}
