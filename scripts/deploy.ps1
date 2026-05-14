# scripts/deploy.ps1 — Pipeline de déploiement local (Windows)
# Usage : .\scripts\deploy.ps1 [-SkipTests] [-SkipMigration] [-SkipWebview] [-SkipVercel] [-SkipBackend]
#
# Étapes : sync git → tests → migration Prisma → backend Railway → Vercel (x3) → APK WebView → tag git
# Variables d'env requises (.env.deploy à la racine, voir .env.deploy.example) :
#   DATABASE_URL, DIRECT_URL, RAILWAY_TOKEN, VERCEL_TOKEN, BACKEND_URL

[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$SkipMigration,
  [switch]$SkipBackend,
  [switch]$SkipVercel,
  [switch]$SkipWebview
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Step($name) {
  Write-Host ""
  Write-Host "▶ $name" -ForegroundColor Cyan
  Write-Host ("─" * 60) -ForegroundColor DarkGray
}

function Fail($msg) {
  Write-Host "✖ $msg" -ForegroundColor Red
  exit 1
}

# Charge .env.deploy si présent
$envFile = Join-Path $RepoRoot '.env.deploy'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)\s*$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }
}

# ── 1. SYNC GIT ──────────────────────────────────────────────
Step "1/7 — Sync git"
$status = git status --porcelain
if ($status) { Fail "Working tree non clean. Commit ou stash avant deploy." }
git fetch origin
$local  = git rev-parse HEAD
$remote = git rev-parse '@{u}' 2>$null
if ($local -ne $remote) { Fail "Branche locale != remote. Pull ou push d'abord." }
$sha   = git rev-parse --short HEAD
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "branch=$branch  sha=$sha"
if ($branch -ne 'main') { Fail "Le deploy production se fait depuis main uniquement." }

# ── 2. TESTS ─────────────────────────────────────────────────
if (-not $SkipTests) {
  Step "2/7 — Tests backend (Jest)"
  Push-Location src/backend
  try { npm ci; if ($LASTEXITCODE) { Fail "npm ci backend" } } finally { Pop-Location }
  Push-Location src/backend
  try { npm test; if ($LASTEXITCODE) { Fail "Tests backend échec" } } finally { Pop-Location }
} else { Write-Host "⊘ Tests sautés" -ForegroundColor Yellow }

# ── 3. MIGRATION PRISMA ──────────────────────────────────────
if (-not $SkipMigration) {
  Step "3/7 — Prisma migrate deploy"
  if (-not $env:DIRECT_URL) { Fail "DIRECT_URL manquant (port 5432 session pooler)" }
  Push-Location src/backend
  try {
    $env:DATABASE_URL = $env:DIRECT_URL
    npx prisma migrate deploy
    if ($LASTEXITCODE) { Fail "Migration Prisma échec" }
  } finally { Pop-Location }
} else { Write-Host "⊘ Migration sautée" -ForegroundColor Yellow }

# ── 4. DEPLOY BACKEND (Railway) ──────────────────────────────
if (-not $SkipBackend) {
  Step "4/7 — Deploy Backend → Railway"
  if (-not $env:RAILWAY_TOKEN) { Fail "RAILWAY_TOKEN manquant" }
  Push-Location src/backend
  try {
    npx -y '@railway/cli@latest' up --detach
    if ($LASTEXITCODE) { Fail "Railway up échec" }
  } finally { Pop-Location }

  if ($env:BACKEND_URL) {
    Step "4b — Healthcheck backend"
    $ok = $false
    for ($i = 1; $i -le 10; $i++) {
      Start-Sleep -Seconds 15
      try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "$($env:BACKEND_URL)/health" -TimeoutSec 10
        if ($r.StatusCode -eq 200) { $ok = $true; break }
      } catch { Write-Host "  try $i KO" }
    }
    if (-not $ok) { Fail "Backend ne répond pas après 10 tentatives" }
    Write-Host "✓ Backend healthy"
  }
} else { Write-Host "⊘ Backend sauté" -ForegroundColor Yellow }

# ── 5. DEPLOY VERCEL (frontend, backoffice) ──────────────────
if (-not $SkipVercel) {
  Step "5/7 — Deploy Vercel (2 apps)"
  if (-not $env:VERCEL_TOKEN) { Fail "VERCEL_TOKEN manquant" }
  $apps = @('src/frontend','src/backoffice')
  foreach ($app in $apps) {
    Write-Host "→ $app" -ForegroundColor White
    Push-Location $app
    try {
      npm ci
      if ($LASTEXITCODE) { Fail "npm ci $app" }
      npx -y vercel@latest pull --yes --environment=production --token=$env:VERCEL_TOKEN
      npx -y vercel@latest build --prod --token=$env:VERCEL_TOKEN
      npx -y vercel@latest deploy --prebuilt --prod --token=$env:VERCEL_TOKEN
      if ($LASTEXITCODE) { Fail "Vercel deploy $app" }
    } finally { Pop-Location }
  }
} else { Write-Host "⊘ Vercel sauté" -ForegroundColor Yellow }

# ── 6. BUILD WEBVIEW APK ────────────────────────────────────
if (-not $SkipWebview) {
  Step "6/7 — Build Android WebView APK"
  Push-Location android-webview
  try {
    if (Test-Path 'keystore/release.keystore') {
      .\gradlew.bat assembleRelease --no-daemon
    } else {
      Write-Host "⚠ Pas de keystore release — build debug" -ForegroundColor Yellow
      .\gradlew.bat assembleDebug --no-daemon
    }
    if ($LASTEXITCODE) { Fail "Build APK échec" }
  } finally { Pop-Location }
  $apk = Get-ChildItem -Recurse android-webview/app/build/outputs/apk -Filter '*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($apk) { Write-Host "✓ APK : $($apk.FullName)" -ForegroundColor Green }
} else { Write-Host "⊘ WebView sauté" -ForegroundColor Yellow }

# ── 7. TAG GIT ──────────────────────────────────────────────
Step "7/7 — Tag deploy"
$tag = "deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$sha"
git tag -a $tag -m "Production deploy $sha"
git push origin $tag
Write-Host ""
Write-Host "✅ Déploiement terminé — tag $tag" -ForegroundColor Green
