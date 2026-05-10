import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function createOption(label, id) {
  return {
    id: String(id),
    crmValue: String(id), // Can map directly to id if no CRM specific ID is available
    label: { fr: label, en: label, es: label }
  };
}

const questionsData = [
  // Catégorie : Informations Personnelles
  { q: "Civilité", t: "texte_court", o: [] },
  { q: "Nom", t: "texte_court", o: [] },
  { q: "Prénom", t: "texte_court", o: [] },
  { q: "Adresse", t: "texte_court", o: [] },
  { q: "Code Postal", t: "texte_court", o: [] },
  { q: "Ville", t: "texte_court", o: [] },
  { q: "Num. de Téléphone", t: "texte_court", o: [] },
  { q: "Adresse Email", t: "texte_court", o: [] },
  { q: "À combien s'élève le revenu total de votre foyer fiscal ?", t: "option_unique", o: ["1- Inférieur à 23 734 €", "2- Entre 23 734 € et 30 427 €", "3- Entre 30 428 € et 42 848 €", "4- Supérieur à 42 849 €"] },
  { q: "Dans ce logement, vous êtes ?", t: "option_unique", o: ["Propriétaire Bailleur", "Propriétaire d'une résidence secondaire", "Propriétaire occupant", "Résident"] },

  // Catégorie : Le Lieu des Travaux
  { q: "Votre projet concerne", t: "option_unique", o: ["Appartement", "Maison"] },
  { q: "Date de construction de votre logement", t: "option_unique", o: ["1- Entre 2 ans et 15 ans", "2- Plus de 15 ans"] },
  { q: "Quelle est la surface habitable de votre logement ?", t: "option_unique", o: ["1- 0 à 70 m²", "2- 71 à 120 m²", "3- 121 à 200 m²", "4- + de 200 m²"] },
  { q: "Quel type de combles avez-vous ?", t: "option_unique", o: ["Combles aménagés / habitables (vous pouvez y vivre)", "Combles perdus / non habitables (espace vide ou stockage)"] },
  { q: "Si vos combles sont non habitables : Type de plancher", t: "option_unique", o: ["Bois", "Béton", "Je ne sais pas (besoin de conseil)", "Plafond en placo / faux plafond", "Structure métallique"] },
  { q: "Accès aux combles : il existe une trappe d'accès ?", t: "option_unique", o: ["OUI", "NON"] },
  { q: "Type de chauffage principal", t: "option_unique", o: ["Bois", "Fioul", "Gaz", "Pompe à chaleur", "Électrique", "Autre"] },
  { q: "Autre type de chauffage principal (affiché si \"Autre\" sélectionné)", t: "texte_court", o: [] },

  // Catégorie : Vos Besoins
  { q: "Si vos combles sont habitables, que souhaitez-vous isoler ?", t: "option_unique", o: ["1- Rampants de toiture (sous le toit)", "2- Plafond intérieur", "3- Murs latéraux", "4- Je ne sais pas (besoin de conseil)"] },
  { q: "Si vos combles sont non habitables : Type de plancher (Besoins)", t: "option_unique", o: ["Bois", "Béton", "Je ne sais pas (besoin de conseil)", "Plafond en placo / faux plafond", "Structure métallique"] },
  { q: "Type d'isolation souhaité", t: "option_unique", o: ["Isolation en rouleaux", "Isolation soufflée"] },
  { q: "Quels travaux souhaitez-vous réaliser dans votre logement ?", t: "option_unique", o: ["1- Isolation thermique", "2- Chauffage et ECS", "3- Ventilation", "4- Energie Solaire", "5- Rénovation Globale"] },
  { q: "Disponibilité pour être contacté", t: "option_unique", o: ["1- Matin", "2- Après-midi", "3- Soir", "4- À tout moment"] },
  { q: "Commentaires ou informations complémentaires", t: "texte_long", o: [] }
];

async function run() {
  console.log('🔄 Création du formulaire personnalisé...');
  
  const questionsToCreate = questionsData.map((data, index) => {
    let optionsJson = null;
    if (data.o && data.o.length > 0) {
      optionsJson = data.o.map((optLabel, i) => createOption(optLabel, i + 1));
    }

    return {
      orderPage: index + 1,
      obligatoire: false, // Could be adjusted if needed, user didn't specify required fields.
      typeOption: data.t,
      libelleQuestion: {
        fr: data.q,
        es: data.q,
        en: data.q
      },
      paragrapheInfo: null,
      options: optionsJson,
      crmFieldIds: [] // No CRM mapping provided here
    };
  });

  try {
    const formulaire = await prisma.formulaire.create({
      data: {
        label: 'Formulaire Complet - Estimer mes aides',
        version: '1.0.0',
        statut: 'publie',
        dureeRetourAccueil: 30,
        annulationInactivite: 120,
        pageDebutConfig: {
          titre: { fr: 'Estimer vos aides' },
          sousTitre: { fr: 'Découvrez vos droits' },
          couleurPrimaire: '#5B2D8E'
        },
        pageFinConfig: {
          titre: { fr: 'Merci !' },
          message: { fr: 'Vos informations ont été enregistrées.' },
          couleurPrimaire: '#5B2D8E'
        },
        questions: {
          create: questionsToCreate
        }
      }
    });

    console.log(`🎉 Formulaire créé avec succès ! ID: ${formulaire.id}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'insertion :', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
