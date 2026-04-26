export function AppHeader() {
  return (
    <header className="app-header">
      <img
        src="/logo.png"
        alt="ila26 Énergie"
        className="app-header-logo-img"
      />

      <div className="app-header-title">
        <h1 className="app-header-h1">
          Estimer <span className="app-header-highlight">vos aides</span>
        </h1>
        <p className="app-header-sub">
          Pour la <strong>rénovation énergétique</strong> de votre maison
        </p>
      </div>

      <div className="app-header-flag" aria-label="France">🇫🇷</div>
    </header>
  )
}
