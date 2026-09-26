# INTEGRATION-ICRM.md — Partage des enregistrements vers I-CRM par clé API

> Canal de type **« Clé API I-CRM »** (`icrm_api_key`), ajouté le 2026-09-25.
> Chaque enregistrement d'une borne devient une **opportunité** du sous-type
> **BORNE TACTILE** dans le tenant I-CRM lié à la clé (avec son contact).
> Le canal historique **« Azure AD (ancien) »** (`azure_ad`) reste disponible et inchangé.

---

## 1. Principe

```
[Borne] --POST /api/enregistrements--> [Backend EMA] --PartageJob--> [queue worker, 30 s]
                                                                        |
        POST {URL API}/api/external/estimer-mes-aides/v1/enregistrements
        X-Api-Key: emak_…   X-Api-Secret: …   Idempotency-Key: <id enregistrement>
                                                                        v
                                   [I-CRM] crée contact + opportunité BORNE TACTILE
```

- **Push** : le worker EMA envoie ; I-CRM ne vient jamais lire EMA.
- La clé est émise **par I-CRM, pour un tenant** : l'entreprise, le sous-type, l'utilisateur
  de service et l'étape du pipeline sont liés **côté I-CRM** à la clé. EMA n'envoie ni
  identifiant de tenant, ni de sous-type, ni d'utilisateur.
- EMA envoie **toutes les réponses** (et plus seulement l'identité, comme le canal Azure AD) :
  I-CRM résout les field IDs du formulaire (ids CAE España 2087…2307) vers les champs du
  tenant et signale en avertissement ce qu'il n'a pas pu mapper.
- Contrat de référence : **v1** + addendum **v1.1** (widget « Borne » → « Info borne », §4.1),
  partagé avec l'implémentation I-CRM.

## 2. Cibles de production

| Borne (pays) | Tenant I-CRM | URL API à saisir dans le canal |
|--------------|--------------|--------------------------------|
| France (`FR`) | **LENA** | `https://icrm.api.ila26.fr` |
| Espagne (`ES`) | **CAE España** | `https://icrm.api.es.ila26.com` |

L'URL est l'URL **de base, sans `/api`** (un `/api` ou un `/` final saisi par erreur est retiré
automatiquement). `https` est obligatoire (seul `http://localhost` est toléré, pour le développement).

## 3. Configurer un canal (back-office)

Prérequis : la clé API et son secret, délivrés par un administrateur I-CRM pour le tenant visé.
Le secret n'est affiché **qu'une fois** par I-CRM : le transmettre par un canal sûr, jamais par e-mail en clair.

1. Menu **Partage CRM** → sélectionner la **borne**.
2. **+ Ajouter un canal**.
3. **Type d'authentification** : `Clé API I-CRM (recommandé)` (valeur par défaut).
4. **Label du canal** : ex. `icrm-lena-prod` / `icrm-cae-prod` (sert à l'affectation borne ↔ canal).
5. **URL API I-CRM** : voir le tableau §2, selon le pays de la borne.
6. **Clé API (X-Api-Key)** : `emak_` suivi de 24 caractères alphanumériques.
7. **Secret (X-Api-Secret)** : 48 caractères alphanumériques (champ masqué, bouton 👁 pour vérifier la saisie).
8. Laisser **Canal actif** et **Affecter ce canal à la borne** cochés → **Créer et affecter**.
9. Dans le tableau « Canaux I-CRM », cliquer **Tester** : le message doit afficher
   **`Connecté à LENA · sous-type BORNE TACTILE (#…)`** (ou `CAE España`). Vérifier que le tenant
   correspond bien au pays de la borne **avant** de mettre des enregistrements en file.
   « Réponse inattendue (HTTP 200) : l'URL ne pointe pas vers l'API I-CRM » = l'URL saisie est
   celle de l'**application** (ex. `https://icrm.ila26.fr/projects`, qui répond une page HTML à
   tout chemin) et non celle de l'API : corriger l'URL (§2).

Un canal appartient à **une** borne : pour N bornes du même tenant, créer N canaux avec la même
clé et le même secret.

Le tableau affiche, pour un canal par clé API, le type « Clé API I-CRM » et l'**identifiant de
clé** (non secret). Le secret n'est **jamais** renvoyé par l'API ni réaffiché.

### Rotation du secret

**Modifier** le canal → saisir le nouveau secret (laisser la clé telle quelle) → **Enregistrer** →
**Tester**. Un champ laissé vide n'est pas modifié.

### Nouvelle clé

I-CRM émet toujours une nouvelle clé **avec un nouveau secret** (la rotation, elle, ne change que
le secret). Remplacer la clé d'un canal impose donc de saisir aussi le secret émis avec elle :
le back-office et l'API (`PUT /api/canaux/:id`, 400) refusent une nouvelle clé sans secret, qui
donnerait `401 invalid_credentials` sur chaque envoi.

### Passer un canal Azure AD existant en clé API

**Modifier** → Type `Clé API I-CRM (recommandé)` → saisir la nouvelle URL (§2), la clé **et** le
secret (obligatoires lors d'un changement de type) → **Enregistrer** → **Tester**.

## 4. Données transmises

Corps de `POST /enregistrements` (voir `buildIcrmEnregistrementPayload` dans
`src/backend/src/services/queueWorker.js`) :

| Champ | Contenu |
|-------|---------|
| `external_id` | UUID de l'enregistrement EMA (clé d'idempotence, aussi dans `Idempotency-Key`) |
| `created_at` | **toujours envoyé** (v1.1) : `enregistrement.createdAt` en ISO-8601 UTC (`2026-09-25T10:42:17.311Z`). Sans date valide, l'envoi est refusé en échec définitif (cas impossible en base : colonne `NOT NULL`) |
| `langue` | `fr` / `es` / `en` (autre valeur : omise) |
| `formulaire` | `id`, `version` figée à la soumission, `label` — coupés à 128 / 64 / 255 caractères |
| `borne` | `id`, `id_borne`, `pays`, `adresse`, `commercant`, `regie`, `installateur` — coupés à 128 / 128 / 8 / 500 / 500 / 500 / 500 caractères (longueurs du contrat : un I-CRM antérieur refusait tout le lead au-delà, 422 définitif ; I-CRM coupe lui aussi désormais) |
| `borne.admin` (v1.1) | AdminBorne propriétaire de la borne : `nom`, `prenom`, `email`, `raison_sociale`, `siret`. Absent si la borne n'a pas d'admin (borne du SuperAdmin) ; membres vides omis, e-mail mal formé ou valeur > 255 caractères omis (un 422 ferait perdre le lead) |
| `contact` | civilité, nom, prénom, adresse, code postal, ville, téléphone, e-mail (même correspondance que le canal historique : field IDs 2262/2087/2088/2217/2089/2090/2015/2016, puis libellé FR) |
| `reponses[]` | `question_id`, `libelle` (FR), `type`, `crm_field_ids`, `valeur` (brute), `valeur_libelles` |

`valeur_libelles` : pour une question à choix, libellé de chaque option choisie =
`crmValue` de l'option, sinon `label.fr`, sinon le libellé dans la langue de la borne, sinon
l'identifiant de l'option (choix multiples séparés par `", "`). Pour une question texte : `[valeur]`.
Les réponses vides et les champs facultatifs non renseignés ne sont pas envoyés.

Bloc `contact` — contraintes d'I-CRM appliquées avant l'envoi (un refus `422 validation_failed`
serait définitif et ferait perdre tout le lead) :

- e-mail : format vérifié et mis en minuscules ; un e-mail invalide est **retiré du contact** ;
- téléphone et code postal : normalisés (E.164, format du pays de la borne) quand ils sont
  valides, sinon envoyés tels quels (I-CRM n'en contrôle que la longueur) ;
- longueurs maximales : civilité 32, code postal 20, téléphone 64, autres champs 255 ; une valeur
  plus longue (ex. question « groupée » saisie en un seul bloc) est retirée du contact.

Une valeur retirée du contact **reste transmise dans `reponses[]`** (I-CRM la mappe ou la recopie
en commentaire de l'opportunité) ; le worker journalise le nom du champ et le motif, jamais la valeur.
Seules les questions reconnues par libellé ou groupées sont concernées : celles qui portent un
field ID unique (2089/2015/2016) ou un type `email`/`telephone` sont déjà validées à la soumission.

### 4.1 Widget « Borne » → « Info borne » dans I-CRM (contrat v1.1)

I-CRM range les informations de la borne et de l'enregistrement dans un widget **« Borne »**,
sous-widget **« Info borne »** (en espagnol « Terminal » → « Info terminal »), ajouté à la fin de
l'onglet du sous-type BORNE TACTILE qui porte les questions EMA (CAE España : onglet 22
« ESTIMER VOS AIDES » ; LENA : son clone). Les 14 champs remplis, clés identiques dans chaque tenant :

| # | Champ I-CRM | Clé | Type | Source EMA |
|---|-------------|-----|------|------------|
| 1 | ID borne | `projets_ema_id_borne` | Texte | `borne.id_borne` (`Borne.idBorne`) |
| 2 | Adresse de la borne | `projets_ema_adresse_borne` | Texte | `borne.adresse` |
| 3 | Pays de la borne | `projets_ema_pays_borne` | Texte | `borne.pays` |
| 4 | Commerçant | `projets_ema_commercant` | Texte | `borne.commercant` |
| 5 | Régie | `projets_ema_regie` | Texte | `borne.regie` |
| 6 | Installateur | `projets_ema_installateur` | Texte | `borne.installateur` |
| 7 | Admin borne | `projets_ema_admin_borne` | Texte | `borne.admin.prenom`, une espace, `borne.admin.nom` (ex. « Claire LEFEBVRE ») |
| 8 | Email admin borne | `projets_ema_admin_email` | Texte | `borne.admin.email` |
| 9 | Entreprise admin borne | `projets_ema_admin_raison_sociale` | Texte | `borne.admin.raison_sociale` (`AdminBorne.raisonSociale`) |
| 10 | SIRET admin borne | `projets_ema_admin_siret` | Texte | `borne.admin.siret` |
| 11 | Date et heure de l'enregistrement | `projets_ema_date_enregistrement` | Date et temps | `created_at` (UTC, converti par I-CRM en heure locale du tenant) |
| 12 | Langue utilisée | `projets_ema_langue` | Texte | `langue` (`Enregistrement.langueUtilisee`) |
| 13 | Formulaire | `projets_ema_formulaire` | Texte | `formulaire.label`, « v », `formulaire.version` (ex. « Estimer mes aides v1.3.0 ») |
| 14 | Référence enregistrement EMA | `projets_ema_ref_enregistrement` | Texte | `external_id` (id de l'enregistrement) |

- **Rien à configurer côté EMA** : le worker envoie ces données avec chaque enregistrement (canal
  clé API uniquement ; le canal Azure AD n'envoie que le contact). Les champs sont créés par I-CRM
  (« provisioning ») à l'émission de la clé, ou à la demande
  (`POST /api/admin/external-api-clients/{id}/provision-borne-fields`,
  `php artisan external-api:provision-borne-fields`).
- Une valeur absente côté EMA n'est pas écrite : borne sans régie → « Régie » vide ; borne sans
  AdminBorne (borne du SuperAdmin) → champs 7 à 10 vides.
- Champ absent (tenant non provisionné, ou widget « Borne » absent des onglets du sous-type — I-CRM
  ne cherche les clés que parmi les champs **affichés** pour le sous-type) : I-CRM recopie la valeur
  dans le commentaire de l'opportunité (si le commentaire est activé sur la clé) et renvoie
  l'avertissement `{ "code": "borne_field_missing", "key": "projets_ema_…", "value": "…" }` ; le
  worker journalise le code et la clé, **jamais la valeur**. Le commentaire n'est plus écrit que pour
  ce qui n'a pas de champ (réponses non mappées, options non reconnues, champs « Info borne »
  absents).
- Un texte qui commence par `=` est écrit par I-CRM avec le sosie `＝` (jamais une formule dans les
  exports Excel du CRM) ; `<` `>` deviennent `‹` `›`.
- Le bloc `borne.admin` contient des données personnelles (nom, e-mail, SIRET de l'AdminBorne) :
  il n'est jamais journalisé par EMA.
- Rétrocompatible : un I-CRM antérieur à la v1.1 ignore `borne.admin`.

### 4.2 Options du formulaire ↔ options du tenant I-CRM

Pour une question à choix, I-CRM cherche l'option du champ cible qui correspond au premier
`valeur_libelles`, en ignorant accents, casse, espaces, typographie (’, tiret insécable) et le
préfixe « N- » (chiffres, tiret collé, espace : « 2- 71 à 120 m2 » ≡ « 71 à 120 m2 » ; une plage
comme « 70-100 m2 » n'est pas une numérotation). Sans correspondance, le libellé brut est stocké, l'avertissement `unmatched_option`
est renvoyé et la valeur est recopiée en commentaire : rien n'est perdu, mais le champ ne porte pas
une option du tenant (filtres, exports).

Seed (`src/backend/prisma/seed.js`) comparé aux options de CAE España (onglet 22, relevé du
2026-09-25) : 48 options sur 53 reconnues.

| Field | Option EMA | Situation | Action |
|-------|------------|-----------|--------|
| 2294 Revenu | « 4- Supérieur à 42 849 € » | le tenant dit « 4- Sup à 42849€ » (abréviation, jamais reconnue) | **seed aligné** : `crmValue` = `4- Sup à 42849€` ; libellé affiché et id d'option inchangés |
| 2301 Chauffage | « Autre » | aucune option « Autre » dans le tenant (le texte libre va dans 2302) | non alignable côté EMA : ajouter l'option « Autre » au champ 2301 dans I-CRM, ou accepter l'avertissement |
| 2306 Date de construction | « 1- Entre 2 ans et 15 ans », « 2- Plus de 15 ans » | champ « Option unique » **sans aucune option** dans le tenant | non alignable côté EMA : recréer ces deux options sur le champ 2306 dans I-CRM |
| 2262 Civilité | « Mr. », « Mme » | champ Texte dans le tenant (pas d'options) | rien à faire : I-CRM normalise en `Mr` / `Mme` |

⚠️ **Production : le seed n'est pas rejoué.** Le formulaire de production garde les options avec
lesquelles il a été créé. À vérifier dans le back-office avant la mise en service, question
« À combien s'élève le revenu total de votre foyer fiscal » (field 2294), option 4 :

- la valeur envoyée est le `crmValue` de l'option s'il existe (invisible dans le back-office,
  lisible dans `GET /api/formulaires/:id` → `questions[].options[].crmValue`), sinon le libellé FR ;
- **enregistrer une question dans le back-office supprime les `crmValue` de ses options** (le schéma
  de `PUT /api/formulaires/:id/questions/:qid` ne les connaît pas) : c'est alors le libellé FR qui
  part, reconnu pour toutes les options sauf « Supérieur » ≠ « Sup » ;
- correction côté EMA : libellé FR de l'option 4 = « 4- Sup à 42 849 € », puis **Enregistrer**
  (la clé de comparaison devient celle du tenant) ; ou, côté I-CRM, renommer l'option du tenant —
  à éviter : les opportunités existantes portent le libellé actuel ;
- après les premiers envois réels, contrôler les journaux `[QUEUE] I-CRM a signalé…` :
  un `unmatched_option` sur `crm_field_ids` 2294, 2301 ou 2306 signale une option non alignée.

## 5. Réponses I-CRM et réessais

| Réponse I-CRM | Effet dans EMA |
|---------------|----------------|
| **2xx** (`201 created`, `200 already_processed`) avec `status` et `projet_id` | succès : enregistrement `partage`, `crmProjetId` / `crmProjetRef` enregistrés |
| **2xx sans le corps du contrat** (page HTML d'un front, page de proxy, autre API) | **échec définitif** « réponse non conforme au contrat — vérifier l'URL API » : l'enregistrement n'est **jamais** marqué `partage` sans preuve de l'opportunité ; corriger l'URL puis relancer (idempotent) |
| **2xx dont le corps n'a pas pu être lu** (flux coupé, délai de 30 s) | **échec temporaire** : nouvel essai automatique (I-CRM répondra `200 already_processed` si l'opportunité a été créée) |
| **401, 403, 404, 413, 422**, redirection 3xx | **échec définitif immédiat** (`echec_definitif`, aucun réessai) ; l'erreur contient le code I-CRM (`invalid_credentials`, `client_disabled`, `insufficient_identity`…) et le `request_id` |
| **408, 409, 429, 5xx**, erreur réseau, délai de 30 s dépassé | **échec temporaire** : réessai avec le backoff existant (2, 4, 8, 16 min + aléa), échec définitif à la 5ᵉ tentative |

- Un envoi est **idempotent** : si EMA renvoie un enregistrement déjà reçu (timeout après
  enregistrement côté I-CRM, relance manuelle), I-CRM répond `200 already_processed` sans créer de doublon.
- `422 insufficient_identity` : I-CRM exige au moins un nom, prénom, téléphone ou e-mail. Les
  sessions abandonnées sans identité finissent donc en échec définitif, sans réessai.
- Après correction (clé, secret, URL), relancer depuis **Partage CRM** : bouton **Relancer** d'un job,
  ou **Mettre en file d'attente** pour toute la borne.
- Les avertissements renvoyés par I-CRM (`unmapped_field`, `unmatched_option`, `borne_field_missing`)
  sont journalisés (codes, field IDs, libellés, clé du champ « Info borne » — jamais les valeurs) ;
  I-CRM recopie les valeurs concernées en commentaire de l'opportunité, sauf si le commentaire est
  désactivé sur la clé (`comment_enabled: false`) : la valeur n'est alors que dans l'avertissement
  (`value`, jamais journalisé par EMA) et dans l'enregistrement EMA.
- Forme des avertissements (contrat §2.3, errata §5) : `{ code, crm_field_ids, libelle, value }`
  pour `unmapped_field` / `unmatched_option` ; `{ code, key, value }` pour `borne_field_missing`.

⚠️ **Premier envoi = tout l'historique.** « Mettre en file d'attente » reprend **tous** les
enregistrements non partagés de la borne (tests, sessions abandonnées, doublons hors-ligne).
Faire le tri avant le premier lancement sur une borne de production.

## 6. Sécurité

- Le secret est stocké dans `canaux.token` (comme les jetons Azure AD) et n'est **jamais** renvoyé
  par l'API : la projection publique expose `type`, `hasApiKey`, `hasToken` et `apiKeyId`
  (l'identifiant `emak_…`, public par construction).
- Ni le secret, ni les valeurs saisies par les visiteurs, ni les données de l'AdminBorne (bloc
  `borne.admin`) ne sont journalisés (RGPD). Le worker ne lit de l'AdminBorne que `nom`, `prenom`,
  `email`, `raisonSociale` et `siret` (jamais `passwordHash`).
- Les redirections HTTP ne sont **pas suivies** : le secret ne part jamais vers un autre hôte.
- Aucun appel à Azure AD pour ce type de canal.

## 7. Base de données — migration

`src/backend/prisma/migrations/20260925000000_canal_type_icrm_api_key/migration.sql` —
**additive et idempotente** :

```sql
ALTER TABLE "canaux" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'azure_ad';
ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmProjetId" TEXT;
ALTER TABLE "enregistrements" ADD COLUMN IF NOT EXISTS "crmProjetRef" TEXT;
```

- Les canaux existants prennent `azure_ad` : **aucun changement de comportement** tant qu'aucun
  canal `icrm_api_key` n'est créé.
- Appliquée automatiquement au déploiement (`prisma migrate deploy` : job `migrate` de
  `.github/workflows/deploy.yml` puis `npm run start:prod` sur Render). Vérification :
  `cd src/backend && npx prisma migrate status`.

## 8. Vérifier en local

```bash
cd src/backend
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --forceExit \
  tests/lib/icrmApiKey.test.js tests/services/queueWorker.icrmApiKey.test.js tests/routes/canaux.test.js
cd ../backoffice && npx vitest run src/components/forms
```
