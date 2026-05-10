import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DOCS_DIR = path.resolve(process.cwd(), '../../docs');

function parseJSONFile(filename) {
  try {
    const content = fs.readFileSync(path.join(DOCS_DIR, filename), 'utf-8');
    // Regex cleanup to handle potential weird characters or pure JSON
    const match = content.match(/\{.*\}|\[.*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error parsing ${filename}:`, err.message);
    return null;
  }
}

async function run() {
  console.log('🔄 Lecture des fichiers de configuration...');
  
  // Lecture de la configuration principale
  const mainForm = parseJSONFile('tab estimer mes aides formulaire .txt');
  if (!mainForm) {
    console.error('❌ Impossible de lire la configuration principale du formulaire.');
    return;
  }

  // Lecture de toutes les valeurs possibles
  const possibleValues = {};
  const files = fs.readdirSync(DOCS_DIR);
  
  for (const file of files) {
    if (file.includes('possible value') && file.endsWith('.txt')) {
      const data = parseJSONFile(file);
      if (data && data.field_id) {
        possibleValues[data.field_id] = data.possible_values || [];
      }
    }
  }
  
  console.log(`✅ ${Object.keys(possibleValues).length} fichiers de valeurs possibles trouvés.`);

  // Construction des questions
  const questionsToCreate = [];
  let globalOrder = 1;
  
  // Les données de tab estimer mes aides formulaire .txt sont un tableau de formulaires/catégories ?
  // D'après la documentation, c'est l'objet entier qui contient 'data'.
  let categories = [];
  if (Array.isArray(mainForm.data)) {
    categories = mainForm.data[0]?.categories || mainForm.data;
  } else if (mainForm.categories) {
    categories = mainForm.categories;
  } else if (Array.isArray(mainForm)) {
    categories = mainForm;
  }
  
  // Mapping API field type to application typeOption
  const typeMap = {
    1: 'texte_court',
    2: 'texte_long',
    4: 'options_multiples',
    5: 'option_unique',
    6: 'telephone',
    50: 'option_unique', // Liste d'options = radio ou select
  };

  for (const category of categories) {
    if (!category.subcategories) continue;
    
    for (const sub of category.subcategories) {
      for (const field of sub.fields) {
        
        // Extraction des options pour ce champ
        let options = null;
        if (possibleValues[field.id] && possibleValues[field.id].length > 0) {
          options = possibleValues[field.id].map(opt => ({
            id: String(opt.id),
            crmValue: String(opt.id), // Garder la valeur CRM
            label: {
              fr: opt.name,
              es: opt.name, // Par défaut si non traduit
              en: opt.name
            }
          }));
        }

        const typeOption = typeMap[field.fieldtype_id] || 'texte_court';
        
        questionsToCreate.push({
          orderPage: globalOrder++,
          obligatoire: field.required || false,
          typeOption: typeOption,
          libelleQuestion: {
            fr: field.name,
            es: field.name,
            en: field.name
          },
          paragrapheInfo: {
            fr: field.description ? field.description.replace(/<[^>]+>/g, '') : null, // Clean HTML
            es: null,
            en: null
          },
          options: options,
          crmFieldIds: [field.id]
        });
      }
    }
  }

  console.log(`🔄 Création du formulaire avec ${questionsToCreate.length} questions...`);

  try {
    const formulaire = await prisma.formulaire.create({
      data: {
        label: 'ESTIMER VOS AIDES (Import CRM)',
        version: '1.0.0',
        statut: 'publie',
        dureeRetourAccueil: 30,
        annulationInactivite: 120,
        pageDebutConfig: {
          titre: { fr: 'Estimer vos aides' },
          sousTitre: { fr: 'Importé depuis le CRM' },
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

    console.log(`🎉 Formulaire importé avec succès ! ID: ${formulaire.id}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'insertion :', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
