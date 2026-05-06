# Plan d'Implémentation — Estimer Mes Aides V2

## Phases d'implémentation

---

## Phase 1 : Migration schéma base de données

- [x] 1.1 Créer la migration Prisma pour les nouveaux modèles (SuperAdmin, AdminBorne, Borne, Formulaire, Question, Enregistrement, EnregistrementReponse, PartageJob)
  - Références : R1.2, R1.3, R1.4, R6.1
- [x] 1.2 Ajouter le champ `borneId` nullable sur le modèle `Submission` existant (rétrocompatibilité V1)
  - Références : R7.3
- [x] 1.3 Écrire et exécuter le script de migration SQL (prisma migrate dev)
  - Références : Design §6.2
- [x] 1.4 Créer le seed V2 : SuperAdmin par défaut, formulaire V2 équivalent au formulaire V1 (15 questions trilingues), borne de démonstration
  - Références : R1.4, R4.1, Design §6.3
- [x] 1.5 Vérifier que les 29 tests Jest existants passent toujours après la migration
  - Références : Design §6.1

---

## Phase 2 : Authentification multi-rôles

- [x] 2.1 Créer le middleware `jwtAuth.js` étendu supportant les rôles `SUPER_ADMIN` et `ADMIN_BORNE`
  - Références : R6.1, R6.4, Design §7.1
- [x] 2.2 Créer le middleware `roleAuth.js` pour la vérification des permissions par rôle
  - Références : R6.1, R6.2, Design §7.2
- [x] 2.3 Créer le middleware `borneOwnership.js` pour le cloisonnement des données AdminBorne
  - Références : R6.2, Design §7.2
- [x] 2.4 Implémenter l'endpoint `POST /api/auth/login` avec bcrypt compare et émission JWT
  - Références : R6.3, R6.4, Design §3.2
- [x] 2.5 Implémenter le rate limiting sur les endpoints d'authentification (10 req/min/IP)
  - Références : R6.10, Design §7.3
- [x] 2.6 Journaliser les tentatives de connexion échouées (IP + horodatage)
  - Références : R6.9
- [x] 2.7 Écrire les tests Jest pour l'authentification (login valide, login invalide, JWT expiré, rôle insuffisant)
  - Références : R6.1, R6.4, R6.5

---

## Phase 3 : API Back-Office — CRUD Bornes, AdminBorne, Formulaires, Questions

- [x] 3.1 Implémenter les routes CRUD `/api/bornes` (GET liste, POST créer, GET détail, PUT modifier, PATCH statut)
  - Références : R1.2, Design §3.2
- [x] 3.2 Implémenter la route `GET /api/bornes/:id/config` retournant la config complète borne + formulaire + questions trilingues
  - Références : R3.2, Design §3.5
- [x] 3.3 Implémenter les routes CRUD `/api/admin-bornes` (GET liste, POST créer, GET détail, PUT modifier, PATCH statut, POST reset-password)
  - Références : R1.3, Design §3.2
- [x] 3.4 Implémenter les routes CRUD `/api/formulaires` (GET liste, POST créer, GET détail, PUT modifier, PATCH statut, POST dupliquer)
  - Références : R1.4, Design §3.2
- [x] 3.5 Implémenter la validation de publication de formulaire (vérification libellés FR obligatoires sur toutes les questions)
  - Références : R1.4 critère 22, R4.6
- [x] 3.6 Implémenter les routes CRUD `/api/formulaires/:id/questions` (GET, POST, PUT, DELETE, PATCH reorder)
  - Références : R1.4, Design §3.2
- [x] 3.7 Implémenter les routes `/api/enregistrements` (POST créer, GET liste avec filtres, GET détail, GET export XLSX)
  - Références : R1.5, R2.3, Design §3.2
- [x] 3.8 Implémenter les routes `/api/dashboard/superadmin` et `/api/dashboard/adminborne` avec les métriques
  - Références : R1.1, R2.1, Design §3.2
- [x] 3.9 Valider toutes les entrées avec Zod sur chaque endpoint (body, params, query)
  - Références : R6.6
- [x] 3.10 Écrire les tests Jest pour tous les nouveaux endpoints (auth, bornes, admin-bornes, formulaires, questions, enregistrements)
  - Références : R1.2, R1.3, R1.4, R1.5

---

## Phase 4 : Back-Office Frontend SuperAdmin

- [x] 4.1 Initialiser l'application `src/backoffice/` avec React 19 + Vite + TailwindCSS v4 + React Router
  - Références : Design §4.1
- [x] 4.2 Implémenter la page de connexion (`LoginPage.jsx`) avec gestion JWT et redirection par rôle
  - Références : R1, R2, Design §4.1
- [x] 4.3 Implémenter le layout back-office (Sidebar, TopBar, ProtectedRoute) avec navigation par rôle
  - Références : R6.1, Design §4.1
- [x] 4.4 Implémenter le tableau de bord SuperAdmin (`DashboardPage.jsx`) avec indicateurs et graphique
  - Références : R1.1
- [x] 4.5 Implémenter la liste et le formulaire de gestion des bornes (BornesListPage, BorneFormPage)
  - Références : R1.2
- [x] 4.6 Implémenter la liste et le formulaire de gestion des AdminBorne (AdminBornesListPage, AdminBorneFormPage)
  - Références : R1.3
- [x] 4.7 Implémenter l'éditeur de formulaires avec gestion des questions et du statut (FormulaireEditorPage)
  - Références : R1.4
- [x] 4.8 Implémenter le composant `I18nTextInput.jsx` pour la saisie trilingue avec onglets FR/ES/EN
  - Références : R4.8, Design §4.1
- [x] 4.9 Implémenter le composant `QuestionEditor.jsx` avec drag-and-drop pour le réordonnancement
  - Références : R1.4 critère 18
- [x] 4.10 Implémenter la liste des enregistrements avec filtres et export XLSX (EnregistrementsListPage)
  - Références : R1.5
- [x] 4.11 Implémenter la page de gestion des jobs de partage I-CRM (PartageJobsPage)
  - Références : R1.6
- [x] 4.12 Intégrer le client Pusher pour les notifications temps réel dans le back-office SuperAdmin
  - Références : R7.2 critère 8, Design §8.2
- [x] 4.13 Appliquer la charte graphique V2 (couleur primaire #5B2D8E, composants UI cohérents)
  - Références : R5.8

---

## Phase 5 : Back-Office Frontend AdminBorne

- [x] 5.1 Implémenter le tableau de bord AdminBorne (`DashboardPage.jsx`) avec bornes assignées et métriques
  - Références : R2.1
- [x] 5.2 Implémenter la page de consultation des bornes assignées (BornesPage.jsx) en lecture seule
  - Références : R2.2
- [x] 5.3 Implémenter la liste des enregistrements AdminBorne avec filtres et export XLSX
  - Références : R2.3
- [x] 5.4 Intégrer le client Pusher pour les notifications temps réel dans le back-office AdminBorne
  - Références : R7.2 critère 7, Design §8.2
- [x] 5.5 Vérifier le cloisonnement des données (un AdminBorne ne voit que ses bornes et enregistrements)
  - Références : R2.2 critère 6, R2.3 critère 10, R6.2

---

## Phase 6 : Front-Office Borne (refonte complète)

- [x] 6.1 Créer le contexte `BorneContext.jsx` gérant la config borne, la langue active et le formulaire dynamique
  - Références : R3.2, R4, Design §4.2
- [x] 6.2 Implémenter le hook `useBorneConfig.js` pour le chargement et la mise en cache de la config (TTL 24h)
  - Références : R3.2, Design §5.1
- [x] 6.3 Implémenter la page de connexion AdminBorne sur la borne (`LoginPage.jsx`) avec blocage après 5 échecs
  - Références : R3.1
- [x] 6.4 Implémenter la page de début visiteur (`StartPage.jsx`) avec sélecteur de langue et bouton démarrer
  - Références : R3.3, R4.2
- [x] 6.5 Implémenter le composant `LanguageSelector.jsx` avec drapeaux FR/ES/EN
  - Références : R4.2, R4.3
- [x] 6.6 Refactoriser `FormPage.jsx` pour utiliser les questions dynamiques du formulaire V2 (orderPage, typeOption, libellés i18n)
  - Références : R3.4, R4.3
- [x] 6.7 Étendre `FieldRenderer.jsx` pour supporter tous les typeOption V2 (texte_court, texte_long, option_unique, options_multiples, telephone, email)
  - Références : R3.4 critère 16
- [x] 6.8 Implémenter le hook `useInactivity.js` avec les deux timers (annulation_inactivite et duree_retour_accueil)
  - Références : R3.5, Design §4.3
- [x] 6.9 Implémenter le composant `InactivityManager.jsx` intégrant le hook useInactivity dans le cycle de vie de la session
  - Références : R3.5
- [x] 6.10 Implémenter le composant `ExitButton.jsx` avec modal de mot de passe et timeout 60s
  - Références : R3.6
- [x] 6.11 Implémenter le hook `useOfflineSync.js` avec IndexedDB pour le stockage offline-first des enregistrements
  - Références : R3.7 critère 32, R7.3 critère 11, Design §5.4
- [x] 6.12 Implémenter la page de fin configurable (`ConfirmationPage.jsx`) affichant page_fin_config dans la langue du visiteur
  - Références : R3.7 critère 33
- [x] 6.13 Implémenter le retour automatique à la page de début après duree_retour_accueil secondes depuis la page de fin
  - Références : R3.7 critère 35
- [x] 6.14 Appliquer la charte graphique V2 : header dégradé #5B2D8E → #1A56A0, barre info borne, badge étape, boutons réponse
  - Références : R5.1, R5.2, R5.3, R5.4, R5.5

---

## Phase 7 : Internationalisation trilingue

- [x] 7.1 Implémenter la fonction utilitaire `t(texteI18n, langue, fallback='fr')` pour la résolution des textes trilingues avec fallback FR
  - Références : R4.4, R4.5
- [x] 7.2 Intégrer la fonction `t()` dans tous les composants du front-office borne (libellés questions, options, paragraphes info, pages début/fin)
  - Références : R4.3
- [x] 7.3 Implémenter la persistance de la langue sélectionnée dans la session visiteur (réinitialisée à la langue par défaut de la borne à chaque nouvelle session)
  - Références : R4.3
- [x] 7.4 Implémenter la validation de publication côté backend : vérifier que chaque question a un libellé FR non vide
  - Références : R4.6, R1.4 critère 22
- [x] 7.5 Tester le fallback FR pour les textes manquants en ES et EN
  - Références : R4.4

---

## Phase 8 : Partage I-CRM asynchrone (Pusher + Queue)

- [x] 8.1 Installer et configurer le SDK Pusher côté backend (`pusher` npm package)
  - Références : R7.2, Design §8.1
- [x] 8.2 Implémenter le service `queueWorker.js` qui traite les PartageJob en attente (polling toutes les 30 secondes)
  - Références : R7.1, Design §5.3
- [x] 8.3 Implémenter la logique de retry exponentiel (1 min → 5 min → 15 min) avec mise à jour du champ `prochainEssai`
  - Références : R7.1 critère 3
- [x] 8.4 Implémenter la notification Pusher sur les canaux `borne-{borneId}` lors des changements de statut (succès, échec définitif)
  - Références : R7.2 critère 6, Design §8.1
- [x] 8.5 Implémenter la route `POST /api/partage/jobs/:id/relancer` pour la relance manuelle par le SuperAdmin
  - Références : R1.6 critère 32
- [x] 8.6 Intégrer le client Pusher dans le back-office (abonnement aux canaux des bornes, mise à jour UI temps réel)
  - Références : R7.2 critères 7 et 8, Design §8.2
- [x] 8.7 Écrire les tests Jest pour le queue worker (succès, échec temporaire, échec définitif, retry)
  - Références : R7.1

---

## Phase 9 : Tests, qualité et déploiement V2

- [x] 9.1 Écrire les tests d'intégration Jest pour les nouveaux endpoints (couverture minimale : auth, bornes, formulaires, enregistrements)
  - Références : Toutes les exigences
- [x] 9.2 Vérifier que les 29 tests Jest V1 passent toujours (non-régression)
  - Références : Design §6.1
- [x] 9.3 Tester le cloisonnement des données : un AdminBorne ne peut pas accéder aux ressources d'un autre AdminBorne
  - Références : R6.2
- [x] 9.4 Tester le mode offline de la borne : soumission sans réseau, stockage IndexedDB, synchronisation au retour en ligne
  - Références : R7.3 critères 11 et 12
- [x] 9.5 Tester la gestion de l'inactivité : annulation de session, retour à la page de début
  - Références : R3.5
- [x] 9.6 Tester le fallback i18n : affichage en FR quand ES ou EN est manquant
  - Références : R4.4
- [x] 9.7 Mettre à jour les variables d'environnement Railway (backend) et Vercel (frontend, backoffice) avec les nouvelles clés Pusher
  - Références : Design §9
- [x] 9.8 Exécuter la migration Prisma en production (prisma migrate deploy)
  - Références : Design §6.2
- [x] 9.9 Créer le SuperAdmin initial en production via script de seed sécurisé
  - Références : Design §6.3
- [x] 9.10 Mettre à jour la documentation technique (CLAUDE.md, docs/CONTEXT.md) pour refléter l'architecture V2
  - Références : Toutes les exigences
