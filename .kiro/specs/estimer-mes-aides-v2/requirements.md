# Document de Exigences — Estimer Mes Aides V2

## Introduction

La V2 de la plateforme « Estimer Mes Aides » transforme l'application de borne interactive pour la rénovation énergétique en une solution multi-bornes, multi-formulaires et multilingue. Elle introduit deux niveaux d'administration (SuperAdmin et AdminBorne), un formulaire entièrement dynamique configurable depuis un back-office, la gestion de l'inactivité en mode kiosque, et une synchronisation asynchrone temps réel avec le CRM via Pusher WebSocket.

La V1 existante (backend Node.js/Express/Prisma, frontend React/Vite, module CRM) est conservée et étendue. Aucune donnée existante n'est perdue lors de la migration.

---

## Glossaire

- **SuperAdmin** : Administrateur global de la plateforme, accès complet à toutes les bornes, formulaires et enregistrements.
- **AdminBorne** : Opérateur responsable d'un parc de bornes, accès limité à ses bornes assignées.
- **Borne** : Terminal physique (tablette) déployé chez un commerçant, régie ou installateur, identifié par un `id_borne` unique.
- **Formulaire** : Définition dynamique d'un questionnaire (label, version, statut, questions), configurable depuis le back-office.
- **Question** : Élément d'un formulaire avec libellé trilingue (FR/ES/EN), options de réponse et type d'affichage.
- **Enregistrement** : Soumission d'un visiteur sur une borne, contenant les réponses et le statut de partage CRM.
- **Partage I-CRM** : Synchronisation asynchrone d'un enregistrement vers le CRM externe via une queue de jobs avec retry.
- **Mode kiosque** : Mode d'affichage plein écran sans barre de navigation système, adapté aux tablettes en libre-service.
- **Session visiteur** : Durée d'interaction d'un visiteur avec la borne, depuis l'affichage de la page de début jusqu'à la soumission ou l'annulation par inactivité.
- **Page_Debut** : Écran d'accueil configurable affiché avant le formulaire (titre, sous-titre, bouton démarrer).
- **Page_Fin** : Écran de confirmation configurable affiché après soumission (message de remerciement, durée d'affichage).
- **Pusher** : Service WebSocket tiers utilisé pour les notifications temps réel de partage CRM.
- **I18n** : Internationalisation — prise en charge des langues FR, ES, EN.
- **JWT** : JSON Web Token utilisé pour l'authentification des administrateurs.
- **bcrypt** : Algorithme de hachage utilisé pour les mots de passe des administrateurs.
- **Queue** : File d'attente de jobs asynchrones pour le partage I-CRM.

---

## Exigences

---

### Exigence R1 : Back-Office SuperAdmin

**User Story :** En tant que SuperAdmin, je veux un back-office complet pour gérer les bornes, les administrateurs, les formulaires et consulter les enregistrements, afin de piloter l'ensemble de la plateforme depuis une interface centralisée.

#### Critères d'acceptation

##### R1.1 — Tableau de bord SuperAdmin

1. WHEN le SuperAdmin se connecte, THE Dashboard_SuperAdmin SHALL afficher le nombre total de bornes actives, le nombre d'enregistrements des 30 derniers jours, le nombre d'enregistrements en attente de partage CRM, et le nombre d'AdminBorne actifs.
2. THE Dashboard_SuperAdmin SHALL afficher un graphique d'évolution des enregistrements par jour sur les 30 derniers jours.
3. WHEN le SuperAdmin clique sur un indicateur du tableau de bord, THE Dashboard_SuperAdmin SHALL naviguer vers la liste filtrée correspondante.

##### R1.2 — CRUD Bornes

4. THE SuperAdmin SHALL pouvoir créer une borne en renseignant : `id_borne` (unique), `langue_defaut` (FR/ES/EN), `adresse`, `commercant`, `regie`, `installateur`, `formulaire_id`, `admin_borne_id`.
5. WHEN le SuperAdmin soumet le formulaire de création de borne avec un `id_borne` déjà existant, THE Systeme SHALL retourner une erreur de validation indiquant que l'identifiant est déjà utilisé.
6. THE SuperAdmin SHALL pouvoir modifier tous les champs d'une borne existante.
7. THE SuperAdmin SHALL pouvoir désactiver une borne sans la supprimer, en changeant son statut à `inactif`.
8. WHEN une borne est désactivée, THE Systeme SHALL empêcher le chargement de la configuration sur cette borne et retourner une erreur HTTP 403.
9. THE SuperAdmin SHALL pouvoir consulter la liste de toutes les bornes avec filtres par statut, AdminBorne et formulaire assigné.
10. THE SuperAdmin SHALL pouvoir assigner ou réassigner un formulaire à une borne depuis la fiche borne.

##### R1.3 — CRUD AdminBorne

11. THE SuperAdmin SHALL pouvoir créer un compte AdminBorne en renseignant : `nom`, `prenom`, `email` (unique), `password`, `raison_sociale`, `siret`.
12. WHEN le SuperAdmin crée un AdminBorne, THE Systeme SHALL hacher le mot de passe avec bcrypt (facteur de coût minimum 12) avant persistance.
13. THE SuperAdmin SHALL pouvoir assigner une ou plusieurs bornes à un AdminBorne depuis sa fiche.
14. THE SuperAdmin SHALL pouvoir désactiver un compte AdminBorne sans le supprimer.
15. WHEN un AdminBorne est désactivé, THE Systeme SHALL invalider ses sessions JWT actives et lui refuser l'accès au back-office.
16. THE SuperAdmin SHALL pouvoir réinitialiser le mot de passe d'un AdminBorne en générant un nouveau mot de passe temporaire.

##### R1.4 — CRUD Formulaires dynamiques

17. THE SuperAdmin SHALL pouvoir créer un formulaire en renseignant : `label`, `duree_retour_accueil` (secondes), `annulation_inactivite` (secondes), `page_debut_config` (JSON i18n), `page_fin_config` (JSON i18n).
18. THE SuperAdmin SHALL pouvoir ajouter, modifier, réordonner et supprimer des questions dans un formulaire.
19. WHEN le SuperAdmin tente de supprimer une question d'un formulaire publié, THE Systeme SHALL afficher un avertissement et exiger une confirmation explicite.
20. THE SuperAdmin SHALL pouvoir définir pour chaque question : `libelle_question` (FR/ES/EN), `type_option` (texte_court, texte_long, option_unique, options_multiples, telephone, email), `options` (FR/ES/EN), `order_page`, `obligatoire` (booléen), `paragraphe_info` (FR/ES/EN).
21. THE SuperAdmin SHALL pouvoir changer le statut d'un formulaire entre `brouillon`, `publie` et `archive`.
22. WHEN le SuperAdmin tente de publier un formulaire, THE Systeme SHALL vérifier que toutes les questions ont un libellé renseigné en français (FR) et retourner une liste d'erreurs si ce n'est pas le cas.
23. WHEN un formulaire est archivé, THE Systeme SHALL empêcher son assignation à de nouvelles bornes tout en conservant les enregistrements existants.
24. THE SuperAdmin SHALL pouvoir dupliquer un formulaire existant pour créer une nouvelle version en brouillon.
25. THE SuperAdmin SHALL pouvoir prévisualiser un formulaire en mode brouillon dans les 3 langues avant publication.

##### R1.5 — Gestion des enregistrements (SuperAdmin)

26. THE SuperAdmin SHALL pouvoir consulter tous les enregistrements de toutes les bornes avec filtres par borne, formulaire, date, et statut de partage CRM.
27. THE SuperAdmin SHALL pouvoir exporter les enregistrements filtrés au format Excel (XLSX).
28. THE SuperAdmin SHALL pouvoir déclencher manuellement le partage CRM d'un enregistrement en attente.
29. THE SuperAdmin SHALL pouvoir consulter le détail d'un enregistrement avec toutes les réponses et l'historique des tentatives de partage CRM.

##### R1.6 — Gestion du partage I-CRM

30. THE SuperAdmin SHALL pouvoir configurer les paramètres de connexion I-CRM (URL, clé API) depuis le back-office.
31. THE SuperAdmin SHALL pouvoir consulter la file d'attente des jobs de partage avec leur statut (en_attente, en_cours, succes, echec_temporaire, echec_definitif).
32. THE SuperAdmin SHALL pouvoir relancer manuellement un job de partage en échec.

---

### Exigence R2 : Back-Office AdminBorne

**User Story :** En tant qu'AdminBorne, je veux un back-office simplifié pour surveiller mes bornes assignées et consulter les enregistrements collectés, afin de gérer mon parc de bornes sans accès aux fonctionnalités d'administration globale.

#### Critères d'acceptation

##### R2.1 — Tableau de bord AdminBorne

1. WHEN l'AdminBorne se connecte, THE Dashboard_AdminBorne SHALL afficher uniquement les bornes qui lui sont assignées avec leur statut (actif/inactif) et le nombre d'enregistrements des 7 derniers jours par borne.
2. THE Dashboard_AdminBorne SHALL afficher le nombre total d'enregistrements en attente de partage CRM pour ses bornes.
3. IF l'AdminBorne n'a aucune borne assignée, THEN THE Dashboard_AdminBorne SHALL afficher un message d'information indiquant qu'aucune borne n'est encore assignée.

##### R2.2 — Consultation des bornes assignées

4. THE AdminBorne SHALL pouvoir consulter la fiche détaillée de chaque borne qui lui est assignée (adresse, formulaire actif, statistiques d'utilisation).
5. THE AdminBorne SHALL pouvoir consulter le formulaire actif d'une borne en mode lecture seule.
6. THE AdminBorne SHALL NOT pouvoir modifier la configuration d'une borne, d'un formulaire ou d'une question.

##### R2.3 — Consultation des enregistrements

7. THE AdminBorne SHALL pouvoir consulter la liste des enregistrements de ses bornes avec filtres par borne et par date.
8. THE AdminBorne SHALL pouvoir consulter le détail d'un enregistrement avec toutes les réponses.
9. THE AdminBorne SHALL pouvoir exporter les enregistrements de ses bornes au format Excel (XLSX).
10. THE AdminBorne SHALL NOT pouvoir consulter les enregistrements des bornes qui ne lui sont pas assignées.

---

### Exigence R3 : Front-Office Borne

**User Story :** En tant que visiteur sur une borne, je veux remplir un formulaire interactif adapté à la tablette pour estimer mes aides à la rénovation énergétique, afin d'obtenir un suivi personnalisé sans avoir à contacter directement un conseiller.

#### Critères d'acceptation

##### R3.1 — Authentification AdminBorne sur la borne

1. WHEN la borne est démarrée pour la première fois ou après déconnexion, THE Borne SHALL afficher un écran de connexion AdminBorne (email + mot de passe).
2. WHEN l'AdminBorne saisit des identifiants valides, THE Borne SHALL stocker le JWT dans le stockage local sécurisé et charger la configuration de la borne.
3. IF l'AdminBorne saisit des identifiants invalides, THEN THE Borne SHALL afficher un message d'erreur et incrémenter un compteur de tentatives.
4. WHEN le compteur de tentatives atteint 5 échecs consécutifs, THE Borne SHALL bloquer les tentatives de connexion pendant 5 minutes.
5. WHEN le JWT de l'AdminBorne expire, THE Borne SHALL afficher l'écran de connexion sans perdre les enregistrements locaux non synchronisés.

##### R3.2 — Chargement de la configuration de la borne

6. WHEN l'AdminBorne est authentifié, THE Borne SHALL charger en une seule requête API la configuration complète : données de la borne, formulaire actif avec toutes ses questions et options dans les 3 langues.
7. THE Borne SHALL mettre en cache la configuration dans le stockage local avec un TTL de 24 heures.
8. WHILE la borne est hors ligne, THE Borne SHALL utiliser la configuration en cache pour permettre la saisie des visiteurs.
9. IF aucune configuration n'est disponible (ni en ligne ni en cache), THEN THE Borne SHALL afficher un écran d'erreur avec un bouton de réessai.
10. WHEN la configuration est rechargée depuis l'API, THE Borne SHALL mettre à jour le cache local.

##### R3.3 — Page de début (accueil visiteur)

11. WHEN la borne est prête à accueillir un visiteur, THE Borne SHALL afficher la `page_debut_config` dans la langue par défaut de la borne.
12. THE Page_Debut SHALL afficher le sélecteur de langue (drapeaux FR/ES/EN) positionné dans le header en haut à droite, permettant au visiteur de choisir sa langue avant de démarrer.
13. WHEN le visiteur sélectionne une langue, THE Borne SHALL afficher tous les textes du formulaire dans la langue sélectionnée.
14. WHEN le visiteur appuie sur le bouton de démarrage, THE Borne SHALL démarrer une nouvelle session visiteur et afficher la première question du formulaire.

##### R3.4 — Navigation dans le formulaire dynamique

15. THE Borne SHALL afficher les questions du formulaire actif dans l'ordre défini par `order_page`, une question par écran.
16. THE Borne SHALL afficher pour chaque question : le libellé dans la langue sélectionnée, le `paragraphe_info` si renseigné, et les options de réponse adaptées au `type_option`.
17. THE Borne SHALL afficher un badge numéroté indiquant la progression (ex. « Étape 3 / 15 »).
18. WHEN le visiteur répond à une question obligatoire, THE Borne SHALL activer le bouton « Suivant ».
19. IF le visiteur tente de passer à l'étape suivante sans répondre à une question obligatoire, THEN THE Borne SHALL afficher un indicateur visuel sur le champ manquant sans bloquer la navigation par un message d'erreur modal.
20. THE Borne SHALL permettre au visiteur de revenir à la question précédente via un bouton flèche `[<]` centré sous le texte de la question, sous forme de bouton carré à bords arrondis.
21. WHEN le visiteur atteint la dernière question et appuie sur « Terminer », THE Borne SHALL soumettre l'enregistrement.
22. THE Borne SHALL afficher les options de réponse en grille (jusqu'à 3 colonnes sur tablette en orientation paysage, 1 colonne sur mobile en orientation portrait).
23. THE Borne SHALL afficher la zone de contenu (question + options) sur fond blanc pur (#FFFFFF), sans card ni ombre portée.

##### R3.5 — Gestion de l'inactivité

24. WHILE une session visiteur est active, THE Borne SHALL surveiller l'inactivité (absence d'interaction tactile).
25. WHEN la durée d'inactivité atteint `annulation_inactivite` secondes, THE Borne SHALL annuler la session en cours, effacer les réponses saisies et retourner à la page de début.
26. WHEN la durée d'inactivité atteint `duree_retour_accueil` secondes depuis la page de début (sans session active), THE Borne SHALL réafficher la page de début dans la langue par défaut de la borne.
27. WHEN une activité tactile est détectée, THE Borne SHALL réinitialiser le compteur d'inactivité.

##### R3.6 — Bouton Exit AdminBorne

28. THE Borne SHALL afficher un bouton « Exit » discret accessible en permanence sur l'interface visiteur.
29. WHEN le visiteur ou l'AdminBorne appuie sur le bouton « Exit », THE Borne SHALL afficher une modal demandant le mot de passe AdminBorne.
30. WHEN le mot de passe saisi est correct, THE Borne SHALL quitter le mode kiosque et afficher le back-office AdminBorne.
31. IF le mot de passe saisi est incorrect, THEN THE Borne SHALL afficher un message d'erreur dans la modal.
32. WHEN la modal Exit est affichée depuis 60 secondes sans interaction, THE Borne SHALL la fermer automatiquement et reprendre la session en cours.

##### R3.7 — Soumission et stockage de l'enregistrement

33. WHEN le visiteur soumet le formulaire, THE Borne SHALL créer un enregistrement avec : `borne_id`, `formulaire_id`, `langue_utilisee`, `reponses` (map question_id vers valeur), `statut_partage` = `en_attente`.
34. THE Borne SHALL stocker l'enregistrement localement (IndexedDB) avant d'envoyer la requête API, pour garantir la non-perte en cas de coupure réseau.
35. WHEN l'enregistrement est envoyé avec succès à l'API, THE Borne SHALL afficher la `page_fin_config` dans la langue du visiteur.
36. IF l'envoi API échoue, THEN THE Borne SHALL conserver l'enregistrement en local et afficher la `page_fin_config` au visiteur sans signaler l'erreur technique.
37. WHEN la `page_fin_config` a été affichée pendant `duree_retour_accueil` secondes, THE Borne SHALL retourner automatiquement à la page de début.

---

### Exigence R4 : Internationalisation trilingue

**User Story :** En tant que visiteur sur une borne, je veux pouvoir remplir le formulaire dans ma langue (français, espagnol ou anglais), afin de comprendre toutes les questions et répondre avec précision.

#### Critères d'acceptation

1. THE Systeme SHALL prendre en charge les langues FR (français), ES (espagnol) et EN (anglais) pour tous les textes affichés au visiteur sur la borne.
2. THE Borne SHALL afficher un sélecteur de langue sous forme de drapeaux (FR / ES / EN) sur la page de début et accessible depuis chaque étape du formulaire.
3. WHEN le visiteur sélectionne une langue, THE Borne SHALL afficher immédiatement tous les textes (libellés de questions, options, paragraphes d'info, page de début, page de fin) dans la langue sélectionnée.
4. IF un texte n'est pas renseigné dans la langue sélectionnée, THEN THE Borne SHALL afficher le texte en français (FR) comme langue de repli (fallback).
5. THE Systeme SHALL stocker les textes multilingues dans un objet JSON structuré : `{ "fr": "...", "es": "...", "en": "..." }` pour chaque champ de texte.
6. WHEN le SuperAdmin tente de publier un formulaire, THE Systeme SHALL vérifier que chaque question a un libellé renseigné en FR et retourner une erreur si ce n'est pas le cas.
7. WHERE les langues ES et EN sont renseignées, THE Systeme SHALL les valider comme non vides avant publication.
8. THE Back_Office_SuperAdmin SHALL afficher les champs de saisie multilingues avec un onglet par langue (FR / ES / EN) dans l'éditeur de formulaire.
9. THE Borne SHALL traduire les libellés de la barre info borne selon la langue active : en FR « Master Filiale », « régie », « installateur » ; en ES « Filial Master », « agencia », « instalador » ; en EN « Master Branch », « agency », « installer ».

---

### Exigence R5 : Charte graphique V2

**User Story :** En tant qu'utilisateur de la borne, je veux une interface visuellement cohérente avec la nouvelle identité graphique V2, afin d'avoir une expérience professionnelle et moderne.

#### Critères d'acceptation

1. THE Borne SHALL afficher un header avec un dégradé de couleur de `#5B2D8E` (violet) à `#1A56A0` (bleu) de gauche à droite.
2. THE Borne SHALL afficher une barre d'information borne positionnée AU-DESSUS du header, avec un fond quasi-noir (`#1A1A2E` ou `#0A0A0A`) et du texte blanc, contenant le nom du commerçant/régie et l'adresse de la borne ; les libellés de cette barre sont traduits selon la langue active.
3. THE Borne SHALL afficher un badge d'étape composé d'un cercle violet (`#5B2D8E`) avec le numéro en blanc à gauche, le libellé de l'étape en texte sombre à droite, et un séparateur horizontal fin sous le badge.
4. THE Borne SHALL afficher les boutons de réponse (options) avec un style visuel distinct entre l'état non sélectionné (fond blanc, bordure violette `#5B2D8E`, radius ~14px) et l'état sélectionné.
5. WHEN une option est sélectionnée, THE Borne SHALL appliquer un fond violet plein `#5B2D8E` sur le bouton sélectionné (pas de dégradé).
6. THE Borne SHALL utiliser une typographie lisible avec une taille minimale de 16px pour les champs de saisie et 14px pour les libellés.
7. THE Borne SHALL respecter des zones tactiles d'au moins 48px de hauteur pour tous les éléments interactifs.
8. THE Back_Office SHALL utiliser la couleur primaire `#5B2D8E` pour les boutons d'action principaux et les éléments de navigation actifs.
9. THE Borne SHALL afficher le bouton de navigation précédent sous forme de bouton carré à bords arrondis, centré sous le texte de la question.
10. THE Borne SHALL afficher le logo ILA26 sous forme de texte stylisé (« ila26 ») dans la barre info borne, en haut à gauche (pas une image PNG).
11. WHILE la borne est en mode kiosque production, THE Borne SHALL masquer la barre de navigation Android (boutons système III ○ <).

---

### Exigence R6 : Sécurité et cloisonnement des données

**User Story :** En tant qu'opérateur de la plateforme, je veux que les données de chaque AdminBorne soient strictement cloisonnées et que les accès soient sécurisés par rôle, afin de garantir la confidentialité des données et la conformité RGPD.

#### Critères d'acceptation

1. THE Systeme SHALL implémenter deux rôles distincts : `SUPER_ADMIN` et `ADMIN_BORNE`, avec des permissions non superposables.
2. WHEN un AdminBorne tente d'accéder à une ressource (borne, enregistrement) qui ne lui est pas assignée, THE Systeme SHALL retourner une erreur HTTP 403 sans révéler l'existence de la ressource.
3. THE Systeme SHALL hacher tous les mots de passe avec bcrypt avec un facteur de coût minimum de 12 avant persistance en base de données.
4. THE Systeme SHALL émettre des JWT avec une durée de validité de 8 heures pour les sessions back-office et de 24 heures pour les sessions borne.
5. WHEN un JWT expire, THE Systeme SHALL retourner une erreur HTTP 401 et le client SHALL rediriger vers l'écran de connexion.
6. THE Systeme SHALL valider toutes les entrées utilisateur côté serveur avec Zod avant tout traitement ou persistance.
7. THE Borne SHALL fonctionner en mode kiosque (plein écran, sans barre de navigation système) sur les tablettes Android ; le mode kiosque masque spécifiquement la barre de navigation Android (boutons système III ○ <) visible en mode non-kiosque.
8. WHILE la borne est en mode kiosque, THE Borne SHALL empêcher l'accès au système de fichiers, aux paramètres système et aux autres applications.
9. THE Systeme SHALL journaliser toutes les tentatives de connexion échouées avec l'adresse IP et l'horodatage.
10. THE Systeme SHALL appliquer un rate limiting de 10 requêtes par minute par IP sur les endpoints d'authentification.

---

### Exigence R7 : Infrastructure et performance

**User Story :** En tant qu'opérateur de la plateforme, je veux une infrastructure fiable avec synchronisation temps réel et gestion des pannes réseau, afin de garantir qu'aucun enregistrement n'est perdu et que les opérateurs sont notifiés en temps réel.

#### Critères d'acceptation

##### R7.1 — Partage I-CRM asynchrone

1. WHEN un enregistrement est soumis sur une borne, THE Systeme SHALL créer un job de partage dans la queue avec le statut `en_attente`.
2. THE Queue_Worker SHALL traiter les jobs de partage en envoyant l'enregistrement au CRM externe via l'API I-CRM existante.
3. IF le partage CRM échoue, THEN THE Queue_Worker SHALL marquer le job comme `echec_temporaire` et planifier une nouvelle tentative après un délai exponentiel (1 minute, 5 minutes, 15 minutes).
4. WHEN le nombre de tentatives atteint 3 échecs consécutifs, THE Queue_Worker SHALL marquer le job comme `echec_definitif` et notifier le SuperAdmin.
5. WHEN un partage CRM réussit, THE Queue_Worker SHALL mettre à jour le statut de l'enregistrement à `partage` et enregistrer l'horodatage.

##### R7.2 — Notifications WebSocket temps réel

6. WHEN le statut d'un job de partage change (succès ou échec), THE Systeme SHALL émettre un événement Pusher sur le canal de la borne concernée.
7. WHEN le back-office AdminBorne reçoit un événement Pusher de succès de partage, THE Dashboard_AdminBorne SHALL mettre à jour le compteur d'enregistrements partagés sans rechargement de page.
8. WHEN le back-office SuperAdmin reçoit un événement Pusher d'échec définitif, THE Dashboard_SuperAdmin SHALL afficher une notification d'alerte.

##### R7.3 — Performance et disponibilité

9. WHEN la borne charge la configuration depuis l'API, THE API SHALL répondre en moins de 2 secondes pour 95% des requêtes.
10. WHEN un visiteur soumet un formulaire, THE API SHALL enregistrer la soumission en moins de 1 seconde pour 95% des requêtes.
11. THE Borne SHALL fonctionner en mode dégradé (hors ligne) pendant au moins 72 heures en utilisant la configuration en cache et en stockant les enregistrements localement.
12. WHEN la connexion réseau est rétablie, THE Borne SHALL synchroniser automatiquement les enregistrements stockés localement avec l'API backend.
