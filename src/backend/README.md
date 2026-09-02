# Backend — Estimer Mes Aides

API REST Node.js/Express déployée sur Render — https://estimer-mes-aides-api.onrender.com

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

## Variables d'environnement Render

Toutes les variables ci-dessous doivent être configurées dans le tableau de bord Render (**Service → Environment**).
Elles sont déclarées dans [`render.yaml`](./render.yaml) avec `sync: false` : aucune valeur de secret n'est versionnée dans le dépôt.

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
CORS_ALLOWED_ORIGINS=https://estimer-mes-aides.vercel.app,https://estimer-mes-aides-wjp3.vercel.app
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
| `PORT` | ⬜ | Port d'écoute (Render l'injecte automatiquement) |
| `NODE_ENV` | ✅ | Environnement (`production` en déploiement Render) — porté par `render.yaml` |
| `NODE_VERSION` | ✅ | Version Node (`20`) — portée par `render.yaml` |

## Health Check

Render vérifie l'état du service via `healthCheckPath` :

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

## Déploiement Render

Le service est décrit par le blueprint [`render.yaml`](./render.yaml) :

| Paramètre | Valeur |
|-----------|--------|
| Service | `estimer-mes-aides-api` (type `web`, runtime `node`) |
| URL | https://estimer-mes-aides-api.onrender.com |
| Région | `frankfurt` |
| Plan | `free` |
| Branche | `main` — auto-deploy à chaque commit (`autoDeployTrigger: commit`) |
| Root directory | `src/backend` |
| Build command | `npm ci` (déclenche le `postinstall` → `prisma generate`) |
| Start command | `npm run start:prod` (migrate deploy strict + `node server.js`) |
| Health check | `GET /health` |

### ⚠️ Mise en veille du plan free

Le plan `free` de Render **met le service en veille après 15 minutes sans trafic**.
La première requête suivante réveille l'instance : elle prend **environ 50 secondes**
avant d'obtenir une réponse (cold start).

Impact concret : **une borne tablette démarrée après une période creuse
(matin, retour de week-end) attendra ce délai** avant que l'API ne réponde —
chargement de la configuration, envoi d'une soumission, connexion au back-office.

C'est un **choix assumé** (coût nul). Aucun correctif n'est appliqué ici : ni changement
de plan, ni ping périodique. À prévoir côté client : écran d'attente explicite et
timeouts réseau supérieurs à 60 s.
