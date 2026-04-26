# Estimer Mes Aides — WebView Mobile App
> Application mobile d'estimation des aides à la rénovation énergétique

---

## 🚀 Démarrage rapide

### Pour Claude Code — Lire en PREMIER
```
Lis CLAUDE.md avant tout. Ce fichier contient le contexte complet du projet.
Ensuite consulte docs/PLAN.md pour savoir où on en est.
```

### Pour un développeur humain
```bash
# Clone + install
git clone [repo-url] estimer-mes-aides
cd estimer-mes-aides

# Backend
cd backend && npm install
cp .env.example .env  # Configurer les variables
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend
cd ../frontend && npm install
cp .env.example .env  # Configurer VITE_API_URL
npm run dev
```

---

## 📚 Documentation

| Fichier | Contenu |
|---------|---------|
| `CLAUDE.md` | **Point d'entrée** — contexte global, architecture, règles |
| `docs/PLAN.md` | Plan de développement phasé + état d'avancement |
| `docs/AGENTS.md` | Agents IA spécialisés + prompts d'activation |
| `docs/SKILLS.md` | Patterns de code réutilisables |
| `docs/WORKFLOWS.md` | Workflows par type de tâche |
| `docs/CONTEXT.md` | Contexte métier, données formulaire exhaustives |
| `docs/DESIGN.md` | Système de design complet (tokens CSS, composants) |
| `docs/USE_CASES.md` | Cas d'utilisation détaillés |
| `docs/COMMANDS.md` | Commandes Claude Code prêtes à l'emploi |
| `docs/OPTIMIZATION.md` | Optimisation tokens Claude + performance app |

---

## 🏗️ Architecture

```
App Mobile (WebView) ──POST /api/submissions──→ Backend API
                    ←──GET /api/configuration── (Node.js/Express)
                                                      │
                                                 PostgreSQL
                                                      │
CRM Existant ───GET /api/submissions?synced=false─────┘
             ←──PUT /api/submissions/{id}/sync────────┘
```

---

## 🎨 Design
- Couleur primaire : **#5C2DD3** (violet institutionnel)
- Font : **DM Sans**
- Touch targets : **≥48px** (obligatoire)
- Mobile-first : **375px** minimum

---

## 📋 Formulaire "Estimer vos aides"
**15 étapes**, 3 catégories :
1. **Informations Personnelles** (3 sous-catégories) — étapes 1-3
2. **Le Lieu des Travaux** (7 sous-catégories) — étapes 4-10
3. **Vos Besoins** (5 sous-catégories) — étapes 11-15

Champs obligatoires (règle frontend) : Nom, Prénom, Code postal, Ville, Revenu fiscal, Statut propriétaire

> Voir `docs/CONTEXT.md` pour la structure complète avec les vrais field IDs CRM.

---

## Variables d'environnement

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=your-jwt-secret-min-32-chars
API_KEY_MOBILE=ema_mobile_xxxxxxxxxxxx
API_KEY_CRM=ema_crm_xxxxxxxxxxxx
CRM_BASE_URL=https://votre-crm.com
PORT=3000
```

### Frontend (.env)
```
VITE_API_URL=https://api.estimer-mes-aides.com
VITE_API_KEY=ema_mobile_xxxxxxxxxxxx
```
