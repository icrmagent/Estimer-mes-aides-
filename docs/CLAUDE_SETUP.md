# CLAUDE_SETUP.md — Configuration Claude Code

*Audit Phase 5 — 2026-05-13*

---

## Ce qui est configuré

### CLAUDE.md
- **Fichier :** `CLAUDE.md` (racine)
- **Taille :** ~230 tokens (limite : 400)
- **Contenu :** 10 règles absolues V2 uniquement
- **Raison :** Chargé automatiquement à chaque session. Volontairement minimal — seules les règles que Claude ne respecterait pas naturellement.

### Rules (lazy-load)
| Fichier | Globs | Rôle |
|---------|-------|------|
| `.claude/rules/planning.md` | `docs/PLAN.md`, `.kiro/specs/**` | Discipline de planification par phase |
| `.claude/rules/context.md` | `src/**`, `docs/**` | Budget d'exploration, périmètre de lecture |
| `.claude/rules/budget.md` | `**` | Discipline de réponse, économie de tokens |

- **Total :** 1 358 chars
- **Raison :** Chargées uniquement quand les fichiers ciblés sont dans le contexte (lazy-load via `globs:`).
- **Note :** La clé `globs:` est utilisée (format Claude Code correct). Le template de Phase 1 disait `paths:` — différence de terminologie, pas d'impact fonctionnel.

### Skills (`.claude/skills/` + `.claude/commands/`)
| Skill | Déclencheur | Raison |
|-------|-------------|--------|
| `/services` | Chaque session dev | Affiche les ports actifs + commandes démarrage 4 services |
| `/db-reset` | Reset de DB nécessaire | Enchaîne migrate reset + seed, avec confirmation obligatoire |
| `/retro` | Après modification backend | Lance uniquement les tests de rétrocompatibilité ciblés |

- **Total skills V2 :** 3 (+ 11 skills V1 conservés pour compatibilité)
- **Total chars skills :** 5 227
- **Raison :** Uniquement des tâches répétitives identifiées dans le CDC — pas de skills spéculatifs.

### Settings (`.claude/settings.json`)
- **JSON valide :** ✅ (vérifié par `node require()`)
- **Permissions :** 10 règles Bash (npm, node, npx prisma, git, ls, mkdir)
- **Hooks configurés :**

| Hook | Déclencheur | Action |
|------|-------------|--------|
| `PostToolUse` | Après chaque outil | Log dans `.claude/errors.log` si `is_error: true` |
| `Stop` | Fin de session | Vérifie que CDC.md + 3 rules existent, affiche ✓ ou ⚠ |

- **Test hook :** ✅ erreur simulée loggée correctement dans `errors.log`

### MCP Servers
- **Installés :** aucun
- **Budget MCP :** 0 tokens (limite : 20 000)

### Sub-Agents
- **Créés :** aucun
- **Raison :** Aucune tâche V2 en cours ne nécessite de contexte isolé au moment de la configuration.

---

## Ce qui n'a PAS été configuré (et pourquoi)

| Élément | Raison d'exclusion |
|---------|-------------------|
| **MCP fetch** | L'accès à I-CRM et Pusher est géré par le backend Node.js, pas par Claude |
| **MCP memory** | Mémoire fichier déjà en place (`~/.claude/projects/.../memory/`) |
| **MCP PostgreSQL** | Accès DB via Prisma CLI + `prisma studio` — accès direct risqué sur Supabase prod |
| **MCP search** | Aucun besoin de recherche vectorielle ou web identifié dans le CDC |
| **Sub-agents** | Pas de tâche parallèle active au moment de la config — à créer à la demande |
| **Hook `PreToolUse`** | Pas de validation pre-exécution identifiée comme nécessaire |

---

## Budget total

| Ressource | Consommé | Limite | Statut |
|-----------|----------|--------|--------|
| CLAUDE.md tokens | ~230 | 400 | ✅ |
| Rules + skills chars | 6 585 | 12 000 | ✅ |
| MCP tokens | 0 | 20 000 | ✅ |

---

## Résultats des tests fonctionnels

| Test | Résultat |
|------|----------|
| `claude --print "objectif du projet ?"` | ✅ Réponse correcte — CDC reflété (borne kiosque, i18n, acteurs) |
| Skill `/services` | ✅ netstat exécuté, tableau des ports affiché |
| Hook `PostToolUse` | ✅ Erreur simulée loggée dans `.claude/errors.log` |
| `settings.json` parseable | ✅ 10 permissions + 2 hooks |

---

## Prochaines étapes si le projet évolue

1. **Quand les agents deviennent nécessaires** — créer `.claude/agents/security-reviewer.md` pour les audits auth JWT + cloisonnement AdminBorne (fort potentiel de régression silencieuse).

2. **Quand la DB doit être interrogée en session** — envisager MCP `@modelcontextprotocol/server-postgres` avec un utilisateur Supabase read-only dédié (pas les credentials de prod).

3. **Si le volume de skills dépasse 12 fichiers** — auditer lesquels sont réellement invoqués et supprimer les obsolètes.

4. **Pour les tests i18n** — ajouter un skill `/i18n-check` qui vérifie la cohérence des clés FR/ES/EN dans `src/frontend/src/i18n/`.
