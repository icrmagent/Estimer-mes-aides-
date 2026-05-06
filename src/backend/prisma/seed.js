import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── V1 Configuration (preserved) ────────────────────────────────────────────
// Source : docs/CONTEXT.md — Tab ID 22, Projet référence 933
const formDefinition = {
  tab: {
    id: 22,
    name: 'ESTIMER VOS AIDES',
    couleur: '#5C2DD3',
    platform: 'WEBMOBILE',
    display_style: 'linear',
  },
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
            { id: 2015, ordre: 6, name: 'Num. de Téléphone', key: 'projets_Telfono_Propietario_inicia', fieldtype_id: 6, required: false, uppercase: false },
            { id: 2016, ordre: 7, name: 'Adresse Email', key: 'projets_Correo_electrnico_Propietario_inicia', fieldtype_id: 1, required: false, uppercase: false },
          ],
        },
        {
          id: 65,
          name: 'Information Personnelle 2/3',
          order: 1,
          fields: [
            {
              id: 2294, ordre: 0, name: "À combien s'élève le revenu total de votre foyer fiscal",
              key: 'projets__combien_slve_le_revenu_total_de_votre_foyer_fiscal',
              fieldtype_id: 50, required: true, uppercase: false,
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
              key: 'projets_Dans_ce_logement_vous_tes',
              fieldtype_id: 50, required: true, uppercase: false,
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
          id: 59,
          name: '1- Le lieu des travaux 1/7',
          order: 0,
          fields: [
            {
              id: 2292, ordre: 0, name: 'Votre projet concerne',
              key: 'projets_Votre_projet_concerne',
              fieldtype_id: 50, required: false, uppercase: false,
              options: [
                { id: 'Appartement', name: 'Appartement' },
                { id: 'Maison', name: 'Maison' },
              ],
            },
          ],
        },
        {
          id: 60,
          name: '1- Le lieu des travaux 2/7',
          order: 1,
          fields: [
            {
              id: 2306, ordre: 0, name: 'Date de construction de votre logement',
              key: 'projets_Date_de_construction_de_votre_logement',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- Entre 2 ans et 15 ans', name: '1- Entre 2 ans et 15 ans' },
                { id: '2- Plus de 15 ans', name: '2- Plus de 15 ans' },
              ],
            },
          ],
        },
        {
          id: 61,
          name: '1- Le lieu des travaux 3/7',
          order: 2,
          fields: [
            {
              id: 2307, ordre: 0, name: 'Quelle est la surface habitable de votre logement',
              key: 'projets_Quelle_est_la_surface_habitable_de_votre_logement',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- 0 à 70 m2', name: '1- 0 à 70 m2' },
                { id: '2- 71 à 120 m2', name: '2- 71 à 120 m2' },
                { id: '3- 121 à 200 m2', name: '3- 121 à 200 m2' },
                { id: '4- + de 200 m2', name: '4- + de 200 m2' },
              ],
            },
          ],
        },
        {
          id: 62,
          name: '1- Le lieu des travaux 4/7',
          order: 3,
          fields: [
            {
              id: 2296, ordre: 0, name: 'Quel type de combles avez-vous',
              key: 'projets_Quel_type_de_combles_avez-vous',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Combles aménagés / habitables (vous pouvez y vivre)', name: 'Combles aménagés / habitables (vous pouvez y vivre)' },
                { id: 'Combles perdus / non habitables (espace vide ou stockage)', name: 'Combles perdus / non habitables (espace vide ou stockage)' },
              ],
            },
          ],
        },
        {
          id: 66,
          name: '1- Le lieu des travaux 5/7',
          order: 4,
          fields: [
            {
              id: 2298, ordre: 0, name: 'Si vos combles sont non habitables : Type de plancher',
              key: 'projets_Si_vos_combles_sont_non_habitables__Type_de_plancher',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Bois', name: 'Bois' },
                { id: 'Béton', name: 'Béton' },
                { id: 'Je ne sais pas (besoin de conseil)', name: 'Je ne sais pas (besoin de conseil)' },
                { id: 'Plafond en placo / faux plafond', name: 'Plafond en placo / faux plafond' },
                { id: 'Structure métallique', name: 'Structure métallique' },
              ],
            },
          ],
        },
        {
          id: 71,
          name: '1- Le lieu des travaux 6/7',
          order: 5,
          fields: [
            {
              id: 2300, ordre: 0, name: "Accès aux combles, il existe une trappe d'accès ?",
              key: 'projets_Accs_aux_combles_il_existe_une_trappe_daccs_',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'NON', name: 'NON' },
                { id: 'OUI', name: 'OUI' },
              ],
            },
          ],
        },
        {
          id: 72,
          name: '1- Le lieu des travaux 7/7',
          order: 6,
          fields: [
            {
              id: 2301, ordre: 0, name: 'Type de chauffage principal',
              key: 'projets_Type_de_chauffage_principal',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Bois', name: 'Bois' },
                { id: 'Fioul', name: 'Fioul' },
                { id: 'Gaz', name: 'Gaz' },
                { id: 'Pompe à chaleur', name: 'Pompe à chaleur' },
                { id: 'Électrique', name: 'Électrique' },
              ],
            },
            { id: 2302, ordre: 1, name: 'Autre Type de chauffage principal', key: 'projets_Autre_Type_de_chauffage_principal', fieldtype_id: 1, required: false, uppercase: true },
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
          id: 64,
          name: 'Vos Besoin 1/5',
          order: 0,
          fields: [
            {
              id: 2297, ordre: 0, name: 'Si vos combles sont habitables : Que souhaitez-vous isoler ?',
              key: 'projets_Si_vos_combles_sont_habitables__Que_souhaitez-vous_isoler_',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- Rampants de toiture (sous le toit)', name: '1- Rampants de toiture (sous le toit)' },
                { id: '2- Plafond intérieur', name: '2- Plafond intérieur' },
                { id: '3- Murs latéraux', name: '3- Murs latéraux' },
                { id: '4- Je ne sais pas (besoin de conseil)', name: '4- Je ne sais pas (besoin de conseil)' },
              ],
            },
          ],
        },
        {
          id: 68,
          name: 'Vos Besoin 2/5',
          order: 1,
          fields: [
            {
              id: 2298, ordre: 0, name: 'Si vos combles sont non habitables : Type de plancher',
              key: 'projets_Si_vos_combles_sont_non_habitables__Type_de_plancher',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: 'Bois', name: 'Bois' },
                { id: 'Béton', name: 'Béton' },
                { id: 'Je ne sais pas (besoin de conseil)', name: 'Je ne sais pas (besoin de conseil)' },
                { id: 'Plafond en placo / faux plafond', name: 'Plafond en placo / faux plafond' },
                { id: 'Structure métallique', name: 'Structure métallique' },
              ],
            },
          ],
        },
        {
          id: 70,
          name: 'Vos Besoins 3/5',
          order: 2,
          fields: [
            {
              id: 2299, ordre: 0, name: "Type d'isolation souhaité",
              key: 'projets_Type_disolation_souhait',
              fieldtype_id: 4, required: false, uppercase: false,
              options: [
                { id: 'Isolation en rouleaux', name: 'Isolation en rouleaux' },
                { id: 'Isolation soufflée', name: 'Isolation soufflée' },
              ],
            },
          ],
        },
        {
          id: 73,
          name: 'Vos Besoins 4/5',
          order: 3,
          fields: [
            {
              id: 2303, ordre: 0, name: 'Quels travaux souhaitez-vous réaliser dans votre logement ?',
              key: 'projets_Quels_travaux_souhaitez-vous_raliser_dans_votre_logement_',
              fieldtype_id: 4, required: false, uppercase: false,
              options: [
                { id: '1- Isolation thermique', name: '1- Isolation thermique' },
                { id: '2- Chauffage et ECS', name: '2- Chauffage et ECS' },
                { id: '3- Ventilation', name: '3- Ventilation' },
                { id: '4- Energie Solaire', name: '4- Energie Solaire' },
                { id: '5- Rénovation Globale', name: '5- Rénovation Globale' },
              ],
            },
          ],
        },
        {
          id: 74,
          name: 'Vos Besoins 5/5',
          order: 4,
          fields: [
            {
              id: 2304, ordre: 0, name: 'Disponibilité pour être contacté',
              key: 'projets_Disponibilit_pour_tre_contact',
              fieldtype_id: 5, required: false, uppercase: false,
              options: [
                { id: '1- Matin', name: '1- Matin' },
                { id: '2- Après-midi', name: '2- Après-midi' },
                { id: '3- Soir', name: '3- Soir' },
                { id: '4- A tout moment', name: '4- A tout moment' },
              ],
            },
            { id: 2305, ordre: 1, name: 'Commentaires ou informations complémentaires', key: 'projets_Commentaires_ou_informations_complmentaires', fieldtype_id: 2, required: false, uppercase: false },
          ],
        },
      ],
    },
  ],
}

// ─── V2 pageDebutConfig (Design §2.1) ────────────────────────────────────────
const pageDebutConfig = {
  fr: {
    titre: 'Estimez vos aides à la rénovation',
    sousTitre: 'Répondez à quelques questions pour découvrir vos aides',
    labelBouton: 'Commencer',
  },
  es: {
    titre: 'Estime sus ayudas para la renovación',
    sousTitre: 'Responda algunas preguntas para descubrir sus ayudas',
    labelBouton: 'Comenzar',
  },
  en: {
    titre: 'Estimate your renovation grants',
    sousTitre: 'Answer a few questions to discover your grants',
    labelBouton: 'Start',
  },
}

// ─── V2 pageFinConfig (Design §2.2) ──────────────────────────────────────────
const pageFinConfig = {
  fr: {
    titre: 'Merci pour votre demande !',
    message: 'Un conseiller vous contactera dans les 48 heures.',
    dureeAffichage: 10,
  },
  es: {
    titre: '¡Gracias por su solicitud!',
    message: 'Un asesor le contactará en 48 horas.',
    dureeAffichage: 10,
  },
  en: {
    titre: 'Thank you for your request!',
    message: 'An advisor will contact you within 48 hours.',
    dureeAffichage: 10,
  },
}

// ─── V2 Questions (15 étapes, trilingues) ─────────────────────────────────────
// Chaque question correspond à une sous-catégorie CRM (source : docs/CONTEXT.md)
const questionsV2 = [
  // Étape 1 — Sous-cat 63 — Informations personnelles (multi-champs texte)
  {
    orderPage: 1,
    obligatoire: true,
    typeOption: 'texte_court',
    libelleQuestion: {
      fr: 'Informations personnelles',
      es: 'Información personal',
      en: 'Personal information',
    },
    paragrapheInfo: {
      fr: 'Veuillez renseigner vos coordonnées (Civilité, Nom, Prénom, Adresse, Code postal, Ville, Téléphone, Email).',
      es: 'Por favor, introduzca sus datos de contacto (Tratamiento, Apellido, Nombre, Dirección, Código postal, Ciudad, Teléfono, Email).',
      en: 'Please enter your contact details (Title, Last name, First name, Address, Postal code, City, Phone, Email).',
    },
    options: null,
    crmFieldIds: [2262, 2087, 2088, 2217, 2089, 2090, 2015, 2016],
  },
  // Étape 2 — Sous-cat 65 — Revenu fiscal (field 2294)
  {
    orderPage: 2,
    obligatoire: true,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: "À combien s'élève le revenu total de votre foyer fiscal ?",
      es: '¿A cuánto ascienden los ingresos totales de su hogar fiscal?',
      en: 'What is the total income of your tax household?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'revenu-1',
        crmValue: '1- Inférieur à 23734€',
        label: { fr: '1- Inférieur à 23 734 €', es: '1- Inferior a 23 734 €', en: '1- Less than €23,734' },
      },
      {
        id: 'revenu-2',
        crmValue: '2- Entre 23734€ et 30427€',
        label: { fr: '2- Entre 23 734 € et 30 427 €', es: '2- Entre 23 734 € y 30 427 €', en: '2- Between €23,734 and €30,427' },
      },
      {
        id: 'revenu-3',
        crmValue: '3- Entre 30428€ et 42848€',
        label: { fr: '3- Entre 30 428 € et 42 848 €', es: '3- Entre 30 428 € y 42 848 €', en: '3- Between €30,428 and €42,848' },
      },
      {
        id: 'revenu-4',
        crmValue: '4- Supérieur à 42849€',
        label: { fr: '4- Supérieur à 42 849 €', es: '4- Superior a 42 849 €', en: '4- More than €42,849' },
      },
    ],
    crmFieldIds: [2294],
  },
  // Étape 3 — Sous-cat 75 — Statut propriétaire (field 2293)
  {
    orderPage: 3,
    obligatoire: true,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Dans ce logement vous êtes',
      es: 'En esta vivienda usted es',
      en: 'In this home you are',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'statut-1',
        crmValue: 'Propriétaire Bailleur',
        label: { fr: 'Propriétaire Bailleur', es: 'Propietario Arrendador', en: 'Landlord Owner' },
      },
      {
        id: 'statut-2',
        crmValue: "Propriétaire d'une résidence secondaire",
        label: { fr: "Propriétaire d'une résidence secondaire", es: 'Propietario de una residencia secundaria', en: 'Owner of a secondary residence' },
      },
      {
        id: 'statut-3',
        crmValue: 'Propriétaire occupant',
        label: { fr: 'Propriétaire occupant', es: 'Propietario ocupante', en: 'Owner-occupier' },
      },
      {
        id: 'statut-4',
        crmValue: 'Résident',
        label: { fr: 'Résident', es: 'Residente', en: 'Resident' },
      },
    ],
    crmFieldIds: [2293],
  },
  // Étape 4 — Sous-cat 59 — Type de logement (field 2292)
  {
    orderPage: 4,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Votre projet concerne',
      es: 'Su proyecto se refiere a',
      en: 'Your project concerns',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'logement-1',
        crmValue: 'Appartement',
        label: { fr: 'Appartement', es: 'Apartamento', en: 'Apartment' },
      },
      {
        id: 'logement-2',
        crmValue: 'Maison',
        label: { fr: 'Maison', es: 'Casa', en: 'House' },
      },
    ],
    crmFieldIds: [2292],
  },
  // Étape 5 — Sous-cat 60 — Date de construction (field 2306)
  {
    orderPage: 5,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Date de construction de votre logement',
      es: 'Fecha de construcción de su vivienda',
      en: 'Construction date of your home',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'construction-1',
        crmValue: '1- Entre 2 ans et 15 ans',
        label: { fr: '1- Entre 2 ans et 15 ans', es: '1- Entre 2 y 15 años', en: '1- Between 2 and 15 years' },
      },
      {
        id: 'construction-2',
        crmValue: '2- Plus de 15 ans',
        label: { fr: '2- Plus de 15 ans', es: '2- Más de 15 años', en: '2- More than 15 years' },
      },
    ],
    crmFieldIds: [2306],
  },
  // Étape 6 — Sous-cat 61 — Surface habitable (field 2307)
  {
    orderPage: 6,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Quelle est la surface habitable de votre logement ?',
      es: '¿Cuál es la superficie habitable de su vivienda?',
      en: 'What is the living area of your home?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'surface-1',
        crmValue: '1- 0 à 70 m2',
        label: { fr: '1- 0 à 70 m²', es: '1- 0 a 70 m²', en: '1- 0 to 70 m²' },
      },
      {
        id: 'surface-2',
        crmValue: '2- 71 à 120 m2',
        label: { fr: '2- 71 à 120 m²', es: '2- 71 a 120 m²', en: '2- 71 to 120 m²' },
      },
      {
        id: 'surface-3',
        crmValue: '3- 121 à 200 m2',
        label: { fr: '3- 121 à 200 m²', es: '3- 121 a 200 m²', en: '3- 121 to 200 m²' },
      },
      {
        id: 'surface-4',
        crmValue: '4- + de 200 m2',
        label: { fr: '4- + de 200 m²', es: '4- + de 200 m²', en: '4- More than 200 m²' },
      },
    ],
    crmFieldIds: [2307],
  },
  // Étape 7 — Sous-cat 62 — Type de combles (field 2296)
  {
    orderPage: 7,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Quel type de combles avez-vous ?',
      es: '¿Qué tipo de buhardilla tiene?',
      en: 'What type of attic do you have?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'combles-1',
        crmValue: 'Combles aménagés / habitables (vous pouvez y vivre)',
        label: {
          fr: 'Combles aménagés / habitables (vous pouvez y vivre)',
          es: 'Buhardilla acondicionada / habitable (puede vivir en ella)',
          en: 'Converted / habitable attic (you can live in it)',
        },
      },
      {
        id: 'combles-2',
        crmValue: 'Combles perdus / non habitables (espace vide ou stockage)',
        label: {
          fr: 'Combles perdus / non habitables (espace vide ou stockage)',
          es: 'Buhardilla no habitable (espacio vacío o almacenamiento)',
          en: 'Non-habitable attic (empty space or storage)',
        },
      },
    ],
    crmFieldIds: [2296],
  },
  // Étape 8 — Sous-cat 66 — Type de plancher (field 2298)
  {
    orderPage: 8,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Si vos combles sont non habitables : Type de plancher',
      es: 'Si su buhardilla no es habitable: Tipo de suelo',
      en: 'If your attic is non-habitable: Floor type',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'plancher-1',
        crmValue: 'Bois',
        label: { fr: 'Bois', es: 'Madera', en: 'Wood' },
      },
      {
        id: 'plancher-2',
        crmValue: 'Béton',
        label: { fr: 'Béton', es: 'Hormigón', en: 'Concrete' },
      },
      {
        id: 'plancher-3',
        crmValue: 'Je ne sais pas (besoin de conseil)',
        label: { fr: 'Je ne sais pas (besoin de conseil)', es: 'No lo sé (necesito consejo)', en: "I don't know (need advice)" },
      },
      {
        id: 'plancher-4',
        crmValue: 'Plafond en placo / faux plafond',
        label: { fr: 'Plafond en placo / faux plafond', es: 'Techo de pladur / falso techo', en: 'Plasterboard ceiling / false ceiling' },
      },
      {
        id: 'plancher-5',
        crmValue: 'Structure métallique',
        label: { fr: 'Structure métallique', es: 'Estructura metálica', en: 'Metal structure' },
      },
    ],
    crmFieldIds: [2298],
  },
  // Étape 9 — Sous-cat 71 — Trappe d'accès (field 2300)
  {
    orderPage: 9,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: "Accès aux combles : il existe une trappe d'accès ?",
      es: '¿Acceso a la buhardilla: existe una trampilla de acceso?',
      en: 'Attic access: is there an access hatch?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'trappe-1',
        crmValue: 'NON',
        label: { fr: 'Non', es: 'No', en: 'No' },
      },
      {
        id: 'trappe-2',
        crmValue: 'OUI',
        label: { fr: 'Oui', es: 'Sí', en: 'Yes' },
      },
    ],
    crmFieldIds: [2300],
  },
  // Étape 10 — Sous-cat 72 — Type de chauffage (fields 2301, 2302)
  {
    orderPage: 10,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Type de chauffage principal',
      es: 'Tipo de calefacción principal',
      en: 'Main heating type',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'chauffage-1',
        crmValue: 'Bois',
        label: { fr: 'Bois', es: 'Leña', en: 'Wood' },
      },
      {
        id: 'chauffage-2',
        crmValue: 'Fioul',
        label: { fr: 'Fioul', es: 'Gasóleo', en: 'Oil' },
      },
      {
        id: 'chauffage-3',
        crmValue: 'Gaz',
        label: { fr: 'Gaz', es: 'Gas', en: 'Gas' },
      },
      {
        id: 'chauffage-4',
        crmValue: 'Pompe à chaleur',
        label: { fr: 'Pompe à chaleur', es: 'Bomba de calor', en: 'Heat pump' },
      },
      {
        id: 'chauffage-5',
        crmValue: 'Électrique',
        label: { fr: 'Électrique', es: 'Eléctrico', en: 'Electric' },
      },
    ],
    crmFieldIds: [2301, 2302],
  },
  // Étape 11 — Sous-cat 64 — Isolation combles habitables (field 2297)
  {
    orderPage: 11,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Si vos combles sont habitables : Que souhaitez-vous isoler ?',
      es: 'Si su buhardilla es habitable: ¿Qué desea aislar?',
      en: 'If your attic is habitable: What do you want to insulate?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'isolation-hab-1',
        crmValue: '1- Rampants de toiture (sous le toit)',
        label: { fr: '1- Rampants de toiture (sous le toit)', es: '1- Pendientes del tejado (bajo el techo)', en: '1- Roof rafters (under the roof)' },
      },
      {
        id: 'isolation-hab-2',
        crmValue: '2- Plafond intérieur',
        label: { fr: '2- Plafond intérieur', es: '2- Techo interior', en: '2- Interior ceiling' },
      },
      {
        id: 'isolation-hab-3',
        crmValue: '3- Murs latéraux',
        label: { fr: '3- Murs latéraux', es: '3- Paredes laterales', en: '3- Side walls' },
      },
      {
        id: 'isolation-hab-4',
        crmValue: '4- Je ne sais pas (besoin de conseil)',
        label: { fr: '4- Je ne sais pas (besoin de conseil)', es: '4- No lo sé (necesito consejo)', en: "4- I don't know (need advice)" },
      },
    ],
    crmFieldIds: [2297],
  },
  // Étape 12 — Sous-cat 68 — Plancher combles non habitables (field 2298)
  {
    orderPage: 12,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Si vos combles sont non habitables : Type de plancher (confirmation)',
      es: 'Si su buhardilla no es habitable: Tipo de suelo (confirmación)',
      en: 'If your attic is non-habitable: Floor type (confirmation)',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'plancher-b-1',
        crmValue: 'Bois',
        label: { fr: 'Bois', es: 'Madera', en: 'Wood' },
      },
      {
        id: 'plancher-b-2',
        crmValue: 'Béton',
        label: { fr: 'Béton', es: 'Hormigón', en: 'Concrete' },
      },
      {
        id: 'plancher-b-3',
        crmValue: 'Je ne sais pas (besoin de conseil)',
        label: { fr: 'Je ne sais pas (besoin de conseil)', es: 'No lo sé (necesito consejo)', en: "I don't know (need advice)" },
      },
      {
        id: 'plancher-b-4',
        crmValue: 'Plafond en placo / faux plafond',
        label: { fr: 'Plafond en placo / faux plafond', es: 'Techo de pladur / falso techo', en: 'Plasterboard ceiling / false ceiling' },
      },
      {
        id: 'plancher-b-5',
        crmValue: 'Structure métallique',
        label: { fr: 'Structure métallique', es: 'Estructura metálica', en: 'Metal structure' },
      },
    ],
    crmFieldIds: [2298],
  },
  // Étape 13 — Sous-cat 70 — Type d'isolation souhaité (field 2299)
  {
    orderPage: 13,
    obligatoire: false,
    typeOption: 'options_multiples',
    libelleQuestion: {
      fr: "Type d'isolation souhaité",
      es: 'Tipo de aislamiento deseado',
      en: 'Desired insulation type',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'type-iso-1',
        crmValue: 'Isolation en rouleaux',
        label: { fr: 'Isolation en rouleaux', es: 'Aislamiento en rollos', en: 'Roll insulation' },
      },
      {
        id: 'type-iso-2',
        crmValue: 'Isolation soufflée',
        label: { fr: 'Isolation soufflée', es: 'Aislamiento soplado', en: 'Blown insulation' },
      },
    ],
    crmFieldIds: [2299],
  },
  // Étape 14 — Sous-cat 73 — Travaux souhaités (field 2303)
  {
    orderPage: 14,
    obligatoire: false,
    typeOption: 'options_multiples',
    libelleQuestion: {
      fr: 'Quels travaux souhaitez-vous réaliser dans votre logement ?',
      es: '¿Qué obras desea realizar en su vivienda?',
      en: 'What work do you want to carry out in your home?',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'travaux-1',
        crmValue: '1- Isolation thermique',
        label: { fr: '1- Isolation thermique', es: '1- Aislamiento térmico', en: '1- Thermal insulation' },
      },
      {
        id: 'travaux-2',
        crmValue: '2- Chauffage et ECS',
        label: { fr: '2- Chauffage et ECS', es: '2- Calefacción y ACS', en: '2- Heating and DHW' },
      },
      {
        id: 'travaux-3',
        crmValue: '3- Ventilation',
        label: { fr: '3- Ventilation', es: '3- Ventilación', en: '3- Ventilation' },
      },
      {
        id: 'travaux-4',
        crmValue: '4- Energie Solaire',
        label: { fr: '4- Énergie Solaire', es: '4- Energía Solar', en: '4- Solar Energy' },
      },
      {
        id: 'travaux-5',
        crmValue: '5- Rénovation Globale',
        label: { fr: '5- Rénovation Globale', es: '5- Renovación Global', en: '5- Global Renovation' },
      },
    ],
    crmFieldIds: [2303],
  },
  // Étape 15 — Sous-cat 74 — Disponibilité contact (fields 2304, 2305)
  {
    orderPage: 15,
    obligatoire: false,
    typeOption: 'option_unique',
    libelleQuestion: {
      fr: 'Disponibilité pour être contacté',
      es: 'Disponibilidad para ser contactado',
      en: 'Availability to be contacted',
    },
    paragrapheInfo: {
      fr: null,
      es: null,
      en: null,
    },
    options: [
      {
        id: 'dispo-1',
        crmValue: '1- Matin',
        label: { fr: '1- Matin', es: '1- Mañana', en: '1- Morning' },
      },
      {
        id: 'dispo-2',
        crmValue: '2- Après-midi',
        label: { fr: '2- Après-midi', es: '2- Tarde', en: '2- Afternoon' },
      },
      {
        id: 'dispo-3',
        crmValue: '3- Soir',
        label: { fr: '3- Soir', es: '3- Noche', en: '3- Evening' },
      },
      {
        id: 'dispo-4',
        crmValue: '4- A tout moment',
        label: { fr: '4- À tout moment', es: '4- En cualquier momento', en: '4- At any time' },
      },
    ],
    crmFieldIds: [2304, 2305],
  },
]

async function main() {
  console.log('🌱 Seeding V2...')

  // ─── 1. V1 Configuration (preserved) ───────────────────────────────────────
  console.log('  → Seeding V1 Configuration...')
  await prisma.configuration.deleteMany()
  await prisma.configuration.create({
    data: {
      formDefinition,
      version: '1.0.0',
    },
  })
  console.log('  ✅ V1 Configuration seeded (15 étapes, 23 champs, Tab ID 22)')

  // ─── 2. SuperAdmin ──────────────────────────────────────────────────────────
  console.log('  → Seeding SuperAdmin...')
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'admin@estimer-mes-aides.fr'
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD_TEMP || 'Admin2026!'
  // bcrypt cost factor 12 (R6.3, R1.3 critère 12)
  const superAdminHash = await bcrypt.hash(superAdminPassword, 12)

  await prisma.superAdmin.upsert({
    where: { email: superAdminEmail },
    update: { passwordHash: superAdminHash },
    create: {
      email: superAdminEmail,
      passwordHash: superAdminHash,
    },
  })
  console.log(`  ✅ SuperAdmin seeded: ${superAdminEmail}`)

  // ─── 3. Formulaire V2 (15 questions trilingues) ─────────────────────────────
  console.log('  → Seeding Formulaire V2...')

  // Delete existing demo formulaire and its questions (idempotent)
  const existingFormulaire = await prisma.formulaire.findFirst({
    where: { label: 'Estimer Mes Aides V2 — Formulaire de démonstration' },
  })
  if (existingFormulaire) {
    // Questions are cascade-deleted via onDelete: Cascade
    await prisma.formulaire.delete({ where: { id: existingFormulaire.id } })
  }

  const formulaire = await prisma.formulaire.create({
    data: {
      label: 'Estimer Mes Aides V2 — Formulaire de démonstration',
      version: '2.0.0',
      statut: 'publie',
      dureeRetourAccueil: 30,
      annulationInactivite: 120,
      pageDebutConfig,
      pageFinConfig,
      questions: {
        create: questionsV2.map(({ orderPage, obligatoire, typeOption, libelleQuestion, paragrapheInfo, options }) => ({
          orderPage,
          obligatoire,
          typeOption,
          libelleQuestion,
          paragrapheInfo,
          options,
        })),
      },
    },
    include: { questions: true },
  })
  console.log(`  ✅ Formulaire V2 seeded: ${formulaire.id} (${formulaire.questions.length} questions)`)

  // ─── 4. AdminBorne de démonstration ────────────────────────────────────────
  console.log('  → Seeding AdminBorne de démonstration...')
  const adminBorneEmail = 'demo-admin@estimer-mes-aides.fr'
  const adminBornePassword = 'Demo2026!'
  const adminBorneHash = await bcrypt.hash(adminBornePassword, 12)

  const adminBorne = await prisma.adminBorne.upsert({
    where: { email: adminBorneEmail },
    update: {
      passwordHash: adminBorneHash,
      nom: 'Démo',
      prenom: 'AdminBorne',
      raisonSociale: 'Société Démo SAS',
      siret: '12345678901234',
      actif: true,
    },
    create: {
      nom: 'Démo',
      prenom: 'AdminBorne',
      email: adminBorneEmail,
      passwordHash: adminBorneHash,
      raisonSociale: 'Société Démo SAS',
      siret: '12345678901234',
      actif: true,
    },
  })
  console.log(`  ✅ AdminBorne seeded: ${adminBorneEmail}`)

  // ─── 5. Borne de démonstration ──────────────────────────────────────────────
  console.log('  → Seeding Borne de démonstration...')

  const borneIdBorne = 'BORNE-DEMO-001'
  await prisma.borne.upsert({
    where: { idBorne: borneIdBorne },
    update: {
      langueDefaut: 'fr',
      adresse: '1 Place de la Démo, 75001 Paris',
      commercant: 'Brico Démo',
      regie: null,
      installateur: 'EcoInstall Démo',
      statut: 'actif',
      formulaireId: formulaire.id,
      adminBorneId: adminBorne.id,
    },
    create: {
      idBorne: borneIdBorne,
      langueDefaut: 'fr',
      adresse: '1 Place de la Démo, 75001 Paris',
      commercant: 'Brico Démo',
      regie: null,
      installateur: 'EcoInstall Démo',
      statut: 'actif',
      formulaireId: formulaire.id,
      adminBorneId: adminBorne.id,
    },
  })
  console.log(`  ✅ Borne seeded: ${borneIdBorne}`)

  console.log('')
  console.log('🎉 Seed V2 terminé avec succès !')
  console.log('   SuperAdmin    :', superAdminEmail)
  console.log('   AdminBorne    :', adminBorneEmail, '/ Demo2026!')
  console.log('   Borne         :', borneIdBorne)
  console.log('   Formulaire    :', formulaire.id)
  console.log('   Questions     :', formulaire.questions.length)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
