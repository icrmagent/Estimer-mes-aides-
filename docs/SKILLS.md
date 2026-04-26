# SKILLS.md — Compétences Techniques du Projet

## Vue d'ensemble
Skills techniques que Claude Code doit maîtriser et appliquer pour ce projet.
Chaque skill inclut les patterns spécifiques à ce projet.

---

## ⚛️ SKILL: React WebView Mobile

**Contexte** : SPA React embarquée dans une WebView native. Contraintes spécifiques.

### Règles WebView critiques
```javascript
// ❌ Ne jamais utiliser
window.open()           // ne fonctionne pas dans WebView
<a target="_blank">    // bloque la navigation
alert() / confirm()    // comportement imprévisible

// ✅ Utiliser à la place
// Navigation interne React Router uniquement
// Modales custom React pour les confirmations
// Callbacks postMessage si communication native requise
```

### Pattern de détection WebView
```javascript
const isWebView = () => {
  const ua = navigator.userAgent;
  return /wv|WebView/.test(ua) || 
    (ua.includes('Android') && ua.includes('Version/')) ||
    window.ReactNativeWebView !== undefined;
};
```

### Optimisations WebView
```javascript
// Désactiver les animations lourdes sur WebView bas de gamme
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Touch events natifs (pas de delay 300ms)
// Dans index.html :
// <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
```

---

## 🎨 SKILL: Design System #5C2DD3

### Tokens CSS immuables
```css
:root {
  --primary: #5C2DD3;
  --primary-dark: #4A1FAF;
  --primary-light: #7B4AE2;
  --primary-bg: #F0EBFF;
  --surface: #FFFFFF;
  --surface-2: #F8F9FA;
  --text-primary: #1A1A2E;
  --text-secondary: #6B7280;
  --text-on-primary: #FFFFFF;
  --border: #E5E7EB;
  --error: #EF4444;
  --error-bg: #FEF2F2;
  --success: #10B981;
  --success-bg: #F0FDF4;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Touch */
  --touch-min: 48px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-card: 0 2px 12px rgba(92,45,211,0.08);
  --shadow-button: 0 4px 16px rgba(92,45,211,0.3);
}
```

### Composant Button (référence)
```jsx
const Button = ({ variant = 'primary', children, onClick, disabled }) => {
  const styles = {
    primary: 'bg-[#5C2DD3] text-white shadow-[0_4px_16px_rgba(92,45,211,0.3)] active:scale-[0.98]',
    secondary: 'bg-white text-[#5C2DD3] border-2 border-[#5C2DD3]',
    ghost: 'bg-transparent text-[#6B7280]',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        min-h-[48px] px-6 rounded-[12px] font-semibold text-base
        transition-all duration-150 w-full
        disabled:opacity-40 disabled:cursor-not-allowed
        ${styles[variant]}
      `}
    >
      {children}
    </button>
  );
};
```

---

## 🔄 SKILL: Gestion des champs dynamiques

### FieldRenderer — pattern central du projet
```jsx
// fieldtype_id mapping (depuis cahier des charges)
const FIELD_TYPES = {
  1: 'text',        // Texte court
  2: 'textarea',    // Texte long
  4: 'checkbox',    // Options multiples
  5: 'radio',       // Option unique
  6: 'tel',         // Téléphone
  50: 'radio',      // Liste enum (même rendu que radio)
};

const FieldRenderer = ({ field, value, onChange, error }) => {
  const type = FIELD_TYPES[field.fieldtype_id];
  
  switch (type) {
    case 'text':
    case 'tel':
      return <InputField field={field} value={value} onChange={onChange} type={type} />;
    case 'textarea':
      return <TextareaField field={field} value={value} onChange={onChange} />;
    case 'radio':
      return <RadioGroup field={field} value={value} onChange={onChange} />;
    case 'checkbox':
      return <CheckboxGroup field={field} value={value} onChange={onChange} />;
    default:
      return null;
  }
};
```

### Validation côté client
```javascript
const validateStep = (fields, values) => {
  const errors = {};
  fields.forEach(field => {
    if (field.required && !values[field.id]) {
      errors[field.id] = `${field.name} est obligatoire`;
    }
  });
  return errors; // {} = pas d'erreur = Suivant débloqué
};
```

---

## 💾 SKILL: Cache & Offline

### Cache de configuration (localStorage)
```javascript
const CONFIG_KEY = 'ema_form_config';
const CONFIG_TTL = 24 * 60 * 60 * 1000; // 24h en ms

export const getCachedConfig = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CONFIG_TTL) return null;
    return cached.data;
  } catch { return null; }
};

export const setCachedConfig = (config) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    data: config,
    timestamp: Date.now(),
  }));
};
```

### Soumissions offline (IndexedDB)
```javascript
// Utiliser idb-keyval pour simplicité
import { set, get, keys, del } from 'idb-keyval';

export const saveOfflineSubmission = async (submission) => {
  await set(`submission_${submission.id}`, {
    ...submission,
    offlineSaved: true,
    timestamp: Date.now(),
  });
};

export const syncOfflineSubmissions = async (apiClient) => {
  const allKeys = await keys();
  const submissionKeys = allKeys.filter(k => String(k).startsWith('submission_'));
  
  for (const key of submissionKeys) {
    const submission = await get(key);
    try {
      await apiClient.post('/api/submissions', submission);
      await del(key);
    } catch (err) {
      console.error('Sync offline failed for', key, err);
    }
  }
};
```

---

## 🔐 SKILL: Auth API (Backend)

### Middleware double auth
```javascript
// API Key pour l'app mobile
const apiKeyAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== process.env.API_KEY_MOBILE) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// JWT Bearer pour le CRM
const jwtAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing JWT' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    req.crm = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid JWT' });
  }
};
```

---

## 📡 SKILL: API Client Frontend

### Pattern axios avec retry et fallback offline
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'x-api-key': import.meta.env.VITE_API_KEY },
  timeout: 10000,
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!navigator.onLine || err.code === 'NETWORK_ERROR') {
      // Basculer en mode offline
      return Promise.reject({ offline: true, originalError: err });
    }
    return Promise.reject(err);
  }
);

export default api;
```

---

## 🧪 SKILL: Tests

### Test d'un composant de champ
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from '../RadioGroup';

describe('RadioGroup', () => {
  const field = {
    id: 1,
    name: 'Civilité',
    required: true,
    options: [{ id: 1, label: 'M.' }, { id: 2, label: 'Mme' }],
  };

  it('should render all options', () => {
    render(<RadioGroup field={field} value="" onChange={() => {}} />);
    expect(screen.getByLabelText('M.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mme')).toBeInTheDocument();
  });

  it('should call onChange with selected value', () => {
    const onChange = vi.fn();
    render(<RadioGroup field={field} value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('M.'));
    expect(onChange).toHaveBeenCalledWith(1, 1);
  });
});
```

### Test endpoint API backend
```javascript
describe('POST /api/submissions', () => {
  it('should create submission with synced=false', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('x-api-key', process.env.API_KEY_MOBILE)
      .send({
        configVersion: '1.0.0',
        values: [
          { fieldId: 2088, value: 'Jean' },     // Prénom (projets_Apellidos)
          { fieldId: 2087, value: 'Dupont' },    // Nom (projets_Nombre)
          { fieldId: 2089, value: '75001' },     // Code postal
          { fieldId: 2090, value: 'Paris' },     // Ville (projets_Ciudad)
        ],
      });
    
    expect(res.status).toBe(201);
    expect(res.body.synced).toBe(false);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
// Note: fieldId = vrais IDs CRM (2087, 2088…), pas des IDs séquentiels
```
