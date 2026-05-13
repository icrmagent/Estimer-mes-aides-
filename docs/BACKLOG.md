# BACKLOG — Items différés

> Liste des tâches identifiées mais non réalisées dans la session en cours, avec contexte, impact, effort estimé et plan de mise en œuvre.
> Chaque item porte une référence d'origine (`L1`, `U6`…) qui pointe vers le rapport d'audit du module concerné.

---

## Légende

- **Impact** : 🔴 critique · 🟠 élevé · 🟡 moyen · 🟢 faible
- **Effort** : `XS` (< 1h) · `S` (½ jour) · `M` (1-2 jours) · `L` (> 2 jours)
- **Risque** : niveau de risque de régression si livré sans tests dédiés

---

## Module : Partage I-CRM

### B-1 · `Borne.canalTransmission` → FK `canalActifId` (réf. L1)

- **Origine** : audit Partage I-CRM — section 2 § L1
- **Impact** : 🟠 élevé (robustesse)
- **Effort** : M
- **Risque** : moyen (migration + backfill obligatoires)

**Problème**
Aujourd'hui, le lien `Borne ↔ Canal` se fait par match de chaîne `Borne.canalTransmission == Canal.label`. Conséquences :
- Renommer un canal casse l'affectation silencieusement.
- Deux canaux avec le même label = comportement non déterministe.
- Pas de contrainte d'intégrité référentielle.

**Action**
1. Ajouter `Borne.canalActifId String?` + relation `canalActif Canal? @relation(fields: [canalActifId], references: [id], onDelete: SetNull, name: "borne_canal_actif")`.
2. Conserver `canalTransmission` temporairement (lecture seule, déprécié) pour ne pas casser les déploiements en cours.
3. Backfill : pour chaque borne, `canalActifId = Canal.findFirst({ borneId, label: canalTransmission })?.id`.
4. Migrer `PUT /api/partage/bornes/:id/canal` pour accepter `canalActifId` (chemin nouveau) + chemin legacy `canalTransmission` (durée 1 sprint).
5. Mettre à jour [queueWorker.js:201-214](../src/backend/src/services/queueWorker.js#L201) pour résoudre via la FK plutôt que par label.
6. Drop final de `canalTransmission` en migration N+2.

**Done quand**
- Le worker n'utilise plus `canalTransmission`.
- Le back-office n'affiche plus le champ texte libre.
- Migration `prisma migrate deploy` testée sur dump prod (dry-run).

---

### B-2 · Externaliser `FIELD_ID_MAP` du worker en DB (réf. L3)

- **Origine** : audit Partage I-CRM — section 2 § L3 (viole règle absolue #3 du `CLAUDE.md`)
- **Impact** : 🟠 élevé (perte silencieuse de données)
- **Effort** : M
- **Risque** : moyen (toucher au worker en prod)

**Problème**
[queueWorker.js:63-72](../src/backend/src/services/queueWorker.js#L63) hardcode 8 mappings CRM. Les field IDs `2294` (revenu fiscal) et `2293` (statut propriétaire) listés dans `CLAUDE.md` ne sont pas mappés → données perdues sans alerte. Le projet V2 est censé être 100% configurable depuis le back-office.

**Action**
1. Ajouter modèle Prisma :
   ```prisma
   model CrmFieldMapping {
     id            String   @id @default(uuid())
     canalId       String?  // null = mapping global
     crmFieldId    Int
     icrmFieldName String   // ex. "last_name"
     transform     String?  // optionnel, nom d'une fonction (civility|upper|…)
     createdAt     DateTime @default(now())
     @@index([canalId, crmFieldId])
   }
   ```
2. Page back-office `/superadmin/crm-mapping` : table CRUD avec preset par défaut (les 8 mappings actuels).
3. Le worker charge le mapping au démarrage du job (cacheable côté canal).
4. Audit : sur chaque enregistrement, logger les `crmFieldIds` non mappés (warn) plutôt que de les ignorer silencieusement.
5. Seed : injecter les 10 mappings réels du `CLAUDE.md` (dont 2293, 2294, 2306, 2307, 2296, 2298, 2300, 2301, 2302, 2303, 2304, 2305).

**Done quand**
- Aucun mapping CRM n'est plus hardcodé dans `queueWorker.js`.
- Toute question avec `crmFieldIds` non mappé déclenche un log `warn` exploitable.

---

### B-3 · Renommer `Canal.apiKey` → `refreshToken` + ajouter `tenantId`/`clientId`/`authUrl` (réf. L4)

- **Origine** : audit Partage I-CRM — section 2 § L4
- **Impact** : 🟡 moyen (lisibilité + multi-tenant)
- **Effort** : M
- **Risque** : moyen (migration + UI)

**Problème**
- `Canal.apiKey` est en réalité un **refresh token Azure AD** (cf. [queueWorker.js:28](../src/backend/src/services/queueWorker.js#L28)). Le nom prête à confusion.
- Les constantes `ICRM_AUTH_URL`, `ICRM_CLIENT_ID`, `ICRM_SCOPE`, `tenant Azure 8abd8e97-…` sont **hardcodées** dans le worker → mono-tenant alors que `Canal` est multi-instances.

**Action**
1. Migration : `ALTER TABLE canaux RENAME COLUMN api_key TO refresh_token`. Ajouter colonnes `tenant_id`, `client_id`, `auth_url`, `scope` (toutes nullable, avec valeurs par défaut backfillées sur les valeurs actuelles).
2. Adapter `canalSchema` ([canaux.js:11-18](../src/backend/src/routes/canaux.js#L11)) et la projection publique.
3. Mettre à jour `getValidToken` ([queueWorker.js:13-60](../src/backend/src/services/queueWorker.js#L13)) pour consommer `canal.authUrl`, `canal.clientId`, `canal.scope`, `canal.refreshToken`.
4. Adapter `CanalConfigModal` (le label "Refresh token Azure AD" est déjà en place ✅) — ajouter `tenantId`, `clientId`, `authUrl` comme champs avancés (collapsable).
5. Mettre à jour le placeholder front (`docs/DEPLOIEMENT.md` § secrets).

**Done quand**
- Aucune constante `ICRM_AUTH_URL`/`ICRM_CLIENT_ID`/`ICRM_SCOPE` dans le code.
- Deux canaux pointant vers deux tenants Azure différents fonctionnent en parallèle.

---

### B-4 · Worker distribué + endpoint `GET /api/partage/worker/health` (réf. L8)

- **Origine** : audit Partage I-CRM — section 2 § L8
- **Impact** : 🟡 moyen (observabilité + scaling)
- **Effort** : M-L
- **Risque** : élevé (toucher au traitement de file)

**Problème**
- `setInterval` in-process ([queueWorker.js:407](../src/backend/src/services/queueWorker.js#L407)). Si l'API crash, plus de worker, sans signal côté UI.
- Le guard `isRunning` est local au pod → si plusieurs pods backend tournent (scale horizontal), chaque pod processera les mêmes jobs en parallèle.
- Pas de visibilité côté UI sur "le worker est-il actif ?".

**Action**
1. Persister un heartbeat : table `WorkerHeartbeat { id, lastTickAt, processedCount }` mis à jour à chaque cycle.
2. Claim DB pour éviter le double-traitement : `UPDATE partage_jobs SET statut='en_cours', claimedBy='<podId>', claimedAt=NOW() WHERE id IN (...) AND statut='en_attente' RETURNING *`. Postgres supporte `SELECT … FOR UPDATE SKIP LOCKED` via Prisma raw.
3. Endpoint `GET /api/partage/worker/health` → `{ healthy, lastTickAt, lagSeconds, processedLast24h }`.
4. KPI card "Worker actif" sur [PartageJobsPage.jsx](../src/backoffice/src/pages/superadmin/PartageJobsPage.jsx) (rouge si `lagSeconds > 90`).
5. Récupération des jobs orphelins : si `claimedAt < NOW() - 5min`, relâcher en `en_attente`.

**Done quand**
- 2 instances backend tournent en parallèle sans double-traitement.
- L'UI affiche en temps réel la santé du worker.

---

### B-5 · Pagination effective sur jobs/enregistrements (réf. L7)

- **Origine** : audit Partage I-CRM — section 2 § L7
- **Impact** : 🟡 moyen (UX dégradée au-delà de 100 items)
- **Effort** : S
- **Risque** : faible

**Problème**
`limit=100` codé en dur ; `meta.total` affiché mais pas de navigation page. Au-delà de 100 jobs, l'admin ne peut pas agir sur les jobs invisibles.

**Action**
1. Ajouter `page`/`limit` dans l'état de [PartageJobsPage.jsx](../src/backoffice/src/pages/superadmin/PartageJobsPage.jsx).
2. Composant `Pagination` réutilisable dans `components/ui.jsx` (← / Page N de M / →).
3. Conserver le filtre statut + borne dans l'URL (query string) pour deep-linking.

---

### B-6 · Réparer ou supprimer les tests Jest obsolètes du queueWorker

- **Origine** : observation pendant la session (4 tests préexistants en échec)
- **Impact** : 🟡 moyen (CI faussement rouge)
- **Effort** : S
- **Risque** : faible

**Problème**
- [tests/queueWorker.test.js](../src/backend/tests/queueWorker.test.js) et [tests/services/queueWorker.test.js](../src/backend/tests/services/queueWorker.test.js) attendent encore l'ancienne URL `crm-test.example.com/api/submissions` et `x-api-key` alors que le code appelle `/api/customContacts?lang=fr` avec `Authorization: Bearer …`.
- Le test "Erreur réseau" reçoit `"Données insuffisantes : Nom et Prénom requis"` au lieu de `"Network error"` — le mock ne fournit pas les champs requis désormais.
- 4 tests / 22 échouent, pollue les rapports CI.

**Action**
1. Mettre à jour les mocks pour fournir un `enregistrement` avec `reponses` valides (au moins `last_name` + `first_name`).
2. Adapter l'URL attendue à `${apiUrl}/api/customContacts?lang=fr`.
3. Adapter le header attendu à `Authorization: Bearer ${token}`.
4. Couvrir le nouveau cas `B-4` (claim DB) si livré.

---

### B-7 · Annulation d'un job en attente / en cours

- **Origine** : audit Partage I-CRM — observation supplémentaire
- **Impact** : 🟢 faible (action manuelle rare)
- **Effort** : XS
- **Risque** : faible

**Action**
Endpoint `DELETE /api/partage/jobs/:id` → passe le job en `annule` (nouveau statut) sans le supprimer. Bouton "Annuler" dans la table jobs.

---

## Section : Hygiène code

### B-8 · Décrire des index Prisma manquants

- **Impact** : 🟢 faible (performance modérée)
- **Effort** : XS

Ajouter `@@index([statut, updatedAt])` sur `PartageJob` pour accélérer l'endpoint stats récemment introduit (`B-1.6` du module Partage).

---

## Comment instruire ce backlog

- Toute nouvelle session de correction sur le module Partage I-CRM doit relire ce fichier avant de commencer.
- Quand un item est terminé, le déplacer en bas de fichier sous une section `## Archivés` avec la date et le commit/PR.
- Ne pas dépiler un item B-2 ou B-3 sans planifier la migration Prisma + backfill associés.

---

*Créé le 2026-05-13 — issu de l'audit du module "Partage I-CRM".*
