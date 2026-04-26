export default function SyncReport({ report, onClose, onRefresh }) {
  const hasErrors = report.errors.length > 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16
    }}>
      <div className="card" style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {hasErrors && report.imported === 0 ? '❌' : hasErrors ? '⚠️' : '✅'}
          </div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>
            Synchronisation terminée
          </h2>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 14 }}>
            {report.total} soumission{report.total !== 1 ? 's' : ''} traitée{report.total !== 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{
            flex: 1, background: '#D1FAE5', borderRadius: 12,
            padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#065F46' }}>{report.imported}</div>
            <div style={{ fontSize: 13, color: '#065F46', marginTop: 2 }}>Importés</div>
          </div>
          <div style={{
            flex: 1, background: hasErrors ? '#FEE2E2' : '#F8F7FC',
            borderRadius: 12, padding: '16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: hasErrors ? '#991B1B' : 'var(--color-muted)' }}>
              {report.errors.length}
            </div>
            <div style={{ fontSize: 13, color: hasErrors ? '#991B1B' : 'var(--color-muted)', marginTop: 2 }}>Erreurs</div>
          </div>
        </div>

        {hasErrors && (
          <div style={{
            background: '#FEF2F2', borderRadius: 8, padding: '12px 16px',
            marginBottom: 20, maxHeight: 160, overflowY: 'auto'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
              Détail des erreurs :
            </p>
            {report.errors.map((e, i) => (
              <p key={i} style={{ margin: '4px 0', fontSize: 12, color: '#7F1D1D', fontFamily: 'monospace' }}>
                #{i + 1} {e.id?.slice(0, 8)}… — {e.error}
              </p>
            ))}
          </div>
        )}

        {report.simulated && (
          <div style={{
            background: '#FEF3C7', borderRadius: 8, padding: '10px 14px',
            marginBottom: 16, fontSize: 13, color: '#92400E'
          }}>
            ⚠️ Mode simulation — Aucun projet créé dans le CRM réel (VITE_CRM_URL non configurée)
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { onClose(); onRefresh() }}
            className="btn-primary"
            style={{ flex: 1 }}
          >
            Fermer & Actualiser
          </button>
        </div>
      </div>
    </div>
  )
}
