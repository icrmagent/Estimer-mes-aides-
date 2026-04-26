# OPTIMIZATION.md — Optimisation Tokens & Performance

## Section 1 — Optimisation des tokens Claude Code

### Principes généraux
Chaque session Claude Code coûte des tokens. Ces règles minimisent le gaspillage.

---

### 📏 Règle 1 — Contexte minimal par demande

**❌ Trop de contexte (gaspille des tokens)**
```
"Peux-tu me créer tout le frontend, le backend, et la synchronisation CRM en une fois ?
Je veux que tu lises tous les fichiers et que tu génères tout le code du projet."
```

**✅ Contexte ciblé (efficace)**
```
"Crée uniquement le composant RadioGroup selon DESIGN.md.
Props : { field, value, onChange }. Fichier : src/components/RadioGroup/index.jsx."
```

**Règle** : Une demande = une tâche = un fichier ou une fonction.

---

### 📏 Règle 2 — Référencer les docs plutôt que de répéter

**❌ Copier-coller les tokens CSS dans chaque demande**
```
"Utilise la couleur #5C2DD3, le radius de 16px, les shadows 0 2px 12px rgba(92,45,211,0.10), 
la font DM Sans, les touch targets de 48px..."
```

**✅ Référencer DESIGN.md**
```
"Applique les tokens de docs/DESIGN.md. Couleur primaire #5C2DD3."
```

---

### 📏 Règle 3 — Ne pas régénérer ce qui existe

Avant toute demande de création, vérifier :
```
"Existe-t-il déjà un composant similaire dans src/components/ ?"
```

Si oui, demander une **modification** plutôt qu'une **création**.

---

### 📏 Règle 4 — Prompt court et précis pour les tâches simples

| Tâche | Prompt optimal |
|-------|---------------|
| Corriger un bug | "Ligne 42 de RadioGroup.jsx : la valeur onChange ne passe pas le bon ID. Fixe-le." |
| Ajouter une prop | "Ajoute la prop `disabled` au composant Button (src/components/Button)." |
| Écrire un test | "Écris 3 tests Vitest pour validateStep() dans src/utils/validation.js." |
| Refactorer | "Extrait la logique de cache localStorage dans un hook useLocalStorage." |

---

### 📏 Règle 5 — Travailler par phases (voir PLAN.md)

Ne jamais sauter une phase. Valider chaque phase avant la suivante.
Moins de dette technique = moins de tokens pour corriger.

---

### 📏 Règle 6 — Réutilisation des prompts COMMANDS.md

Les commandes dans COMMANDS.md sont pré-optimisées. Les utiliser telles quelles.
Elles contiennent exactement le contexte nécessaire, ni plus ni moins.

---

### 📏 Règle 7 — Batch les petites tâches

**❌ 5 sessions séparées pour 5 petites modifications**
```
Session 1 : "Ajoute un spinner au bouton Suivant"
Session 2 : "Change la couleur du header"
Session 3 : "Ajoute un message d'erreur sous le champ email"
...
```

**✅ Une session groupée**
```
"Effectue ces 5 modifications dans le frontend :
1. Spinner sur bouton Suivant pendant les appels API
2. Header : background #5C2DD3 → gradient #5C2DD3 to #4A1FAF
3. Champ email : validation format (regex) + message d'erreur
4. Progress bar : animation smooth transition
5. Textarea : resize: none (pas de redimensionnement manuel)
Modifie les fichiers concernés, pas besoin de tout régénérer."
```

---

## Section 2 — Performance de l'Application

### Frontend — Optimisations WebView

#### Bundle size (critique pour WebView)
```javascript
// vite.config.js — optimisations
export default {
  build: {
    rollupOptions: {
      output: {
        // Code splitting par route
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'form-logic': ['./src/context/FormContext', './src/hooks/useFormConfig'],
        },
      },
    },
    // Minification agressive
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
    },
  },
};
```

#### Lazy loading des pages
```javascript
// Dans App.jsx — charger les pages à la demande
const FormPage = lazy(() => import('./pages/FormPage'));
const ConfirmationPage = lazy(() => import('./pages/ConfirmationPage'));

// Dans le Router
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<WelcomePage />} />
    <Route path="/form" element={<FormPage />} />
    <Route path="/confirmation" element={<ConfirmationPage />} />
  </Routes>
</Suspense>
```

#### Images et assets
```javascript
// Pas d'images lourdes — utiliser des SVG inline ou des icônes CSS
// Si logo nécessaire : format WebP, max 50KB
// Font : précharger DM Sans
// Dans index.html :
// <link rel="preload" href="/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin>
```

#### Éviter les re-renders inutiles
```javascript
// Mémoïser les composants stables
const RadioGroup = memo(({ field, value, onChange }) => { ... });
const ProgressBar = memo(({ current, total }) => { ... });

// Mémoïser les callbacks
const handleFieldChange = useCallback((fieldId, value) => {
  dispatch({ type: 'SET_VALUE', fieldId, value });
}, [dispatch]);
```

---

### Backend — Optimisations API

#### Cache de configuration
```javascript
// Éviter les requêtes DB répétées pour la config
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1h

const getConfiguration = async () => {
  if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache;
  }
  configCache = await prisma.configuration.findFirst({ orderBy: { id: 'desc' } });
  configCacheTime = Date.now();
  return configCache;
};
```

#### Pagination des soumissions
```javascript
// GET /api/submissions?synced=false&limit=50&page=1
const getSubmissions = async (req) => {
  const { synced, limit = 50, page = 1, since } = req.query;
  const where = {
    ...(synced !== undefined && { synced: synced === 'true' }),
    ...(since && { createdAt: { gte: new Date(since) } }),
  };
  
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: { values: true },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.submission.count({ where }),
  ]);
  
  return { data: submissions, total, page: Number(page), limit: Number(limit) };
};
```

#### Index DB (Prisma)
```prisma
model Submission {
  // ...
  @@index([synced, createdAt]) // Requête la plus fréquente du CRM
}

model SubmissionValue {
  // ...
  @@index([submissionId]) // JOIN fréquent
  @@index([fieldId])       // Lookup par champ
}
```

---

### Optimisations réseau

#### Compression Gzip
```javascript
import compression from 'compression';
app.use(compression()); // Compresse toutes les réponses JSON
```

#### Headers de cache pour la config
```javascript
router.get('/configuration', apiKeyAuth, async (req, res) => {
  const config = await getConfiguration();
  res.set({
    'Cache-Control': 'public, max-age=3600', // 1h côté client
    'ETag': `"${config.version}"`,
  });
  
  // 304 Not Modified si version inchangée
  if (req.headers['if-none-match'] === `"${config.version}"`) {
    return res.status(304).end();
  }
  
  res.json(config);
});
```

#### Timeout et retry côté frontend
```javascript
// api.js — timeout 10s + retry 2x sur erreur réseau
const api = axios.create({ timeout: 10000 });

api.interceptors.response.use(null, async (error) => {
  const config = error.config;
  if (!config._retryCount) config._retryCount = 0;
  if (config._retryCount < 2 && error.code === 'ECONNABORTED') {
    config._retryCount++;
    await new Promise(r => setTimeout(r, 1000 * config._retryCount));
    return api(config);
  }
  return Promise.reject(error);
});
```

---

## Section 3 — Métriques de performance cibles

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Temps de chargement initial (WebView) | < 2s | Lighthouse |
| Taille du bundle JS | < 200KB gzippé | `npm run build` |
| Temps de réponse API (p50) | < 200ms | Logs Railway |
| Temps de réponse API (p95) | < 800ms | Logs Railway |
| Score Lighthouse mobile | > 85 | Lighthouse |
| Time to Interactive | < 3s | Lighthouse |

---

## Section 4 — Monitoring

```javascript
// backend/src/middleware/requestLogger.js
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`SLOW REQUEST: ${req.method} ${req.path} - ${duration}ms`);
    }
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
};
```

**Alertes à configurer sur Railway** :
- Temps de réponse moyen > 1s → alerte
- Taux d'erreur 5xx > 1% → alerte critique
- Utilisation mémoire > 80% → alerte
