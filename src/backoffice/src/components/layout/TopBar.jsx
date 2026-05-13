import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

const ROUTE_LABELS = {
  '/superadmin/dashboard':           'Tableau de bord',
  '/superadmin/bornes':              'Bornes',
  '/superadmin/bornes/new':          'Nouvelle borne',
  '/superadmin/admin-bornes':        'AdminBornes',
  '/superadmin/admin-bornes/new':    'Nouvel admin',
  '/superadmin/formulaires':         'Formulaires',
  '/superadmin/categories-questions':'Catégories de questions',
  '/superadmin/enregistrements':     'Enregistrements',
  '/superadmin/partage':             'Partage CRM',
  '/adminborne/dashboard':           'Tableau de bord',
  '/adminborne/bornes':              'Mes Bornes',
  '/adminborne/enregistrements':     'Enregistrements',
}

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_BORNE: 'Admin Borne',
}

const ROLE_COLORS = {
  SUPER_ADMIN: { bg: '#5B2D8E', text: '#fff' },
  ADMIN_BORNE: { bg: '#1A56A0', text: '#fff' },
}

function getPageTitle(pathname) {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  // Routes dynamiques : /bornes/:id/edit → afficher le label parent + Modification
  for (const [key, value] of Object.entries(ROUTE_LABELS)) {
    if (pathname.startsWith(key + '/')) return `${value} — Modification`
  }
  return ''
}

export default function TopBar() {
  const { user } = useAuth()
  const location = useLocation()

  const roleColor = ROLE_COLORS[user?.role] || { bg: '#6b7280', text: '#fff' }
  const pageTitle = getPageTitle(location.pathname)

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      {/* Titre de la page courante */}
      <div className="flex items-center min-w-0">
        {pageTitle && (
          <h2 className="text-sm font-semibold text-gray-800 truncate">{pageTitle}</h2>
        )}
      </div>

      {/* Infos utilisateur */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: roleColor.bg, color: roleColor.text }}
        >
          {ROLE_LABELS[user?.role] || user?.role}
        </span>
        <span className="text-sm text-gray-500 hidden md:block">{user?.email}</span>
      </div>
    </header>
  )
}
