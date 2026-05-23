# EstimerMesAides — Android WebView

App Android (kiosque tablette) qui charge le Front-Office Borne (`src/frontend/`) dans une WebView.

- `applicationId` : `fr.ila26.estimermesaides`
- `minSdk` : 26 — `targetSdk` / `compileSdk` : 34
- Gradle 8.6 — AGP 8.3.2 — Kotlin 1.9.24 — JVM 17
- `versionName` synchronisé avec `src/frontend/package.json`
- `versionCode` = nombre de commits git (ou `-PversionCodeOverride=N`)

## Ouverture dans Android Studio

1. Android Studio → *Open* → sélectionner le dossier `android-webview/`
2. Vérifier `local.properties` (généré au 1er sync) : `sdk.dir=…`
3. Pour signer la release, créer `keystore/keystore.properties` :
   ```properties
   storeFile=../keystore/release.keystore
   storePassword=…
   keyAlias=release
   keyPassword=…
   ```

## Run Configurations (partagées via `.idea/runConfigurations/`)

| Nom | Action |
|-----|--------|
| **app (debug)** | Installe et lance l'APK debug sur l'appareil/émulateur sélectionné |
| **Build Release APK** | `./gradlew :app:assembleRelease` (nécessite keystore) |
| **Clean Build** | `./gradlew clean :app:assembleDebug` |

## Builds CLI

```bash
# Debug
gradlew.bat :app:assembleDebug

# Release (avec override versionCode)
gradlew.bat :app:assembleRelease -PversionCodeOverride=42
```

APK généré : `app/build/outputs/apk/{debug,release}/`

## Synchronisation des assets frontend → APK

⚠️ La WebView charge les assets **bundlés dans l'APK** (`assets/`), pas le code source live.
Toute modification de `src/frontend/` nécessite de **rebuild le frontend ET resynchroniser les assets** avant de packager l'APK.

```powershell
# Depuis le dossier android-webview/, en une commande
./sync-assets.ps1
./gradlew.bat installDebug    # ou assembleDebug
```

Le script `sync-assets.ps1` fait :
1. `npm run build` dans `src/frontend/`
2. Supprime les anciens bundles hashés de `app/src/main/assets/`
3. Copie `src/frontend/dist/*` → `app/src/main/assets/*`
