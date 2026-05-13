import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const prisma = new PrismaClient()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendEnvPath = path.resolve(__dirname, '../../frontend/.env')

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

// ─── V2 question taxonomy (categories + sous-categories) ─────────────────────
// Source: table fourni pour la V2. Les questions V2 restent une question par
// ecran/etape, et chaque etape est rattachee a sa categorie/sous-categorie.
const questionTaxonomy = [
  {
    categorie: 'Informations Personnelles',
    sousCategories: [
      'Information Personnelle 1/3',
      'Information Personnelle 2/3',
      'Information Personnelle 3/3',
    ],
  },
  {
    categorie: 'Le Lieu des Travaux',
    sousCategories: [
      'Le lieu des travaux 1/7',
      'Le lieu des travaux 2/7',
      'Le lieu des travaux 3/7',
      'Le lieu des travaux 4/7',
      'Le lieu des travaux 5/7',
      'Le lieu des travaux 6/7',
      'Le lieu des travaux 7/7',
    ],
  },
  {
    categorie: 'Vos Besoins',
    sousCategories: [
      'Vos Besoins 1/5',
      'Vos Besoins 2/5',
      'Vos Besoins 3/5',
      'Vos Besoins 4/5',
      'Vos Besoins 5/5',
    ],
  },
]

const questionTaxonomyByOrderPage = {
  1: { categorie: 'Informations Personnelles', sousCategorie: 'Information Personnelle 1/3' },
  2: { categorie: 'Informations Personnelles', sousCategorie: 'Information Personnelle 2/3' },
  3: { categorie: 'Informations Personnelles', sousCategorie: 'Information Personnelle 3/3' },
  4: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 1/7' },
  5: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 2/7' },
  6: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 3/7' },
  7: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 4/7' },
  8: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 5/7' },
  9: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 6/7' },
  10: { categorie: 'Le Lieu des Travaux', sousCategorie: 'Le lieu des travaux 7/7' },
  11: { categorie: 'Vos Besoins', sousCategorie: 'Vos Besoins 1/5' },
  12: { categorie: 'Vos Besoins', sousCategorie: 'Vos Besoins 2/5' },
  13: { categorie: 'Vos Besoins', sousCategorie: 'Vos Besoins 3/5' },
  14: { categorie: 'Vos Besoins', sousCategorie: 'Vos Besoins 4/5' },
  15: { categorie: 'Vos Besoins', sousCategorie: 'Vos Besoins 5/5' },
}

// ─── V2 Questions (15 étapes, trilingues) ─────────────────────────────────────
// Chaque question correspond à une sous-catégorie CRM (source : docs/CONTEXT.md)
const legacyQuestionsV2 = [
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

const FIELD_TYPE_TO_TYPE_OPTION = {
  1: 'texte_court',
  2: 'texte_long',
  4: 'option_unique',
  5: 'option_unique',
  6: 'telephone',
  50: 'option_unique',
}

const FIELD_TYPE_OVERRIDES = {
  2016: 'email',
  2299: 'option_unique',
  2303: 'option_unique',
  2305: 'texte_long',
}

const FIELD_LABEL_OVERRIDES = {
  2089: 'Code Postal',
  2300: "Accès aux combles : il existe une trappe d'accès ?",
  2302: 'Autre type de chauffage principal',
  2297: 'Si vos combles sont habitables, que souhaitez-vous isoler ?',
}

const FIELD_REQUIRED_OVERRIDES = {
  2087: true,
  2088: true,
  2089: true,
  2090: true,
  2294: true,
  2293: true,
}

const FIELD_OPTIONS_OVERRIDES = {
  2262: ['Mr.', 'Mme'],
  2301: ['Bois', 'Fioul', 'Gaz', 'Pompe à chaleur', 'Électrique', 'Autre'],
}

const FIELD_LABEL_TRANSLATIONS = {
  2262: { fr: 'Civilité', es: 'Tratamiento', en: 'Title' },
  2087: { fr: 'Nom', es: 'Apellido', en: 'Last name' },
  2088: { fr: 'Prénom', es: 'Nombre', en: 'First name' },
  2217: { fr: 'Adresse', es: 'Dirección', en: 'Address' },
  2089: { fr: 'Code Postal', es: 'Código postal', en: 'Postal code' },
  2090: { fr: 'Ville', es: 'Ciudad', en: 'City' },
  2015: { fr: 'Num. de Téléphone', es: 'Núm. de Teléfono', en: 'Phone number' },
  2016: { fr: 'Adresse Email', es: 'Correo electrónico', en: 'Email address' },
  2294: { fr: "À combien s'élève le revenu total de votre foyer fiscal ?", es: '¿A cuánto ascienden los ingresos totales de su hogar fiscal?', en: 'What is the total income of your tax household?' },
  2293: { fr: 'Dans ce logement vous êtes', es: 'En esta vivienda usted es', en: 'In this home you are' },
  2292: { fr: 'Votre projet concerne', es: 'Su proyecto se refiere a', en: 'Your project concerns' },
  2306: { fr: 'Date de construction de votre logement', es: 'Fecha de construcción de su vivienda', en: 'Construction date of your home' },
  2307: { fr: 'Quelle est la surface habitable de votre logement ?', es: '¿Cuál es la superficie habitable de su vivienda?', en: 'What is the living area of your home?' },
  2296: { fr: 'Quel type de combles avez-vous ?', es: '¿Qué tipo de buhardilla tiene?', en: 'What type of attic do you have?' },
  2298: { fr: 'Si vos combles sont non habitables : Type de plancher', es: 'Si su buhardilla no es habitable: Tipo de suelo', en: 'If your attic is non-habitable: Floor type' },
  2300: { fr: "Accès aux combles : il existe une trappe d'accès ?", es: '¿Existe una trampilla de acceso a la buhardilla?', en: 'Attic access: is there an access hatch?' },
  2301: { fr: 'Type de chauffage principal', es: 'Tipo de calefacción principal', en: 'Main heating type' },
  2302: { fr: 'Autre type de chauffage principal', es: 'Otro tipo de calefacción principal', en: 'Other main heating type' },
  2297: { fr: 'Si vos combles sont habitables, que souhaitez-vous isoler ?', es: 'Si su buhardilla es habitable: ¿Qué desea aislar?', en: 'If your attic is habitable: What do you want to insulate?' },
  2299: { fr: "Type d'isolation souhaité", es: 'Tipo de aislamiento deseado', en: 'Desired insulation type' },
  2303: { fr: 'Quels travaux souhaitez-vous réaliser dans votre logement ?', es: '¿Qué obras desea realizar en su vivienda?', en: 'What work do you want to carry out in your home?' },
  2304: { fr: 'Disponibilité pour être contacté', es: 'Disponibilidad para ser contactado', en: 'Availability to be contacted' },
  2305: { fr: 'Commentaires ou informations complémentaires', es: 'Comentarios o información adicional', en: 'Comments or additional information' },
}

const OPTION_TRANSLATIONS = {
  2262: {
    'Mr.': { fr: 'Mr.', es: 'Sr.', en: 'Mr.' },
    'Mme': { fr: 'Mme', es: 'Sra.', en: 'Mrs.' },
  },
  2294: {
    '1- Inférieur à 23734€': { fr: '1- Inférieur à 23 734 €', es: '1- Inferior a 23 734 €', en: '1- Less than €23,734' },
    '2- Entre 23734€ et 30427€': { fr: '2- Entre 23 734 € et 30 427 €', es: '2- Entre 23 734 € y 30 427 €', en: '2- Between €23,734 and €30,427' },
    '3- Entre 30428€ et 42848€': { fr: '3- Entre 30 428 € et 42 848 €', es: '3- Entre 30 428 € y 42 848 €', en: '3- Between €30,428 and €42,848' },
    '4- Supérieur à 42849€': { fr: '4- Supérieur à 42 849 €', es: '4- Superior a 42 849 €', en: '4- More than €42,849' },
  },
  2293: {
    'Propriétaire Bailleur': { fr: 'Propriétaire Bailleur', es: 'Propietario Arrendador', en: 'Landlord Owner' },
    "Propriétaire d'une résidence secondaire": { fr: "Propriétaire d'une résidence secondaire", es: 'Propietario de una residencia secundaria', en: 'Owner of a secondary residence' },
    'Propriétaire occupant': { fr: 'Propriétaire occupant', es: 'Propietario ocupante', en: 'Owner-occupier' },
    'Résident': { fr: 'Résident', es: 'Residente', en: 'Resident' },
  },
  2292: {
    'Appartement': { fr: 'Appartement', es: 'Apartamento', en: 'Apartment' },
    'Maison': { fr: 'Maison', es: 'Casa', en: 'House' },
  },
  2306: {
    '1- Entre 2 ans et 15 ans': { fr: '1- Entre 2 ans et 15 ans', es: '1- Entre 2 y 15 años', en: '1- Between 2 and 15 years' },
    '2- Plus de 15 ans': { fr: '2- Plus de 15 ans', es: '2- Más de 15 años', en: '2- More than 15 years' },
  },
  2307: {
    '1- 0 à 70 m2': { fr: '1- 0 à 70 m²', es: '1- 0 a 70 m²', en: '1- 0 to 70 m²' },
    '2- 71 à 120 m2': { fr: '2- 71 à 120 m²', es: '2- 71 a 120 m²', en: '2- 71 to 120 m²' },
    '3- 121 à 200 m2': { fr: '3- 121 à 200 m²', es: '3- 121 a 200 m²', en: '3- 121 to 200 m²' },
    '4- + de 200 m2': { fr: '4- + de 200 m²', es: '4- + de 200 m²', en: '4- More than 200 m²' },
  },
  2296: {
    'Combles aménagés / habitables (vous pouvez y vivre)': { fr: 'Combles aménagés / habitables (vous pouvez y vivre)', es: 'Buhardilla acondicionada / habitable (puede vivir en ella)', en: 'Converted / habitable attic (you can live in it)' },
    'Combles perdus / non habitables (espace vide ou stockage)': { fr: 'Combles perdus / non habitables (espace vide ou stockage)', es: 'Buhardilla no habitable (espacio vacío o almacenamiento)', en: 'Non-habitable attic (empty space or storage)' },
  },
  2298: {
    'Bois': { fr: 'Bois', es: 'Madera', en: 'Wood' },
    'Béton': { fr: 'Béton', es: 'Hormigón', en: 'Concrete' },
    'Je ne sais pas (besoin de conseil)': { fr: 'Je ne sais pas (besoin de conseil)', es: 'No lo sé (necesito consejo)', en: "I don't know (need advice)" },
    'Plafond en placo / faux plafond': { fr: 'Plafond en placo / faux plafond', es: 'Techo de pladur / falso techo', en: 'Plasterboard ceiling / false ceiling' },
    'Structure métallique': { fr: 'Structure métallique', es: 'Estructura metálica', en: 'Metal structure' },
  },
  2300: {
    'NON': { fr: 'Non', es: 'No', en: 'No' },
    'OUI': { fr: 'Oui', es: 'Sí', en: 'Yes' },
  },
  2301: {
    'Bois': { fr: 'Bois', es: 'Leña', en: 'Wood' },
    'Fioul': { fr: 'Fioul', es: 'Gasóleo', en: 'Oil' },
    'Gaz': { fr: 'Gaz', es: 'Gas', en: 'Gas' },
    'Pompe à chaleur': { fr: 'Pompe à chaleur', es: 'Bomba de calor', en: 'Heat pump' },
    'Électrique': { fr: 'Électrique', es: 'Eléctrico', en: 'Electric' },
    'Autre': { fr: 'Autre', es: 'Otro', en: 'Other' },
  },
  2297: {
    '1- Rampants de toiture (sous le toit)': { fr: '1- Rampants de toiture (sous le toit)', es: '1- Pendientes del tejado (bajo el techo)', en: '1- Roof rafters (under the roof)' },
    '2- Plafond intérieur': { fr: '2- Plafond intérieur', es: '2- Techo interior', en: '2- Interior ceiling' },
    '3- Murs latéraux': { fr: '3- Murs latéraux', es: '3- Paredes laterales', en: '3- Side walls' },
    '4- Je ne sais pas (besoin de conseil)': { fr: '4- Je ne sais pas (besoin de conseil)', es: '4- No lo sé (necesito consejo)', en: "4- I don't know (need advice)" },
  },
  2299: {
    'Isolation en rouleaux': { fr: 'Isolation en rouleaux', es: 'Aislamiento en rollos', en: 'Roll insulation' },
    'Isolation soufflée': { fr: 'Isolation soufflée', es: 'Aislamiento soplado', en: 'Blown insulation' },
  },
  2303: {
    '1- Isolation thermique': { fr: '1- Isolation thermique', es: '1- Aislamiento térmico', en: '1- Thermal insulation' },
    '2- Chauffage et ECS': { fr: '2- Chauffage et ECS', es: '2- Calefacción y ACS', en: '2- Heating and DHW' },
    '3- Ventilation': { fr: '3- Ventilation', es: '3- Ventilación', en: '3- Ventilation' },
    '4- Energie Solaire': { fr: '4- Énergie Solaire', es: '4- Energía Solar', en: '4- Solar Energy' },
    '5- Rénovation Globale': { fr: '5- Rénovation Globale', es: '5- Renovación Global', en: '5- Global Renovation' },
  },
  2304: {
    '1- Matin': { fr: '1- Matin', es: '1- Mañana', en: '1- Morning' },
    '2- Après-midi': { fr: '2- Après-midi', es: '2- Tarde', en: '2- Afternoon' },
    '3- Soir': { fr: '3- Soir', es: '3- Noche', en: '3- Evening' },
    '4- A tout moment': { fr: '4- À tout moment', es: '4- En cualquier momento', en: '4- At any time' },
  },
}

function normalizeQuestionText(text) {
  if (!text) return ''
  return FIELD_LABEL_OVERRIDES[text.id] || text.name || ''
}

function i18nSame(value) {
  return { fr: value, es: value, en: value }
}

function optionId(fieldId, value, index) {
  return `${fieldId}-${index + 1}-${String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

function buildQuestionsV2FromFields() {
  const questions = []
  let orderPage = 1

  for (const category of formDefinition.categories) {
    for (const subCategory of category.subcategories) {
      for (const field of subCategory.fields) {
        const optionValues = FIELD_OPTIONS_OVERRIDES[field.id] || field.options?.map((option) => option.name) || []
        const hasOptions = optionValues.length > 0
        const typeOption = FIELD_TYPE_OVERRIDES[field.id] || (hasOptions ? 'option_unique' : FIELD_TYPE_TO_TYPE_OPTION[field.fieldtype_id] || 'texte_court')
        const labelFr = normalizeQuestionText(field)
        const libelleQuestion = FIELD_LABEL_TRANSLATIONS[field.id] || i18nSame(labelFr)

        questions.push({
          orderPage,
          ordreDansPage: field.ordre ?? 0,
          obligatoire: FIELD_REQUIRED_OVERRIDES[field.id] ?? field.required ?? false,
          typeOption,
          libelleQuestion,
          paragrapheInfo: { fr: null, es: null, en: null },
          options: hasOptions
            ? optionValues.map((value, index) => ({
                id: optionId(field.id, value, index),
                crmValue: value,
                label: (OPTION_TRANSLATIONS[field.id]?.[value]) || i18nSame(value),
              }))
            : null,
          crmFieldIds: [field.id],
        })
      }
      orderPage += 1
    }
  }

  return questions
}

const questionsV2 = buildQuestionsV2FromFields()

// ─── Valid CRM Field IDs (source of truth — Requirement 7.4) ─────────────────
// These are the ONLY valid field IDs for CRM synchronization.
// Never use invented IDs — they will fail during CRM sync.
const VALID_CRM_FIELD_IDS = [
  2262, 2087, 2088, 2217, 2089, 2090, 2015, 2016,
  2294, 2293, 2292, 2306, 2307, 2296, 2298, 2300,
  2301, 2302, 2297, 2299, 2303, 2304, 2305,
]

// ─── V2 Primary Color (Requirement 3.4 — must be #5B2D8E, NOT #5C2DD3) ──────
const PRIMARY_COLOR_V2 = process.env.PRIMARY_COLOR ?? '#5B2D8E'

function updateFrontendBorneEnv(borneId) {
  if (!borneId || !fs.existsSync(frontendEnvPath)) {
    console.log(`  ⚠️  Frontend .env introuvable — configurez VITE_BORNE_ID=${borneId}`)
    return
  }

  let envContent = fs.readFileSync(frontendEnvPath, 'utf8')
  const nextLine = `VITE_BORNE_ID="${borneId}"`

  if (envContent.includes('VITE_BORNE_ID=')) {
    envContent = envContent.replace(/VITE_BORNE_ID=.*/, nextLine)
  } else {
    envContent = `${envContent.trimEnd()}\n${nextLine}\n`
  }

  fs.writeFileSync(frontendEnvPath, envContent)
  console.log('  ✅ Frontend .env mis à jour avec le VITE_BORNE_ID de la borne demo')
}

/**
 * Validate that all CRM field IDs used in questionsV2 are in the approved list.
 * Throws if any invalid ID is found (Requirement 7.12).
 */
function validateCrmFieldIds() {
  const invalidIds = []
  for (const question of questionsV2) {
    for (const fieldId of question.crmFieldIds) {
      if (!VALID_CRM_FIELD_IDS.includes(fieldId)) {
        invalidIds.push(fieldId)
      }
    }
  }
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid CRM field IDs detected: [${invalidIds.join(', ')}]. ` +
      `Only these IDs are valid: [${VALID_CRM_FIELD_IDS.join(', ')}]`
    )
  }
  console.log(`  ✅ CRM field ID validation passed (${VALID_CRM_FIELD_IDS.length} valid IDs checked)`)
}

/**
 * Check whether seed data already exists.
 * Returns true if the SuperAdmin and demo borne are already present.
 * Requirement 3.8 — skip creation and log "Data already exists" if data is found.
 */
async function dataAlreadyExists() {
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'admin@estimer-mes-aides.fr'
  const [superAdmin, borne] = await Promise.all([
    prisma.superAdmin.findUnique({ where: { email: superAdminEmail } }),
    prisma.borne.findUnique({ where: { idBorne: 'BORNE-DEMO-001' } }),
  ])
  return superAdmin !== null && borne !== null
}

/**
 * Seed the V1 Configuration record (preserved for backward compatibility).
 * Uses upsert so it is safe to run multiple times.
 */
async function seedV1Configuration() {
  console.log('  → Seeding V1 Configuration...')
  // V1 config preserves the original V1 color (#5C2DD3) — this is intentional
  // for backward compatibility with the V1 CRM module. Do NOT change to #5B2D8E here.
  const existing = await prisma.configuration.findFirst()
  if (existing) {
    await prisma.configuration.update({
      where: { id: existing.id },
      data: { formDefinition, version: '1.0.0' },
    })
  } else {
    await prisma.configuration.create({
      data: { formDefinition, version: '1.0.0' },
    })
  }
  console.log('  ✅ V1 Configuration seeded (15 étapes, 23 champs, Tab ID 22)')
}

/**
 * Seed the SuperAdmin account.
 * Email from SUPERADMIN_EMAIL env var, password from SUPERADMIN_PASSWORD_TEMP.
 * bcrypt cost factor 12 (Requirement 3.1, project rule).
 * Task 7.2
 */
async function seedSuperAdmin() {
  console.log('  → Seeding SuperAdmin...')
  const email = process.env.SUPERADMIN_EMAIL || 'admin@estimer-mes-aides.fr'
  const password = process.env.SUPERADMIN_PASSWORD_TEMP || 'Admin2026!'
  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.superAdmin.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  })
  console.log(`  ✅ SuperAdmin seeded: ${email}`)
  return email
}

/**
 * Seed the demo AdminBorne account.
 * bcrypt cost factor 12 (project rule).
 * Task 7.3
 */
async function seedAdminBorne() {
  console.log('  → Seeding AdminBorne de démonstration...')
  const email = 'demo-admin@estimer-mes-aides.fr'
  const password = 'Demo2026!'
  const passwordHash = await bcrypt.hash(password, 12)

  const adminBorne = await prisma.adminBorne.upsert({
    where: { email },
    update: {
      passwordHash,
      nom: 'Démo',
      prenom: 'AdminBorne',
      raisonSociale: 'Société Démo SAS',
      siret: '12345678901234',
      actif: true,
    },
    create: {
      nom: 'Démo',
      prenom: 'AdminBorne',
      email,
      passwordHash,
      raisonSociale: 'Société Démo SAS',
      siret: '12345678901234',
      actif: true,
    },
  })
  console.log(`  ✅ AdminBorne seeded: ${email}`)
  return adminBorne
}

async function ensureQuestionTaxonomySchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "categories_question" (
      "id" TEXT NOT NULL,
      "nom" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "categories_question_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "sous_categories_question" (
      "id" TEXT NOT NULL,
      "nom" TEXT NOT NULL,
      "categorieId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "sous_categories_question_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe('ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "categorieId" TEXT;')
  await prisma.$executeRawUnsafe('ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "sousCategorieId" TEXT;')
  await prisma.$executeRawUnsafe('ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "ordreDansPage" INTEGER NOT NULL DEFAULT 0;')
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "categories_question_nom_key" ON "categories_question"("nom");')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "sous_categories_question_categorieId_idx" ON "sous_categories_question"("categorieId");')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "questions_categorieId_idx" ON "questions"("categorieId");')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "questions_sousCategorieId_idx" ON "questions"("sousCategorieId");')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "questions_formulaireId_orderPage_ordreDansPage_idx" ON "questions"("formulaireId", "orderPage", "ordreDansPage");')

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sous_categories_question_categorieId_fkey'
      ) THEN
        ALTER TABLE "sous_categories_question"
        ADD CONSTRAINT "sous_categories_question_categorieId_fkey"
        FOREIGN KEY ("categorieId") REFERENCES "categories_question"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `)

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'questions_categorieId_fkey'
      ) THEN
        ALTER TABLE "questions"
        ADD CONSTRAINT "questions_categorieId_fkey"
        FOREIGN KEY ("categorieId") REFERENCES "categories_question"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'questions_sousCategorieId_fkey'
      ) THEN
        ALTER TABLE "questions"
        ADD CONSTRAINT "questions_sousCategorieId_fkey"
        FOREIGN KEY ("sousCategorieId") REFERENCES "sous_categories_question"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `)
}

async function seedQuestionTaxonomy() {
  console.log('  → Seeding catégories et sous-catégories V2...')
  await ensureQuestionTaxonomySchema()
  const taxonomyByName = new Map()

  for (const categoryData of questionTaxonomy) {
    const categorie = await prisma.categorieQuestion.upsert({
      where: { nom: categoryData.categorie },
      update: {},
      create: { nom: categoryData.categorie },
    })

    for (const sousCategorieNom of categoryData.sousCategories) {
      let sousCategorie = await prisma.sousCategorieQuestion.findFirst({
        where: {
          nom: sousCategorieNom,
          categorieId: categorie.id,
        },
      })

      if (!sousCategorie) {
        sousCategorie = await prisma.sousCategorieQuestion.create({
          data: {
            nom: sousCategorieNom,
            categorieId: categorie.id,
          },
        })
      }

      taxonomyByName.set(`${categoryData.categorie}::${sousCategorieNom}`, {
        categorieId: categorie.id,
        sousCategorieId: sousCategorie.id,
      })
    }
  }

  console.log(`  ✅ Taxonomie V2 seeded (${questionTaxonomy.length} catégories, ${taxonomyByName.size} sous-catégories)`)
  return taxonomyByName
}

function buildQuestionCreateData(taxonomyByName) {
  return questionsV2.map((question) => {
    const taxonomy = questionTaxonomyByOrderPage[question.orderPage]
    const ids = taxonomy
      ? taxonomyByName.get(`${taxonomy.categorie}::${taxonomy.sousCategorie}`)
      : null

    if (!ids) {
      throw new Error(`Taxonomie manquante pour la question orderPage=${question.orderPage}`)
    }

    const {
      orderPage,
      obligatoire,
      ordreDansPage,
      typeOption,
      libelleQuestion,
      paragrapheInfo,
      options,
      crmFieldIds,
    } = question

    return {
      orderPage,
      ordreDansPage,
      obligatoire,
      typeOption,
      libelleQuestion,
      paragrapheInfo,
      options,
      crmFieldIds,
      categorieId: ids.categorieId,
      sousCategorieId: ids.sousCategorieId,
    }
  })
}

/**
 * Seed the demo Formulaire with all 15 steps and correct CRM field IDs.
 * Uses couleurPrimaire #5B2D8E (V2 color — Requirement 3.4).
 * Tasks 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */
async function seedFormulaire(taxonomyByName) {
  console.log('  → Seeding Formulaire V2 (15 étapes)...')

  const DEMO_LABEL = 'Estimer Mes Aides V2 — Formulaire de démonstration'

  // Build pageDebutConfig and pageFinConfig with correct V2 primary color
  const pageDebutConfigV2 = {
    couleurPrimaire: PRIMARY_COLOR_V2,
    ...pageDebutConfig,
  }
  const pageFinConfigV2 = {
    couleurPrimaire: PRIMARY_COLOR_V2,
    ...pageFinConfig,
  }
  const questionCreateData = buildQuestionCreateData(taxonomyByName)

  // Check if demo formulaire already exists
  const existing = await prisma.formulaire.findFirst({
    where: { label: DEMO_LABEL },
    include: { questions: true },
  })

  if (existing) {
    // Update the formulaire in place — delete old questions and recreate
    // (questions are cascade-deleted via onDelete: Cascade in schema)
    await prisma.question.deleteMany({ where: { formulaireId: existing.id } })
    const formulaire = await prisma.formulaire.update({
      where: { id: existing.id },
      data: {
        version: '1.0.0',
        statut: 'publie',
        dureeRetourAccueil: 30,
        annulationInactivite: 120,
        pageDebutConfig: pageDebutConfigV2,
        pageFinConfig: pageFinConfigV2,
        questions: {
          create: questionCreateData,
        },
      },
      include: { questions: true },
    })
    console.log(`  ✅ Formulaire V2 updated: ${formulaire.id} (${formulaire.questions.length} questions)`)
    return formulaire
  }

  const formulaire = await prisma.formulaire.create({
    data: {
      label: DEMO_LABEL,
      version: '1.0.0',
      statut: 'publie',
      dureeRetourAccueil: 30,
      annulationInactivite: 120,
      pageDebutConfig: pageDebutConfigV2,
      pageFinConfig: pageFinConfigV2,
      questions: {
        create: questionCreateData,
      },
    },
    include: { questions: true },
  })
  console.log(`  ✅ Formulaire V2 seeded: ${formulaire.id} (${formulaire.questions.length} questions)`)
  return formulaire
}

/**
 * Seed the demo Borne assigned to the demo AdminBorne with the demo Formulaire.
 * Task 7.10
 */
async function seedBorne(adminBorne, formulaire) {
  console.log('  → Seeding Borne de démonstration...')
  const idBorne = 'BORNE-DEMO-001'

  const borne = await prisma.borne.upsert({
    where: { idBorne },
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
      idBorne,
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
  updateFrontendBorneEnv(borne.id)
  console.log(`  ✅ Borne seeded: ${idBorne} (${borne.id}) → AdminBorne: ${adminBorne.email}, Formulaire: ${formulaire.id}`)
  return borne
}

/**
 * Main seed entry point.
 *
 * Execution order:
 *   1. Validate all CRM field IDs (fail fast if any are invalid)
 *   2. Seed V1 Configuration (always — backward compat)
 *   3. Seed V2 taxonomy (categories + sous-categories)
 *   4. Check idempotency — if demo data exists, refresh only the demo formulaire
 *   5. Seed SuperAdmin (task 7.2)
 *   6. Seed demo AdminBorne (task 7.3)
 *   7. Seed demo Formulaire with 15 steps (tasks 7.4–7.9)
 *   8. Seed demo Borne assigned to AdminBorne + Formulaire (task 7.10)
 *   9. Print summary
 */
async function main() {
  console.log('🌱 Seeding V2...')
  console.log(`   Primary color : ${PRIMARY_COLOR_V2}`)
  console.log(`   SuperAdmin    : ${process.env.SUPERADMIN_EMAIL || 'admin@estimer-mes-aides.fr'}`)
  console.log('')

  // ─── Step 1: Validate CRM field IDs before any DB operation ────────────────
  console.log('  → Validating CRM field IDs...')
  validateCrmFieldIds()

  // ─── Step 2: V1 Configuration (always seeded — backward compat) ────────────
  await seedV1Configuration()

  // ─── Step 3: V2 Taxonomy (categories + sous-categories) ───────────────────
  const taxonomyByName = await seedQuestionTaxonomy()

  // ─── Step 4: Idempotency check for V2 data ─────────────────────────────────
  const alreadySeeded = await dataAlreadyExists()
  if (alreadySeeded) {
    const formulaire = await seedFormulaire(taxonomyByName)
    const borne = await prisma.borne.findUnique({ where: { idBorne: 'BORNE-DEMO-001' } })
    updateFrontendBorneEnv(borne?.id)
    console.log('')
    console.log('ℹ️  Data already exists — taxonomie et formulaire V2 rafraîchis.')
    console.log('   SuperAdmin/AdminBorne/Borne de démonstration conservés.')
    console.log('   Borne UUID    :', borne?.id)
    console.log('   Formulaire    :', formulaire.id)
    console.log('   Questions     :', formulaire.questions.length)
    return
  }

  // ─── Step 5: SuperAdmin (task 7.2) ─────────────────────────────────────────
  const superAdminEmail = await seedSuperAdmin()

  // ─── Step 6: Demo AdminBorne (task 7.3) ────────────────────────────────────
  const adminBorne = await seedAdminBorne()

  // ─── Step 7: Demo Formulaire with 15 steps (tasks 7.4–7.9) ────────────────
  const formulaire = await seedFormulaire(taxonomyByName)

  // ─── Step 8: Demo Borne (task 7.10) ────────────────────────────────────────
  const borne = await seedBorne(adminBorne, formulaire)

  // ─── Step 9: Summary ───────────────────────────────────────────────────────
  console.log('')
  console.log('🎉 Seed V2 terminé avec succès !')
  console.log('   SuperAdmin    :', superAdminEmail)
  console.log('   AdminBorne    :', adminBorne.email, '/ Demo2026!')
  console.log('   Borne         :', borne.idBorne)
  console.log('   Borne UUID    :', borne.id)
  console.log('   Formulaire    :', formulaire.id)
  console.log('   Questions     :', formulaire.questions.length)
  console.log('   Couleur V2    :', PRIMARY_COLOR_V2)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e.message)
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
