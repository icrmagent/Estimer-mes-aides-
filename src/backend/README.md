# Backend — Estimer Mes Aides

API REST Node.js/Express déployée sur Railway.

## Démarrage local

```bash
npm install
cp .env.example .env   # remplir les valeurs
npx prisma migrate deploy
npm run dev            # port 3000
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (nodemon) |
| `npm start` | Démarrage simple (`node server.js`) |
| `npm run start:prod` | Production : migrate + démarrage |
| `npm test` | Suite de tests Jest (72+ tests) |
| `npm run prisma:seed` | Seed SuperAdmin + formulaire + borne démo |
| `npm run prisma:migrate` | Créer une nouvelle migration |
| `npm run prisma:deploy` | Appliquer les migrations en production |

## Variables d'environnement Railway

Toutes les variables ci-dessous doivent être configurées dans le tableau de bord Railway (**Settings → Variables**).

### Base de données

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | ✅ | URL de connexion PostgreSQL avec pool (`?connection_limit=10`) |
| `DIRECT_URL` | ✅ | URL directe PostgreSQL (sans pooler — utilisée par Prisma Migrate) |

Exemple :
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?connection_limit=10
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
```

### Authentification & Sécurité

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `JWT_SECRET` | ✅ | Secret JWT (minimum 32 caractères) — générer avec `openssl rand -hex 32` |
| `API_KEY_MOBILE` | ✅ | Clé API pour les bornes (header `x-api-key`) |
| `API_KEY_CRM` | ✅ | Clé API pour le module CRM V1 |

### CORS

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `CORS_ALLOWED_ORIGINS` | ✅ | Liste des origines autorisées, séparées par des virgules |

Exemple :
```
CORS_ALLOWED_ORIGINS=https://estimer-mes-aides.vercel.app,https://backoffice.estimer-mes-aides.vercel.app
```

> En développement (`NODE_ENV=development`), toutes les origines sont autorisées (`*`).  
> En production (`NODE_ENV=production`), seules les origines listées sont acceptées.

### Pusher WebSocket (temps réel)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `PUSHER_APP_ID` | ✅ | ID de l'application Pusher Channels |
| `PUSHER_KEY` | ✅ | Clé publique Pusher |
| `PUSHER_SECRET` | ✅ | Secret Pusher (côté serveur uniquement) |
| `PUSHER_CLUSTER` | ✅ | Cluster Pusher (ex : `eu`) |

### CRM externe (partage asynchrone)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `CRM_API_URL` | ✅ | URL de base de l'API CRM V1 |
| `CRM_API_KEY` | ✅ | Clé API CRM (même valeur que `API_KEY_CRM`) |

### Redis (cache & sécurité)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `REDIS_URL` | ✅ | URL Redis (ex : `redis://default:[PASSWORD]@[HOST]:6379`) |

> Redis est requis en production pour la liste noire JWT, la protection brute-force et le cache de réponses (ADR-3).

### Seed SuperAdmin

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SUPERADMIN_EMAIL` | ✅ | Email du premier SuperAdmin (créé par le seed) |
| `SUPERADMIN_PASSWORD_TEMP` | ✅ | Mot de passe temporaire du SuperAdmin |

### Sentry (monitoring — optionnel)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SENTRY_DSN` | ⬜ | DSN Sentry pour le suivi des erreurs en production |

> Si `SENTRY_DSN` n'est pas défini, Sentry est désactivé silencieusement.

### Serveur

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `PORT` | ⬜ | Port d'écoute (Railway l'injecte automatiquement) |
| `NODE_ENV` | ✅ | Environnement (`production` en déploiement Railway) |

## Health Check

Railway vérifie l'état du service via :

```
GET /health
```

Réponse attendue (HTTP 200) :
```json
{
  "status": "ok",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "db": "ok",
  "sentry": "enabled"
}
```

Si la base de données est inaccessible, `status` passe à `"degraded"` et `db` à `"error"`.

## Déploiement Railway

La configuration de déploiement est dans [`railway.json`](./railway.json) :

- **Builder** : Nixpacks
- **Start command** : `npm run start:prod` (migrate + démarrage)
- **Health check** : `GET /health` — timeout 30s
- **Restart policy** : `ON_FAILURE` — max 3 tentatives
