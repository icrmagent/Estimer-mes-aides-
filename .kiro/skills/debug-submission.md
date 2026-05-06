# Skill — Déboguer une soumission / enregistrement

## Quand utiliser ce skill
Quand une soumission V1 ou un enregistrement V2 ne s'enregistre pas, ne se synchronise pas, ou a des données incorrectes.

---

## Diagnostic V2 — Enregistrements

### 1. Vérifier via l'API back-office
```bash
# Login SuperAdmin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@estimer-mes-aides.fr", "password": "Admin2026!"}'
# → Copier le token

# Lister les enregistrements en attente de partage CRM
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/enregistrements?statutPartage=en_attente"

# Vérifier les jobs de partage en échec
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/partage/jobs?statut=echec_definitif"
```

### 2. Vérifier via MCP PostgreSQL (si connecté)
```sql
-- Enregistrements récents
SELECT id, "borneId", "statutPartage", "tentatives", "createdAt"
FROM enregistrements
ORDER BY "createdAt" DESC
LIMIT 10;

-- Jobs de partage en attente
SELECT id, "enregistrementId", statut, tentatives, "prochainEssai"
FROM partage_jobs
WHERE statut != 'succes'
ORDER BY "createdAt" DESC;

-- Borne et formulaire d'un enregistrement
SELECT e.id, b."idBorne", f.label, e."langueUtilisee", e."statutPartage"
FROM enregistrements e
JOIN bornes b ON e."borneId" = b.id
JOIN formulaires f ON e."formulaireId" = f.id
ORDER BY e."createdAt" DESC LIMIT 5;
```

### 3. Relancer un job en échec
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/partage/jobs/<JOB_ID>/relancer"
```

---

## Diagnostic V1 — Soumissions

### 1. Vérifier la soumission en base
```bash
# Via Prisma Studio
cd src/backend && npx prisma studio
```

### 2. Tester l'endpoint manuellement
```bash
# Health check
curl https://estimer-mes-aides-production.up.railway.app/health

# Créer une soumission de test
curl -X POST https://estimer-mes-aides-production.up.railway.app/api/submissions \
  -H "Content-Type: application/json" \
  -H "x-api-key: ema_mobile_3eab3e46c484e94b06ba6f8cf8d9e0e6" \
  -d '{
    "configVersion": "1.0.0",
    "values": [
      {"fieldId": 2087, "value": "Dupont"},
      {"fieldId": 2088, "value": "Jean"},
      {"fieldId": 2089, "value": "75001"},
      {"fieldId": 2090, "value": "Paris"}
    ]
  }'
```

### 3. Vérifier les soumissions non synchronisées (CRM V1)
```bash
cd src/backend && node scripts/generate-crm-jwt.js
# Copier le token, puis :
curl -H "Authorization: Bearer <TOKEN>" \
  "https://estimer-mes-aides-production.up.railway.app/api/submissions?synced=false"
```

---

## Problèmes courants

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| 401 sur POST /submissions | Mauvaise API key | Vérifier `x-api-key` header |
| 401 sur routes V2 | JWT manquant ou expiré | Re-login via POST /api/auth/login |
| 403 sur routes V2 | Mauvais rôle JWT | Vérifier `role` dans le payload JWT |
| 400 sur POST /enregistrements | Body invalide | Vérifier borneId, formulaireId (UUID valides) |
| statutPartage reste en_attente | queueWorker pas démarré | Vérifier que server.js démarre le worker |
| Config borne non chargée | JWT AdminBorne expiré | Re-login sur la borne |
| Enregistrement offline perdu | IndexedDB non synchronisé | Vérifier useOfflineSync hook |
| 422 sur publication formulaire | Question sans libellé FR | Ajouter libelleQuestion.fr à toutes les questions |

## Vérifier le queueWorker
```bash
# Le worker doit être démarré dans server.js
# Vérifier les logs Railway pour les messages [QUEUE WORKER]
# Logs locaux : cd src/backend && npm run dev
```

## Logs Railway
https://railway.com/project/c33e8de1-9d45-40d2-9a53-6a865dce2b70
