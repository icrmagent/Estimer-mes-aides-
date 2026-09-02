#!/usr/bin/env bash
# scripts/deploy.sh — Pipeline de déploiement local (macOS/Linux)
# Usage : ./scripts/deploy.sh [--skip-tests] [--skip-migration] [--skip-backend] [--skip-vercel] [--skip-webview]
#
# Variables requises (.env.deploy à la racine) :
#   DATABASE_URL, DIRECT_URL, RENDER_API_KEY, RENDER_SERVICE_ID, VERCEL_TOKEN, BACKEND_URL

set -euo pipefail

SKIP_TESTS=0 SKIP_MIGRATION=0 SKIP_BACKEND=0 SKIP_VERCEL=0 SKIP_WEBVIEW=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests)     SKIP_TESTS=1 ;;
    --skip-migration) SKIP_MIGRATION=1 ;;
    --skip-backend)   SKIP_BACKEND=1 ;;
    --skip-vercel)    SKIP_VERCEL=1 ;;
    --skip-webview)   SKIP_WEBVIEW=1 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
[ -f .env.deploy ] && set -a && . ./.env.deploy && set +a

step() { printf "\n\e[36m▶ %s\e[0m\n" "$1"; printf '%.0s─' {1..60}; printf "\n"; }
die()  { printf "\e[31m✖ %s\e[0m\n" "$1" >&2; exit 1; }

# 1. SYNC GIT
step "1/7 — Sync git"
[ -z "$(git status --porcelain)" ] || die "Working tree non clean."
git fetch origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] || die "Local != remote."
SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "branch=$BRANCH  sha=$SHA"
[ "$BRANCH" = "main" ] || die "Deploy production = depuis main uniquement."

# 2. TESTS
if [ "$SKIP_TESTS" -eq 0 ]; then
  step "2/7 — Tests backend"
  (cd src/backend && npm ci && npm test) || die "Tests"
else echo "⊘ Tests sautés"; fi

# 3. MIGRATION
if [ "$SKIP_MIGRATION" -eq 0 ]; then
  step "3/7 — Prisma migrate deploy"
  [ -n "${DIRECT_URL:-}" ] || die "DIRECT_URL manquant"
  (cd src/backend && DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy) || die "Migration"
else echo "⊘ Migration sautée"; fi

# 4. BACKEND RENDER
# Render redeploie automatiquement a chaque push sur main (autoDeployTrigger: commit).
# On declenche malgre tout un deploiement explicite pour pouvoir en suivre l'etat.
if [ "$SKIP_BACKEND" -eq 0 ]; then
  step "4/7 — Deploy Backend → Render"
  [ -n "${RENDER_API_KEY:-}" ]    || die "RENDER_API_KEY manquant"
  RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-srv-dac30kbm8hqs73eb1d20}"

  DEPLOY_ID=$(curl -fsS -X POST     -H "Authorization: Bearer ${RENDER_API_KEY}"     -H "Content-Type: application/json"     -d '{"clearCache":"do_not_clear"}'     "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys"     | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*//p' | head -1)
  [ -n "$DEPLOY_ID" ] || die "Render : deploiement non declenche"
  echo "  deploy=$DEPLOY_ID"

  # Attente de l'etat terminal (build ~2-4 min sur le plan free)
  ok=0
  for i in $(seq 1 40); do
    sleep 20
    ST=$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}"       "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys/${DEPLOY_ID}"       | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*//p' | head -1)
    case "$ST" in
      live) ok=1; break ;;
      build_failed|update_failed|pre_deploy_failed|canceled|deactivated)
        die "Render : deploiement $ST (logs : https://dashboard.render.com)" ;;
      *) echo "  [$i] $ST" ;;
    esac
  done
  [ "$ok" -eq 1 ] || die "Render : deploiement non live apres ~13 min"

  if [ -n "${BACKEND_URL:-}" ]; then
    step "4b — Healthcheck"
    # /health renvoie 503 si la base est injoignable : curl -f echoue alors, c'est voulu.
    # Le plan free met le service en veille ; le premier appel peut prendre ~50 s.
    ok=0
    for i in $(seq 1 12); do
      sleep 15
      curl -fsS --max-time 75 "${BACKEND_URL}/health" >/dev/null && { ok=1; break; } || echo "  try $i KO"
    done
    [ "$ok" -eq 1 ] || die "Backend healthcheck (503 = base injoignable, 000 = service endormi)"
    echo "✓ Backend healthy"
  fi
else echo "⊘ Backend sauté"; fi

# 5. VERCEL
if [ "$SKIP_VERCEL" -eq 0 ]; then
  step "5/7 — Deploy Vercel"
  [ -n "${VERCEL_TOKEN:-}" ] || die "VERCEL_TOKEN manquant"
  for app in src/frontend src/backoffice; do
    echo "→ $app"
    (cd "$app" \
      && npm ci \
      && npx -y vercel@latest pull --yes --environment=production --token="$VERCEL_TOKEN" \
      && npx -y vercel@latest build --prod --token="$VERCEL_TOKEN" \
      && npx -y vercel@latest deploy --prebuilt --prod --token="$VERCEL_TOKEN") \
      || die "Vercel $app"
  done
else echo "⊘ Vercel sauté"; fi

# 6. WEBVIEW
if [ "$SKIP_WEBVIEW" -eq 0 ]; then
  step "6/7 — Build APK"
  (cd android-webview && chmod +x ./gradlew && \
    if [ -f keystore/release.keystore ]; then ./gradlew assembleRelease --no-daemon
    else echo "⚠ Pas de keystore — build debug"; ./gradlew assembleDebug --no-daemon
    fi) || die "Build APK"
else echo "⊘ WebView sauté"; fi

# 7. TAG
step "7/7 — Tag git"
TAG="deploy-$(date -u +%Y%m%d-%H%M%S)-$SHA"
git tag -a "$TAG" -m "Production deploy $SHA"
git push origin "$TAG"
printf "\n\e[32m✅ Déploiement terminé — tag %s\e[0m\n" "$TAG"
