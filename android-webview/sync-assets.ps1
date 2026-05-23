# Synchronise src/frontend/dist/ -> android-webview/app/src/main/assets/
# A executer apres tout build frontend, avant de packager l'APK.

$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $PSScriptRoot
$frontDist   = Join-Path $root 'src\frontend\dist'
$webviewAssets = Join-Path $PSScriptRoot 'app\src\main\assets'

if (-not (Test-Path $frontDist)) {
    Write-Host "[!] $frontDist introuvable. Lance d'abord 'npm run build' dans src/frontend." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Build frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'src\frontend')
npm run build --silent
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "[!] Build frontend echoue." -ForegroundColor Red
    exit 1
}
Pop-Location

Write-Host "[2/3] Nettoyage des anciens assets bundles..." -ForegroundColor Cyan
# Supprime uniquement les bundles hashes (index-*.js, index-*.css, *-vendor-*.js, rolldown-runtime-*.js)
# et reconstruit le dossier assets/
$bundleDir = Join-Path $webviewAssets 'assets'
if (Test-Path $bundleDir) {
    Remove-Item -Recurse -Force $bundleDir
}
# index.html racine
$indexHtml = Join-Path $webviewAssets 'index.html'
if (Test-Path $indexHtml) {
    Remove-Item -Force $indexHtml
}

Write-Host "[3/3] Copie dist/ -> assets/..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $frontDist 'index.html') -Destination $indexHtml -Force
Copy-Item -Path (Join-Path $frontDist 'assets')     -Destination $webviewAssets -Recurse -Force

# manifest.json + favicon.svg si presents dans dist/
foreach ($extra in @('manifest.json', 'favicon.svg')) {
    $src = Join-Path $frontDist $extra
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $webviewAssets $extra) -Force
    }
}

Write-Host ""
Write-Host "[OK] Assets synchronises." -ForegroundColor Green
Write-Host "     Prochaine etape : ./gradlew assembleDebug (ou installDebug)" -ForegroundColor Yellow
