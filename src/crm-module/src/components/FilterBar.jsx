export default function FilterBar({ filters, onChange, total }) {
  function handle(field, value) {
    onChange({ ...filters, [field]: value })
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Depuis</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => handle('dateFrom', e.target.value)}
          style={{
            border: '1.5px solid #E5E0F7',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 14,
            color: 'var(--color-text)',
            background: 'white'
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Jusqu'au</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => handle('dateTo', e.target.value)}
          style={{
            border: '1.5px solid #E5E0F7',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 14,
            color: 'var(--color-text)',
            background: 'white'
          }}
        />
      </div>
      {(filters.dateFrom || filters.dateTo) && (
        <button
          onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '8px 4px',
            textDecoration: 'underline'
          }}
        >
          Effacer filtres
        </button>
      )}
      <div style={{ marginLeft: 'auto', color: 'var(--color-muted)', fontSize: 13, paddingBottom: 8 }}>
        {total} soumission{total !== 1 ? 's' : ''} en attente
      </div>
    </div>
  )
}
