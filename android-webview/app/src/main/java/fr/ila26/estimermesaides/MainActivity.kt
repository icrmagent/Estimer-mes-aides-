package fr.ila26.estimermesaides

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import fr.ila26.estimermesaides.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    // ── URL de l'application déployée sur Vercel ──────────────────
    // Remplacer après le déploiement : vercel --prod → copier l'URL
    private val APP_URL = "https://estimer-mes-aides.vercel.app"
    // ─────────────────────────────────────────────────────────────

    private lateinit var binding: ActivityMainBinding
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge (WebView occupe tout l'écran)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupBackNavigation()
        setupWebView()
        loadApp()
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

        // Mode sombre : suivre le thème système si supporté
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(binding.webView.settings, false)
        }

        binding.webView.webViewClient = object : WebViewClient() {
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

    // ── Chargement de l'app ───────────────────────────────────────
    private fun loadApp() {
        if (!isConnected()) {
            binding.webView.visibility     = View.INVISIBLE
            binding.errorView.visibility   = View.VISIBLE
            binding.progressBar.visibility = View.GONE
            return
        }
        binding.errorView.visibility   = View.GONE
        binding.progressBar.visibility = View.VISIBLE
        binding.webView.visibility     = View.VISIBLE
        binding.webView.loadUrl(APP_URL)
    }

    // ── Vérification réseau ───────────────────────────────────────
    private fun isConnected(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val cap = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
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
