export function AppHeader() {
  return (
    <header className="app-header">
      {/* Logo ila26 */}
      <div className="app-header-logo">
        <div className="app-header-logo-box">
          <span className="app-logo-ila">ila</span>
          <span className="app-logo-26">26</span>
        </div>
        <span className="app-logo-sub">Énergie</span>
      </div>

      {/* Titre centré */}
      <div className="app-header-title">
        <h1 className="app-header-h1">
          Estimer <span className="app-header-highlight">vos aides</span>
        </h1>
        <p className="app-header-sub">
          Pour la <strong>rénovation énergétique</strong> de votre maison
        </p>
      </div>

      {/* Drapeau français SVG */}
      <div className="app-header-flag" aria-label="France" role="img">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 42 28"
          width="42"
          height="28"
        >
          <rect x="0"  y="0" width="14" height="28" fill="#002395" />
          <rect x="14" y="0" width="14" height="28" fill="#EDEDED" />
          <rect x="28" y="0" width="14" height="28" fill="#ED2939" />
        </svg>
      </div>
    </header>
  )
}
