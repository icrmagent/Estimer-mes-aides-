package fr.ila26.estimermesaides

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature
import fr.ila26.estimermesaides.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    // ── URL locale (assets bundlés dans l'APK) ────────────────────
    private val APP_URL = "https://appassets.androidplatform.net/index.html"
    // ─────────────────────────────────────────────────────────────

    private lateinit var binding: ActivityMainBinding
    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge (WebView occupe tout l'écran)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupAssetLoader()
        setupBackNavigation()
        setupWebView()
        loadApp()
    }

    // ── AssetLoader : sert les fichiers depuis assets/ avec URL HTTPS ─
    private fun setupAssetLoader() {
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // ── Navigation arrière ────────────────────────────────────────
    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    // ── Configuration WebView ─────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(binding.webView.settings) {
            javaScriptEnabled              = true
            domStorageEnabled              = true
            databaseEnabled                = true
            allowFileAccess                = false
            allowContentAccess             = false
            mixedContentMode               = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort                = true
            loadWithOverviewMode           = true
            setSupportZoom(false)
            builtInZoomControls            = false
            displayZoomControls            = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode                      = WebSettings.LOAD_DEFAULT
        }

        // Mode sombre : désactivé (charte graphique maîtrisée par le front)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(binding.webView.settings, false)
        }

        binding.webView.webViewClient = object : WebViewClient() {

            // Intercepte toutes les requêtes pour servir depuis les assets locaux
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val intercepted = assetLoader.shouldInterceptRequest(request.url)
                if (intercepted != null) return intercepted

                // SPA fallback : routes React Router sans extension → index.html
                val path = request.url.path ?: return null
                if (request.isForMainFrame && !path.contains('.')) {
                    return assetLoader.shouldInterceptRequest(
                        Uri.parse("https://appassets.androidplatform.net/index.html")
                    )
                }
                return null
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                binding.progressBar.visibility = View.VISIBLE
                binding.errorView.visibility   = View.GONE
                binding.webView.visibility     = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    binding.progressBar.visibility = View.GONE
                    binding.webView.visibility     = View.INVISIBLE
                    binding.errorView.visibility   = View.VISIBLE
                }
            }
        }

        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progressBar.progress   = newProgress
                binding.progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            }

            // Sélecteur de fichier (si le formulaire en a besoin)
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                val intent = params.createIntent()
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST)
                } catch (e: Exception) {
                    filePathCallback = null
                    return false
                }
                return true
            }
        }

        binding.btnRetry.setOnClickListener { loadApp() }
    }

    // ── Chargement de l'app depuis les assets locaux ──────────────
    private fun loadApp() {
        binding.errorView.visibility   = View.GONE
        binding.progressBar.visibility = View.VISIBLE
        binding.webView.visibility     = View.VISIBLE
        binding.webView.loadUrl(APP_URL)
    }

    // ── Résultat sélecteur fichier ────────────────────────────────
    @Deprecated("Kept for file chooser compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            filePathCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            )
            filePathCallback = null
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 1001
    }
}
