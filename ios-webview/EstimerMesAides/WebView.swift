import SwiftUI
import WebKit

private let APP_URL = URL(string: "https://estimer-mes-aides.vercel.app")!
private let PRIMARY = Color(red: 0.361, green: 0.176, blue: 0.827)

// ── Root View ─────────────────────────────────────────────────────────────────

struct WebView: View {
    @StateObject private var model = WebModel()

    var body: some View {
        ZStack(alignment: .top) {
            WKWrapper(model: model)
                .ignoresSafeArea()

            // Barre de progression fine en haut
            if model.isLoading {
                GeometryReader { geo in
                    Rectangle()
                        .fill(Color.white.opacity(0.8))
                        .frame(width: geo.size.width * model.progress, height: 3)
                        .animation(.linear(duration: 0.1), value: model.progress)
                }
                .frame(height: 3)
            }

            // Écran d'erreur réseau
            if model.showError {
                ErrorOverlay(onRetry: model.load)
            }
        }
        .onAppear { model.load() }
    }
}

// ── UIViewRepresentable ────────────────────────────────────────────────────────

private struct WKWrapper: UIViewRepresentable {
    @ObservedObject var model: WebModel

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        // Ne pas ajuster les insets — le CSS gère env(safe-area-inset-*)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(PRIMARY)

        model.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    // ── Coordinator ───────────────────────────────────────────────────────────

    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: WebModel
        private var progressObs: NSKeyValueObservation?

        init(model: WebModel) { self.model = model }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation _: WKNavigation!) {
            DispatchQueue.main.async {
                self.model.isLoading = true
                self.model.showError = false
                self.model.progress  = 0
            }
            progressObs = webView.observe(\.estimatedProgress) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.model.progress = wv.estimatedProgress }
            }
        }

        func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
            DispatchQueue.main.async {
                self.model.isLoading = false
                self.model.progress  = 1
            }
            progressObs = nil
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            DispatchQueue.main.async {
                self.model.isLoading = false
                self.model.showError = true
            }
            progressObs = nil
        }

        func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            DispatchQueue.main.async {
                self.model.isLoading = false
                self.model.showError = true
            }
        }
    }
}

// ── Model ──────────────────────────────────────────────────────────────────────

private final class WebModel: ObservableObject {
    @Published var isLoading  = false
    @Published var progress   = 0.0
    @Published var showError  = false

    weak var webView: WKWebView?

    func load() {
        showError = false
        webView?.load(URLRequest(
            url: APP_URL,
            cachePolicy: .useProtocolCachePolicy,
            timeoutInterval: 30
        ))
    }
}

// ── Error Overlay ──────────────────────────────────────────────────────────────

private struct ErrorOverlay: View {
    let onRetry: () -> Void

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()

            VStack(spacing: 28) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 64))
                    .foregroundColor(PRIMARY.opacity(0.45))

                VStack(spacing: 10) {
                    Text("Connexion impossible")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(red: 0.102, green: 0.063, blue: 0.188))

                    Text("Vérifiez votre connexion internet\net réessayez.")
                        .font(.callout)
                        .foregroundColor(Color(red: 0.420, green: 0.408, blue: 0.533))
                        .multilineTextAlignment(.center)
                }

                Button(action: onRetry) {
                    Text("Réessayer")
                        .font(.body.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 48)
                        .padding(.vertical, 14)
                        .background(PRIMARY)
                        .cornerRadius(12)
                }
            }
            .padding(32)
        }
    }
}
