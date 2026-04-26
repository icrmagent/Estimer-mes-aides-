export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-logo">
        <img src="/logo-ila26.png" alt="ila26 Énergie" className="app-header-logo-img" />
      </div>

      <div className="app-header-title">
        <h1 className="app-header-h1">
          Estimer <span className="app-header-highlight">vos aides</span>
        </h1>
        <p className="app-header-sub">
          Rénovation énergétique · <strong>100&nbsp;% gratuit</strong>
        </p>
      </div>

      <div className="app-header-flag" aria-label="France" role="img">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 28" width="42" height="28">
          <rect x="0"  y="0" width="14" height="28" fill="#002395" />
          <rect x="14" y="0" width="14" height="28" fill="#EDEDED" />
          <rect x="28" y="0" width="14" height="28" fill="#ED2939" />
        </svg>
      </div>
    </header>
  )
}
