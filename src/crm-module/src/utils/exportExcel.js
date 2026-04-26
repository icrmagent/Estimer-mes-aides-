import * as XLSX from 'xlsx'

const FIELDS = [
  { id: 2262, label: 'Civilité' },
  { id: 2087, label: 'Nom' },
  { id: 2088, label: 'Prénom' },
  { id: 2217, label: 'Adresse' },
  { id: 2089, label: 'Code Postal' },
  { id: 2090, label: 'Ville' },
  { id: 2015, label: 'Téléphone' },
  { id: 2016, label: 'Email' },
  { id: 2294, label: 'Revenu Fiscal' },
  { id: 2293, label: 'Statut Propriétaire' },
  { id: 2292, label: 'Type Logement' },
  { id: 2306, label: 'Date Construction' },
  { id: 2307, label: 'Surface Habitable' },
  { id: 2296, label: 'Type Combles' },
  { id: 2298, label: 'Type Plancher' },
  { id: 2300, label: 'Trappe Accès' },
  { id: 2301, label: 'Type Chauffage' },
  { id: 2302, label: 'Autre Chauffage' },
  { id: 2297, label: 'Isolation Combles Habitables' },
  { id: 2299, label: 'Type Isolation' },
  { id: 2303, label: 'Travaux Souhaités' },
  { id: 2304, label: 'Disponibilité Contact' },
  { id: 2305, label: 'Commentaires' },
]

function getVal(values, fieldId) {
  const sv = (values || []).find(v => v.field_id === fieldId)
  return sv?.value ?? ''
}

export function exportSubmissionsToExcel(submissions) {
  const rows = submissions.map(sub => {
    const row = {
      ID: sub.id,
      Date: new Date(sub.created_at).toLocaleString('fr-FR'),
      Synchronisé: sub.synced ? 'Oui' : 'Non',
    }
    for (const { id, label } of FIELDS) {
      row[label] = getVal(sub.submission_values, id)
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 38 },
    { wch: 18 },
    { wch: 12 },
    ...FIELDS.map(f => ({ wch: Math.max(f.label.length + 2, 14) })),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Soumissions')

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `soumissions-export-${today}.xlsx`)
}
