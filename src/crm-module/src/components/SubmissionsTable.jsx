function getFieldValue(values, fieldId) {
  const sv = (values || []).find(v => v.fieldId === fieldId)
  return sv?.value || '—'
}

function formatDate(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function SubmissionsTable({ submissions, selected, onToggle, onToggleAll, syncProgress }) {
  const allSelected = submissions.length > 0 && selected.size === submissions.length

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-2)', borderBottom: '2px solid #E5E0F7' }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(!allSelected)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
              />
            </th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 600 }}>Date</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 600 }}>Prénom / Nom</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 600 }}>Email</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 600 }}>CP / Ville</th>
            <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-muted)', fontWeight: 600 }}>Champs</th>
            <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-muted)', fontWeight: 600 }}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {submissions.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-muted)' }}>
                Aucune soumission en attente
              </td>
            </tr>
          )}
          {submissions.map(sub => {
            const prenom = getFieldValue(sub.values, 2088)
            const nom = getFieldValue(sub.values, 2087)
            const email = getFieldValue(sub.values, 2016)
            const cp = getFieldValue(sub.values, 2089)
            const ville = getFieldValue(sub.values, 2090)
            const nbChamps = (sub.values || []).length
            const progress = syncProgress[sub.id]
            const isSelected = selected.has(sub.id)

            return (
              <tr
                key={sub.id}
                style={{
                  borderBottom: '1px solid #F0EBFF',
                  background: isSelected ? 'var(--color-accent)' : 'white',
                  transition: 'background 0.1s'
                }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(sub.id)}
                    disabled={progress === 'syncing' || progress === 'done'}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                  />
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {formatDate(sub.createdAt)}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                  {prenom !== '—' || nom !== '—' ? `${prenom} ${nom}`.trim() : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--color-muted)' }}>
                  {email}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {cp !== '—' || ville !== '—' ? `${cp} ${ville}`.trim() : '—'}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-primary)',
                    padding: '2px 10px',
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {nbChamps}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {progress === 'syncing' && (
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  )}
                  {progress === 'done' && <span className="badge-synced">Importé</span>}
                  {progress === 'error' && <span className="badge-error">Erreur</span>}
                  {!progress && <span className="badge-pending">En attente</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
