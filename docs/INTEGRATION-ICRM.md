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
- Contrat de référence : **v1**, partagé avec l'implémentation I-CRM.

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
| `created_at`, `langue` | date de soumission (ISO-8601), `fr` / `es` / `en` |
| `formulaire` | `id`, `version` figée à la soumission, `label` |
| `borne` | `id`, `id_borne`, `pays`, `adresse`, `commercant`, `regie`, `installateur` |
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
- Les avertissements renvoyés par I-CRM (`unmapped_field`, `unmatched_option`) sont journalisés
  (codes, field IDs, libellés — jamais les valeurs) ; I-CRM les recopie aussi en commentaire de l'opportunité.

⚠️ **Premier envoi = tout l'historique.** « Mettre en file d'attente » reprend **tous** les
enregistrements non partagés de la borne (tests, sessions abandonnées, doublons hors-ligne).
Faire le tri avant le premier lancement sur une borne de production.

## 6. Sécurité

- Le secret est stocké dans `canaux.token` (comme les jetons Azure AD) et n'est **jamais** renvoyé
  par l'API : la projection publique expose `type`, `hasApiKey`, `hasToken` et `apiKeyId`
  (l'identifiant `emak_…`, public par construction).
- Ni le secret ni les valeurs saisies par les visiteurs ne sont journalisés (RGPD).
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
