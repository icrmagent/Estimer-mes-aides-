# Changelog

Toutes les évolutions notables de **Estimer Mes Aides** sont consignées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnement : [Semantic Versioning](https://semver.org/lang/fr/).

> **Reconstruit le 2026-09-02** depuis l'historique git réel (`git log`, `git tag -l`,
> `git show --stat`). Le dépôt n'avait aucun changelog jusqu'à cette date.
>
> ⚠️ **Aucun tag semver n'existe dans le dépôt.** `git tag -l 'v*'` renvoie 0 résultat.
> Les 25 tags présents sont tous des `deploy-YYYYMMDD-HHMMSS-<sha>` posés
> automatiquement par le job `finalize` de `.github/workflows/deploy.yml`.
> Les numéros de version ci-dessous sont donc **reconstitués** à partir des messages
> de commit et de `src/frontend/package.json` — ils ne correspondent à aucun tag git.
> Pour rendre la 2.0.0 identifiable : `git tag -a v2.0.0 b8562e4 -m "v2.0.0"`.

---

## [Non publié]

### 2026-09-25 — canal I-CRM par clé API (opportunités BORNE TACTILE)

Branche `feat/canal-icrm-cle-api`, **non mergée** (merger `main` = mise en production :
Render, Vercel et `prisma migrate deploy`). Contrat EMA → I-CRM **v1** ; côté I-CRM, l'API
entrante `/api/external/estimer-mes-aides/v1` doit être déployée avant d'activer un canal.
Guide : [docs/INTEGRATION-ICRM.md](docs/INTEGRATION-ICRM.md).

#### Ajouté
- **Canal de type `icrm_api_key`** (« Clé API I-CRM ») : `apiKey` = identifiant de clé
  `emak_…` (public), `token` = secret de 48 caractères (écriture seule). Le worker envoie
  chaque enregistrement à `POST {apiUrl}/api/external/estimer-mes-aides/v1/enregistrements`
  (`X-Api-Key`, `X-Api-Secret`, `Idempotency-Key` = id de l'enregistrement, délai 30 s),
  sans aucun appel Azure AD. I-CRM crée le contact et une **opportunité** du sous-type lié à la clé.
- **Payload complet** (`buildIcrmEnregistrementPayload`, exporté) : bloc `contact` (même
  correspondance field ID / libellé que le canal historique), **toutes** les réponses avec
  libellé FR, type, `crm_field_ids`, valeur brute et `valeur_libelles` (option →
  `crmValue` ?? `label.fr` ?? libellé de la langue ?? id ; choix multiples découpés sur `", "`),
  métadonnées borne / formulaire, langue, date de soumission.
- **Migration `20260925000000_canal_type_icrm_api_key`** (additive, idempotente) :
  `canaux.type` (défaut `azure_ad`), `enregistrements.crmProjetId` / `crmProjetRef`
  (opportunité créée, renseignés au succès).
- **Test de connexion** d'un canal par clé API : `GET …/v1/ping`, succès uniquement sur 2xx,
  renvoie l'entreprise, le sous-type et le client I-CRM ; 401/403 → échec avec message clair.
- **Back-office** : sélecteur « Type d'authentification » (« Clé API I-CRM (recommandé) » /
  « Azure AD (ancien) ») dans la fenêtre du canal, champs « Clé API (X-Api-Key) » et
  « Secret (X-Api-Secret) » (masqué, afficher/masquer, « laisser vide pour ne pas changer »),
  URL d'exemple `https://icrm.api.ila26.fr` ; tableau des canaux avec colonnes Type et
  Identifiants (identifiant de clé au lieu de l'expiration du token) ; le test affiche
  « Connecté à <entreprise> · sous-type <nom> ».
- **Tests** : backend `tests/lib/icrmApiKey.test.js`, `tests/services/queueWorker.icrmApiKey.test.js`,
  `tests/routes/canaux.test.js` (+109 tests) ; back-office `canalConfig.test.js` et
  `CanalConfigModal.test.jsx` (+32 tests, premier test de composant monté dans jsdom).
- **Docs** : `docs/INTEGRATION-ICRM.md`, section « Partage I-CRM — canal par clé API » de
  `docs/DEPLOIEMENT.md`.

#### Modifié
- **Worker** : une erreur marquée définitive (canal clé API : 401/403/404/413/422, redirection,
  canal incomplet) passe en `echec_definitif` **dès la première tentative**, sans épuiser les
  5 réessais ; 408/409/429/5xx/réseau/timeout gardent le backoff existant. Le chemin
  `azure_ad` (Bearer, `customContacts`, refresh Azure) est inchangé.
- **Worker** : la requête Prisma charge aussi `typeOption` / `options` des questions, les
  métadonnées de la borne et le formulaire (utilisés par le seul canal clé API).
- **`/api/canaux`** : `type` accepté en création (défaut `azure_ad`) et en modification ;
  un changement de type exige la clé **et** le secret. Projection publique enrichie de
  `type` et `apiKeyId` (identifiant de clé seulement ; `tokenExpiresAt` vaut `null` pour ce type).

#### Sécurité
- Canal clé API : URL `https` obligatoire (hors `localhost`), redirections HTTP non suivies
  (le secret ne part jamais vers un autre hôte), secret jamais renvoyé ni journalisé ;
  erreurs I-CRM journalisées avec code, noms de champs et `request_id`, jamais les valeurs saisies.

### 2026-09-23 — v2.1.0 : écran de veille des bornes

Branche `feat/ecran-veille` (commits `d4e6a0f`, `dfb5823`, `624076f`), PR #10,
mergée le 2026-09-23 (`2f36a76`). Release GitHub **v2.1.0** : APK build 63.
Version **2.1.0** dans les trois `package.json` : l'APK est reconstruit avec
`versionName` 2.1.0 et doit être redistribué pour que les tablettes aient la veille.

#### Ajouté
- **Backend** : modèles `EcranVeille` / `DiapositiveVeille`, `Borne.ecranVeilleId`
  (migration additive `20260923000000_ecran_veille`) ; 7 routes `/api/ecrans-veille`
  (CRUD, duplication, signature d'envoi Supabase Storage) ; `ecranVeille` dans
  `GET /api/bornes/:id/config` ; événement Pusher `ecran-veille.maj`.
- **Back-office** : menu « Écrans de veille » — liste avec miniatures, éditeur
  (séquence glisser-déposer, diapos texte / photo / galerie / vidéo en FR/ES/EN,
  période de diffusion, délai, transition, plage horaire, affectation des bornes),
  aperçu tablette en direct et lecture plein écran. Choix de l'écran sur la fiche borne.
- **Borne** : diaporama plein écran après inactivité sur l'accueil, fermé au toucher ;
  médias préchargés pour le hors-ligne (Cache API).

#### Corrigé (PR #12)
- Envoi de fichiers en 503 en production juste après la saisie de la clé Supabase : résolu
  au redéploiement. La clé est désormais aussi lue sous `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`
  ou `SUPABASE_SERVICE_KEY` (format `sb_secret_…` pris en charge), et `SUPABASE_URL` est
  déduite de `DATABASE_URL` si absente.

#### Modifié
- `PUT /api/bornes/:id` : `ecranVeilleId` réservé au SuperAdmin.
- CSP Vercel du back-office : `media-src` et `blob:` pour la lecture des vidéos.
- `tests/integration/offline-sync.integration.test.js` : mocks Pusher sortis de la
  fabrique `unstable_mockModule` (instances multiples sous Jest ESM).

### 2026-09-02 — Fiabilisation de la livraison + bascule Railway → Render

Travaux de la session de livraison, **non encore commités** au moment de la rédaction.

#### Ajouté
- **Migration `20260902000000_fix_schema_drift_canaux_crmfieldids_borneid`** — rattrape
  **5 écarts** prouvés entre les migrations et `prisma/schema.prisma`
  (source : `prisma migrate diff`) :
  1. `submissions.borne_id` → `submissions."borneId"` (500 « The column
     submissions.borneId does not exist » sur `POST /api/submissions`) ;
  2. colonne `questions."crmFieldIds"` (JSONB) manquante — `P2022` sur **toute** lecture
     de questions, dont `bornes-config.js` appelé au démarrage de la borne kiosque ;
  3. table `canaux` absente de toute migration — `P2021` sur `routes/canaux.js`,
     `queueWorker.js` et `partage.js` ;
  4. index unique résiduel `categories_question_nom_key` (la migration
     `20260513000000` tentait un `DROP CONSTRAINT` sur ce qui est un **index** :
     no-op silencieux) ;
  5. index `enregistrements_created_at_idx` → `enregistrements_createdAt_idx`.

  Migration **idempotente**, sans `DROP` de colonne ni perte de données.
  État mesuré le 2026-09-02 : `15 migrations found`, cette migration seule reste
  `not yet been applied` sur la base de production.
- **`src/backend/render.yaml`** — blueprint Render versionné (service
  `estimer-mes-aides-api`, `runtime: node`, `region: frankfurt`, `plan: free`,
  `rootDir: src/backend`, `buildCommand: npm ci`,
  `startCommand: npm run start:prod`, `healthCheckPath: /health`,
  `autoDeployTrigger: commit`, `NODE_VERSION: "20"`). Toutes les valeurs sensibles
  y sont en `sync: false` : elles se saisissent dans le dashboard, jamais dans le dépôt.
- **Journalisation des field IDs I-CRM non mappés** — `queueWorker.js` embarque
  désormais `LIBELLES_CHAMPS_CRM` (libellés métier issus de `docs/CONTEXT.md`) et
  émet un `logger.warn` `[QUEUE] Champs de la soumission NON transmis à I-CRM` listant
  `crmFieldIds` + libellé pour chaque champ absent de `FIELD_ID_MAP`. **15 field IDs**
  du formulaire V1 sont dans ce cas (2292, 2293, 2294, 2296 à 2307) : le schéma de
  destination de l'API I-CRM `customContacts` n'est documenté nulle part dans le
  dépôt. Ils ne sont pas transmis — mais ils ne sont plus perdus en silence.
  Seuls les IDs et libellés sont journalisés, **jamais les valeurs saisies** (RGPD).

#### Modifié
- **Bascule Railway → Render.** `src/backend/railway.json` et
  `src/backend/railway.toml` **supprimés**, remplacés par `src/backend/render.yaml`.
  Backend de production : **https://estimer-mes-aides-api.onrender.com**
  (service `estimer-mes-aides-api`, id `srv-dac30kbm8hqs73eb1d20`, plan free,
  région frankfurt). Le service Railway est détaché et ne reviendra pas.
  Contrainte assumée du plan free : veille après **15 min** sans trafic,
  réveil **~50 s** — documentée dans
  [docs/DEPLOIEMENT.md § Plan free Render](docs/DEPLOIEMENT.md#plan-free-render--veille-et-réveil).
- **Actions GitHub mises à niveau** dans `ci.yml` et `deploy.yml` :
  `actions/checkout` v4 → **v7** (12 usages), `actions/setup-node` v4 → **v7**
  (11 usages), `actions/upload-artifact` v4 → **v7** (2 usages),
  `actions/setup-java` v4 → **v6**, `gradle/actions/setup-gradle` v4 → **v6**.
  Ajout d'un job `lint` (matrice `frontend` / `backoffice`) et d'un `NODE_VERSION: '20'`
  centralisé (plancher imposé par Vite 8, ESLint 10 et Vitest 4).
- **Documentation** : `docs/DEPLOIEMENT.md` et `CLAUDE.md` réalignés sur Render
  (architecture, URLs, variables, procédures, reprise après sinistre,
  troubleshooting).

#### Corrigé
- **`GET /health` renvoie désormais `503` quand la base est KO.** Le handler
  répondait `200` avec `status: "degraded"` : un consommateur qui ne lit que le code
  HTTP (health check Render, `curl -fsS` du job `healthcheck`) voyait un service sain
  alors que la base était injoignable. La sonde `probeDatabase()` est en outre bornée
  par un timeout explicite (`HEALTH_DB_TIMEOUT_MS`, défaut **1000 ms**) au lieu des
  ~2 s des délais internes de Prisma. Le corps JSON est **inchangé** — seul le code
  HTTP change.
- **Lint à zéro erreur** sur les deux modules dotés d'ESLint :
  `cd src/frontend && npm run lint` et `cd src/backoffice && npm run lint` sortent
  sans aucun message (le backend n'a pas de script `lint`).
- **Faux positif « projet Supabase supprimé »** — voir la section
  [Incident 2026-09](#incident-2026-09--diagnostic-corrigé) en fin de fichier.

#### Sécurité
- **Fuite du secret Pusher corrigée côté variables Vercel.** Seule la **clé publique**
  Pusher doit être exposée à un bundle front (`VITE_PUSHER_KEY`) ; `PUSHER_SECRET` est
  une variable **serveur uniquement** (`src/backend/src/services/pusherService.js`,
  `validateEnv.js`). Les garde-fous correspondants ont été inscrits dans
  `src/frontend/.env.example` et `src/backoffice/.env.example` :
  « Ne jamais mettre `PUSHER_SECRET` ici : le bundle est public ».
  Aucun secret Pusher n'est présent dans le dépôt.

#### Livraison
- **Sans canal I-CRM actif** — choix explicite. Les variables `CRM_API_URL`,
  `CRM_API_KEY` et `CRM_USER_ID` sont déclarées dans `render.yaml` en `sync: false`
  mais ne sont pas renseignées à la livraison.

---

### Commit `806b69c` — 2026-05-24

Déployé (`deploy-20260524-055603-806b69c`) mais
**aucun bump de version** : `src/frontend/package.json` est resté à `2.0.0`, si bien
que l'APK produit porte le même `versionName` que la 2.0.0 précédente. Ce commit
n'était documenté nulle part avant la présente entrée.

#### Ajouté
- **Champ « pays » sur la borne** (ISO 3166-1 alpha-2, défaut `FR`) : nouvelle
  migration Prisma `20260524000000_add_pays_to_borne`, champ ajouté au modèle
  `Borne` et exposé par `bornes.js` et `bornes-config.js`.
- **Sélecteur de pays dans le back-office** : liste de 249 pays
  (`src/backoffice/src/utils/countries.js`, +261 lignes) branchée sur
  `BorneFormPage.jsx`.
- **Auto-complétion d'adresse sur le front borne** : nouveau composant
  `AddressAutocomplete.jsx` (+230 lignes) et service `utils/addressApi.js` (+80 lignes),
  appuyés sur l'API **BAN** pour la France et **Photon** à l'international. Une seule
  sélection met à jour d'un coup adresse, code postal et ville. Le menu déroulant est
  rendu via un React Portal pour ne pas être rogné par un `overflow: hidden` parent.

#### Modifié
- `FieldRenderer` : capitalisation **UPPERCASE** appliquée à tous les champs texte
  (`texte_court`, `texte_long`, défaut). Les champs e-mail en sont exclus.
- CSS : les options de réponse deviennent responsives via `clamp()` sur
  `min-height`, `font-size` et `padding`.

11 fichiers, +697 / -18 lignes.

---

## [2.0.0] — 2026-05-23

Commit `b8562e4`, intitulé `release(v2.0.0)`. **Non taggé en semver** — seul le tag
automatique `deploy-20260523-064542-b8562e4` existe.
`src/frontend/package.json` passe à `"version": "2.0.0"`, ce qui fixe le `versionName`
de l'APK (cf. `android-webview/app/build.gradle`).

### Ajouté
- **Mode kiosque tablette** : mode immersif Android sticky masquant la status bar et
  la nav bar, réappliqué à chaque `onWindowFocusChanged` (`MainActivity.kt`).
- Script `android-webview/sync-assets.ps1` : copie du `dist` frontend vers les assets
  de l'APK.
- Configurations de run IDE partagées (`app_debug`, `Build_Release_APK`, `Clean_Build`).
- `android-webview/README.md` : procédure de synchronisation des assets.

### Modifié
- Refonte UI des pages `StartPage`, `FormPage` et `ConfirmationPage` : safe-area-inset
  et media queries paysage, scroll vertical du contenu de formulaire, boutons
  « Suivant » et « Terminer » alignés dans le même conteneur, bouton « Retourner à
  l'accueil » calqué sur le style du bouton « Commencer », espacement countdown/bouton
  porté à `clamp(40px, …, 80px)`.
- `BorneInfoBar` : libellés abrégés (ID / Adresse), `flex-wrap` et troncature adaptative.

### Corrigé — série d'ajustements kiosque du 2026-05-23
| Commit | Correctif |
|--------|-----------|
| `34ba4b1` | responsive mobile/tablette + CORS en développement (#1) |
| `a161221` | `StartPage` : le bouton « Commencer » débordait sur le sous-titre en tablette (#2) |
| `7cd2882` | `ConfirmationPage` : refonte du bouton de retour à l'accueil (#3) |
| `81e397f` | `FormPage` : refonte du bouton « Terminer » de l'étape finale (#4) |
| `3852b61` | refonte des flèches de navigation du formulaire — fond dégradé + alignement (#6) |
| `f102b95` | 4 débordements dans le header de `FormPage` (logo, icône, langue, flèche) (#7) |
| `f50ef5b` | renforcement des 4 correctifs de header précédents (#8) |
| `d8fcda5` | refonte de la mise en page du formulaire + corrections du countdown (#9) |

### Ajouté (back-office / borne)
- `c609e60` — `BorneInfoBar` : le libellé « Master Filiale » devient « Commerçant » ;
  affichage de l'ID et de l'adresse de la borne (#5).

### Interne
- `b34dabe` — `artifacts/` et `test-results/` sortis du suivi git.

---

## [2.0.0-rc] — 2026-05-13 → 2026-05-14 — Mise en production V2

Première mise en production de la V2 : Railway (backend), Vercel (front borne +
back-office), intégration I-CRM, pipeline GitHub Actions. 13 tags `deploy-*` sur ces
deux journées.

> 📌 **Note historique — Railway.** Toutes les mentions de Railway dans cette section
> et dans celles qui suivent décrivent l'hébergement **de l'époque**. Depuis le
> 2026-09-02, le backend est hébergé sur **Render**
> (https://estimer-mes-aides-api.onrender.com) ; `railway.json` et `railway.toml` ont
> été supprimés et l'URL `*.up.railway.app` est morte. Ces entrées sont conservées
> telles quelles parce qu'elles documentent l'historique réel du dépôt — elles ne
> décrivent **pas** l'infrastructure actuelle.

### Ajouté
- `d8ae5a5` — mise en production : Railway, Vercel, intégration I-CRM.
- `12f3872` — déploiement production V2 : back-office, frontend, I-CRM, tests.
- `bf4659a` — auto-refresh du token I-CRM via `refresh_token` (validité 24 h).
- `583972e` — sélecteur de borne dans le modal de création de canal I-CRM.
- `dbe2a97` — i18n des catégories, indicateur de connectivité borne, correctifs UI
  back-office, configuration Android WebView.
- `e7d0d65` — back-office admin-bornes, frontend kiosque, soft delete.
- `844847f` — **pipeline de déploiement production** : `sync`, `tests`, `migrate`,
  `healthcheck`, `build-webview`, `finalize` (tag `deploy-*`).
- `1df74f0` — runner Node pour le dédoublonnage des enregistrements.

### Modifié
- `bd0656a` — simplification du pipeline : Railway et Vercel auto-déploient via leur
  intégration Git native ; `RAILWAY_TOKEN` et `VERCEL_TOKEN` retirés du workflow
  (Railway exige un plan payant pour générer un token API).
- `8d0461c` — le job APK embarque désormais le **build frontend de production dans les
  assets** de l'APK. C'est de ce changement que découle le chargement
  `appassets.androidplatform.net` au lieu d'une URL distante.
- `1d2855b` — consolidation de `docs/DEPLOIEMENT.md` (pipeline + troubleshooting).

### Corrigé
- `7029d94`, `7866dac`, `153cc24` — chaîne CSRF back-office Vercel ↔ backend Railway :
  cookie cross-site + token côté client, `trust proxy 1` pour stabiliser l'identifiant
  de session derrière le load-balancer Railway, sortie de
  `POST`/`DELETE /api/bornes/:id/session` du `backofficeRouter`.
- `e685a3a` — CORS : autorisation de l'origine WebView Android (APK borne).
- `dc210b9` — WebView : débordement entre le header applicatif et la status bar Android.
- `a35469c` — suppression des doublons d'enregistrement lors d'un POST direct.
- `164d8a2` — lisibilité du bouton « Retourner à l'accueil » de la `ConfirmationPage`.
- `080cbc8` — validation des champs obligatoires avant envoi I-CRM (`last_name`, `first_name`).
- `8b0c1ae` — mapping des champs I-CRM : téléphone (**2015**), e-mail (**2016**),
  adresse (**2217**), transformation de la civilité.
- `c9222a3`, `3c62ed8` — le queue worker sélectionne le canal via `canalTransmission`
  et lit les credentials depuis le canal de la borne.
- `8441830` — éditeur de formulaire back-office : `QuestionEditor` et `FormulaireEditorPage`.
- `c9c86a7` — build APK via `gradle/actions/setup-gradle@v4` : le dépôt ne contient
  que `gradlew.bat`, pas de wrapper Unix.
- `2226fa4` — `fetch-depth: 0` sur le job APK pour un `versionCode` monotone
  (`git rev-list --count HEAD`).
- `73f5c14` — alignement des tests CRM sur l'API `customContacts` + garde sur
  `deploy-backend`.

### Supprimé
- `b7585cc` — **suppression de `src/crm-module/`**, remplacé par le partage I-CRM
  asynchrone du backend (V2 Phase 8, `src/backend/src/services/queueWorker.js`).
  Les routes legacy `GET /api/submissions` et `PUT /api/submissions/:id/sync` sont
  conservées pour la rétrocompatibilité.

---

## [2.0.0-alpha] — 2026-05-06 → 2026-05-10 — Refonte V2

### Ajouté
- `a1c1a41` — **Estimer Mes Aides V2** : multi-bornes, formulaires dynamiques, auth
  multi-rôles (`SUPER_ADMIN` / `ADMIN_BORNE`), i18n FR/ES/EN, Pusher, back-office.
- `329d09f` — synchronisation frontend/backend + support du build Android.

### Corrigé
- `c50044b` — `vercel.json` pour le routing SPA du back-office.
- `a129f33` — `pusher` ajouté au `package-lock.json` (déploiement Railway).
- `24beb80` — `prisma generate` exécuté au build Railway.

### Interne
- `66ca842` — mises à jour V2 et nettoyage du projet.

---

## [1.0.0] — 2026-04-26 — V1 en production

Application mono-borne : formulaire figé à 15 étapes, module CRM de synchronisation,
WebView Android et iOS.

### Ajouté
- `071ba23` — **Phases 1 à 3** : backend API (Express + Prisma + Zod) et frontend WebView.
- `df040ab` — **Phase 5** : tests E2E Playwright + configurations de déploiement.
- `e14c093` — refonte UI avec icônes SVG inline et système de design ila26.
- `7c72d1a` — logo image, mise en page tablette paysage, finitions design.
- `bf1ca3f` — 6 améliorations du formulaire : select, grille, ville automatique,
  téléphone scindé, icônes, countdown.
- `1ebcd45` — `DialCodePicker` : liste complète des pays, icônes d'options, responsive.
- `27a17d7` — refonte `PhoneInput`, safe area Android, déploiement Railway/Vercel,
  WebView Android.
- `5dbe0df` — module CRM : export Excel + déploiement Vercel production.
- `10a5d16` — projet WebView **iOS** (SwiftUI + WKWebView).
- `55c70d0` — première version de `docs/DEPLOIEMENT.md`.

### Corrigé
- `17dc867` — `DialCodePicker` : drapeau + indicatif seuls, nom du pays retiré de la liste.
- `951b792` — module CRM : noms de champs Prisma en camelCase.

### Interne
- `471bd36` — résolution du conflit sur `README`.

---

## [0.1.0] — 2026-04-24

- `29c1201` — commit initial.

---

## Tags de déploiement

25 tags au 2026-09-02, tous au format `deploy-YYYYMMDD-HHMMSS-<sha>`, posés
automatiquement par le pipeline.

| Période | Nombre | Du … au … |
|---------|--------|-----------|
| 2026-05-13 → 2026-05-14 | 13 | `deploy-20260513-234223-c9c86a7` → `deploy-20260514-035206-dc210b9` |
| 2026-05-22 → 2026-05-23 | 11 | `deploy-20260522-235340-34ba4b1` → `deploy-20260523-064542-b8562e4` |
| 2026-05-24 | 1 | `deploy-20260524-055603-806b69c` |

Deux tags pointent sur le même commit `2226fa4` (`deploy-20260514-002324-2226fa4` et
`deploy-20260514-003056-2226fa4`) : deux exécutions successives du pipeline sans
nouveau commit entre les deux.

---

## Incident 2026-09 — diagnostic corrigé

Une version antérieure de ce fichier affirmait, hors historique git, que **« le projet
Supabase a été supprimé et le service Railway détaché »**. Sur les deux affirmations,
**une seule était vraie**.

| Affirmation d'origine | Verdict | Preuve |
|-----------------------|---------|--------|
| Projet Supabase supprimé | ❌ **FAUX** | base vivante, **19 tables** dans `information_schema`, 14 des 15 migrations appliquées |
| Service Railway détaché | ✅ **VRAI** | Railway abandonné ; backend migré sur Render |

### Le faux positif Supabase

Le constat de suppression reposait sur un **`NXDOMAIN`** lors de la résolution de
l'host Supabase depuis le poste d'audit. Ce `NXDOMAIN` venait d'une **panne DNS
locale**, pas d'une suppression côté Supabase. Re-mesuré le 2026-09-02 depuis
`src/backend` :

```
$ npx prisma migrate status
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-eu-north-1.pooler.supabase.com:5432"
15 migrations found in prisma/migrations
Following migration have not yet been applied:
20260902000000_fix_schema_drift_canaux_crmfieldids_borneid

$ SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
TABLES_PUBLIC=19
_prisma_migrations, admin_bornes, bornes, canaux, categories_question, configurations,
enregistrement_reponses, enregistrements, formulaire_versions, formulaires,
login_attempts, partage_jobs, questions, refresh_tokens, revoked_tokens,
sous_categories_question, submission_values, submissions, super_admins
```

**La base de production est vivante et son schéma est complet.** Aucune recréation de
base ne doit être lancée. Leçon retenue, inscrite dans la doc : un échec de résolution
DNS sur le poste d'audit ne prouve rien sur l'état du service distant — le verdict qui
fait foi est `npx prisma migrate status`.

### Ce qui a réellement changé

Le backend a quitté Railway pour **Render** :
**https://estimer-mes-aides-api.onrender.com** (service `estimer-mes-aides-api`,
plan free, région frankfurt). L'ancienne URL
`https://estimer-mes-aides-production.up.railway.app` est morte et ne doit plus être
réutilisée. Les deux frontends Vercel sont inchangés.

Le code n'a jamais été en cause. Procédure d'hébergement et pièges Render :
[docs/DEPLOIEMENT.md § Reprise après sinistre](docs/DEPLOIEMENT.md#reprise-après-sinistre).
